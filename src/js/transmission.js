
import { debounce } from './debounce.js';
import { isEqual } from './isequal.js';
import { Formatter } from './formatter.js';
import { Prefs } from './prefs.js';
import { Torrent } from './torrent.js';
import { Remote, RPC } from './remote.js';
import { TorrentRow, TorrentRenderer,} from './torrent-row.js';

export class Transmission extends EventTarget {
  constructor(toolbar, prefs) {
    super();

    this.toolbar = toolbar;
    this.prefs = prefs;

    this.remote = new Remote(this);

    this.torrentRenderer = new TorrentRenderer();

    this.addEventListener('torrent-selection-changed', (event_) =>
      this.toolbar.update(event_),
    );

    this._torrents = {};
    this._rows = [];
    this.dirtyTorrents = new Set();

    this.changeStatus = false;
    this.resortSoon = debounce(() => this._resort(false));
    this.resortAllSoon = debounce(() => this._resort(true));

    this.pointer_device = Object.seal({
      is_touch_device: 'ontouchstart' in window,
      long_press_callback: null,
      x: 0,
      y: 0,
    });
    
    const input = document.getElementById("add-torrent-input");
    input.addEventListener('change', (e) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        this._handleTorrentFiles(files);
        e.target.value = ''; // Reset
      }
    });

    for (const element of document.querySelectorAll(`button[data-action]`)) {
      const { action } = element.dataset;
      
      if (!this.toolbar.enabled(action)) {
        element.setAttribute('disabled', true);
      } else {
        element.removeAttribute('disabled');
      }

      element.addEventListener('click', () => {
          this.toolbar.click(action);
      });
    }

    this.toolbar.addEventListener('change', (event_) => {
      for (const element of document.querySelectorAll(
        `[data-action="${event_.action}"]`,
      )) {
    if (!event_.enabled) {
      element.setAttribute('disabled', true);
    } else {
      element.removeAttribute('disabled');
    }        
      }
    });

    this.toolbar.addEventListener('click', (event_) => {
      switch (event_.action) {
        case 'add-torrent':
          this._addTorrents();
          break;
        case 'remove-torrent':
          this._removeSelectedTorrents(true);
          break;
        case 'start-torrents':
          this._startTorrents();
          break;
        case 'stop-torrents':
          this._stopTorrents();
          break;
        case 'sort-order':
          this._SortOrder();
          break;
        case 'alt-speed':
          this.remote.savePrefs({[RPC.AltSpeedEnabled]: !this.session_properties[RPC.AltSpeedEnabled]});
          break;
        default:
          alert(`unhandled action: ${event_.action}`);
      }
    });

    document.addEventListener('keydown', this._keyDown.bind(this));
    document.addEventListener('keyup', this._keyUp.bind(this));

    for(const element of document.querySelectorAll('html, #toolbar, #statusbar')) {
      element.addEventListener('click', (event_) => {
      if (event_.target === event_.currentTarget) {
        this._deselectAll();
      }})
    };


    this.elements = {
      torrent_list: document.querySelector('#torrents'),
    };

    if (this.pointer_device.is_touch_device) {
      const touch = this.pointer_device;
      this.elements.torrent_list.addEventListener('touchstart', (event_) => {
        touch.x = event_.touches[0].pageX;
        touch.y = event_.touches[0].pageY;

        if (touch.long_press_callback) {
          clearTimeout(touch.long_press_callback);
          touch.long_press_callback = null;
        } else {
          touch.long_press_callback = setTimeout(
            right_click.bind(this),
            500,
            event_,
          );
        }
      });

      this.elements.torrent_list.addEventListener('touchend', () => {
        clearTimeout(touch.long_press_callback);
        touch.long_press_callback = null;
        setTimeout(() => {
          const popup = this.popup[Transmission.default_popup_level];
          if (popup) {
            popup.root.style.pointerEvents = 'auto';
          }
        }, 1);
      });

      this.elements.torrent_list.addEventListener('touchmove', (event_) => {
        touch.x = event_.touches[0].pageX;
        touch.y = event_.touches[0].pageY;

        clearTimeout(touch.long_press_callback);
        touch.long_press_callback = null;
      });

    } else {
      this.elements.torrent_list.addEventListener('mousemove', (event_) => {
        this.pointer_device.x = event_.pageX;
        this.pointer_device.y = event_.pageY;
      });
    }

    this.loadDaemonPrefs();
    this._initializeTorrents();
    this.refreshTorrents();
    this.togglePeriodicSessionRefresh(true);

    this.prefs.addEventListener('change', ({ key }) =>
      this._onPrefChanged(key),
    );
    
    for (const [key] of this.prefs.entries()) {
      this._onPrefChanged(key);
    }
  }

  loadDaemonPrefs() {
    this.remote.loadDaemonPrefs((data) => {
      this.session_properties = data.arguments;
    });
  }

  get session_properties() {
    return this._session_properties;
  }

  set session_properties(o) {
    if (isEqual(this._session_properties, o)) {
      return;
    }

    this._session_properties = Object.seal(o);
    const event = new Event('session-change');
    event.session_properties = o;
    this.dispatchEvent(event);

    this._updateGuiFromSession(o);
  }

  _onPrefChanged(key) {
    switch (key) {

      case Prefs.SortMode:
        this.resortAllSoon();
        break;

      case Prefs.RefreshRate: {
        clearInterval(this.refreshTorrentsInterval);
        const callback = this.refreshTorrents.bind(this);
        const pref = this.prefs.refresh_rate_sec;
        const msec = pref > 0 ? pref * 1000 : 1000;
        this.refreshTorrentsInterval = setInterval(callback, msec);
        break; 
      }

      default:
        break;
    }
  }

  static get max_popups() {
    return 2;
  }

  static get default_popup_level() {
    return Transmission.max_popups - 1;
  }

  _getAllTorrents() {
    return Object.values(this._torrents);
  }

  static _getTorrentIds(torrents) {
    return torrents.map((t) => t.getId());
  }

  seedRatioLimit() {
    const p = this.session_properties;
    if (p && p.seedRatioLimited) {
      return p.seedRatioLimit;
    }
    return -1;
  }

  _getSelectedRows() {
    return this._rows.filter((r) => r.isSelected());

  }

  _getSelectedTorrents() {
    return this._getSelectedRows().map((r) => r.getTorrent());
  }

  _getSelectedTorrentIds() {
    return Transmission._getTorrentIds(this._getSelectedTorrents());
  }

  _setSelectedRow(row) {
    const e_sel = row ? row.getElement() : null;
    for (const e of this.elements.torrent_list.children) {
      e.classList.toggle('selected', e === e_sel);
    }
    this._dispatchSelectionChanged();
  }

  _selectRow(row) {
    row.getElement().classList.add('selected');
    this._dispatchSelectionChanged();
  }

  _deselectRow(row) {
    row.getElement().classList.remove('selected');
    this._dispatchSelectionChanged();
  }

  _selectAll() {
    for (const e of this.elements.torrent_list.children) {
      e.classList.add('selected');
    }
    this._dispatchSelectionChanged();
  }

  _deselectAll() {
    for (const e of this.elements.torrent_list.children) {
      e.classList.remove('selected');
    }
    this._dispatchSelectionChanged();
    delete this._last_torrent_clicked;
  }

  _indexOfLastTorrent() {
    return this._rows.findIndex(
      (row) => row.getTorrentId() === this._last_torrent_clicked,
    );
  }

  _dispatchSelectionChanged() {
    const nonselected = [];
    const selected = [];
    for (const r of this._rows) {
      (r.isSelected() ? selected : nonselected).push(r.getTorrent());
    }

    const event = new Event('torrent-selection-changed');
    event.nonselected = nonselected;
    event.selected = selected;
    this.dispatchEvent(event);
  }

  _keyDown(event_) {
    let { ctrlKey, keyCode, metaKey, shiftKey, target } = event_;
    const esc_key = keyCode === 27;
    let rows = this._rows;
    let max = rows.length - 1;
    let min = 0;
    const up_key = keyCode === 38;
    const dn_key = keyCode === 40;
    let index = this._indexOfLastTorrent();
    
    if ((up_key || dn_key) && rows.length > 0) {
  
      if (dn_key && index + 1 <= max) {
        index++;
        this._setSelectedRow(rows[index]);
        this._last_torrent_clicked = rows[index].getTorrentId();

      } else if (up_key && index - 1 >= min) {
        index--;
        this._setSelectedRow(rows[index]);
        this._last_torrent_clicked = rows[index].getTorrentId();

      }
    }
  }

  _keyUp(event_) {
    if (event_.keyCode === 16) {
      delete this._shift_index;
    }
  }

  togglePeriodicSessionRefresh(enabled) {
    if (!enabled && this.sessionInterval) {
      clearInterval(this.sessionInterval);
      delete this.sessionInterval;
    }
    if (enabled) {
      this.loadDaemonPrefs();
      if (!this.sessionInterval) {
        const msec = 3000;
        this.sessionInterval = setInterval(
          this.loadDaemonPrefs.bind(this),
          msec,
        );
      }
    }
  }

  _onTorrentChanged(event_) {
    if (this.changeStatus) {
      this._dispatchSelectionChanged();
      this.changeStatus = false;
    }

    const tor = event_.currentTarget;
    this.dirtyTorrents.add(tor.getId());

    this.resortSoon();
  }

  updateTorrents(ids, fields) {
    this.remote.updateTorrents(ids, fields, (table, removed_ids) => {
      const needinfo = [];

      const keys = table.shift();
      const o = {};
      for (const row of table) {
        for (const [index, key] of keys.entries()) {
          o[key] = row[index];
        }
        const { id } = o;
        let t = this._torrents[id];
        if (t) {
          const needed = t.needsMetaData();
          t.refresh(o);
          if (needed && !t.needsMetaData()) {
            needinfo.push(id);
          }
        } else {
          t = this._torrents[id] = new Torrent(o);
          t.addEventListener('dataChanged', this._onTorrentChanged.bind(this));
          this.dirtyTorrents.add(id);
          if (!('name' in t.fields) || !('status' in t.fields)) {
            needinfo.push(id);
          }
        }
      }

      if (needinfo.length > 0) {
        const more_fields = [
          'id',
          ...Torrent.Fields.Metadata,
          ...Torrent.Fields.Stats,
        ];
        this.updateTorrents(needinfo, more_fields);
        this.resortSoon();
      }

      if (removed_ids) {
        this._deleteTorrents(removed_ids);
        this.resortSoon();
      }
    });
  }

  refreshTorrents() {
    const fields = ['id', ...Torrent.Fields.Stats];
    this.updateTorrents('recently-active', fields);
  }

  _initializeTorrents() {
    const fields = ['id', ...Torrent.Fields.Metadata, ...Torrent.Fields.Stats];
    this.updateTorrents(null, fields);
  }

  _onRowClicked(event_) {
    const { row } = event_.currentTarget;
    this._last_torrent_clicked = row.getTorrentId();
    row.isSelected() ? this._deselectRow(row) : this._selectRow(row);
  }

  _addTorrents() {
    document.getElementById("add-torrent-input").click();
  }

  _handleTorrentFiles(files) {
    const paused = false;
    const destination = this.session_properties['download-dir'];

    for (const file of files) {
      const reader = new FileReader();
      reader.addEventListener('load', (e) => {
        const contents = e.target.result;
        const key = 'base64,';
        const index = contents.indexOf(key);
        if (index === -1) {
          return;
        }
        const o = {
          arguments: {
            'download-dir': destination,
            metainfo: contents.slice(Math.max(0, index + key.length)),
            paused,
          },
          method: 'torrent-add',
        };
        this.remote.sendRequest(o, (response) => {
          if (response.result !== 'success') {
            alert(`Error adding "${file.name}": ${response.result}`);
          }
        });
      });
      reader.readAsDataURL(file);
    }
  }

  _deleteTorrents(ids) {
    if (ids && ids.length > 0) {
      for (const id of ids) {
        this.dirtyTorrents.add(id);
        delete this._torrents[id];
      }
      this.resortSoon();
    }
  }

  _removeSelectedTorrents(trash) {
    const torrents = this._getSelectedTorrents();
    if (torrents.length > 0) {
      this.remote.removeTorrents(torrents, trash);
    }
  }

  _startTorrents() {
    this.changeStatus = true;
    const torrents = this._getSelectedRows().length == 0 ? this._getAllTorrents() : this._getSelectedTorrents();
    this.remote.startTorrents(
      Transmission._getTorrentIds(torrents),
      false,
      this.refreshTorrents,
      this,
    );
  }

  _stopTorrents() {
    this.changeStatus = true;
    const torrents = this._getSelectedRows().length == 0 ? this._getAllTorrents() : this._getSelectedTorrents();
    this.remote.stopTorrents(
      Transmission._getTorrentIds(torrents),
      () => {
        setTimeout(() => {
          this.refreshTorrents();
        }, 500);
      },
      this,
    );
  }

  _SortOrder() {
    if(this.prefs.get(Prefs.SortMode) === Prefs.SortByQueue) {

      this.prefs.set(Prefs.SortMode, Prefs.SortByName);
    } else {

      this.prefs.set(Prefs.SortMode, Prefs.SortByQueue);
    }
  }

  changeFileCommand(torrentId, rowIndices, command) {
    this.remote.changeFileCommand(torrentId, rowIndices, command);
  }

  _updateGuiFromSession(o) {
    const [, version, checksum] = o.version.match(/(.*)\s\(([\da-f]+)\)/);
    this.version_info = {
      checksum,
      version,
    };

    const element = document.querySelector('#alt-speed');

    if (o[RPC.AltSpeedEnabled]) {
      //  alert('true');
      element.classList.toggle('on', o[RPC.AltSpeedEnabled]);
    } else {
      //  alert('false');
      element.classList.toggle('on', o[RPC.AltSpeedEnabled]);
    }
  }

  _updateStatusbar() {
    const fmt = Formatter;
    const torrents = this._getAllTorrents();

    const u = torrents.reduce(
      (accumulator, tor) => accumulator + tor.getUploadSpeed(),
      0,
    );
    const d = torrents.reduce(
      (accumulator, tor) => accumulator + tor.getDownloadSpeed(),
      0,
    );
    const string = fmt.countString('Transfer', 'Transfers', this._rows.length);

    document.querySelector('#speed-down').textContent = fmt.speedBps(d);
    document.querySelector('#speed-up').textContent = fmt.speedBps(u);
  }

  sortRows(rows) {
    const torrents = rows.map((row) => row.getTorrent());
    const id2row = rows.reduce((accumulator, row) => {
      accumulator[row.getTorrent().getId()] = row;
      return accumulator;
    }, {});
    Torrent.sortTorrents(
      torrents,
      this.prefs.sort_mode,
    );
    for (const [index, tor] of torrents.entries()) {
      rows[index] = id2row[tor.getId()];
    }
  }

  _resort(rebuildEverything) {
    const { sort_mode } = this.prefs;
    const renderer = this.torrentRenderer;
    const list = this.elements.torrent_list;

    const countRows = () => [...list.children].length;
    const countSelectedRows = () =>
      [...list.children].reduce(
        (n, e) => (n + e.classList.contains('selected') ? 1 : 0),
        0,
      );
    const old_row_count = countRows();
    const old_sel_count = countSelectedRows();

    if (rebuildEverything) {
      while (list.firstChild) {
        list.firstChild.remove();
      }
      this._rows = [];
      this.dirtyTorrents = new Set(Object.keys(this._torrents));
    }

    const clean_rows = [];
    let dirty_rows = [];
    for (const row of this._rows) {
      if (this.dirtyTorrents.has(row.getTorrentId())) {
        dirty_rows.push(row);
      } else {
        clean_rows.push(row);
      }
    }

    for (const row of dirty_rows) {
      row.getElement().remove();
    }

    const temporary = [];
    for (const row of dirty_rows) {
      const id = row.getTorrentId();
      const t = this._torrents[id];
      if (t) {
        temporary.push(row);
      }
      this.dirtyTorrents.delete(id);
    }
    dirty_rows = temporary;

    for (const id of this.dirtyTorrents.values()) {
      const t = this._torrents[id];
      if (t) {
        const row = new TorrentRow(renderer, this, t);
        const e = row.getElement();
        e.row = row;
        dirty_rows.push(row);
        e.addEventListener('click', this._onRowClicked.bind(this));
      }
    }

    this.sortRows(dirty_rows);

    const rows = [];
    const cmax = clean_rows.length;
    const dmax = dirty_rows.length;
    const frag = document.createDocumentFragment();
    let ci = 0;
    let di = 0;
    while (ci !== cmax || di !== dmax) {
      let push_clean = null;
      if (ci === cmax) {
        push_clean = false;
      } else if (di === dmax) {
        push_clean = true;
      } else {
        const c = Torrent.compareTorrents(
          clean_rows[ci].getTorrent(),
          dirty_rows[di].getTorrent(),
        );
        push_clean = c < 0;
      }

      if (push_clean) {
        rows.push(clean_rows[ci++]);
      } else {
        const row = dirty_rows[di++];
        const e = row.getElement();

        if (ci === cmax) {
          frag.append(e);
        } else {
          list.insertBefore(e, clean_rows[ci].getElement());
        }

        rows.push(row);
      }
    }
    list.append(frag);

    this._rows = rows;
    this.dirtyTorrents.clear();

    this._dispatchSelectionChanged();
    this._updateStatusbar();
    if (
      old_sel_count !== countSelectedRows() ||
      old_row_count !== countRows()
    ) {
      this._dispatchSelectionChanged();
    }
  }
}

import { throttle } from './throttle.js';
import { isEqual } from './isequal.js';
import { Formatter } from './formatter.js';
import { Preferences } from './preferences.js';
import { Torrent } from './torrent.js';
import { Remote, RPC } from './remote.js';
import { Row, RowRenderer } from './row.js';
import { SettingsDialog } from './settings.js';

export class Transmission extends EventTarget {
  #sessionProperties;
  #lastTorrentClicked = null;

  constructor(toolbar, prefs) {
    super();

    document.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    });

    this.toolbar = toolbar;
    this.prefs = prefs;

    this.settingsButton = document.getElementById('settings');
    this.connected = false;
    this.setConnectionState(false);

    this.settingsDialog = new SettingsDialog(this.prefs);
    this.settingsDialog.addEventListener('saved', async () => {
      this.remote.session = '';
      this.setConnectionState(false);
      this.#clearTorrents();
      await this.#loadDaemonPrefs();
      if (this.connected) {
        this.#initializeTorrents();
      }
    });

    this.remote = new Remote(this);

    this.rowRenderer = new RowRenderer();

    this.addEventListener('torrent-selection-changed', (event) =>
      this.toolbar.update(event),
    );

    this.torrents = {};
    this.rows = [];
    this.dirtyTorrents = new Set();

    this.resortSoon = throttle(() => this.#resort(false));
    this.resortAllSoon = throttle(() => this.#resort(true));

    this.pointerDevice = Object.seal({
      isTouchDevice: 'ontouchstart' in window,
      x: 0,
      y: 0,
    });

    const input = document.getElementById("add-torrent-input");
    input.addEventListener('change', (e) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        this.#handleTorrentFiles(files);
        e.target.value = '';
      }
    });

    for (const element of document.querySelectorAll(`button[data-button]`)) {
      const { button } = element.dataset;
      const enabled = this.toolbar.enabled(button);
      element.disabled = !enabled;

      element.addEventListener('click', () => {
          this.toolbar.click(button);
      });
    }

    this.toolbar.addEventListener('change', (event) => {
      const { button: buttonName, enabled } = event.detail || {};
      for (const element of document.querySelectorAll(
        `[data-button="${buttonName}"]`,
      )) {
        element.disabled = !enabled;
      }
    });

    this.toolbar.addEventListener('click', (event) => {
      const { button: buttonName } = event.detail || {};
      switch (buttonName) {
        case 'add-torrents':
          this.#addTorrents();
          break;
        case 'remove-torrents':
          this.#removeSelectedTorrents(true);
          break;
        case 'start-torrents':
          this.#startSelectedTorrents();
          break;
        case 'stop-torrents':
          this.#stopSelectedTorrents();
          break;
        case 'sort-order':
          this.#toggleSortOrder();
          break;
        case 'alt-speed':
          this.#toggleAltSpeed();
          break;
        case 'settings':
          this.settingsDialog.open();
          break;
        default:
          console.warn(`unhandled button: ${buttonName}`);
      }
    });

    document.addEventListener('keydown', this.#keyDown.bind(this));
    const torrentList = document.querySelector('#torrents');
    torrentList.addEventListener('click', (event) => {
      if (event.target === event.currentTarget) {
        this.#deselectAll();
      }
    });

    this.elements = {
      torrentList: torrentList,
    };

    if (!this.pointerDevice.isTouchDevice) {
      this.elements.torrentList.addEventListener('mousemove', (event) => {
        this.pointerDevice.x = event.pageX;
        this.pointerDevice.y = event.pageY;
      });
    }

    this.#loadDaemonPrefs();
    this.#initializeTorrents();
    this.#refreshTorrents();
    this.#togglePeriodicSessionRefresh(true);

    this.prefs.addEventListener('change', ({ key, newValue }) =>
      this.#onPrefChanged(key, newValue),
    );

    for (const [key, value] of this.prefs.entries()) {
      this.#onPrefChanged(key, value);
    }
  }

  get sessionProperties() {
    return this.#sessionProperties;
  }

  set sessionProperties(sessionProperties) {
    if (isEqual(this.#sessionProperties, sessionProperties)) {
      return;
    }

    this.#sessionProperties = Object.seal(sessionProperties);
    const event = new Event('session-change');
    event.sessionProperties = sessionProperties;
    this.dispatchEvent(event);

    this.#updateToolbar(sessionProperties);
  }

  setConnectionState(connected) {
    this.connected = connected;
    if (this.settingsButton) {
      this.settingsButton.classList.toggle('on', connected);
    }
  }

  refreshTorrents(ids) {
    if (ids && ids.length > 0) {
      const fields = ['id', ...Torrent.Fields.Metadata, ...Torrent.Fields.Stats];
      return this.#updateTorrents(ids, fields);
    }
    return this.#refreshTorrents();
  }

  async #loadDaemonPrefs() {
    try {
      const responseArgs = await this.remote.loadDaemonPrefs();
      this.sessionProperties = responseArgs;
      this.setConnectionState(true);
    } catch (error) {
      console.error(`Unable to load session preferences: ${error.message}`);
      this.setConnectionState(false);
    }
  }

  loadDaemonPrefs() {
    return this.#loadDaemonPrefs();
  }

  #onPrefChanged(key, value) {
    switch (key) {

      case Preferences.SortMode:
        this.resortAllSoon();
        const sortButton = document.getElementById('sort-order');
        if (sortButton) {
          const isAgeSort = value === Preferences.SortByAge;
          sortButton.classList.toggle('on', isAgeSort);
        }
        break;

      case Preferences.RefreshRate: {
        clearInterval(this.refreshTorrentsInterval);
        const callback = this.#refreshTorrents.bind(this);
        const pref = this.prefs.refreshRateSec;
        const msec = pref > 0 ? pref * 1000 : 1000;
        this.refreshTorrentsInterval = setInterval(callback, msec);
        break;
      }

      default:
        break;
    }
  }

  #getAllTorrents() {
    return Object.values(this.torrents);
  }

  #clearTorrents() {
    for (const row of this.rows) {
      row.getElement().remove();
    }
    this.rows = [];
    this.torrents = {};
    this.dirtyTorrents.clear();
    this.#dispatchSelectionChanged();
    this.#updateStatusbar();
  }

  static getTorrentIds(torrents) {
    return torrents.map((t) => t.getId());
  }

  seedRatioLimit() {
    const p = this.sessionProperties;
    if (p && p.seedRatioLimited) {
      return p.seedRatioLimit;
    }
    return -1;
  }

  #getSelectedRows() {
    return this.rows.filter((r) => r.isSelected());

  }

  #getSelectedTorrents() {
    return this.#getSelectedRows().map((r) => r.getTorrent());
  }

  #getSelectedTorrentIds() {
    return Transmission.getTorrentIds(this.#getSelectedTorrents());
  }

  #setSelectedRow(row) {
    const selectedElement = row ? row.getElement() : null;
    for (const e of this.elements.torrentList.children) {
      e.classList.toggle('selected', e === selectedElement);
    }
    this.#dispatchSelectionChanged();
  }

  #selectRow(row) {
    row.getElement().classList.add('selected');
    this.#dispatchSelectionChanged();
  }

  #deselectRow(row) {
    row.getElement().classList.remove('selected');
    this.#dispatchSelectionChanged();
  }

  #selectAll() {
    for (const e of this.elements.torrentList.children) {
      e.classList.add('selected');
    }
    this.#dispatchSelectionChanged();
  }

  #deselectAll() {
    for (const e of this.elements.torrentList.children) {
      e.classList.remove('selected');
    }
    this.#dispatchSelectionChanged();
    this.#lastTorrentClicked = undefined;
  }

  #indexOfLastTorrent() {
    return this.rows.findIndex(
      (row) => row.getTorrentId() === this.#lastTorrentClicked,
    );
  }

  #dispatchSelectionChanged() {
    const nonselected = [];
    const selected = [];
    for (const r of this.rows) {
      (r.isSelected() ? selected : nonselected).push(r.getTorrent());
    }

    const event = new CustomEvent('torrent-selection-changed', {
      detail: { selected, unselected: nonselected },
    });
    event.selected = selected;
    event.nonselected = nonselected;
    this.dispatchEvent(event);
  }

  #keyDown(event) {
    const key = event.key;
    const rows = this.rows;
    const isUpKey = key === 'ArrowUp';
    const isDownKey = key === 'ArrowDown';

    if ((isUpKey || isDownKey) && rows.length > 0) {
      let index = this.#indexOfLastTorrent();

      if (isDownKey && index + 1 <= rows.length - 1) {
        ++index;
      } else if (isUpKey && index - 1 >= 0) {
        --index;
      }

      const r = rows[index];

      this.#setSelectedRow(r);

      if (r) {
        this.#lastTorrentClicked = r.getTorrentId();
        r.getElement().scrollIntoView();
        event.preventDefault();
      }
    }
  }

  #togglePeriodicSessionRefresh(enabled) {
    if (!enabled && this.sessionInterval) {
      clearInterval(this.sessionInterval);
      delete this.sessionInterval;
    }
    if (enabled) {
      this.#loadDaemonPrefs();
      if (!this.sessionInterval) {
        const msec = 3000;
        this.sessionInterval = setInterval(
          this.#loadDaemonPrefs.bind(this),
          msec,
        );
      }
    }
  }

  togglePeriodicSessionRefresh(enabled) {
    this.#togglePeriodicSessionRefresh(enabled);
  }

  #onTorrentChanged(event) {
    const tor = event.currentTarget;
    this.dirtyTorrents.add(tor.getId());
    this.#dispatchSelectionChanged();
    this.resortSoon();
  }

  async #updateTorrents(ids, fields) {
    try {
      const responseArgs = await this.remote.updateTorrents(ids, fields);
      const table = responseArgs.torrents;
      const removedIds = responseArgs.removed;
      const needInfo = [];

      const keys = table.shift();
      let addedDirty = false;
      for (const row of table) {
        const torrent = {};
        for (const [index, key] of keys.entries()) {
          torrent[key] = row[index];
        }
        const { id } = torrent;
        let t = this.torrents[id];
        if (t) {
          const needed = t.needsMetaData();
          t.refresh(torrent);
          if (needed && !t.needsMetaData()) {
            needInfo.push(id);
          }
        } else {
          t = this.torrents[id] = new Torrent(torrent);
          t.addEventListener('dataChanged', this.#onTorrentChanged.bind(this));
          this.dirtyTorrents.add(id);
          addedDirty = true;
          if (!('name' in t.fields) || !('status' in t.fields)) {
            needInfo.push(id);
          }
        }
      }
      if (addedDirty) {
        this.resortSoon();
      }

      if (removedIds && removedIds.length > 0) {
        this.#deleteTorrents(removedIds);
      }

      if (needInfo.length > 0) {
        const moreFields = [
          'id',
          ...Torrent.Fields.Metadata,
          ...Torrent.Fields.Stats,
        ];
        this.#updateTorrents(needInfo, moreFields);
      }
    } catch (error) {
      console.error(`Unable to refresh torrents: ${error.message}`);
      this.setConnectionState(false);
    }
  }

  #refreshTorrents() {
    const fields = ['id', ...Torrent.Fields.Stats];
    this.#updateTorrents('recently-active', fields);
  }

  #initializeTorrents() {
    const fields = ['id', ...Torrent.Fields.Metadata, ...Torrent.Fields.Stats];
    this.#updateTorrents(null, fields);
  }

  #onRowClicked(row) {
    if (!row.isSelected()) {
      this.#setSelectedRow(row);
    } else {
      this.#deselectRow(row);
    }
  }

  #addTorrents() {
    document.getElementById("add-torrent-input").click();
  }

  #handleTorrentFiles(files) {
    const paused = false;
    const destination = this.sessionProperties?.['download-dir'];

    for (const file of files) {
      const reader = new FileReader();
      reader.addEventListener('load', async (e) => {
        const contents = e.target.result;
        const key = 'base64,';
        const index = contents.indexOf(key);
        if (index === -1) {
          return;
        }
        const request = {
          arguments: {
            'download-dir': destination,
            metainfo: contents.slice(Math.max(0, index + key.length)),
            paused,
          },
          method: 'torrent-add',
        };
        try {
          const response = await this.remote.sendRequest(request);
          if (response.result !== 'success') {
            console.error(`Error adding "${file.name}": ${response.result}`);
          }
        } catch (error) {
          console.error(`Error adding "${file.name}": ${error.message}`);
        }
      });
      reader.readAsDataURL(file);
    }
  }

  #deleteTorrents(ids) {
    if (ids && ids.length > 0) {
      const removedIds = new Set(ids);
      for (const id of ids) {
        this.dirtyTorrents.add(id);
        delete this.torrents[id];
      }

      let removed = false;
      this.rows = this.rows.filter((row) => {
        if (removedIds.has(row.getTorrentId())) {
          row.getElement().remove();
          removed = true;
          return false;
        }
        return true;
      });

      if (removed) {
        this.resortSoon();
      }
    }
  }

  #removeSelectedTorrents(trash) {
    const torrents = this.#getSelectedTorrents();
    if (torrents.length > 0) {
      this.remote.removeTorrents(torrents, trash).catch((error) => console.error(error));
    }
  }

  #startSelectedTorrents() {
    const torrents = this.#getSelectedTorrents().length > 0
      ? this.#getSelectedTorrents()
      : this.#getAllTorrents();
    this.#startTorrents(torrents);
  }

  #stopSelectedTorrents() {
    const torrents = this.#getSelectedTorrents().length > 0
      ? this.#getSelectedTorrents()
      : this.#getAllTorrents();
    this.#stopTorrents(torrents);
  }

  #toggleSortOrder() {
    const currentSort = this.prefs.sortMode;
    const newSort = currentSort === Preferences.SortByName ? Preferences.SortByAge : Preferences.SortByName;
    this.prefs.sortMode = newSort;
  }

  #toggleAltSpeed() {
    if (!this.sessionProperties) {
      return;
    }
    this.remote.savePrefs({
      [RPC.AltSpeedEnabled]: !this.sessionProperties[RPC.AltSpeedEnabled],
    }).catch((error) => console.error(error));
  }

  #startTorrents(torrents, force) {
    this.remote.startTorrents(Transmission.getTorrentIds(torrents), force)
      .then(() => this.#refreshTorrents())
      .catch((error) => console.error(error));
  }

  #stopTorrents(torrents) {
    this.remote.stopTorrents(Transmission.getTorrentIds(torrents))
      .then(() => {
        setTimeout(() => {
          this.#refreshTorrents();
        }, 500);
      })
      .catch((error) => console.error(error));
  }

  #changeFileCommand(torrentId, rowIndices, command) {
    this.remote.changeFileCommand(torrentId, rowIndices, command).catch((error) => console.error(error));
  }

  #updateToolbar(sessionProperties) {
    const [, version, checksum] = sessionProperties.version.match(/(.*)\s\(([\da-f]+)\)/);
    this.versionInfo = {
      checksum,
      version,
    };

    const element = document.querySelector('#alt-speed');

    element.classList.toggle('on', sessionProperties[RPC.AltSpeedEnabled]);

  }

  #updateStatusbar() {
    const fmt = Formatter;
    const torrents = this.#getAllTorrents();

    const u = torrents.reduce(
      (accumulator, tor) => accumulator + tor.getUploadSpeed(),
      0,
    );
    const d = torrents.reduce(
      (accumulator, tor) => accumulator + tor.getDownloadSpeed(),
      0,
    );
    const string = fmt.countString('Transfer', 'Transfers', this.rows.length);

    document.querySelector('#speed-down').textContent = fmt.speedBps(d);
    document.querySelector('#speed-up').textContent = fmt.speedBps(u);
  }

  #sortRows(rows) {
    const torrents = rows.map((row) => row.getTorrent());
    const id2row = rows.reduce((accumulator, row) => {
      accumulator[row.getTorrent().getId()] = row;
      return accumulator;
    }, {});
    Torrent.sortTorrents(
      torrents,
      this.prefs.sortMode,
    );
    for (const [index, tor] of torrents.entries()) {
      rows[index] = id2row[tor.getId()];
    }
  }

  #resort(rebuildEverything) {
    const { sortMode } = this.prefs;
    const renderer = this.rowRenderer;
    const list = this.elements.torrentList;

    const countRows = () => [...list.children].length;
    const countSelectedRows = () =>
      [...list.children].reduce(
        (n, e) => (n + e.classList.contains('selected') ? 1 : 0),
        0,
      );
    const oldRowCount = countRows();
    const oldSelCount = countSelectedRows();

    if (rebuildEverything) {
      while (list.firstChild) {
        list.firstChild.remove();
      }
      this.rows = [];
      this.dirtyTorrents = new Set(Object.keys(this.torrents));
    }

    const cleanRows = [];
    let dirtyRows = [];
    for (const row of this.rows) {
      if (this.dirtyTorrents.has(row.getTorrentId())) {
        dirtyRows.push(row);
      } else {
        cleanRows.push(row);
      }
    }

    for (const row of dirtyRows) {
      row.getElement().remove();
    }

    const temporary = [];
    for (const row of dirtyRows) {
      const id = row.getTorrentId();
      const t = this.torrents[id];
      if (t) {
        temporary.push(row);
      }
      this.dirtyTorrents.delete(id);
    }
    dirtyRows = temporary;

    for (const id of this.dirtyTorrents.values()) {
      const t = this.torrents[id];
      if (t) {
        const row = new Row(renderer, this, t);
        dirtyRows.push(row);
        row.getElement().addEventListener('click', () => this.#onRowClicked(row));
      }
    }

    this.#sortRows(dirtyRows);

    const rows = [];
    const cmax = cleanRows.length;
    const dmax = dirtyRows.length;
    const frag = document.createDocumentFragment();
    let ci = 0;
    let di = 0;
    while (ci !== cmax || di !== dmax) {
      let pushClean = null;
      if (ci === cmax) {
        pushClean = false;
      } else if (di === dmax) {
        pushClean = true;
      } else {
        const c = Torrent.compareTorrents(
          cleanRows[ci].getTorrent(),
          dirtyRows[di].getTorrent(),
          sortMode,
        );
        pushClean = c < 0;
      }

      if (pushClean) {
        rows.push(cleanRows[ci++]);
      } else {
        const row = dirtyRows[di++];
        const e = row.getElement();

        if (ci === cmax) {
          frag.append(e);
        } else {
          list.insertBefore(e, cleanRows[ci].getElement());
        }

        rows.push(row);
      }
    }
    list.append(frag);

    this.rows = rows;
    this.dirtyTorrents.clear();

    this.#updateStatusbar();
    if (
      oldSelCount !== countSelectedRows() ||
      oldRowCount !== countRows()
    ) {
      this.#dispatchSelectionChanged();
    }
  }
}
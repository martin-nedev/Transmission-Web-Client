(() => {
  // src/js/debounce.js
  function debounce(callback, wait = 100) {
    let timeout = null;
    return (...arguments_) => {
      if (!timeout) {
        timeout = setTimeout(() => {
          timeout = null;
          callback(...arguments_);
        }, wait);
      }
    };
  }

  // src/js/prefs.js
  var Prefs = class _Prefs extends EventTarget {
    constructor() {
      super();
      this.cache = {};
      this.dispatchPrefsChange = debounce((key, oldValue, newValue) => {
        const event = new Event("change");
        Object.assign(event, { key, oldValue, newValue });
        this.dispatchEvent(event);
      });
      for (const [key, defaultValue] of Object.entries(_Prefs.Defaults)) {
        this.set(key, _Prefs.getCookie(key, defaultValue));
        Object.defineProperty(this, key.replaceAll("-", "_"), {
          get: () => this.get(key),
          set: (value) => {
            this.set(key, value);
          }
        });
      }
      Object.seal(this);
    }
    entries() {
      return Object.entries(this.cache);
    }
    keys() {
      return Object.keys(this.cache);
    }
    get(key) {
      const { cache } = this;
      if (!Object.prototype.hasOwnProperty.call(cache, key)) {
        throw new Error(key);
      }
      return cache[key];
    }
    set(key, newValue) {
      const { cache } = this;
      const oldValue = cache[key];
      if (oldValue !== newValue) {
        cache[key] = newValue;
        _Prefs.setCookie(key, newValue);
        this.dispatchPrefsChange(key, oldValue, newValue);
      }
    }
    static setCookie(key, newValue) {
      const date = /* @__PURE__ */ new Date();
      date.setFullYear(date.getFullYear() + 1);
      document.cookie = `${key}=${newValue}; SameSite=Strict; expires=${date.toGMTString()}`;
    }
    static getCookie(key, fallback) {
      const value = _Prefs.readCookie(key);
      if (value === null) {
        return fallback;
      }
      const type = typeof fallback;
      if (type === "boolean") {
        if (value === "true") {
          return true;
        }
        if (value === "false") {
          return false;
        }
        return fallback;
      }
      if (type === "number") {
        const f = Number.parseFloat(value);
        return Number.isNaN(f) ? fallback : f;
      }
      return value;
    }
    static readCookie(key) {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${key}=`);
      return parts.length === 2 ? parts.pop().split(";").shift() : null;
    }
  };
  Prefs.RefreshRate = "refresh-rate-sec";
  Prefs.SortMode = "sort-mode";
  Prefs.SortByName = "name";
  Prefs.SortByQueue = "queue";
  Prefs.AltSpeed = "alt-speed";
  Prefs.Defaults = {
    [Prefs.RefreshRate]: 1,
    [Prefs.SortMode]: Prefs.SortByName,
    [Prefs.AltSpeed]: false
  };

  // src/js/toolbar.js
  var Toolbar = class extends EventTarget {
    constructor() {
      super();
      this.actions = Object.seal({
        "add-torrent": { enabled: true, text: "Add torrent\u2026" },
        "remove-torrent": { enabled: false, text: "Remove torrent" },
        "start-torrents": { enabled: false, text: "Start torrents" },
        "stop-torrents": { enabled: false, text: "Stop torrents" },
        "sort-order": { enabled: true, text: "Sort Order" },
        "alt-speed": { enabled: true, text: "Alternative Speed" }
      });
    }
    click(name) {
      if (this.enabled(name)) {
        const event = new Event("click");
        event.action = name;
        this.dispatchEvent(event);
      }
    }
    enabled(name) {
      const action = this.actions[name];
      if (!action) {
        throw new Error(`no such action: ${name}`);
      }
      return action.enabled;
    }
    text(name) {
      const action = this.actions[name];
      if (!action) {
        throw new Error(`no such action: ${name}`);
      }
      return action.text;
    }
    update(event) {
      const selected = event.selected.length;
      const nonselected = event.nonselected.length;
      const selected_paused = event.selected.filter((tor) => tor.isStopped()).length;
      const selected_active = event.selected.length - selected_paused;
      const nonselected_paused = event.nonselected.filter((tor) => tor.isStopped()).length;
      const nonselected_active = event.nonselected.length - nonselected_paused;
      const paused = selected > 0 ? selected_paused : nonselected_paused;
      const active = selected > 0 ? selected_active : nonselected_active;
      const selected_queued = event.selected.filter((tor) => tor.isQueued()).length;
      const total = selected + nonselected;
      const enable = (enabled, actions) => {
        for (const name of actions) {
          const action = this.actions[name];
          if (!action) {
            throw new Error(`no such action: ${name}`);
          }
          if (action.enabled !== enabled) {
            action.enabled = enabled;
            const event2 = new Event("change");
            event2.action = name;
            event2.enabled = enabled;
            this.dispatchEvent(event2);
          }
        }
      };
      enable(selected > 0, ["remove-torrent"]);
      enable(paused > 0, ["start-torrents"]);
      enable(active > 0, ["stop-torrents"]);
    }
  };

  // src/js/isequal.js
  function isEqual(a, b) {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (a && b && typeof a === "object") {
      if (Array.isArray(a) !== Array.isArray(b)) return false;
      if (Array.isArray(a)) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
          if (!isEqual(a[i], b[i])) return false;
        }
        return true;
      }
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;
      for (const key of keysA) {
        if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
        if (!isEqual(a[key], b[key])) return false;
      }
      return true;
    }
    return false;
  }

  // src/js/formatter.js
  var plural_rules = new Intl.PluralRules();
  var current_locale = plural_rules.resolvedOptions().locale;
  var number_format = new Intl.NumberFormat(current_locale);
  var kilo = 1e3;
  var mem_formatters = [
    new Intl.NumberFormat(current_locale, {
      maximumFractionDigits: 0,
      style: "unit",
      unit: "byte"
    }),
    new Intl.NumberFormat(current_locale, {
      maximumFractionDigits: 0,
      style: "unit",
      unit: "kilobyte"
    }),
    new Intl.NumberFormat(current_locale, {
      maximumFractionDigits: 0,
      style: "unit",
      unit: "megabyte"
    }),
    new Intl.NumberFormat(current_locale, {
      maximumFractionDigits: 2,
      style: "unit",
      unit: "gigabyte"
    }),
    new Intl.NumberFormat(current_locale, {
      maximumFractionDigits: 2,
      style: "unit",
      unit: "terabyte"
    }),
    new Intl.NumberFormat(current_locale, {
      maximumFractionDigits: 2,
      style: "unit",
      unit: "petabyte"
    })
  ];
  var fmt_kBps = new Intl.NumberFormat(current_locale, {
    maximumFractionDigits: 2,
    style: "unit",
    unit: "kilobyte-per-second"
  });
  var fmt_MBps = new Intl.NumberFormat(current_locale, {
    maximumFractionDigits: 2,
    style: "unit",
    unit: "megabyte-per-second"
  });
  var fmt_GBps = new Intl.NumberFormat(current_locale, {
    maximumFractionDigits: 2,
    style: "unit",
    unit: "gigabyte-per-second"
  });
  var Formatter = {
    countString(msgid, msgid_plural, n) {
      return `${this.number(n)} ${this.ngettext(msgid, msgid_plural, n)}`;
    },
    mem(bytes) {
      if (bytes < 0) {
        return "Unknown";
      }
      if (bytes === 0) {
        return "None";
      }
      let size = bytes;
      for (const nf of mem_formatters) {
        if (size < kilo) {
          return nf.format(size);
        }
        size /= kilo;
      }
      return "E2BIG";
    },
    ngettext(msgid, msgid_plural, n) {
      return plural_rules.select(n) === "one" ? msgid : msgid_plural;
    },
    number(number) {
      return number_format.format(number);
    },
    percentString(x, decimal_places) {
      decimal_places = x < 100 ? decimal_places : 0;
      const returnValue = Math.floor(x * 10 ** decimal_places) / 10 ** decimal_places;
      return returnValue.toFixed(decimal_places);
    },
    ratioString(x) {
      if (x === -1) {
        return "None";
      }
      if (x === -2) {
        return "&infin;";
      }
      return this.percentString(x, 1);
    },
    size(bytes) {
      return this.mem(bytes);
    },
    speed(KBps) {
      if (KBps < 999.95) {
        return fmt_kBps.format(KBps);
      } else if (KBps < 999950) {
        return fmt_MBps.format(KBps / 1e3);
      }
      return fmt_GBps.format(KBps / 1e6);
    },
    speedBps(Bps) {
      return this.speed(this.toKBps(Bps));
    },
    stringSanitizer(str) {
      return ["E2BIG", "NaN"].some((badStr) => str.includes(badStr)) ? `\u2026` : str;
    },
    timeInterval(seconds, granular_depth = 3) {
      const days = Math.floor(seconds / 86400);
      let buffer = [];
      if (days) {
        buffer.push(this.countString("day", "days", days));
      }
      const hours = Math.floor(seconds % 86400 / 3600);
      if (days || hours) {
        buffer.push(this.countString("hour", "hours", hours));
      }
      const minutes = Math.floor(seconds % 3600 / 60);
      if (days || hours || minutes) {
        buffer.push(this.countString("minute", "minutes", minutes));
        buffer = buffer.slice(0, granular_depth);
        return buffer.length > 1 ? `${buffer.slice(0, -1).join(", ")} and ${buffer.slice(-1)}` : buffer[0];
      }
      return this.countString("second", "seconds", Math.floor(seconds % 60));
    },
    timestamp(seconds) {
      if (!seconds) {
        return "N/A";
      }
      const myDate = new Date(seconds * 1e3);
      const now = /* @__PURE__ */ new Date();
      let date = "";
      let time = "";
      const sameYear = now.getFullYear() === myDate.getFullYear();
      const sameMonth = now.getMonth() === myDate.getMonth();
      const dateDiff = now.getDate() - myDate.getDate();
      if (sameYear && sameMonth && Math.abs(dateDiff) <= 1) {
        if (dateDiff === 0) {
          date = "Today";
        } else if (dateDiff === 1) {
          date = "Yesterday";
        } else {
          date = "Tomorrow";
        }
      } else {
        date = myDate.toDateString();
      }
      let hours = myDate.getHours();
      let period = "AM";
      if (hours > 12) {
        hours = hours - 12;
        period = "PM";
      }
      if (hours === 0) {
        hours = 12;
      }
      if (hours < 10) {
        hours = `0${hours}`;
      }
      let minutes = myDate.getMinutes();
      if (minutes < 10) {
        minutes = `0${minutes}`;
      }
      seconds = myDate.getSeconds();
      if (seconds < 10) {
        seconds = `0${seconds}`;
      }
      time = [hours, minutes, seconds].join(":");
      return [date, time, period].join(" ");
    },
    toKBps(Bps) {
      return Math.floor(Bps / kilo);
    }
  };

  // src/js/torrent.js
  var Torrent = class _Torrent extends EventTarget {
    constructor(data) {
      super();
      this.fieldObservers = {};
      this.fields = {};
      this.refresh(data);
    }
    notifyOnFieldChange(field, callback) {
      this.fieldObservers[field] = this.fieldObservers[field] || [];
      this.fieldObservers[field].push(callback);
    }
    setField(o, name, value) {
      const old_value = o[name];
      if (isEqual(old_value, value)) {
        return false;
      }
      const observers = this.fieldObservers[name];
      if (o === this.fields && observers && observers.length > 0) {
        for (const observer of observers) {
          observer.call(this, value, old_value, name);
        }
      }
      o[name] = value;
      return true;
    }
    updateFiles(files) {
      let changed = false;
      const myfiles = this.fields.files || [];
      const keys = ["length", "name", "bytesCompleted", "wanted", "priority"];
      for (const [index, f] of files.entries()) {
        const myfile = myfiles[index] || {};
        for (const key of keys) {
          if (key in f) {
            changed |= this.setField(myfile, key, f[key]);
          }
        }
        myfiles[index] = myfile;
      }
      this.fields.files = myfiles;
      return changed;
    }
    static collateTrackers(trackers) {
      return trackers.map((t) => t.announce.toLowerCase()).join("	");
    }
    refreshFields(data) {
      let changed = false;
      for (const [key, value] of Object.entries(data)) {
        switch (key) {
          case "files":
          case "fileStats":
            changed |= this.updateFiles(value);
            break;
          case "trackerStats":
            changed |= this.setField(this.fields, "trackers", value);
            break;
          case "trackers":
            if (!(key in this.fields)) {
              changed |= this.setField(this.fields, key, value);
            }
            break;
          case "name":
            if (this.setField(this.fields, key, data[key])) {
              this.fields.collatedName = "";
              changed = true;
            }
            break;
          default:
            changed |= this.setField(this.fields, key, value);
        }
      }
      return changed;
    }
    refresh(data) {
      if (this.refreshFields(data)) {
        this.dispatchEvent(new Event("dataChanged"));
      }
    }
    getComment() {
      return this.fields.comment;
    }
    getCreator() {
      return this.fields.creator;
    }
    getDateAdded() {
      return this.fields.addedDate;
    }
    getDateCreated() {
      return this.fields.dateCreated;
    }
    getDesiredAvailable() {
      return this.fields.desiredAvailable;
    }
    getDownloadDir() {
      return this.fields.downloadDir;
    }
    getDownloadSpeed() {
      return this.fields.rateDownload;
    }
    getDownloadedEver() {
      return this.fields.downloadedEver;
    }
    getError() {
      return this.fields.error;
    }
    getErrorString() {
      return this.fields.errorString;
    }
    getETA() {
      return this.fields.eta;
    }
    getFailedEver() {
      return this.fields.corruptEver;
    }
    getFiles() {
      return this.fields.files || [];
    }
    getFile(index) {
      return this.fields.files[index];
    }
    getFileCount() {
      return this.fields["file-count"];
    }
    getHashString() {
      return this.fields.hashString;
    }
    getHave() {
      return this.getHaveValid() + this.getHaveUnchecked();
    }
    getHaveUnchecked() {
      return this.fields.haveUnchecked;
    }
    getHaveValid() {
      return this.fields.haveValid;
    }
    getId() {
      return this.fields.id;
    }
    getLabels() {
      return this.fields.labels.sort();
    }
    getLastActivity() {
      return this.fields.activityDate;
    }
    getLeftUntilDone() {
      return this.fields.leftUntilDone;
    }
    getMagnetLink() {
      return this.fields.magnetLink;
    }
    getMetadataPercentComplete() {
      return this.fields.metadataPercentComplete;
    }
    getName() {
      return this.fields.name || "Unknown";
    }
    getPeers() {
      return this.fields.peers || [];
    }
    getPeersConnected() {
      return this.fields.peersConnected;
    }
    getPeersGettingFromUs() {
      return this.fields.peersGettingFromUs;
    }
    getPeersSendingToUs() {
      return this.fields.peersSendingToUs;
    }
    getPieceCount() {
      return this.fields.pieceCount;
    }
    getPieceSize() {
      return this.fields.pieceSize;
    }
    getPrimaryMimeType() {
      return this.fields["primary-mime-type"] || "application/octet-stream";
    }
    getPrivateFlag() {
      return this.fields.isPrivate;
    }
    getQueuePosition() {
      return this.fields.queuePosition;
    }
    getRecheckProgress() {
      return this.fields.recheckProgress;
    }
    getSeedRatioLimit() {
      return this.fields.seedRatioLimit;
    }
    getSeedRatioMode() {
      return this.fields.seedRatioMode;
    }
    getSizeWhenDone() {
      return this.fields.sizeWhenDone;
    }
    getStartDate() {
      return this.fields.startDate;
    }
    getStatus() {
      return this.fields.status;
    }
    getTotalSize() {
      return this.fields.totalSize;
    }
    getTrackers() {
      return this.fields.trackers || [];
    }
    getUploadSpeed() {
      return this.fields.rateUpload;
    }
    getUploadRatio() {
      return this.fields.uploadRatio;
    }
    getUploadedEver() {
      return this.fields.uploadedEver;
    }
    getWebseedsSendingToUs() {
      return this.fields.webseedsSendingToUs;
    }
    isFinished() {
      return this.fields.isFinished;
    }
    hasExtraInfo() {
      return "hashString" in this.fields;
    }
    isSeeding() {
      return this.getStatus() === _Torrent._StatusSeed;
    }
    isStopped() {
      return this.getStatus() === _Torrent._StatusStopped;
    }
    isChecking() {
      return this.getStatus() === _Torrent._StatusCheck;
    }
    isDownloading() {
      return this.getStatus() === _Torrent._StatusDownload;
    }
    isQueued() {
      return this.getStatus() === _Torrent._StatusDownloadWait || this.getStatus() === _Torrent._StatusSeedWait;
    }
    isDone() {
      return this.getLeftUntilDone() < 1;
    }
    needsMetaData() {
      return this.getMetadataPercentComplete() < 1;
    }
    getActivity() {
      return this.getDownloadSpeed() + this.getUploadSpeed();
    }
    getPercentDoneStr() {
      return Formatter.percentString(100 * this.getPercentDone(), 1);
    }
    getPercentDone() {
      return this.fields.percentDone;
    }
    getStateString() {
      switch (this.getStatus()) {
        case _Torrent._StatusStopped:
          return this.isFinished() ? "Seeding complete" : "Paused";
        case _Torrent._StatusCheckWait:
          return "Queued for verification";
        case _Torrent._StatusCheck:
          return "Verifying local data";
        case _Torrent._StatusDownloadWait:
          return "Queued for download";
        case _Torrent._StatusDownload:
          return "Downloading";
        case _Torrent._StatusSeedWait:
          return "Queued for seeding";
        case _Torrent._StatusSeed:
          return "Seeding";
        case null:
          return "Unknown";
        default:
          return "Error";
      }
    }
    seedRatioLimit(controller) {
      switch (this.getSeedRatioMode()) {
        case _Torrent._RatioUseGlobal:
          return controller.seedRatioLimit();
        case _Torrent._RatioUseLocal:
          return this.getSeedRatioLimit();
        default:
          return -1;
      }
    }
    getErrorMessage() {
      const string = this.getErrorString();
      switch (this.getError()) {
        case _Torrent._ErrTrackerWarning:
          return `Tracker returned a warning: ${string}`;
        case _Torrent._ErrTrackerError:
          return `Tracker returned an error: ${string}`;
        case _Torrent._ErrLocalError:
          return `Error: ${string}`;
        default:
          return null;
      }
    }
    getCollatedName() {
      const f = this.fields;
      if (!f.collatedName && f.name) {
        f.collatedName = f.name.toLowerCase();
      }
      return f.collatedName || "";
    }
    getCollatedTrackers() {
      const f = this.fields;
      if (!f.collatedTrackers && f.trackers) {
        f.collatedTrackers = _Torrent.collateTrackers(f.trackers);
      }
      return f.collatedTrackers || "";
    }
    testState(state) {
      const s = this.getStatus();
      switch (state) {
        case Prefs.FilterActive:
          return this.getPeersGettingFromUs() > 0 || this.getPeersSendingToUs() > 0 || this.getWebseedsSendingToUs() > 0 || this.isChecking();
        case Prefs.FilterSeeding:
          return s === _Torrent._StatusSeed || s === _Torrent._StatusSeedWait;
        case Prefs.FilterDownloading:
          return s === _Torrent._StatusDownload || s === _Torrent._StatusDownloadWait;
        case Prefs.FilterPaused:
          return this.isStopped();
        case Prefs.FilterFinished:
          return this.isFinished();
        default:
          return true;
      }
    }
    test(state) {
      let pass = this.testState(state);
      return pass;
    }
    static compareById(ta, tb) {
      return ta.getId() - tb.getId();
    }
    static compareByName(ta, tb) {
      return ta.getCollatedName().localeCompare(tb.getCollatedName()) || _Torrent.compareById(ta, tb);
    }
    static compareByQueue(ta, tb) {
      return ta.getQueuePosition() - tb.getQueuePosition();
    }
    static compareByAge(ta, tb) {
      const a = ta.getDateAdded();
      const b = tb.getDateAdded();
      return b - a || _Torrent.compareByQueue(ta, tb);
    }
    static compareByState(ta, tb) {
      const a = ta.getStatus();
      const b = tb.getStatus();
      return b - a || _Torrent.compareByQueue(ta, tb);
    }
    static compareByActivity(ta, tb) {
      const a = ta.getActivity();
      const b = tb.getActivity();
      return b - a || _Torrent.compareByState(ta, tb);
    }
    static compareByRatio(ta, tb) {
      const a = ta.getUploadRatio();
      const b = tb.getUploadRatio();
      if (a < b) {
        return 1;
      }
      if (a > b) {
        return -1;
      }
      return _Torrent.compareByState(ta, tb);
    }
    static compareByProgress(ta, tb) {
      const a = ta.getPercentDone();
      const b = tb.getPercentDone();
      return a - b || _Torrent.compareByRatio(ta, tb);
    }
    static compareBySize(ta, tb) {
      const a = ta.getTotalSize();
      const b = tb.getTotalSize();
      return a - b || _Torrent.compareByName(ta, tb);
    }
    static compareTorrents(a, b, sortMode) {
      let index = 0;
      switch (sortMode) {
        case Prefs.SortByName:
          index = _Torrent.compareByName(a, b);
          break;
        case Prefs.SortByQueue:
          index = _Torrent.compareByQueue(a, b);
          break;
        default:
          console.log(`Unrecognized sort mode: ${sortMode}`);
          index = _Torrent.compareByName(a, b);
          break;
      }
      return index;
    }
    static sortTorrents(torrents, sortMode) {
      switch (sortMode) {
        case Prefs.SortByName:
          torrents.sort(this.compareByName);
          break;
        case Prefs.SortByQueue:
          torrents.sort(this.compareByQueue);
          break;
        default:
          console.log(`Unrecognized sort mode: ${sortMode}`);
          torrents.sort(this.compareByName);
          break;
      }
      return torrents;
    }
  };
  Torrent._StatusStopped = 0;
  Torrent._StatusCheckWait = 1;
  Torrent._StatusCheck = 2;
  Torrent._StatusDownloadWait = 3;
  Torrent._StatusDownload = 4;
  Torrent._StatusSeedWait = 5;
  Torrent._StatusSeed = 6;
  Torrent._RatioUseGlobal = 0;
  Torrent._RatioUseLocal = 1;
  Torrent._RatioUnlimited = 2;
  Torrent._ErrNone = 0;
  Torrent._ErrTrackerWarning = 1;
  Torrent._ErrTrackerError = 2;
  Torrent._ErrLocalError = 3;
  Torrent._TrackerInactive = 0;
  Torrent._TrackerWaiting = 1;
  Torrent._TrackerQueued = 2;
  Torrent._TrackerActive = 3;
  Torrent.Fields = {};
  Torrent.Fields.Metadata = [
    "addedDate",
    "file-count",
    "name",
    "primary-mime-type",
    "totalSize"
  ];
  Torrent.Fields.Stats = [
    "error",
    "errorString",
    "eta",
    "isFinished",
    "isStalled",
    "labels",
    "leftUntilDone",
    "metadataPercentComplete",
    "peersConnected",
    "peersGettingFromUs",
    "peersSendingToUs",
    "percentDone",
    "queuePosition",
    "rateDownload",
    "rateUpload",
    "recheckProgress",
    "seedRatioMode",
    "seedRatioLimit",
    "sizeWhenDone",
    "status",
    "trackers",
    "downloadDir",
    "uploadedEver",
    "uploadRatio",
    "webseedsSendingToUs"
  ];

  // src/js/remote.js
  var RPC = {
    Root: "../rpc",
    Version: "version",
    SpeedLimitDown: "speed-limit-down",
    SpeedLimitDownEnabled: "speed-limit-down-enabled",
    SpeedLimitUp: "speed-limit-up",
    SpeedLimitUpEnabled: "speed-limit-up-enabled",
    AltSpeedDown: "alt-speed-down",
    AltSpeedUp: "alt-speed-up",
    AltSpeedEnabled: "alt-speed-enabled",
    QueueMoveBottom: "queue-move-bottom",
    QueueMoveDown: "queue-move-down",
    QueueMoveTop: "queue-move-top",
    QueueMoveUp: "queue-move-up"
  };
  var Remote = class _Remote {
    constructor(controller) {
      this.controller = controller;
      this.session = "";
    }
    sendRequest(data, callback, context) {
      const headers = new Headers();
      headers.append("cache-control", "no-cache");
      headers.append("content-type", "application/json");
      headers.append("pragma", "no-cache");
      if (this.session) {
        headers.append(_Remote.SessionHeader, this.session);
      }
      let argument = null;
      fetch(RPC.Root, {
        body: JSON.stringify(data),
        headers,
        method: "POST"
      }).then((response) => {
        argument = response;
        if (response.status === 409) {
          const error = new Error(_Remote.SessionHeader);
          error.header = response.headers.get(_Remote.SessionHeader);
          throw error;
        }
        return response.json();
      }).then((payload) => {
        if (callback) {
          callback.call(context, payload, argument);
        }
      }).catch((error) => {
        if (error.message === _Remote.SessionHeader) {
          this.session = error.header;
          this.sendRequest(data, callback, context);
          return;
        }
        console.trace(error);
        this.controller.togglePeriodicSessionRefresh(false);
        alert("Could not connect to the server.\nReload the page to reconnect.");
      });
    }
    loadDaemonStats(callback, context) {
      const o = {
        method: "session-stats"
      };
      this.sendRequest(o, callback, context);
    }
    loadDaemonPrefs(callback, context) {
      const o = {
        method: "session-get"
      };
      this.sendRequest(o, callback, context);
    }
    checkPort(ip, callback, context) {
      const o = {
        arguments: {
          ip
        },
        method: "port-test"
      };
      this.sendRequest(o, callback, context);
    }
    updateTorrents(ids, fields, callback, context) {
      const o = {
        arguments: {
          fields,
          format: "table"
        },
        method: "torrent-get"
      };
      if (ids) {
        o.arguments.ids = ids;
      }
      this.sendRequest(o, (response) => {
        const arguments_ = response["arguments"];
        callback.call(context, arguments_.torrents, arguments_.removed);
      });
    }
    getFreeSpace(dir, callback, context) {
      const o = {
        arguments: {
          path: dir
        },
        method: "free-space"
      };
      this.sendRequest(o, (response) => {
        const arguments_ = response["arguments"];
        callback.call(context, arguments_.path, arguments_["size-bytes"]);
      });
    }
    changeFileCommand(id, fileIndices, command) {
      const arguments_ = {
        ids: [id]
      };
      arguments_[command] = fileIndices;
      this.sendRequest(
        {
          arguments: arguments_,
          method: "torrent-set"
        },
        () => {
          this.controller.refreshTorrents([id]);
        }
      );
    }
    sendTorrentSetRequests(method, ids, arguments_, callback, context) {
      if (!arguments_) {
        arguments_ = {};
      }
      arguments_["ids"] = ids;
      const o = {
        arguments: arguments_,
        method
      };
      this.sendRequest(o, callback, context);
    }
    sendTorrentActionRequests(method, ids, callback, context) {
      this.sendTorrentSetRequests(method, ids, null, callback, context);
    }
    startTorrents(ids, noqueue, callback, context) {
      const name = noqueue ? "torrent-start-now" : "torrent-start";
      this.sendTorrentActionRequests(name, ids, callback, context);
    }
    stopTorrents(ids, callback, context) {
      this.sendTorrentActionRequests(
        "torrent-stop",
        ids,
        callback,
        context
      );
    }
    removeTorrents(ids, trash) {
      const o = {
        arguments: {
          "delete-local-data": trash,
          ids: []
        },
        method: "torrent-remove"
      };
      if (ids) {
        for (let index = 0, length_ = ids.length; index < length_; ++index) {
          o.arguments.ids.push(ids[index].getId());
        }
      }
      this.sendRequest(o, () => {
        this.controller.refreshTorrents();
      });
    }
    verifyTorrents(ids, callback, context) {
      this.sendTorrentActionRequests(
        "torrent-verify",
        ids,
        callback,
        context
      );
    }
    reannounceTorrents(ids, callback, context) {
      this.sendTorrentActionRequests(
        "torrent-reannounce",
        ids,
        callback,
        context
      );
    }
    addTorrentByUrl(url, options) {
      if (/^[\da-f]{40}$/i.test(url)) {
        url = `magnet:?xt=urn:btih:${url}`;
      }
      const o = {
        arguments: {
          filename: url,
          paused: options.paused
        },
        method: "torrent-add"
      };
      this.sendRequest(o, () => {
        this.controller.refreshTorrents();
      });
    }
    savePrefs(arguments_) {
      const o = {
        arguments: arguments_,
        method: "session-set"
      };
      this.sendRequest(o, () => {
        this.controller.loadDaemonPrefs();
      });
    }
    updateBlocklist() {
      const o = {
        method: "blocklist-update"
      };
      this.sendRequest(o, () => {
        this.controller.loadDaemonPrefs();
      });
    }
    moveTorrentsToTop(ids, callback, context) {
      this.sendTorrentActionRequests(
        RPC.QueueMoveTop,
        ids,
        callback,
        context
      );
    }
    moveTorrentsToBottom(ids, callback, context) {
      this.sendTorrentActionRequests(
        RPC.QueueMoveBottom,
        ids,
        callback,
        context
      );
    }
    moveTorrentsUp(ids, callback, context) {
      this.sendTorrentActionRequests(
        RPC.QueueMoveUp,
        ids,
        callback,
        context
      );
    }
    moveTorrentsDown(ids, callback, context) {
      this.sendTorrentActionRequests(
        RPC.QueueMoveDown,
        ids,
        callback,
        context
      );
    }
  };
  Remote.SessionHeader = "X-Transmission-Session-Id";

  // src/js/torrent-row.js
  var TorrentRendererHelper = {
    formatETA: (t) => {
      const eta = t.getETA();
      if (eta < 0 || eta >= 999 * 60 * 60) {
        return "";
      }
      return `ETA: ${Formatter.timeInterval(eta, 1)}`;
    },
    getProgressInfo: (controller, t) => {
      const status = t.getStatus();
      const classList = ["torrent-progress-bar"];
      let percent = 100;
      let ratio = null;
      if (status === Torrent._StatusStopped) {
        classList.push("paused");
      }
      if (t.needsMetaData()) {
        classList.push("magnet");
        percent = t.getMetadataPercentComplete() * 100;
      } else if (status === Torrent._StatusCheck) {
        classList.push("verify");
        percent = t.getRecheckProgress() * 100;
      } else if (t.getLeftUntilDone() > 0) {
        classList.push("leech");
        percent = t.getPercentDone() * 100;
      } else {
        classList.push("seed");
        if (status !== Torrent._StatusStopped) {
          const seed_ratio_limit = t.seedRatioLimit(controller);
          ratio = seed_ratio_limit > 0 ? t.getUploadRatio() * 100 / seed_ratio_limit : 100;
        }
      }
      if (t.isQueued()) {
        classList.push("queued");
      }
      return {
        classList,
        percent,
        ratio
      };
    },
    renderProgressbar: (controller, t, progressbar) => {
      const info = TorrentRendererHelper.getProgressInfo(controller, t);
      const percent = Math.min(info.ratio || info.percent, 100);
      const pct_str = `${Formatter.percentString(percent, 2)}%`;
      progressbar.className = info.classList.join(" ");
      progressbar.style.setProperty("--progress", pct_str);
      progressbar.dataset.progress = info.ratio ? "100%" : pct_str;
    },
    symbol: { down: "\u25BC", up: "\u25B2" }
  };
  var TorrentRenderer = class _TorrentRenderer {
    static renderPeerDetails(t, peer_details) {
      const fmt = Formatter;
      const has_error = t.getError() !== Torrent._ErrNone;
      peer_details.classList.toggle("error", has_error);
      const error = t.getErrorMessage();
      if (error) {
        peer_details.textContent = error;
      } else if (t.isDownloading()) {
        const peer_count = t.getPeersConnected();
        const webseed_count = t.getWebseedsSendingToUs();
        const s = ["Downloading from"];
        if (peer_count) {
          s.push(
            t.getPeersSendingToUs(),
            "of",
            fmt.countString("peer", "peers", peer_count)
          );
          if (webseed_count) {
            s.push("and");
          }
        }
        if (webseed_count) {
          s.push(fmt.countString("web seed", "web seeds", webseed_count));
        }
        s.push(
          "-",
          TorrentRendererHelper.symbol.down,
          fmt.speedBps(t.getDownloadSpeed()),
          TorrentRendererHelper.symbol.up,
          fmt.speedBps(t.getUploadSpeed())
        );
        peer_details.textContent = s.join(" ");
      } else if (t.isSeeding()) {
        const str = [
          "Seeding to",
          t.getPeersGettingFromUs(),
          "of",
          fmt.countString("peer", "peers", t.getPeersConnected()),
          "-",
          TorrentRendererHelper.symbol.up,
          fmt.speedBps(t.getUploadSpeed())
        ].join(" ");
        peer_details.textContent = str;
      } else if (t.isChecking()) {
        const str = [
          "Verifying local data (",
          fmt.percentString(100 * t.getRecheckProgress(), 1),
          "% tested)"
        ].join("");
        peer_detailstextContent = str;
      } else {
        peer_details.textContent = t.getStateString();
      }
    }
    static renderProgressDetails(controller, t, progress_details) {
      const fmt = Formatter;
      if (t.needsMetaData()) {
        let MetaDataStatus = "retrieving";
        if (t.isStopped()) {
          MetaDataStatus = "needs";
        }
        const percent = 100 * t.getMetadataPercentComplete();
        const str = [
          "Magnetized transfer - ",
          MetaDataStatus,
          " metadata (",
          fmt.percentString(percent, 1),
          "%)"
        ].join("");
        progress_details.textContent = str;
        return;
      }
      const sizeWhenDone = t.getSizeWhenDone();
      const totalSize = t.getTotalSize();
      const is_done = t.isDone() || t.isSeeding();
      const s = [];
      if (is_done) {
        if (totalSize === sizeWhenDone) {
          s.push(fmt.size(totalSize));
        } else {
          s.push(
            fmt.size(sizeWhenDone),
            " of ",
            fmt.size(t.getTotalSize()),
            " (",
            t.getPercentDoneStr(),
            "%)"
          );
        }
        s.push(
          ", uploaded ",
          fmt.size(t.getUploadedEver()),
          " (Ratio: ",
          fmt.ratioString(t.getUploadRatio()),
          ")"
        );
      } else {
        s.push(
          fmt.size(sizeWhenDone - t.getLeftUntilDone()),
          " of ",
          fmt.size(sizeWhenDone),
          " (",
          t.getPercentDoneStr(),
          "%)"
        );
      }
      if (!t.isStopped() && (!is_done || t.seedRatioLimit(controller) > 0)) {
        s.push(" - ");
        const eta = t.getETA();
        if (eta < 0 || eta >= 999 * 60 * 60) {
          s.push("remaining time unknown");
        } else {
          s.push(fmt.timeInterval(t.getETA(), 1), " remaining");
        }
      }
      progress_details.textContent = s.join("");
    }
    render(controller, torrent, root) {
      const is_stopped = torrent.isStopped();
      root.classList.toggle("paused", is_stopped);
      const { name, peer_details, progressbar, progress_details } = root;
      name.textContent = torrent.getName();
      _TorrentRenderer.renderProgressDetails(controller, torrent, progress_details);
      TorrentRendererHelper.renderProgressbar(controller, torrent, progressbar);
      _TorrentRenderer.renderPeerDetails(torrent, peer_details);
    }
    createRow(torrent) {
      const root = document.createElement("li");
      root.className = "torrent";
      const elements = [
        ["name", "torrent-name"],
        ["progress_details", "torrent-progress-details"],
        ["progressbar", "torrent-progress-bar"],
        ["peer_details", "torrent-peer-details"]
      ];
      for (const [name, className] of elements) {
        const e = document.createElement("div");
        e.className = className;
        root.append(e);
        root[name] = e;
      }
      return root;
    }
  };
  var TorrentRow = class {
    constructor(view, controller, torrent) {
      this._view = view;
      this._torrent = torrent;
      this._element = view.createRow(torrent);
      const update = () => this.render(controller);
      this._torrent.addEventListener("dataChanged", update);
      update();
    }
    getElement() {
      return this._element;
    }
    render(controller) {
      const tor = this.getTorrent();
      if (tor) {
        this._view.render(controller, tor, this.getElement());
      }
    }
    isSelected() {
      return this.getElement().classList.contains("selected");
    }
    getTorrent() {
      return this._torrent;
    }
    getTorrentId() {
      return this.getTorrent().getId();
    }
  };

  // src/js/transmission.js
  var Transmission = class _Transmission extends EventTarget {
    constructor(toolbar, prefs) {
      super();
      this.toolbar = toolbar;
      this.prefs = prefs;
      this.remote = new Remote(this);
      this.torrentRenderer = new TorrentRenderer();
      this.addEventListener(
        "torrent-selection-changed",
        (event_) => this.toolbar.update(event_)
      );
      this._torrents = {};
      this._rows = [];
      this.dirtyTorrents = /* @__PURE__ */ new Set();
      this.changeStatus = false;
      this.resortSoon = debounce(() => this._resort(false));
      this.resortAllSoon = debounce(() => this._resort(true));
      this.pointer_device = Object.seal({
        is_touch_device: "ontouchstart" in window,
        long_press_callback: null,
        x: 0,
        y: 0
      });
      const input = document.getElementById("add-torrent-input");
      input.addEventListener("change", (e) => {
        const files = e.target.files;
        if (files && files.length > 0) {
          this._handleTorrentFiles(files);
          e.target.value = "";
        }
      });
      for (const element of document.querySelectorAll(`button[data-action]`)) {
        const { action } = element.dataset;
        if (!this.toolbar.enabled(action)) {
          element.setAttribute("disabled", true);
        } else {
          element.removeAttribute("disabled");
        }
        element.addEventListener("click", () => {
          this.toolbar.click(action);
        });
      }
      this.toolbar.addEventListener("change", (event_) => {
        for (const element of document.querySelectorAll(
          `[data-action="${event_.action}"]`
        )) {
          if (!event_.enabled) {
            element.setAttribute("disabled", true);
          } else {
            element.removeAttribute("disabled");
          }
        }
      });
      this.toolbar.addEventListener("click", (event_) => {
        switch (event_.action) {
          case "add-torrent":
            this._addTorrents();
            break;
          case "remove-torrent":
            this._removeSelectedTorrents(true);
            break;
          case "start-torrents":
            this._startTorrents();
            break;
          case "stop-torrents":
            this._stopTorrents();
            break;
          case "sort-order":
            this._SortOrder();
            break;
          case "alt-speed":
            this.remote.savePrefs({ [RPC.AltSpeedEnabled]: !this.session_properties[RPC.AltSpeedEnabled] });
            break;
          default:
            alert(`unhandled action: ${event_.action}`);
        }
      });
      document.addEventListener("keydown", this._keyDown.bind(this));
      document.addEventListener("keyup", this._keyUp.bind(this));
      for (const element of document.querySelectorAll("html, #toolbar, #statusbar")) {
        element.addEventListener("click", (event_) => {
          if (event_.target === event_.currentTarget) {
            this._deselectAll();
          }
        });
      }
      ;
      this.elements = {
        torrent_list: document.querySelector("#torrents")
      };
      if (this.pointer_device.is_touch_device) {
        const touch = this.pointer_device;
        this.elements.torrent_list.addEventListener("touchstart", (event_) => {
          touch.x = event_.touches[0].pageX;
          touch.y = event_.touches[0].pageY;
          if (touch.long_press_callback) {
            clearTimeout(touch.long_press_callback);
            touch.long_press_callback = null;
          } else {
            touch.long_press_callback = setTimeout(
              right_click.bind(this),
              500,
              event_
            );
          }
        });
        this.elements.torrent_list.addEventListener("touchend", () => {
          clearTimeout(touch.long_press_callback);
          touch.long_press_callback = null;
          setTimeout(() => {
            const popup = this.popup[_Transmission.default_popup_level];
            if (popup) {
              popup.root.style.pointerEvents = "auto";
            }
          }, 1);
        });
        this.elements.torrent_list.addEventListener("touchmove", (event_) => {
          touch.x = event_.touches[0].pageX;
          touch.y = event_.touches[0].pageY;
          clearTimeout(touch.long_press_callback);
          touch.long_press_callback = null;
        });
      } else {
        this.elements.torrent_list.addEventListener("mousemove", (event_) => {
          this.pointer_device.x = event_.pageX;
          this.pointer_device.y = event_.pageY;
        });
      }
      this.loadDaemonPrefs();
      this._initializeTorrents();
      this.refreshTorrents();
      this.togglePeriodicSessionRefresh(true);
      this.prefs.addEventListener(
        "change",
        ({ key }) => this._onPrefChanged(key)
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
      const event = new Event("session-change");
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
          const msec = pref > 0 ? pref * 1e3 : 1e3;
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
      return _Transmission.max_popups - 1;
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
      return _Transmission._getTorrentIds(this._getSelectedTorrents());
    }
    _setSelectedRow(row) {
      const e_sel = row ? row.getElement() : null;
      for (const e of this.elements.torrent_list.children) {
        e.classList.toggle("selected", e === e_sel);
      }
      this._dispatchSelectionChanged();
    }
    _selectRow(row) {
      row.getElement().classList.add("selected");
      this._dispatchSelectionChanged();
    }
    _deselectRow(row) {
      row.getElement().classList.remove("selected");
      this._dispatchSelectionChanged();
    }
    _selectAll() {
      for (const e of this.elements.torrent_list.children) {
        e.classList.add("selected");
      }
      this._dispatchSelectionChanged();
    }
    _deselectAll() {
      for (const e of this.elements.torrent_list.children) {
        e.classList.remove("selected");
      }
      this._dispatchSelectionChanged();
      delete this._last_torrent_clicked;
    }
    _indexOfLastTorrent() {
      return this._rows.findIndex(
        (row) => row.getTorrentId() === this._last_torrent_clicked
      );
    }
    _dispatchSelectionChanged() {
      const nonselected = [];
      const selected = [];
      for (const r of this._rows) {
        (r.isSelected() ? selected : nonselected).push(r.getTorrent());
      }
      const event = new Event("torrent-selection-changed");
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
          const msec = 3e3;
          this.sessionInterval = setInterval(
            this.loadDaemonPrefs.bind(this),
            msec
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
            t.addEventListener("dataChanged", this._onTorrentChanged.bind(this));
            this.dirtyTorrents.add(id);
            if (!("name" in t.fields) || !("status" in t.fields)) {
              needinfo.push(id);
            }
          }
        }
        if (needinfo.length > 0) {
          const more_fields = [
            "id",
            ...Torrent.Fields.Metadata,
            ...Torrent.Fields.Stats
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
      const fields = ["id", ...Torrent.Fields.Stats];
      this.updateTorrents("recently-active", fields);
    }
    _initializeTorrents() {
      const fields = ["id", ...Torrent.Fields.Metadata, ...Torrent.Fields.Stats];
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
      const destination = this.session_properties["download-dir"];
      for (const file of files) {
        const reader = new FileReader();
        reader.addEventListener("load", (e) => {
          const contents = e.target.result;
          const key = "base64,";
          const index = contents.indexOf(key);
          if (index === -1) {
            return;
          }
          const o = {
            arguments: {
              "download-dir": destination,
              metainfo: contents.slice(Math.max(0, index + key.length)),
              paused
            },
            method: "torrent-add"
          };
          this.remote.sendRequest(o, (response) => {
            if (response.result !== "success") {
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
        _Transmission._getTorrentIds(torrents),
        false,
        this.refreshTorrents,
        this
      );
    }
    _stopTorrents() {
      this.changeStatus = true;
      const torrents = this._getSelectedRows().length == 0 ? this._getAllTorrents() : this._getSelectedTorrents();
      this.remote.stopTorrents(
        _Transmission._getTorrentIds(torrents),
        () => {
          setTimeout(() => {
            this.refreshTorrents();
          }, 500);
        },
        this
      );
    }
    _SortOrder() {
      if (this.prefs.get(Prefs.SortMode) === Prefs.SortByQueue) {
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
        version
      };
      const element = document.querySelector("#alt-speed");
      if (o[RPC.AltSpeedEnabled]) {
        element.classList.toggle("on", o[RPC.AltSpeedEnabled]);
      } else {
        element.classList.toggle("on", o[RPC.AltSpeedEnabled]);
      }
    }
    _updateStatusbar() {
      const fmt = Formatter;
      const torrents = this._getAllTorrents();
      const u = torrents.reduce(
        (accumulator, tor) => accumulator + tor.getUploadSpeed(),
        0
      );
      const d = torrents.reduce(
        (accumulator, tor) => accumulator + tor.getDownloadSpeed(),
        0
      );
      const string = fmt.countString("Transfer", "Transfers", this._rows.length);
      document.querySelector("#speed-down").textContent = fmt.speedBps(d);
      document.querySelector("#speed-up").textContent = fmt.speedBps(u);
    }
    sortRows(rows) {
      const torrents = rows.map((row) => row.getTorrent());
      const id2row = rows.reduce((accumulator, row) => {
        accumulator[row.getTorrent().getId()] = row;
        return accumulator;
      }, {});
      Torrent.sortTorrents(
        torrents,
        this.prefs.sort_mode
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
      const countSelectedRows = () => [...list.children].reduce(
        (n, e) => n + e.classList.contains("selected") ? 1 : 0,
        0
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
          e.addEventListener("click", this._onRowClicked.bind(this));
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
            dirty_rows[di].getTorrent()
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
      if (old_sel_count !== countSelectedRows() || old_row_count !== countRows()) {
        this._dispatchSelectionChanged();
      }
    }
  };

  // src/js/main.js
  function main() {
    const toolbar = new Toolbar();
    const prefs = new Prefs();
    const transmission = new Transmission(toolbar, prefs);
    const scroll_soon = debounce(
      () => transmission.elements.torrent_list.scrollTo(0, 1)
    );
    window.addEventListener("load", scroll_soon);
    window.addEventListener("orientationchange", scroll_soon);
  }
  document.addEventListener("DOMContentLoaded", main);
})();

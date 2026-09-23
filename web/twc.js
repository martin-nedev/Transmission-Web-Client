(() => {
  // src/js/throttle.js
  function throttle(callback, wait = 100) {
    let timeout = null;
    return (...args) => {
      if (!timeout) {
        timeout = setTimeout(() => {
          timeout = null;
          callback(...args);
        }, wait);
      }
    };
  }

  // src/js/preferences.js
  var Preferences = class _Preferences extends EventTarget {
    constructor() {
      super();
      this.cache = {};
      this.dispatchPrefsChange = throttle((key, oldValue, newValue) => {
        const event = new Event("change");
        Object.assign(event, { key, oldValue, newValue });
        this.dispatchEvent(event);
      });
      for (const [key, defaultValue] of Object.entries(_Preferences.Defaults)) {
        this.set(key, _Preferences.#getCookie(key, defaultValue));
        const propertyName = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        Object.defineProperty(this, propertyName, {
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
        _Preferences.#setCookie(key, newValue);
        this.dispatchPrefsChange(key, oldValue, newValue);
      }
    }
    static #setCookie(key, newValue) {
      const date = /* @__PURE__ */ new Date();
      date.setFullYear(date.getFullYear() + 1);
      const encodedKey = encodeURIComponent(key);
      const encodedValue = encodeURIComponent(String(newValue));
      document.cookie = `${encodedKey}=${encodedValue}; SameSite=Strict; expires=${date.toUTCString()}`;
    }
    static #getCookie(key, fallback) {
      const value = _Preferences.#readCookie(key);
      if (value === null || value === "") {
        return fallback;
      }
      const decodedValue = decodeURIComponent(value);
      const type = typeof fallback;
      if (type === "boolean") {
        if (decodedValue === "true") {
          return true;
        }
        if (decodedValue === "false") {
          return false;
        }
        return fallback;
      }
      if (type === "number") {
        const f = Number.parseFloat(decodedValue);
        return Number.isNaN(f) ? fallback : f;
      }
      return decodedValue;
    }
    static #readCookie(key) {
      const encodedKey = encodeURIComponent(key);
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${encodedKey}=`);
      return parts.length === 2 ? parts.pop().split(";").shift() : null;
    }
  };
  Preferences.RpcUrl = "rpc-url";
  Preferences.RpcPort = "rpc-port";
  Preferences.RpcUsername = "rpc-username";
  Preferences.RpcPassword = "rpc-password";
  Preferences.RefreshRate = "refresh-rate-sec";
  Preferences.SortMode = "sort-mode";
  Preferences.SortByName = "sort-by-name";
  Preferences.SortByAge = "sort-by-age";
  Preferences.AltSpeed = "alt-speed";
  Preferences.Defaults = {
    [Preferences.RpcUrl]: "../rpc",
    [Preferences.RpcUsername]: "",
    [Preferences.RpcPassword]: "",
    [Preferences.RefreshRate]: 1,
    [Preferences.SortMode]: Preferences.SortByName,
    [Preferences.AltSpeed]: false
  };

  // src/js/toolbar.js
  var Toolbar = class extends EventTarget {
    constructor() {
      super();
      this.buttons = Object.seal({
        "add-torrents": { enabled: true, text: "Add torrents\u2026" },
        "remove-torrents": { enabled: false, text: "Remove torrents" },
        "start-torrents": { enabled: false, text: "Start torrents" },
        "stop-torrents": { enabled: false, text: "Stop torrents" },
        "sort-order": { enabled: true, text: "Sort Order" },
        "alt-speed": { enabled: true, text: "Alternative Speed" },
        "settings": { enabled: true, text: "Settings" }
      });
    }
    click(name) {
      if (this.enabled(name)) {
        const event = new CustomEvent("click", {
          detail: { button: name }
        });
        this.dispatchEvent(event);
      }
    }
    enabled(name) {
      const button = this.buttons[name];
      if (!button) {
        throw new Error(`no such button: ${name}`);
      }
      return button.enabled;
    }
    text(name) {
      const button = this.buttons[name];
      if (!button) {
        throw new Error(`no such button: ${name}`);
      }
      return button.text;
    }
    update(event) {
      const buttonStates = this.#getButtonStates(event);
      for (const [name, enabled] of Object.entries(buttonStates)) {
        const button = this.buttons[name];
        if (!button) {
          throw new Error(`no such button: ${name}`);
        }
        if (button.enabled === enabled) {
          continue;
        }
        button.enabled = enabled;
        const stateEvent = new CustomEvent("change", {
          detail: { button: name, enabled }
        });
        this.dispatchEvent(stateEvent);
      }
    }
    #getSelectionState(event) {
      const { selected = [], unselected = [] } = event.detail || event;
      const selectedCount = selected.length;
      const selectedPaused = selected.filter((tor) => tor.isStopped()).length;
      const selectedActive = selectedCount - selectedPaused;
      const unselectedCount = unselected.length;
      const unselectedPaused = unselected.filter((tor) => tor.isStopped()).length;
      const unselectedActive = unselectedCount - unselectedPaused;
      return {
        selectedCount,
        selectedPaused,
        selectedActive,
        unselectedCount,
        unselectedPaused,
        unselectedActive
      };
    }
    #getButtonStates(event) {
      const {
        selectedCount,
        selectedPaused,
        selectedActive,
        unselectedPaused,
        unselectedActive
      } = this.#getSelectionState(event);
      return {
        "remove-torrents": selectedCount > 0,
        "start-torrents": selectedCount > 0 ? selectedPaused > 0 : unselectedPaused > 0,
        "stop-torrents": selectedCount > 0 ? selectedActive > 0 : unselectedActive > 0
      };
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
  var pluralRules = new Intl.PluralRules();
  var currentLocale = pluralRules.resolvedOptions().locale;
  var numberFormat = new Intl.NumberFormat(currentLocale);
  var kilo = 1e3;
  var memFormatters = [
    new Intl.NumberFormat(currentLocale, {
      maximumFractionDigits: 0,
      style: "unit",
      unit: "byte"
    }),
    new Intl.NumberFormat(currentLocale, {
      maximumFractionDigits: 0,
      style: "unit",
      unit: "kilobyte"
    }),
    new Intl.NumberFormat(currentLocale, {
      maximumFractionDigits: 0,
      style: "unit",
      unit: "megabyte"
    }),
    new Intl.NumberFormat(currentLocale, {
      maximumFractionDigits: 2,
      style: "unit",
      unit: "gigabyte"
    }),
    new Intl.NumberFormat(currentLocale, {
      maximumFractionDigits: 2,
      style: "unit",
      unit: "terabyte"
    }),
    new Intl.NumberFormat(currentLocale, {
      maximumFractionDigits: 2,
      style: "unit",
      unit: "petabyte"
    })
  ];
  var fmtKBps = new Intl.NumberFormat(currentLocale, {
    maximumFractionDigits: 1,
    style: "unit",
    unit: "kilobyte-per-second"
  });
  var fmtMBps = new Intl.NumberFormat(currentLocale, {
    maximumFractionDigits: 1,
    style: "unit",
    unit: "megabyte-per-second"
  });
  var fmtGBps = new Intl.NumberFormat(currentLocale, {
    maximumFractionDigits: 2,
    style: "unit",
    unit: "gigabyte-per-second"
  });
  var Formatter = {
    countString(msgid, msgidPlural, n) {
      return `${this.number(n)} ${this.ngettext(msgid, msgidPlural, n)}`;
    },
    mem(bytes) {
      if (bytes < 0) {
        return "Unknown";
      }
      if (bytes === 0) {
        return "None";
      }
      let size = bytes;
      for (const nf of memFormatters) {
        if (size < kilo) {
          return nf.format(size);
        }
        size /= kilo;
      }
      return "E2BIG";
    },
    ngettext(msgid, msgidPlural, n) {
      return pluralRules.select(n) === "one" ? msgid : msgidPlural;
    },
    number(number) {
      return numberFormat.format(number);
    },
    percentString(x, decimalPlaces) {
      decimalPlaces = x < 100 ? decimalPlaces : 0;
      const returnValue = Math.floor(x * 10 ** decimalPlaces) / 10 ** decimalPlaces;
      return returnValue.toFixed(decimalPlaces);
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
        return fmtKBps.format(KBps);
      } else if (KBps < 999950) {
        return fmtMBps.format(KBps / 1e3);
      }
      return fmtGBps.format(KBps / 1e6);
    },
    speedBps(Bps) {
      return this.speed(this.toKBps(Bps));
    },
    stringSanitizer(str) {
      return ["E2BIG", "NaN"].some((badStr) => str.includes(badStr)) ? `\u2026` : str;
    },
    timeInterval(seconds, granularDepth = 3) {
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
        buffer = buffer.slice(0, granularDepth);
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
    setField(fields, name, value) {
      const oldValue = fields[name];
      if (isEqual(oldValue, value)) {
        return false;
      }
      const observers = this.fieldObservers[name];
      if (fields === this.fields && observers && observers.length > 0) {
        for (const observer of observers) {
          observer.call(this, value, oldValue, name);
        }
      }
      fields[name] = value;
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
      return [...this.fields.labels || []].sort();
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
      return this.getStatus() === _Torrent.Status.Seed;
    }
    isStopped() {
      return this.getStatus() === _Torrent.Status.Stopped;
    }
    isChecking() {
      return this.getStatus() === _Torrent.Status.Check;
    }
    isDownloading() {
      return this.getStatus() === _Torrent.Status.Download;
    }
    isQueued() {
      return this.getStatus() === _Torrent.Status.DownloadWait || this.getStatus() === _Torrent.Status.SeedWait;
    }
    isDone() {
      return Number(this.getLeftUntilDone()) < 1;
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
        case _Torrent.Status.Stopped:
          return this.isFinished() ? "Seeding complete" : "Paused";
        case _Torrent.Status.CheckWait:
          return "Queued for verification";
        case _Torrent.Status.Check:
          return "Verifying local data";
        case _Torrent.Status.DownloadWait:
          return "Queued for download";
        case _Torrent.Status.Download:
          return "Downloading";
        case _Torrent.Status.SeedWait:
          return "Queued for seeding";
        case _Torrent.Status.Seed:
          return "Seeding";
        case null:
          return "Unknown";
        default:
          return "Error";
      }
    }
    seedRatioLimit(controller) {
      switch (this.getSeedRatioMode()) {
        case _Torrent.RatioMode.UseGlobal:
          return controller.seedRatioLimit();
        case _Torrent.RatioMode.UseLocal:
          return this.getSeedRatioLimit();
        default:
          return -1;
      }
    }
    getErrorMessage() {
      const string = this.getErrorString();
      switch (this.getError()) {
        case _Torrent.Error.TrackerWarning:
          return `Tracker returned a warning: ${string}`;
        case _Torrent.Error.TrackerError:
          return `Tracker returned an error: ${string}`;
        case _Torrent.Error.LocalError:
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
        case Preferences.FilterActive:
          return this.getPeersGettingFromUs() > 0 || this.getPeersSendingToUs() > 0 || this.getWebseedsSendingToUs() > 0 || this.isChecking();
        case Preferences.FilterSeeding:
          return s === _Torrent.Status.Seed || s === _Torrent.Status.SeedWait;
        case Preferences.FilterDownloading:
          return s === _Torrent.Status.Download || s === _Torrent.Status.DownloadWait;
        case Preferences.FilterPaused:
          return this.isStopped();
        case Preferences.FilterFinished:
          return this.isFinished();
        default:
          return true;
      }
    }
    test(state) {
      return this.testState(state);
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
        case Preferences.SortByName:
          index = _Torrent.compareByName(a, b);
          break;
        case Preferences.SortByAge:
          index = _Torrent.compareByAge(a, b);
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
        case Preferences.SortByName:
          torrents.sort(this.compareByName);
          break;
        case Preferences.SortByAge:
          torrents.sort(this.compareByAge);
          break;
        default:
          console.log(`Unrecognized sort mode: ${sortMode}`);
          torrents.sort(this.compareByName);
          break;
      }
      return torrents;
    }
    static Status = Object.freeze({
      Stopped: 0,
      CheckWait: 1,
      Check: 2,
      DownloadWait: 3,
      Download: 4,
      SeedWait: 5,
      Seed: 6
    });
    static RatioMode = Object.freeze({
      UseGlobal: 0,
      UseLocal: 1,
      Unlimited: 2
    });
    static Error = Object.freeze({
      None: 0,
      TrackerWarning: 1,
      TrackerError: 2,
      LocalError: 3
    });
    static TrackerStatus = Object.freeze({
      Inactive: 0,
      Waiting: 1,
      Queued: 2,
      Active: 3
    });
    static Fields = Object.freeze({
      Metadata: [
        "addedDate",
        "file-count",
        "name",
        "primary-mime-type",
        "totalSize"
      ],
      Stats: [
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
      ]
    });
  };

  // src/js/remote.js
  var RPC = {
    Root: "rpc",
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
    #getRpcUrl() {
      const prefs = this.controller?.prefs;
      const rpcUrl = prefs?.get(Preferences.RpcUrl) || Preferences.Defaults[Preferences.RpcUrl];
      return rpcUrl.endsWith("/rpc") ? rpcUrl : `${rpcUrl}/rpc`;
    }
    #getAuthHeader() {
      const prefs = this.controller?.prefs;
      const username = prefs?.get(Preferences.RpcUsername) || Preferences.Defaults[Preferences.RpcUsername];
      const password = prefs?.get(Preferences.RpcPassword) || Preferences.Defaults[Preferences.RpcPassword];
      if (!username && !password) {
        return null;
      }
      const token = btoa(`${username}:${password}`);
      return `Basic ${token}`;
    }
    async sendRequest(request) {
      const headers = new Headers();
      headers.append("cache-control", "no-cache");
      headers.append("content-type", "application/json");
      headers.append("pragma", "no-cache");
      if (this.session) {
        headers.append(_Remote.SessionHeader, this.session);
      }
      const rpcUrl = this.#getRpcUrl();
      const authHeader = this.#getAuthHeader();
      if (authHeader) {
        headers.append("authorization", authHeader);
      }
      try {
        const response = await fetch(rpcUrl, {
          body: JSON.stringify(request),
          headers,
          method: "POST"
        });
        if (response.status === 409) {
          const error = new Error(_Remote.SessionHeader);
          error.header = response.headers.get(_Remote.SessionHeader);
          throw error;
        }
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const responseData = await response.json();
        this.controller?.setConnectionState?.(true);
        return responseData;
      } catch (error) {
        if (error.message === _Remote.SessionHeader) {
          this.session = error.header;
          return this.sendRequest(request);
        }
        this.controller?.setConnectionState?.(false);
        this.controller?.togglePeriodicSessionRefresh?.(false);
        throw error;
      }
    }
    async loadDaemonStats() {
      const request = {
        method: "session-stats"
      };
      const response = await this.sendRequest(request);
      return response["arguments"];
    }
    async loadDaemonPrefs() {
      const request = {
        method: "session-get"
      };
      const response = await this.sendRequest(request);
      return response["arguments"];
    }
    async checkPort(ip) {
      const request = {
        arguments: {
          ip
        },
        method: "port-test"
      };
      const response = await this.sendRequest(request);
      return response["arguments"];
    }
    async updateTorrents(ids, fields) {
      const request = {
        arguments: {
          fields,
          format: "table"
        },
        method: "torrent-get"
      };
      if (ids) {
        request.arguments.ids = ids;
      }
      const response = await this.sendRequest(request);
      return response["arguments"];
    }
    async getFreeSpace(dir) {
      const request = {
        arguments: {
          path: dir
        },
        method: "free-space"
      };
      const response = await this.sendRequest(request);
      return response["arguments"];
    }
    async changeFileCommand(id, fileIndices, command) {
      const requestArgs = {
        ids: [id]
      };
      requestArgs[command] = fileIndices;
      await this.sendRequest({
        arguments: requestArgs,
        method: "torrent-set"
      });
      this.controller.refreshTorrents([id]);
    }
    async #sendTorrentSetRequests(method, ids, args) {
      if (!args) {
        args = {};
      }
      args["ids"] = ids;
      const request = {
        arguments: args,
        method
      };
      return this.sendRequest(request);
    }
    async #sendTorrentActionRequests(method, ids) {
      return this.#sendTorrentSetRequests(method, ids, null);
    }
    async startTorrents(ids, noqueue) {
      const name = noqueue ? "torrent-start-now" : "torrent-start";
      return this.#sendTorrentActionRequests(name, ids);
    }
    async stopTorrents(ids) {
      return this.#sendTorrentActionRequests(
        "torrent-stop",
        ids
      );
    }
    async removeTorrents(ids, trash) {
      const request = {
        arguments: {
          "delete-local-data": trash,
          ids: []
        },
        method: "torrent-remove"
      };
      if (ids) {
        for (let index = 0, length_ = ids.length; index < length_; ++index) {
          request.arguments.ids.push(ids[index].getId());
        }
      }
      await this.sendRequest(request);
      this.controller.refreshTorrents();
    }
    async verifyTorrents(ids) {
      return this.#sendTorrentActionRequests(
        "torrent-verify",
        ids
      );
    }
    async reannounceTorrents(ids) {
      return this.#sendTorrentActionRequests(
        "torrent-reannounce",
        ids
      );
    }
    async addTorrentByUrl(url, options) {
      if (/^[\da-f]{40}$/i.test(url)) {
        url = `magnet:?xt=urn:btih:${url}`;
      }
      const request = {
        arguments: {
          filename: url,
          paused: options.paused
        },
        method: "torrent-add"
      };
      await this.sendRequest(request);
      this.controller.refreshTorrents();
    }
    async savePrefs(requestArgs) {
      const request = {
        arguments: requestArgs,
        method: "session-set"
      };
      await this.sendRequest(request);
      await this.controller.loadDaemonPrefs();
    }
    async updateBlocklist() {
      const request = {
        method: "blocklist-update"
      };
      await this.sendRequest(request);
      await this.controller.loadDaemonPrefs();
    }
    async moveTorrentsToTop(ids) {
      return this.#sendTorrentActionRequests(
        RPC.QueueMoveTop,
        ids
      );
    }
    async moveTorrentsToBottom(ids) {
      return this.#sendTorrentActionRequests(
        RPC.QueueMoveBottom,
        ids
      );
    }
    async moveTorrentsUp(ids) {
      return this.#sendTorrentActionRequests(
        RPC.QueueMoveUp,
        ids
      );
    }
    async moveTorrentsDown(ids) {
      return this.#sendTorrentActionRequests(
        RPC.QueueMoveDown,
        ids
      );
    }
  };
  Remote.SessionHeader = "X-Transmission-Session-Id";

  // src/js/row.js
  var RowRenderer = class _RowRenderer {
    static #formatETA(t) {
      const eta = t.getETA();
      if (eta < 0 || eta >= 999 * 60 * 60) {
        return "";
      }
      return `ETA: ${Formatter.timeInterval(eta, 1)}`;
    }
    static #getProgressInfo(controller, t) {
      const status = t.getStatus();
      const classList = ["torrent-progress-bar"];
      let percent = 100;
      let ratio = null;
      if (status === Torrent.Status.Stopped) {
        classList.push("paused");
      }
      if (t.needsMetaData()) {
        classList.push("magnet");
        percent = t.getMetadataPercentComplete() * 100;
      } else if (status === Torrent.Status.Check) {
        classList.push("verify");
        percent = t.getRecheckProgress() * 100;
      } else if (t.getLeftUntilDone() > 0) {
        classList.push("leech");
        percent = t.getPercentDone() * 100;
      } else {
        classList.push("seed");
        if (status !== Torrent.Status.Stopped) {
          const seedRatioLimit = t.seedRatioLimit(controller);
          ratio = seedRatioLimit > 0 ? t.getUploadRatio() * 100 / seedRatioLimit : 100;
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
    }
    static #renderProgressbar(controller, t, progressbar) {
      const info = this.#getProgressInfo(controller, t);
      const percent = Math.min(info.ratio ?? info.percent, 100);
      const pctStr = `${Formatter.percentString(percent, 2)}%`;
      progressbar.className = info.classList.join(" ");
      progressbar.style.setProperty("--progress", pctStr);
    }
    static get #symbol() {
      return { down: "\u25BC", up: "\u25B2" };
    }
    static #renderPeerDetails(t, peerDetails) {
      const fmt = Formatter;
      const hasError = t.getError() !== Torrent.Error.None;
      peerDetails.classList.toggle("error", hasError);
      const error = t.getErrorMessage();
      if (error) {
        peerDetails.textContent = error;
      } else if (t.isDownloading()) {
        const peerCount = t.getPeersConnected();
        const webseedCount = t.getWebseedsSendingToUs();
        const s = ["Downloading from"];
        if (peerCount) {
          s.push(
            t.getPeersSendingToUs(),
            "of",
            fmt.countString("peer", "peers", peerCount)
          );
          if (webseedCount) {
            s.push("and");
          }
        }
        if (webseedCount) {
          s.push(fmt.countString("web seed", "web seeds", webseedCount));
        }
        s.push(
          "-",
          this.#symbol.down,
          fmt.speedBps(t.getDownloadSpeed()),
          this.#symbol.up,
          fmt.speedBps(t.getUploadSpeed())
        );
        peerDetails.textContent = s.join(" ");
      } else if (t.isSeeding()) {
        const str = [
          "Seeding to",
          t.getPeersGettingFromUs(),
          "of",
          fmt.countString("peer", "peers", t.getPeersConnected()),
          "-",
          this.#symbol.up,
          fmt.speedBps(t.getUploadSpeed())
        ].join(" ");
        peerDetails.textContent = str;
      } else if (t.isChecking()) {
        const str = [
          "Verifying local data (",
          fmt.percentString(100 * t.getRecheckProgress(), 1),
          "% tested)"
        ].join("");
        peerDetails.textContent = str;
      } else {
        peerDetails.textContent = t.getStateString();
      }
    }
    static #renderProgressDetails(controller, t, progressDetails) {
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
        progressDetails.textContent = str;
        return;
      }
      const sizeWhenDone = t.getSizeWhenDone();
      const totalSize = t.getTotalSize();
      const isDone = t.isDone() || t.isSeeding();
      const s = [];
      if (isDone) {
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
      if (!t.isStopped() && (!isDone || t.seedRatioLimit(controller) > 0)) {
        s.push(" - ");
        const eta = t.getETA();
        if (eta < 0 || eta >= 999 * 60 * 60) {
          s.push("remaining time unknown");
        } else {
          s.push(fmt.timeInterval(t.getETA(), 1), " remaining");
        }
      }
      progressDetails.textContent = s.join("");
    }
    render(controller, torrent, elements) {
      const isStopped = torrent.isStopped();
      const { root, name, peerDetails, progressbar, progressDetails } = elements;
      root.classList.toggle("paused", isStopped);
      name.textContent = torrent.getName();
      _RowRenderer.#renderProgressDetails(controller, torrent, progressDetails);
      _RowRenderer.#renderProgressbar(controller, torrent, progressbar);
      _RowRenderer.#renderPeerDetails(torrent, peerDetails);
    }
    createRow() {
      const root = document.createElement("li");
      root.className = "torrent";
      const name = document.createElement("div");
      name.className = "torrent-name";
      const progressDetails = document.createElement("div");
      progressDetails.className = "torrent-progress-details";
      const progressbar = document.createElement("div");
      progressbar.className = "torrent-progress-bar";
      const peerDetails = document.createElement("div");
      peerDetails.className = "torrent-peer-details";
      root.append(name, progressDetails, progressbar, peerDetails);
      return {
        name,
        peerDetails,
        progressDetails,
        progressbar,
        root
      };
    }
  };
  var Row = class {
    #view;
    #torrent;
    #element;
    #elements;
    constructor(view, controller, torrent) {
      this.#view = view;
      this.#torrent = torrent;
      this.#elements = view.createRow(torrent);
      this.#element = this.#elements.root;
      const update = () => this.render(controller);
      this.#torrent.addEventListener("dataChanged", update);
      update();
    }
    getElement() {
      return this.#element;
    }
    render(controller) {
      const tor = this.getTorrent();
      if (tor) {
        this.#view.render(controller, tor, this.#elements);
      }
    }
    isSelected() {
      return this.getElement().classList.contains("selected");
    }
    getTorrent() {
      return this.#torrent;
    }
    getTorrentId() {
      return this.getTorrent().getId();
    }
  };

  // src/js/settings.js
  var SettingsDialog = class extends EventTarget {
    constructor(prefs) {
      super();
      this.prefs = prefs;
      this.element = null;
    }
    open() {
      if (this.element) {
        return;
      }
      const container = document.createElement("div");
      container.className = "dialog-container";
      container.hidden = false;
      container.addEventListener("click", (event) => {
        if (event.target === container) {
          this.close();
        }
      });
      const dialog = document.createElement("div");
      dialog.className = "dialog";
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-labelledby", "settings-dialog-title");
      const title = document.createElement("div");
      title.className = "dialog-title";
      title.id = "settings-dialog-title";
      title.textContent = "Settings";
      dialog.append(title);
      const body = document.createElement("div");
      body.className = "dialog-body";
      this.fields = {
        rpcUrl: this.#createField(body, "settings-rpc-url", "Address", "text"),
        rpcUsername: this.#createField(body, "settings-rpc-username", "Username", "text"),
        rpcPassword: this.#createField(body, "settings-rpc-password", "Password", "password")
      };
      const buttons = document.createElement("div");
      buttons.className = "dialog-buttons";
      this.saveButton = document.createElement("button");
      this.saveButton.type = "button";
      this.saveButton.className = "dialog-button";
      this.saveButton.textContent = "Save";
      buttons.append(this.saveButton);
      this.cancelButton = document.createElement("button");
      this.cancelButton.type = "button";
      this.cancelButton.className = "dialog-button";
      this.cancelButton.textContent = "Cancel";
      buttons.append(this.cancelButton);
      dialog.append(body, buttons);
      container.append(dialog);
      document.body.append(container);
      this.element = container;
      this.onKeyDownHandler = this.#onKeyDown.bind(this);
      this.saveButton.addEventListener("click", this.#saveSettings.bind(this));
      this.cancelButton.addEventListener("click", this.close.bind(this));
      document.addEventListener("keydown", this.onKeyDownHandler);
      this.#load();
      this.fields.rpcUrl.focus();
    }
    close() {
      if (!this.element) {
        return;
      }
      document.removeEventListener("keydown", this.onKeyDownHandler);
      this.element.remove();
      this.element = null;
    }
    #load() {
      this.fields.rpcUrl.value = this.prefs.get(Preferences.RpcUrl);
      this.fields.rpcUsername.value = this.prefs.get(Preferences.RpcUsername);
      this.fields.rpcPassword.value = this.prefs.get(Preferences.RpcPassword);
    }
    #createField(container, id, labelText, type) {
      const label = document.createElement("label");
      label.className = "dialog-label";
      label.setAttribute("for", id);
      label.textContent = labelText;
      const input = document.createElement("input");
      input.className = "dialog-input";
      input.id = id;
      input.type = type;
      input.autocapitalize = "off";
      input.autocomplete = "off";
      input.autocorrect = "off";
      input.spellcheck = "false";
      container.append(label, input);
      return input;
    }
    #saveSettings() {
      const rpcUrl = this.fields.rpcUrl.value.trim();
      const rpcUsername = this.fields.rpcUsername.value.trim();
      const rpcPassword = this.fields.rpcPassword.value;
      this.prefs.set(Preferences.RpcUrl, rpcUrl || Preferences.Defaults[Preferences.RpcUrl]);
      this.prefs.set(Preferences.RpcUsername, rpcUsername);
      this.prefs.set(Preferences.RpcPassword, rpcPassword);
      this.dispatchEvent(new Event("saved"));
      this.close();
    }
    #onKeyDown(event) {
      switch (event.key) {
        case "Escape":
          this.close();
          break;
        case "Enter":
          this.#saveSettings();
          break;
      }
    }
  };

  // src/js/transmission.js
  var Transmission = class _Transmission extends EventTarget {
    #sessionProperties;
    #lastTorrentClicked = null;
    constructor(toolbar, prefs) {
      super();
      document.addEventListener("contextmenu", (event) => {
        event.preventDefault();
      });
      this.toolbar = toolbar;
      this.prefs = prefs;
      this.settingsButton = document.getElementById("settings");
      this.connected = false;
      this.setConnectionState(false);
      this.settingsDialog = new SettingsDialog(this.prefs);
      this.settingsDialog.addEventListener("saved", async () => {
        this.remote.session = "";
        this.setConnectionState(false);
        this.#clearTorrents();
        await this.#loadDaemonPrefs();
        if (this.connected) {
          this.#initializeTorrents();
        }
      });
      this.remote = new Remote(this);
      this.rowRenderer = new RowRenderer();
      this.addEventListener(
        "torrent-selection-changed",
        (event) => this.toolbar.update(event)
      );
      this.torrents = {};
      this.rows = [];
      this.dirtyTorrents = /* @__PURE__ */ new Set();
      this.resortSoon = throttle(() => this.#resort(false));
      this.resortAllSoon = throttle(() => this.#resort(true));
      this.pointerDevice = Object.seal({
        isTouchDevice: "ontouchstart" in window,
        x: 0,
        y: 0
      });
      const input = document.getElementById("add-torrent-input");
      input.addEventListener("change", (e) => {
        const files = e.target.files;
        if (files && files.length > 0) {
          this.#handleTorrentFiles(files);
          e.target.value = "";
        }
      });
      for (const element of document.querySelectorAll(`button[data-button]`)) {
        const { button } = element.dataset;
        const enabled = this.toolbar.enabled(button);
        element.disabled = !enabled;
        element.addEventListener("click", () => {
          this.toolbar.click(button);
        });
      }
      this.toolbar.addEventListener("change", (event) => {
        const { button: buttonName, enabled } = event.detail || {};
        for (const element of document.querySelectorAll(
          `[data-button="${buttonName}"]`
        )) {
          element.disabled = !enabled;
        }
      });
      this.toolbar.addEventListener("click", (event) => {
        const { button: buttonName } = event.detail || {};
        switch (buttonName) {
          case "add-torrents":
            this.#addTorrents();
            break;
          case "remove-torrents":
            this.#removeSelectedTorrents(true);
            break;
          case "start-torrents":
            this.#startSelectedTorrents();
            break;
          case "stop-torrents":
            this.#stopSelectedTorrents();
            break;
          case "sort-order":
            this.#toggleSortOrder();
            break;
          case "alt-speed":
            this.#toggleAltSpeed();
            break;
          case "settings":
            this.settingsDialog.open();
            break;
          default:
            console.warn(`unhandled button: ${buttonName}`);
        }
      });
      document.addEventListener("keydown", this.#keyDown.bind(this));
      const torrentList = document.querySelector("#torrents");
      torrentList.addEventListener("click", (event) => {
        if (event.target === event.currentTarget) {
          this.#deselectAll();
        }
      });
      this.elements = {
        torrentList
      };
      if (!this.pointerDevice.isTouchDevice) {
        this.elements.torrentList.addEventListener("mousemove", (event) => {
          this.pointerDevice.x = event.pageX;
          this.pointerDevice.y = event.pageY;
        });
      }
      this.#loadDaemonPrefs();
      this.#initializeTorrents();
      this.#refreshTorrents();
      this.#togglePeriodicSessionRefresh(true);
      this.prefs.addEventListener(
        "change",
        ({ key, newValue }) => this.#onPrefChanged(key, newValue)
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
      const event = new Event("session-change");
      event.sessionProperties = sessionProperties;
      this.dispatchEvent(event);
      this.#updateToolbar(sessionProperties);
    }
    setConnectionState(connected) {
      this.connected = connected;
      if (this.settingsButton) {
        this.settingsButton.classList.toggle("on", connected);
      }
    }
    refreshTorrents(ids) {
      if (ids && ids.length > 0) {
        const fields = ["id", ...Torrent.Fields.Metadata, ...Torrent.Fields.Stats];
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
          const sortButton = document.getElementById("sort-order");
          if (sortButton) {
            const isAgeSort = value === Preferences.SortByAge;
            sortButton.classList.toggle("on", isAgeSort);
          }
          break;
        case Preferences.RefreshRate: {
          clearInterval(this.refreshTorrentsInterval);
          const callback = this.#refreshTorrents.bind(this);
          const pref = this.prefs.refreshRateSec;
          const msec = pref > 0 ? pref * 1e3 : 1e3;
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
      return _Transmission.getTorrentIds(this.#getSelectedTorrents());
    }
    #setSelectedRow(row) {
      const selectedElement = row ? row.getElement() : null;
      for (const e of this.elements.torrentList.children) {
        e.classList.toggle("selected", e === selectedElement);
      }
      this.#dispatchSelectionChanged();
    }
    #selectRow(row) {
      row.getElement().classList.add("selected");
      this.#dispatchSelectionChanged();
    }
    #deselectRow(row) {
      row.getElement().classList.remove("selected");
      this.#dispatchSelectionChanged();
    }
    #selectAll() {
      for (const e of this.elements.torrentList.children) {
        e.classList.add("selected");
      }
      this.#dispatchSelectionChanged();
    }
    #deselectAll() {
      for (const e of this.elements.torrentList.children) {
        e.classList.remove("selected");
      }
      this.#dispatchSelectionChanged();
      this.#lastTorrentClicked = void 0;
    }
    #indexOfLastTorrent() {
      return this.rows.findIndex(
        (row) => row.getTorrentId() === this.#lastTorrentClicked
      );
    }
    #dispatchSelectionChanged() {
      const nonselected = [];
      const selected = [];
      for (const r of this.rows) {
        (r.isSelected() ? selected : nonselected).push(r.getTorrent());
      }
      const event = new CustomEvent("torrent-selection-changed", {
        detail: { selected, unselected: nonselected }
      });
      event.selected = selected;
      event.nonselected = nonselected;
      this.dispatchEvent(event);
    }
    #keyDown(event) {
      const key = event.key;
      const rows = this.rows;
      const isUpKey = key === "ArrowUp";
      const isDownKey = key === "ArrowDown";
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
          const msec = 3e3;
          this.sessionInterval = setInterval(
            this.#loadDaemonPrefs.bind(this),
            msec
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
            t.addEventListener("dataChanged", this.#onTorrentChanged.bind(this));
            this.dirtyTorrents.add(id);
            addedDirty = true;
            if (!("name" in t.fields) || !("status" in t.fields)) {
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
            "id",
            ...Torrent.Fields.Metadata,
            ...Torrent.Fields.Stats
          ];
          this.#updateTorrents(needInfo, moreFields);
        }
      } catch (error) {
        console.error(`Unable to refresh torrents: ${error.message}`);
        this.setConnectionState(false);
      }
    }
    #refreshTorrents() {
      const fields = ["id", ...Torrent.Fields.Stats];
      this.#updateTorrents("recently-active", fields);
    }
    #initializeTorrents() {
      const fields = ["id", ...Torrent.Fields.Metadata, ...Torrent.Fields.Stats];
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
      const destination = this.sessionProperties?.["download-dir"];
      for (const file of files) {
        const reader = new FileReader();
        reader.addEventListener("load", async (e) => {
          const contents = e.target.result;
          const key = "base64,";
          const index = contents.indexOf(key);
          if (index === -1) {
            return;
          }
          const request = {
            arguments: {
              "download-dir": destination,
              metainfo: contents.slice(Math.max(0, index + key.length)),
              paused
            },
            method: "torrent-add"
          };
          try {
            const response = await this.remote.sendRequest(request);
            if (response.result !== "success") {
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
      const torrents = this.#getSelectedTorrents().length > 0 ? this.#getSelectedTorrents() : this.#getAllTorrents();
      this.#startTorrents(torrents);
    }
    #stopSelectedTorrents() {
      const torrents = this.#getSelectedTorrents().length > 0 ? this.#getSelectedTorrents() : this.#getAllTorrents();
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
        [RPC.AltSpeedEnabled]: !this.sessionProperties[RPC.AltSpeedEnabled]
      }).catch((error) => console.error(error));
    }
    #startTorrents(torrents, force) {
      this.remote.startTorrents(_Transmission.getTorrentIds(torrents), force).then(() => this.#refreshTorrents()).catch((error) => console.error(error));
    }
    #stopTorrents(torrents) {
      this.remote.stopTorrents(_Transmission.getTorrentIds(torrents)).then(() => {
        setTimeout(() => {
          this.#refreshTorrents();
        }, 500);
      }).catch((error) => console.error(error));
    }
    #changeFileCommand(torrentId, rowIndices, command) {
      this.remote.changeFileCommand(torrentId, rowIndices, command).catch((error) => console.error(error));
    }
    #updateToolbar(sessionProperties) {
      const [, version, checksum] = sessionProperties.version.match(/(.*)\s\(([\da-f]+)\)/);
      this.versionInfo = {
        checksum,
        version
      };
      const element = document.querySelector("#alt-speed");
      element.classList.toggle("on", sessionProperties[RPC.AltSpeedEnabled]);
    }
    #updateStatusbar() {
      const fmt = Formatter;
      const torrents = this.#getAllTorrents();
      const u = torrents.reduce(
        (accumulator, tor) => accumulator + tor.getUploadSpeed(),
        0
      );
      const d = torrents.reduce(
        (accumulator, tor) => accumulator + tor.getDownloadSpeed(),
        0
      );
      const string = fmt.countString("Transfer", "Transfers", this.rows.length);
      document.querySelector("#speed-down").textContent = fmt.speedBps(d);
      document.querySelector("#speed-up").textContent = fmt.speedBps(u);
    }
    #sortRows(rows) {
      const torrents = rows.map((row) => row.getTorrent());
      const id2row = rows.reduce((accumulator, row) => {
        accumulator[row.getTorrent().getId()] = row;
        return accumulator;
      }, {});
      Torrent.sortTorrents(
        torrents,
        this.prefs.sortMode
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
      const countSelectedRows = () => [...list.children].reduce(
        (n, e) => n + e.classList.contains("selected") ? 1 : 0,
        0
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
          row.getElement().addEventListener("click", () => this.#onRowClicked(row));
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
            sortMode
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
      if (oldSelCount !== countSelectedRows() || oldRowCount !== countRows()) {
        this.#dispatchSelectionChanged();
      }
    }
  };

  // src/js/twc.js
  function script() {
    const toolbar = new Toolbar();
    const preferences = new Preferences();
    const transmission = new Transmission(toolbar, preferences);
    const scroll = throttle(
      () => transmission.elements.torrentList.scrollTo(0, 1)
    );
    window.addEventListener("load", scroll);
    window.addEventListener("orientationchange", scroll);
  }
  document.addEventListener("DOMContentLoaded", script);
})();

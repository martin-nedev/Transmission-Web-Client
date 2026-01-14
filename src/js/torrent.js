
import { isEqual } from './isequal.js';
import { Formatter } from './formatter.js';
import { Prefs } from './prefs.js';

export class Torrent extends EventTarget {
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
    const keys = ['length', 'name', 'bytesCompleted', 'wanted', 'priority'];

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
    return trackers.map((t) => t.announce.toLowerCase()).join('\t');
  }

  refreshFields(data) {
    let changed = false;

    for (const [key, value] of Object.entries(data)) {
      switch (key) {
        case 'files':
        case 'fileStats':
          changed |= this.updateFiles(value);
          break;
        case 'trackerStats':
          changed |= this.setField(this.fields, 'trackers', value);
          break;
        case 'trackers':
          if (!(key in this.fields)) {
            changed |= this.setField(this.fields, key, value);
          }
          break;
        case 'name':
          if (this.setField(this.fields, key, data[key])) {
            this.fields.collatedName = '';
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
      this.dispatchEvent(new Event('dataChanged'));
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
    return this.fields['file-count'];
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
    return this.fields.name || 'Unknown';
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
    return this.fields['primary-mime-type'] || 'application/octet-stream';
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
    return 'hashString' in this.fields;
  }

  isSeeding() {
    return this.getStatus() === Torrent._StatusSeed;
  }

  isStopped() {
    return this.getStatus() === Torrent._StatusStopped;
  }

  isChecking() {
    return this.getStatus() === Torrent._StatusCheck;
  }

  isDownloading() {
    return this.getStatus() === Torrent._StatusDownload;
  }

  isQueued() {
    return (
      this.getStatus() === Torrent._StatusDownloadWait ||
      this.getStatus() === Torrent._StatusSeedWait
    );
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
      case Torrent._StatusStopped:
        return this.isFinished() ? 'Seeding complete' : 'Paused';
      case Torrent._StatusCheckWait:
        return 'Queued for verification';
      case Torrent._StatusCheck:
        return 'Verifying local data';
      case Torrent._StatusDownloadWait:
        return 'Queued for download';
      case Torrent._StatusDownload:
        return 'Downloading';
      case Torrent._StatusSeedWait:
        return 'Queued for seeding';
      case Torrent._StatusSeed:
        return 'Seeding';
      case null:
        return 'Unknown';
      default:
        return 'Error';
    }
  }

  seedRatioLimit(controller) {
    switch (this.getSeedRatioMode()) {
      case Torrent._RatioUseGlobal:
        return controller.seedRatioLimit();
      case Torrent._RatioUseLocal:
        return this.getSeedRatioLimit();
      default:
        return -1;
    }
  }

  getErrorMessage() {
    const string = this.getErrorString();
    switch (this.getError()) {
      case Torrent._ErrTrackerWarning:
        return `Tracker returned a warning: ${string}`;
      case Torrent._ErrTrackerError:
        return `Tracker returned an error: ${string}`;
      case Torrent._ErrLocalError:
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
    return f.collatedName || '';
  }

  getCollatedTrackers() {
    const f = this.fields;
    if (!f.collatedTrackers && f.trackers) {
      f.collatedTrackers = Torrent.collateTrackers(f.trackers);
    }
    return f.collatedTrackers || '';
  }

  testState(state) {
    const s = this.getStatus();

    switch (state) {
      case Prefs.FilterActive:
        return (
          this.getPeersGettingFromUs() > 0 ||
          this.getPeersSendingToUs() > 0 ||
          this.getWebseedsSendingToUs() > 0 ||
          this.isChecking()
        );
      case Prefs.FilterSeeding:
        return s === Torrent._StatusSeed || s === Torrent._StatusSeedWait;
      case Prefs.FilterDownloading:
        return (
          s === Torrent._StatusDownload || s === Torrent._StatusDownloadWait
        );
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
    return (
      ta.getCollatedName().localeCompare(tb.getCollatedName()) ||
      Torrent.compareById(ta, tb)
    );
  }

  static compareByQueue(ta, tb) {
    return ta.getQueuePosition() - tb.getQueuePosition();
  }

  static compareByAge(ta, tb) {
    const a = ta.getDateAdded();
    const b = tb.getDateAdded();

    return b - a || Torrent.compareByQueue(ta, tb);
  }

  static compareByState(ta, tb) {
    const a = ta.getStatus();
    const b = tb.getStatus();

    return b - a || Torrent.compareByQueue(ta, tb);
  }

  static compareByActivity(ta, tb) {
    const a = ta.getActivity();
    const b = tb.getActivity();

    return b - a || Torrent.compareByState(ta, tb);
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
    return Torrent.compareByState(ta, tb);
  }

  static compareByProgress(ta, tb) {
    const a = ta.getPercentDone();
    const b = tb.getPercentDone();

    return a - b || Torrent.compareByRatio(ta, tb);
  }

  static compareBySize(ta, tb) {
    const a = ta.getTotalSize();
    const b = tb.getTotalSize();

    return a - b || Torrent.compareByName(ta, tb);
  }

  static compareTorrents(a, b, sortMode) {
    let index = 0;

    switch (sortMode) {
      case Prefs.SortByName:
        index = Torrent.compareByName(a, b);
        break;
      case Prefs.SortByQueue:
        index = Torrent.compareByQueue(a, b);
        break;
      default:
        console.log(`Unrecognized sort mode: ${sortMode}`);
        index = Torrent.compareByName(a, b);
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
}

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
  'addedDate',
  'file-count',
  'name',
  'primary-mime-type',
  'totalSize',
];

Torrent.Fields.Stats = [
  'error',
  'errorString',
  'eta',
  'isFinished',
  'isStalled',
  'labels',
  'leftUntilDone',
  'metadataPercentComplete',
  'peersConnected',
  'peersGettingFromUs',
  'peersSendingToUs',
  'percentDone',
  'queuePosition',
  'rateDownload',
  'rateUpload',
  'recheckProgress',
  'seedRatioMode',
  'seedRatioLimit',
  'sizeWhenDone',
  'status',
  'trackers',
  'downloadDir',
  'uploadedEver',
  'uploadRatio',
  'webseedsSendingToUs',
];

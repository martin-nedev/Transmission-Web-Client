import { Formatter } from './formatter.js';
import { Torrent } from './torrent.js';

export class RowRenderer {
  static #formatETA(t) {
    const eta = t.getETA();

    if (eta < 0 || eta >= 999 * 60 * 60) {
      return '';
    }
    return `ETA: ${Formatter.timeInterval(eta, 1)}`;
  }

  static #getProgressInfo(controller, t) {
    const status = t.getStatus();
    const classList = ['torrent-progress-bar'];
    let percent = 100;
    let ratio = null;

    if (status === Torrent.Status.Stopped) {
      classList.push('paused');
    }

    if (t.needsMetaData()) {
      classList.push('magnet');
      percent = t.getMetadataPercentComplete() * 100;
    } else if (status === Torrent.Status.Check) {
      classList.push('verify');
      percent = t.getRecheckProgress() * 100;
    } else if (t.getLeftUntilDone() > 0) {
      classList.push('leech');
      percent = t.getPercentDone() * 100;
    } else {
      classList.push('seed');
      if (status !== Torrent.Status.Stopped) {
        const seedRatioLimit = t.seedRatioLimit(controller);
        ratio =
          seedRatioLimit > 0
            ? (t.getUploadRatio() * 100) / seedRatioLimit
            : 100;
      }
    }

    if (t.isQueued()) {
      classList.push('queued');
    }

    return {
      classList,
      percent,
      ratio,
    };
  }

  static #renderProgressbar(controller, t, progressbar) {
    const info = this.#getProgressInfo(controller, t);
    const percent = Math.min(info.ratio ?? info.percent, 100);
    const pctStr = `${Formatter.percentString(percent, 2)}%`;
    progressbar.className = info.classList.join(' ');
    progressbar.style.setProperty('--progress', pctStr);
  }

  static get #symbol() {
    return { down: '▼', up: '▲' };
  }
  
  static #renderPeerDetails(t, peerDetails) {
    const fmt = Formatter;

    const hasError = t.getError() !== Torrent.Error.None;
    peerDetails.classList.toggle('error', hasError);

    const error = t.getErrorMessage();
    if (error) {
      peerDetails.textContent = error;
    } else if (t.isDownloading()) {
      const peerCount = t.getPeersConnected();
      const webseedCount = t.getWebseedsSendingToUs();
      const s = ['Downloading from'];
      if (peerCount) {
        s.push(
          t.getPeersSendingToUs(),
          'of',
          fmt.countString('peer', 'peers', peerCount),
        );
        if (webseedCount) {
          s.push('and');
        }
      }
      if (webseedCount) {
        s.push(fmt.countString('web seed', 'web seeds', webseedCount));
      }
      s.push(
        '-',
        this.#symbol.down,
        fmt.speedBps(t.getDownloadSpeed()),
        this.#symbol.up,
        fmt.speedBps(t.getUploadSpeed()),
      );
      peerDetails.textContent = s.join(' ');
    } else if (t.isSeeding()) {
      const str = [
        'Seeding to',
        t.getPeersGettingFromUs(),
        'of',
        fmt.countString('peer', 'peers', t.getPeersConnected()),
        '-',
        this.#symbol.up,
        fmt.speedBps(t.getUploadSpeed()),
      ].join(' ');
      peerDetails.textContent = str;
    } else if (t.isChecking()) {
      const str = [
        'Verifying local data (',
        fmt.percentString(100 * t.getRecheckProgress(), 1),
        '% tested)',
      ].join('');
      peerDetails.textContent = str;
    } else {
      peerDetails.textContent = t.getStateString();
    }
  }

  static #renderProgressDetails(controller, t, progressDetails) {
    const fmt = Formatter;

    if (t.needsMetaData()) {
      let MetaDataStatus = 'retrieving';
      if (t.isStopped()) {
        MetaDataStatus = 'needs';
      }
      const percent = 100 * t.getMetadataPercentComplete();
      const str = [
        'Magnetized transfer - ',
        MetaDataStatus,
        ' metadata (',
        fmt.percentString(percent, 1),
        '%)',
      ].join('');
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
          ' of ',
          fmt.size(t.getTotalSize()),
          ' (',
          t.getPercentDoneStr(),
          '%)',
        );
      }
      s.push(
        ', uploaded ',
        fmt.size(t.getUploadedEver()),
        ' (Ratio: ',
        fmt.ratioString(t.getUploadRatio()),
        ')',
      );
    } else {
      s.push(
        fmt.size(sizeWhenDone - t.getLeftUntilDone()),
        ' of ',
        fmt.size(sizeWhenDone),
        ' (',
        t.getPercentDoneStr(),
        '%)',
      );
    }

    if (!t.isStopped() && (!isDone || t.seedRatioLimit(controller) > 0)) {
      s.push(' - ');
      const eta = t.getETA();
      if (eta < 0 || eta >= 999 * 60 * 60 ) {
        s.push('remaining time unknown');
      } else {
        s.push(fmt.timeInterval(t.getETA(), 1), ' remaining');
      }
    }

    progressDetails.textContent = s.join('');
  }

  render(controller, torrent, elements) {
    const isStopped = torrent.isStopped();
    const { root, name, peerDetails, progressbar, progressDetails } = elements;

    root.classList.toggle('paused', isStopped);

    name.textContent = torrent.getName();

    RowRenderer.#renderProgressDetails(controller, torrent, progressDetails);

    RowRenderer.#renderProgressbar(controller, torrent, progressbar);

    RowRenderer.#renderPeerDetails(torrent, peerDetails);
  }

  createRow() {
    const root = document.createElement('li');
    root.className = 'torrent';

    const name = document.createElement('div');
    name.className = 'torrent-name';

    const progressDetails = document.createElement('div');
    progressDetails.className = 'torrent-progress-details';

    const progressbar = document.createElement('div');
    progressbar.className = 'torrent-progress-bar';

    const peerDetails = document.createElement('div');
    peerDetails.className = 'torrent-peer-details';

    root.append(name, progressDetails, progressbar, peerDetails);

    return {
      name,
      peerDetails,
      progressDetails,
      progressbar,
      root,
    };
  }
}

export class Row {
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
    this.#torrent.addEventListener('dataChanged', update);
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
    return this.getElement().classList.contains('selected');
  }

  getTorrent() {
    return this.#torrent;
  }

  getTorrentId() {
    return this.getTorrent().getId();
  }
}
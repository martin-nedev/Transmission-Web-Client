
import { Formatter } from './formatter.js';
import { Torrent } from './torrent.js';

const TorrentRendererHelper = {

  formatETA: (t) => {
    const eta = t.getETA();

    if (eta < 0 || eta >= 999 * 60 * 60) {
      return '';
    }
    return `ETA: ${Formatter.timeInterval(eta, 1)}`;
  },

  getProgressInfo: (controller, t) => {
    const status = t.getStatus();
    const classList = ['torrent-progress-bar'];
    let percent = 100;
    let ratio = null;

    if (status === Torrent._StatusStopped) {
      classList.push('paused');
    }

    if (t.needsMetaData()) {
      classList.push('magnet');
      percent = t.getMetadataPercentComplete() * 100;
    } else if (status === Torrent._StatusCheck) {
      classList.push('verify');
      percent = t.getRecheckProgress() * 100;
    } else if (t.getLeftUntilDone() > 0) {
      classList.push('leech');
      percent = t.getPercentDone() * 100;
    } else {
      classList.push('seed');
      if (status !== Torrent._StatusStopped) {
        const seed_ratio_limit = t.seedRatioLimit(controller);
        ratio =
          seed_ratio_limit > 0
            ? (t.getUploadRatio() * 100) / seed_ratio_limit
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
  },

  renderProgressbar: (controller, t, progressbar) => {
    const info = TorrentRendererHelper.getProgressInfo(controller, t);
    const percent = Math.min(info.ratio || info.percent, 100);
    const pct_str = `${Formatter.percentString(percent, 2)}%`;
    progressbar.className = info.classList.join(' ');
    progressbar.style.setProperty('--progress', pct_str);
    progressbar.dataset.progress = info.ratio ? '100%' : pct_str;
  },
  
  symbol: { down: '▼', up: '▲' },
};

export class TorrentRenderer {
  static renderPeerDetails(t, peer_details) {
    const fmt = Formatter;

    const has_error = t.getError() !== Torrent._ErrNone;
    peer_details.classList.toggle('error', has_error);

    const error = t.getErrorMessage();
    if (error) {
      peer_details.textContent = error;
    } else if (t.isDownloading()) {
      const peer_count = t.getPeersConnected();
      const webseed_count = t.getWebseedsSendingToUs();
      const s = ['Downloading from'];
      if (peer_count) {
        s.push(
          t.getPeersSendingToUs(),
          'of',
          fmt.countString('peer', 'peers', peer_count),
        );
        if (webseed_count) {
          s.push('and');
        }
      }
      if (webseed_count) {
        s.push(fmt.countString('web seed', 'web seeds', webseed_count));
      }
      s.push(
        '-',
        TorrentRendererHelper.symbol.down,
        fmt.speedBps(t.getDownloadSpeed()),
        TorrentRendererHelper.symbol.up,
        fmt.speedBps(t.getUploadSpeed()),
      );
      peer_details.textContent = s.join(' ');
    } else if (t.isSeeding()) {
      const str = [
        'Seeding to',
        t.getPeersGettingFromUs(),
        'of',
        fmt.countString('peer', 'peers', t.getPeersConnected()),
        '-',
        TorrentRendererHelper.symbol.up,
        fmt.speedBps(t.getUploadSpeed()),
      ].join(' ');
      peer_details.textContent = str;
    } else if (t.isChecking()) {
      const str = [
        'Verifying local data (',
        fmt.percentString(100 * t.getRecheckProgress(), 1),
        '% tested)',
      ].join('');
      peer_detailstextContent = str;
    } else {
      peer_details.textContent = t.getStateString();
    }
  }

  static renderProgressDetails(controller, t, progress_details) {
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

    if (!t.isStopped() && (!is_done || t.seedRatioLimit(controller) > 0)) {
      s.push(' - ');
      const eta = t.getETA();
      if (eta < 0 || eta >= 999 * 60 * 60 /* arbitrary */) {
        s.push('remaining time unknown');
      } else {
        s.push(fmt.timeInterval(t.getETA(), 1), ' remaining');
      }
    }

    progress_details.textContent = s.join('');
  }

  render(controller, torrent, root) {
    const is_stopped = torrent.isStopped();
    root.classList.toggle('paused', is_stopped);
    const { name, peer_details, progressbar, progress_details } = root;

    name.textContent = torrent.getName();

    TorrentRenderer.renderProgressDetails(controller, torrent, progress_details,);

    TorrentRendererHelper.renderProgressbar(controller, torrent, progressbar);

    TorrentRenderer.renderPeerDetails(torrent, peer_details);
  }

  createRow(torrent) {
    const root = document.createElement('li');
    root.className = 'torrent';

    const elements = [
      ['name', 'torrent-name'],
      ['progress_details', 'torrent-progress-details'],
      ['progressbar', 'torrent-progress-bar'],
      ['peer_details', 'torrent-peer-details'],
    ];

    for (const [name, className] of elements) {
      const e = document.createElement('div');
      e.className = className;
      root.append(e);
      root[name] = e;
    }

    return root;
  }
}

export class TorrentRow {
  constructor(view, controller, torrent) {
    this._view = view;
    this._torrent = torrent;
    this._element = view.createRow(torrent);

    const update = () => this.render(controller);
    this._torrent.addEventListener('dataChanged', update);
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
    return this.getElement().classList.contains('selected');
  }

  getTorrent() {
    return this._torrent;
  }

  getTorrentId() {
    return this.getTorrent().getId();
  }
}

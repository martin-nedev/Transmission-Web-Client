
export const RPC = {
  Root: '../rpc',
  Version: 'version',
  SpeedLimitDown: 'speed-limit-down',
  SpeedLimitDownEnabled: 'speed-limit-down-enabled',
  SpeedLimitUp: 'speed-limit-up',
  SpeedLimitUpEnabled: 'speed-limit-up-enabled',
  AltSpeedDown: 'alt-speed-down',
  AltSpeedUp: 'alt-speed-up',
  AltSpeedEnabled: 'alt-speed-enabled',
  QueueMoveBottom: 'queue-move-bottom',
  QueueMoveDown: 'queue-move-down',
  QueueMoveTop: 'queue-move-top',
  QueueMoveUp: 'queue-move-up',
};

export class Remote {
  constructor(controller) {
    this.controller = controller;
    this.session = '';
  }

  sendRequest(data, callback, context) {
    const headers = new Headers();
    headers.append('cache-control', 'no-cache');
    headers.append('content-type', 'application/json');
    headers.append('pragma', 'no-cache');
    if (this.session) {
      headers.append(Remote.SessionHeader, this.session);
    }

    let argument = null;
    fetch(RPC.Root, {
      body: JSON.stringify(data),
      headers,
      method: 'POST',
    })
      .then((response) => {
        argument = response;
        if (response.status === 409) {
          const error = new Error(Remote.SessionHeader);
          error.header = response.headers.get(Remote.SessionHeader);
          throw error;
        }
        return response.json();
      })
      .then((payload) => {
        if (callback) {
          callback.call(context, payload, argument);
        }
      })
      .catch((error) => {
        if (error.message === Remote.SessionHeader) {
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
      method: 'session-stats',
    };
    this.sendRequest(o, callback, context);
  }

  loadDaemonPrefs(callback, context) {
    const o = {
      method: 'session-get',
    };
    this.sendRequest(o, callback, context);
  }

  checkPort(ip, callback, context) {
    const o = {
      arguments: {
        ip,
      },
      method: 'port-test',
    };
    this.sendRequest(o, callback, context);
  }

  updateTorrents(ids, fields, callback, context) {
    const o = {
      arguments: {
        fields,
        format: 'table',
      },
      method: 'torrent-get',
    };
    if (ids) {
      o.arguments.ids = ids;
    }
    this.sendRequest(o, (response) => {
      const arguments_ = response['arguments'];
      callback.call(context, arguments_.torrents, arguments_.removed);
    });
  }

  getFreeSpace(dir, callback, context) {
    const o = {
      arguments: {
        path: dir,
      },
      method: 'free-space',
    };
    this.sendRequest(o, (response) => {
      const arguments_ = response['arguments'];
      callback.call(context, arguments_.path, arguments_['size-bytes']);
    });
  }

  changeFileCommand(id, fileIndices, command) {
    const arguments_ = {
      ids: [id],
    };
    arguments_[command] = fileIndices;
    this.sendRequest(
      {
        arguments: arguments_,
        method: 'torrent-set',
      },
      () => {
        this.controller.refreshTorrents([id]);
      },
    );
  }

  sendTorrentSetRequests(method, ids, arguments_, callback, context) {
    if (!arguments_) {
      arguments_ = {};
    }
    arguments_['ids'] = ids;
    const o = {
      arguments: arguments_,
      method,
    };
    this.sendRequest(o, callback, context);
  }

  sendTorrentActionRequests(method, ids, callback, context) {
    this.sendTorrentSetRequests(method, ids, null, callback, context);
  }

  startTorrents(ids, noqueue, callback, context) {
    const name = noqueue ? 'torrent-start-now' : 'torrent-start';
    this.sendTorrentActionRequests(name, ids, callback, context);
  }

  stopTorrents(ids, callback, context) {
    this.sendTorrentActionRequests(
      'torrent-stop',
      ids,
      callback,
      context,
    );
  }

  removeTorrents(ids, trash) {
    const o = {
      arguments: {
        'delete-local-data': trash,
        ids: [],
      },
      method: 'torrent-remove',
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
      'torrent-verify',
      ids,
      callback,
      context,
    );
  }

  reannounceTorrents(ids, callback, context) {
    this.sendTorrentActionRequests(
      'torrent-reannounce',
      ids,
      callback,
      context,
    );
  }

  addTorrentByUrl(url, options) {
    if (/^[\da-f]{40}$/i.test(url)) {
      url = `magnet:?xt=urn:btih:${url}`;
    }
    const o = {
      arguments: {
        filename: url,
        paused: options.paused,
      },
      method: 'torrent-add',
    };
    this.sendRequest(o, () => {
      this.controller.refreshTorrents();
    });
  }

  savePrefs(arguments_) {
    const o = {
      arguments: arguments_,
      method: 'session-set',
    };
    this.sendRequest(o, () => {
      this.controller.loadDaemonPrefs();
    });
  }

  updateBlocklist() {
    const o = {
      method: 'blocklist-update',
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
      context,
    );
  }

  moveTorrentsToBottom(ids, callback, context) {
    this.sendTorrentActionRequests(
      RPC.QueueMoveBottom,
      ids,
      callback,
      context,
    );
  }

  moveTorrentsUp(ids, callback, context) {
    this.sendTorrentActionRequests(
      RPC.QueueMoveUp,
      ids,
      callback,
      context,
    );
  }

  moveTorrentsDown(ids, callback, context) {
    this.sendTorrentActionRequests(
      RPC.QueueMoveDown,
      ids,
      callback,
      context,
    );
  }
}

Remote.SessionHeader = 'X-Transmission-Session-Id';

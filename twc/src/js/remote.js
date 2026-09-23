import { Preferences } from './preferences.js';

export const RPC = {
  Root: 'rpc',
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

  #getRpcUrl() {
    const prefs = this.controller?.prefs;
    const rpcUrl = prefs?.get(Preferences.RpcUrl) || Preferences.Defaults[Preferences.RpcUrl];
    return rpcUrl.endsWith('/rpc') ? rpcUrl : `${rpcUrl}/rpc`;
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
    headers.append('cache-control', 'no-cache');
    headers.append('content-type', 'application/json');
    headers.append('pragma', 'no-cache');
    if (this.session) {
      headers.append(Remote.SessionHeader, this.session);
    }

    const rpcUrl = this.#getRpcUrl();
    const authHeader = this.#getAuthHeader();
    if (authHeader) {
      headers.append('authorization', authHeader);
    }

    try {
      const response = await fetch(rpcUrl, {
        body: JSON.stringify(request),
        headers,
        method: 'POST',
      });

      if (response.status === 409) {
        const error = new Error(Remote.SessionHeader);
        error.header = response.headers.get(Remote.SessionHeader);
        throw error;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const responseData = await response.json();
      this.controller?.setConnectionState?.(true);
      return responseData;
    } catch (error) {
      if (error.message === Remote.SessionHeader) {
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
      method: 'session-stats',
    };
    const response = await this.sendRequest(request);
    return response['arguments'];
  }

  async loadDaemonPrefs() {
    const request = {
      method: 'session-get',
    };
    const response = await this.sendRequest(request);
    return response['arguments'];
  }

  async checkPort(ip) {
    const request = {
      arguments: {
        ip,
      },
      method: 'port-test',
    };
    const response = await this.sendRequest(request);
    return response['arguments'];
  }

  async updateTorrents(ids, fields) {
    const request = {
      arguments: {
        fields,
        format: 'table',
      },
      method: 'torrent-get',
    };
    if (ids) {
      request.arguments.ids = ids;
    }
    const response = await this.sendRequest(request);
    return response['arguments'];
  }

  async getFreeSpace(dir) {
    const request = {
      arguments: {
        path: dir,
      },
      method: 'free-space',
    };
    const response = await this.sendRequest(request);
    return response['arguments'];
  }

  async changeFileCommand(id, fileIndices, command) {
    const requestArgs = {
      ids: [id],
    };
    requestArgs[command] = fileIndices;
    await this.sendRequest({
      arguments: requestArgs,
      method: 'torrent-set',
    });
    this.controller.refreshTorrents([id]);
  }

  async #sendTorrentSetRequests(method, ids, args) {
    if (!args) {
      args = {};
    }
    args['ids'] = ids;
    const request = {
      arguments: args,
      method,
    };
    return this.sendRequest(request);
  }

  async #sendTorrentActionRequests(method, ids) {
    return this.#sendTorrentSetRequests(method, ids, null);
  }

  async startTorrents(ids, noqueue) {
    const name = noqueue ? 'torrent-start-now' : 'torrent-start';
    return this.#sendTorrentActionRequests(name, ids);
  }

  async stopTorrents(ids) {
    return this.#sendTorrentActionRequests(
      'torrent-stop',
      ids,
    );
  }

  async removeTorrents(ids, trash) {
    const request = {
      arguments: {
        'delete-local-data': trash,
        ids: [],
      },
      method: 'torrent-remove',
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
      'torrent-verify',
      ids,
    );
  }

  async reannounceTorrents(ids) {
    return this.#sendTorrentActionRequests(
      'torrent-reannounce',
      ids,
    );
  }

  async addTorrentByUrl(url, options) {
    if (/^[\da-f]{40}$/i.test(url)) {
      url = `magnet:?xt=urn:btih:${url}`;
    }
    const request = {
      arguments: {
        filename: url,
        paused: options.paused,
      },
      method: 'torrent-add',
    };
    await this.sendRequest(request);
    this.controller.refreshTorrents();
  }

  async savePrefs(requestArgs) {
    const request = {
      arguments: requestArgs,
      method: 'session-set',
    };
    await this.sendRequest(request);
    await this.controller.loadDaemonPrefs();
  }

  async updateBlocklist() {
    const request = {
      method: 'blocklist-update',
    };
    await this.sendRequest(request);
    await this.controller.loadDaemonPrefs();
  }

  async moveTorrentsToTop(ids) {
    return this.#sendTorrentActionRequests(
      RPC.QueueMoveTop,
      ids,
    );
  }

  async moveTorrentsToBottom(ids) {
    return this.#sendTorrentActionRequests(
      RPC.QueueMoveBottom,
      ids,
    );
  }

  async moveTorrentsUp(ids) {
    return this.#sendTorrentActionRequests(
      RPC.QueueMoveUp,
      ids,
    );
  }

  async moveTorrentsDown(ids) {
    return this.#sendTorrentActionRequests(
      RPC.QueueMoveDown,
      ids,
    );
  }
}

Remote.SessionHeader = 'X-Transmission-Session-Id';
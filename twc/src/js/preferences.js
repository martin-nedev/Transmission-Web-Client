import { throttle } from './throttle.js';

export class Preferences extends EventTarget {
  constructor() {
    super();

    this.cache = {};

    this.dispatchPrefsChange = throttle((key, oldValue, newValue) => {
      const event = new Event('change');
      Object.assign(event, { key, oldValue, newValue });
      this.dispatchEvent(event);
    });

    for (const [key, defaultValue] of Object.entries(Preferences.Defaults)) {
      this.set(key, Preferences.#getCookie(key, defaultValue));

      const propertyName = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      Object.defineProperty(this, propertyName, {
        get: () => this.get(key),
        set: (value) => {
          this.set(key, value);
        },
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
    const oldValue =  cache[key];
    if (oldValue !== newValue) {
      cache[key] = newValue;
      Preferences.#setCookie(key, newValue);
      this.dispatchPrefsChange(key, oldValue, newValue);
    }
  }

  static #setCookie(key, newValue) {
    const date = new Date();
    date.setFullYear(date.getFullYear() + 1);
    const encodedKey = encodeURIComponent(key);
    const encodedValue = encodeURIComponent(String(newValue));
    document.cookie = `${encodedKey}=${encodedValue}; SameSite=Strict; expires=${date.toUTCString()}`;
  }

  static #getCookie(key, fallback) {
    const value = Preferences.#readCookie(key);
    if (value === null || value === '') {
      return fallback;
    }

    const decodedValue = decodeURIComponent(value);
    const type = typeof fallback;
    if (type === 'boolean') {
      if (decodedValue === 'true') {
        return true;
      }
      if (decodedValue === 'false') {
        return false;
      }
      return fallback;
    }
    if (type === 'number') {
      const f = Number.parseFloat(decodedValue);
      return Number.isNaN(f) ? fallback : f;
    }
    return decodedValue;
  }

  static #readCookie(key) {
    const encodedKey = encodeURIComponent(key);
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${encodedKey}=`);
    return parts.length === 2 ? parts.pop().split(';').shift() : null;
  }
}

Preferences.RpcUrl = 'rpc-url';
Preferences.RpcPort = 'rpc-port';
Preferences.RpcUsername = 'rpc-username';
Preferences.RpcPassword = 'rpc-password';
Preferences.RefreshRate = 'refresh-rate-sec';
Preferences.SortMode = 'sort-mode';
Preferences.SortByName = 'sort-by-name';
Preferences.SortByAge = 'sort-by-age';
Preferences.AltSpeed = 'alt-speed';

Preferences.Defaults = {
  [Preferences.RpcUrl]: '../rpc',
  [Preferences.RpcUsername]: '',
  [Preferences.RpcPassword]: '',
  [Preferences.RefreshRate]: 1,
  [Preferences.SortMode]: Preferences.SortByName,
  [Preferences.AltSpeed]: false,
};
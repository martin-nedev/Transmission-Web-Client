

import { debounce } from './debounce.js';

export class Prefs extends EventTarget {
  constructor() {
    super();

    this.cache = {};

    this.dispatchPrefsChange = debounce((key, oldValue, newValue) => {
      const event = new Event('change');
      Object.assign(event, { key, oldValue, newValue });
      this.dispatchEvent(event);
    });

    for (const [key, defaultValue] of Object.entries(Prefs.Defaults)) {
      this.set(key, Prefs.getCookie(key, defaultValue));

      Object.defineProperty(this, key.replaceAll('-', '_'), {
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
      Prefs.setCookie(key, newValue);
      this.dispatchPrefsChange(key, oldValue, newValue);
    }
  }

  static setCookie(key, newValue) {
    const date = new Date();
    date.setFullYear(date.getFullYear() + 1);
    document.cookie = `${key}=${newValue}; SameSite=Strict; expires=${date.toGMTString()}`;
  }

  static getCookie(key, fallback) {
    const value = Prefs.readCookie(key);
    if (value === null) {
      return fallback;
    }

    const type = typeof fallback;
    if (type === 'boolean') {
      if (value === 'true') {
        return true;
      }
      if (value === 'false') {
        return false;
      }
      return fallback;
    }
    if (type === 'number') {
      const f = Number.parseFloat(value);
      return Number.isNaN(f) ? fallback : f;
    }
    return value;
  }

  static readCookie(key) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${key}=`);
    return parts.length === 2 ? parts.pop().split(';').shift() : null;
  }
}

Prefs.RefreshRate = 'refresh-rate-sec';
Prefs.SortMode = 'sort-mode';
Prefs.SortByName = 'name';
Prefs.SortByQueue = 'queue';
Prefs.AltSpeed = 'alt-speed';

Prefs.Defaults = {
  [Prefs.RefreshRate]: 1,
  [Prefs.SortMode]: Prefs.SortByName,
  [Prefs.AltSpeed]: false,
};

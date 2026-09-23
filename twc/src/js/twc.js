import { throttle } from './throttle.js';
import { Preferences } from './preferences.js';
import { Toolbar } from './toolbar.js';
import { Transmission } from './transmission.js';

function script() {
  const toolbar = new Toolbar();
  const preferences = new Preferences();
  const transmission = new Transmission(toolbar, preferences);

  const scroll = throttle(() =>
    transmission.elements.torrentList.scrollTo(0, 1)
  );
  window.addEventListener('load', scroll);
  window.addEventListener('orientationchange', scroll);
}
document.addEventListener('DOMContentLoaded', script);

import { debounce } from './debounce.js';
import { Prefs } from './prefs.js';
import { Toolbar } from './toolbar.js';
import { Transmission } from './transmission.js';

import '../css/transmission.scss';

function main() {
  const toolbar = new Toolbar();
  const prefs = new Prefs();
  const transmission = new Transmission(toolbar, prefs);

  const scroll_soon = debounce(() =>
    transmission.elements.torrent_list.scrollTo(0, 1),
  );
  window.addEventListener('load', scroll_soon);
  window.addEventListener('orientationchange', scroll_soon);
}
document.addEventListener('DOMContentLoaded', main);

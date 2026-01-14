
export class Toolbar extends EventTarget {
  constructor() {
    super();
    this.actions = Object.seal({
      'add-torrent': {enabled: true, text: 'Add torrent…',},
      'remove-torrent': { enabled: false, text: 'Remove torrent' },
      'start-torrents': { enabled: false, text: 'Start torrents' },
      'stop-torrents': { enabled: false, text: 'Stop torrents' },
      'sort-order': {enabled: true, text: 'Sort Order'},
      'alt-speed': { enabled: true, text: 'Alternative Speed' },
    });
  }

  click(name) {
    if (this.enabled(name)) {
      const event = new Event('click');
      event.action = name;
      this.dispatchEvent(event);
    }
  }

  enabled(name) {
    const action = this.actions[name];
    if (!action) {
      throw new Error(`no such action: ${name}`);
    }
    return action.enabled;
  }

  text(name) {
    const action = this.actions[name];
    if (!action) {
      throw new Error(`no such action: ${name}`);
    }
    return action.text;
  }

  update(event) {
    const selected = event.selected.length;
    const nonselected = event.nonselected.length;
    const selected_paused = event.selected.filter((tor) => tor.isStopped()).length;
    const selected_active = event.selected.length - selected_paused;
    const nonselected_paused = event.nonselected.filter((tor) => tor.isStopped(),).length;
    const nonselected_active = event.nonselected.length - nonselected_paused;
    const paused = selected > 0 ? selected_paused : nonselected_paused;
    const active = selected > 0 ? selected_active : nonselected_active;
    const selected_queued = event.selected.filter((tor) => tor.isQueued()).length;
    const total = selected + nonselected;

    const enable = (enabled, actions) => {
      for (const name of actions) {
        const action = this.actions[name];
        if (!action) {
          throw new Error(`no such action: ${name}`);
        }
        if (action.enabled !== enabled) {
          action.enabled = enabled;
          const event = new Event('change');
          event.action = name;
          event.enabled = enabled;
          this.dispatchEvent(event);
        }
      }
    };
  
    enable(selected > 0, ['remove-torrent']);
    enable(paused > 0, ['start-torrents']);
    enable(active > 0, ['stop-torrents']);
  }
}

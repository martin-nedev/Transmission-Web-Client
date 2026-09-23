export class Toolbar extends EventTarget {
  constructor() {
    super();
    this.buttons = Object.seal({
      'add-torrents': {enabled: true, text: 'Add torrents…'},
      'remove-torrents': { enabled: false, text: 'Remove torrents' },
      'start-torrents': { enabled: false, text: 'Start torrents' },
      'stop-torrents': { enabled: false, text: 'Stop torrents' },
      'sort-order': {enabled: true, text: 'Sort Order'},
      'alt-speed': { enabled: true, text: 'Alternative Speed' },
      'settings': { enabled: true, text: 'Settings' },
    });
  }

  click(name) {
    if (this.enabled(name)) {
      const event = new CustomEvent('click', {
        detail: { button: name },
      });
      this.dispatchEvent(event);
    }
  }

  enabled(name) {
    const button = this.buttons[name];
    if (!button) {
      throw new Error(`no such button: ${name}`);
    }
    return button.enabled;
  }

  text(name) {
    const button = this.buttons[name];
    if (!button) {
      throw new Error(`no such button: ${name}`);
    }
    return button.text;
  }

  update(event) {
    const buttonStates = this.#getButtonStates(event);

    for (const [name, enabled] of Object.entries(buttonStates)) {
      const button = this.buttons[name];
      if (!button) {
        throw new Error(`no such button: ${name}`);
      }
      if (button.enabled === enabled) {
        continue;
      }
      button.enabled = enabled;
      const stateEvent = new CustomEvent('change', {
        detail: { button: name, enabled },
      });
      this.dispatchEvent(stateEvent);
    }
  }

  #getSelectionState(event) {
    const { selected = [], unselected = [] } = event.detail || event;
    const selectedCount = selected.length;
    const selectedPaused = selected.filter((tor) => tor.isStopped()).length;
    const selectedActive = selectedCount - selectedPaused;
    const unselectedCount = unselected.length;
    const unselectedPaused = unselected.filter((tor) => tor.isStopped()).length;
    const unselectedActive = unselectedCount - unselectedPaused;

    return {
      selectedCount,
      selectedPaused,
      selectedActive,
      unselectedCount,
      unselectedPaused,
      unselectedActive,
    };
  }

  #getButtonStates(event) {
    const {
      selectedCount,
      selectedPaused,
      selectedActive,
      unselectedPaused,
      unselectedActive,
    } = this.#getSelectionState(event);

    return {
      'remove-torrents': selectedCount > 0,
      'start-torrents': selectedCount > 0 ? selectedPaused > 0 : unselectedPaused > 0,
      'stop-torrents': selectedCount > 0 ? selectedActive > 0 : unselectedActive > 0,
    };
  }
}
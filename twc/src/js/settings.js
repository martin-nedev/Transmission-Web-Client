import { Preferences } from './preferences.js';

export class SettingsDialog extends EventTarget {
  constructor(prefs) {
    super();
    this.prefs = prefs;
    this.element = null;
  }

  open() {
    if (this.element) {
      return;
    }

    const container = document.createElement('div');
    container.className = 'dialog-container';
    container.hidden = false;
    container.addEventListener('click', (event) => {
      if (event.target === container) {
        this.close();
      }
    });

    const dialog = document.createElement('div');
    dialog.className = 'dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'settings-dialog-title');

    const title = document.createElement('div');
    title.className = 'dialog-title';
    title.id = 'settings-dialog-title';
    title.textContent = 'Settings';
    dialog.append(title);

    const body = document.createElement('div');
    body.className = 'dialog-body';

    this.fields = {
      rpcUrl: this.#createField(body, 'settings-rpc-url', 'Address', 'text'),
      rpcUsername: this.#createField(body, 'settings-rpc-username', 'Username', 'text'),
      rpcPassword: this.#createField(body, 'settings-rpc-password', 'Password', 'password'),
    };

    const buttons = document.createElement('div');
    buttons.className = 'dialog-buttons';

    this.saveButton = document.createElement('button');
    this.saveButton.type = 'button';
    this.saveButton.className = 'dialog-button';
    this.saveButton.textContent = 'Save';
    buttons.append(this.saveButton);

    this.cancelButton = document.createElement('button');
    this.cancelButton.type = 'button';
    this.cancelButton.className = 'dialog-button';
    this.cancelButton.textContent = 'Cancel';
    buttons.append(this.cancelButton);

    dialog.append(body, buttons);
    container.append(dialog);
    document.body.append(container);

    this.element = container;
    this.onKeyDownHandler = this.#onKeyDown.bind(this);
    this.saveButton.addEventListener('click', this.#saveSettings.bind(this));
    this.cancelButton.addEventListener('click', this.close.bind(this));
    document.addEventListener('keydown', this.onKeyDownHandler);

    this.#load();
    this.fields.rpcUrl.focus();
  }

  close() {
    if (!this.element) {
      return;
    }
    document.removeEventListener('keydown', this.onKeyDownHandler);
    this.element.remove();
    this.element = null;
  }

  #load() {
    this.fields.rpcUrl.value = this.prefs.get(Preferences.RpcUrl);
    this.fields.rpcUsername.value = this.prefs.get(Preferences.RpcUsername);
    this.fields.rpcPassword.value = this.prefs.get(Preferences.RpcPassword);
  }

  #createField(container, id, labelText, type) {
    const label = document.createElement('label');
    label.className = 'dialog-label';
    label.setAttribute('for', id);
    label.textContent = labelText;

    const input = document.createElement('input');
    input.className = 'dialog-input';
    input.id = id;
    input.type = type;
    input.autocapitalize = 'off';
    input.autocomplete = 'off';
    input.autocorrect = 'off';
    input.spellcheck = 'false';

    container.append(label, input);
    return input;
  }

  #saveSettings() {
    const rpcUrl = this.fields.rpcUrl.value.trim();
    const rpcUsername = this.fields.rpcUsername.value.trim();
    const rpcPassword = this.fields.rpcPassword.value;

    this.prefs.set(Preferences.RpcUrl, rpcUrl || Preferences.Defaults[Preferences.RpcUrl]);
    this.prefs.set(Preferences.RpcUsername, rpcUsername);
    this.prefs.set(Preferences.RpcPassword, rpcPassword);

    this.dispatchEvent(new Event('saved'));
    this.close();
  }

  #onKeyDown(event) {
    switch (event.key) {
      case 'Escape':
        this.close();
        break;
      case 'Enter':
        this.#saveSettings();
        break;
    }
  }
}
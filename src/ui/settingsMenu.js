import { state } from '../state/store.js';
import { fetchSettings, updateSettings } from '../api/client.js';

let settingsLoaded = false;

export async function loadSettings() {
  const settings = await fetchSettings();
  if (!settings) {
    return null;
  }

  state.aisPersistenceEnabled = Boolean(settings.aisPersistenceEnabled);
  settingsLoaded = true;
  return settings;
}

export function mountSettingsMenu() {
  const container = document.getElementById('settings-menu-content');
  if (!container) {
    return;
  }

  container.innerHTML = '';

  const section = document.createElement('div');
  section.className = 'settings-menu-section';

  const title = document.createElement('div');
  title.className = 'settings-menu-title';
  title.textContent = 'Settings';
  section.appendChild(title);

  const row = document.createElement('label');
  row.className = 'settings-menu-row';
  row.htmlFor = 'settings-ais-persistence';

  const textWrap = document.createElement('div');
  textWrap.className = 'settings-menu-text';
  const label = document.createElement('div');
  label.className = 'settings-menu-label';
  label.textContent = 'Save AIS data to database';
  const hint = document.createElement('div');
  hint.className = 'settings-menu-hint';
  hint.textContent = 'Stores incoming AIS location and metadata history for track playback.';
  textWrap.append(label, hint);

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.id = 'settings-ais-persistence';
  input.checked = Boolean(state.aisPersistenceEnabled);

  input.addEventListener('change', async () => {
    const previous = Boolean(state.aisPersistenceEnabled);
    const next = input.checked;
    state.aisPersistenceEnabled = next;
    input.disabled = true;
    const result = await updateSettings({ aisPersistenceEnabled: next });
    input.disabled = false;

    if (!result) {
      state.aisPersistenceEnabled = previous;
      input.checked = previous;
      return;
    }

    state.aisPersistenceEnabled = Boolean(result.aisPersistenceEnabled);
    input.checked = state.aisPersistenceEnabled;
  });

  row.append(textWrap, input);
  section.appendChild(row);

  if (!settingsLoaded) {
    const status = document.createElement('div');
    status.className = 'settings-menu-status';
    status.textContent = 'Loading settings...';
    section.appendChild(status);
  }

  container.appendChild(section);
}

export async function loadAndMountSettings() {
  await loadSettings();
  mountSettingsMenu();
}

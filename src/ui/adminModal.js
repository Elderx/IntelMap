import { state } from '../state/store.js';
import { fetchAdminStats } from '../api/client.js';

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

let refreshTimer = null;
let refreshInFlight = false;
let initialized = false;

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) {
    return 'Unavailable';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ['KB', 'MB', 'GB', 'TB'];
  let index = -1;
  let current = bytes;
  while (current >= 1024 && index < units.length - 1) {
    current /= 1024;
    index += 1;
  }
  return `${current.toFixed(current >= 100 ? 0 : current >= 10 ? 1 : 2)} ${units[index]}`;
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = value;
}

function isModalVisible() {
  const overlay = document.getElementById('admin-modal-overlay');
  return Boolean(overlay && overlay.classList.contains('visible'));
}

function startRefreshLoop() {
  stopRefreshLoop();
  refreshTimer = setInterval(() => {
    refreshAdminStats();
  }, REFRESH_INTERVAL_MS);
}

function stopRefreshLoop() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

export async function refreshAdminStats() {
  if (!state.isAdmin || refreshInFlight) {
    return;
  }

  refreshInFlight = true;
  setText('admin-stats-status', 'Refreshing...');

  const stats = await fetchAdminStats();
  if (!stats) {
    setText('admin-stats-status', 'Failed to load server statistics.');
    refreshInFlight = false;
    return;
  }

  const tileBytes = stats?.tileCache?.bytes;
  const aisBytes = stats?.aisData?.totalBytes;

  setText('admin-tile-cache-size', formatBytes(tileBytes));
  setText('admin-ais-data-size', formatBytes(aisBytes));

  const generatedAt = stats?.generatedAt ? new Date(stats.generatedAt) : null;
  if (generatedAt && !Number.isNaN(generatedAt.getTime())) {
    setText('admin-stats-updated-at', generatedAt.toLocaleString());
    setText('admin-stats-status', 'Auto-refresh every 5 minutes.');
  } else {
    setText('admin-stats-updated-at', '-');
    setText('admin-stats-status', 'Auto-refresh every 5 minutes.');
  }

  refreshInFlight = false;
}

export function closeAdminModal() {
  const overlay = document.getElementById('admin-modal-overlay');
  if (!overlay) return;

  overlay.classList.remove('visible');
  overlay.setAttribute('aria-hidden', 'true');
  stopRefreshLoop();
}

export function openAdminModal() {
  if (!state.isAdmin) {
    return;
  }

  const overlay = document.getElementById('admin-modal-overlay');
  if (!overlay) return;

  overlay.classList.add('visible');
  overlay.setAttribute('aria-hidden', 'false');

  refreshAdminStats();
  startRefreshLoop();
}

export function updateAdminUiVisibility() {
  const adminToggle = document.getElementById('admin-toggle');
  if (!adminToggle) {
    return;
  }

  if (state.isAdmin) {
    adminToggle.classList.remove('header-hidden');
    return;
  }

  adminToggle.classList.add('header-hidden');
  if (isModalVisible()) {
    closeAdminModal();
  }
}

export function initAdminModal() {
  if (initialized) {
    updateAdminUiVisibility();
    return;
  }

  const adminToggle = document.getElementById('admin-toggle');
  const overlay = document.getElementById('admin-modal-overlay');
  const closeBtn = document.getElementById('admin-modal-close');
  const refreshBtn = document.getElementById('admin-modal-refresh');

  if (!adminToggle || !overlay || !closeBtn || !refreshBtn) {
    return;
  }

  adminToggle.addEventListener('click', () => {
    openAdminModal();
  });

  closeBtn.addEventListener('click', () => {
    closeAdminModal();
  });

  refreshBtn.addEventListener('click', () => {
    refreshAdminStats();
  });

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closeAdminModal();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isModalVisible()) {
      closeAdminModal();
    }
  });

  initialized = true;
  updateAdminUiVisibility();
}

/**
 * IntelMap Theme Manager
 * Handles dark/light theme switching with localStorage persistence
 */

import { state } from '../state/store.js';

const THEME_STORAGE_KEY = 'intelmap-theme';
const THEMES = ['light', 'dark'];

/**
 * Get the saved theme from localStorage
 * @returns {string} Theme ('light' or 'dark')
 */
function getSavedTheme() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved && THEMES.includes(saved)) {
      return saved;
    }
  } catch (e) {
    console.warn('[ThemeManager] Could not read from localStorage:', e);
  }
  return 'light';
}

/**
 * Save theme to localStorage
 * @param {string} theme - Theme to save
 */
function saveTheme(theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (e) {
    console.warn('[ThemeManager] Could not save to localStorage:', e);
  }
}

/**
 * Apply theme to the document
 * @param {string} theme - Theme to apply
 */
function applyTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }

  // Update state
  state.theme = theme;

  // Update Flatpickr theme if loaded
  updateFlatpickrTheme(theme);
}

/**
 * Update Flatpickr theme CSS
 * @param {string} theme - Current theme
 */
function updateFlatpickrTheme(theme) {
  // Check if Flatpickr is loaded
  if (typeof flatpickr === 'undefined') {
    return;
  }

  // Remove old theme link
  const oldLink = document.getElementById('flatpickr-theme-css');
  if (oldLink) {
    oldLink.remove();
  }

  // Add new theme link
  const newLink = document.createElement('link');
  newLink.id = 'flatpickr-theme-css';
  newLink.rel = 'stylesheet';
  // Flatpickr uses 'dark' for dark theme and 'light' (default) for light theme
  // For light theme, we don't need to add the CSS file as it's the default
  if (theme === 'dark') {
    newLink.href = 'node_modules/flatpickr/dist/themes/dark.css';
  }
  document.head.appendChild(newLink);
}

/**
 * Initialize theme on app load
 * Reads from localStorage and applies to document
 */
export function initTheme() {
  const savedTheme = getSavedTheme();
  applyTheme(savedTheme);
  console.log('[ThemeManager] Initialized with theme:', savedTheme);
}

/**
 * Toggle between light and dark themes
 * @returns {string} The new theme
 */
export function toggleTheme() {
  const currentTheme = state.theme || 'light';
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  setTheme(newTheme);
  return newTheme;
}

/**
 * Set a specific theme
 * @param {string} theme - Theme to set ('light' or 'dark')
 */
export function setTheme(theme) {
  if (!THEMES.includes(theme)) {
    console.warn('[ThemeManager] Invalid theme:', theme);
    return;
  }

  applyTheme(theme);
  saveTheme(theme);
  console.log('[ThemeManager] Theme set to:', theme);
}

/**
 * Get the current theme
 * @returns {string} Current theme
 */
export function getCurrentTheme() {
  return state.theme || 'light';
}

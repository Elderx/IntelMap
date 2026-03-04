/**
 * IntelMap Unified Header Component
 * Manages dropdown interactions, badge updates, and reset functionality
 */

import { state } from '../state/store.js';
import { initTheme, toggleTheme } from './themeManager.js';
import { mountSettingsMenu } from './settingsMenu.js';

let backdropElement = null;
let currentOpenDropdown = null;

/**
 * Initialize the header component
 */
export function initHeader() {
  // Get elements
  const backdrop = document.getElementById('header-backdrop');
  const drawToggle = document.getElementById('draw-menu-toggle');
  const drawDropdown = document.getElementById('draw-dropdown');
  const layersToggle = document.getElementById('layers-toggle');
  const layersDropdown = document.getElementById('layers-dropdown');
  const leftMapToggle = document.getElementById('left-map-toggle');
  const leftMapDropdown = document.getElementById('left-map-dropdown');
  const rightMapToggle = document.getElementById('right-map-toggle');
  const rightMapDropdown = document.getElementById('right-map-dropdown');
  const logo = document.getElementById('header-logo');
  const themeToggle = document.getElementById('theme-toggle');
  const settingsToggle = document.getElementById('settings-toggle');
  const settingsDropdown = document.getElementById('settings-dropdown');

  backdropElement = backdrop;

  // Setup dropdown toggles
  setupDropdown(drawToggle, drawDropdown);
  setupDropdown(layersToggle, layersDropdown);
  setupDropdown(leftMapToggle, leftMapDropdown);
  setupDropdown(rightMapToggle, rightMapDropdown);
  setupDropdown(settingsToggle, settingsDropdown);

  // Setup backdrop click to close all dropdowns
  backdrop.addEventListener('click', closeAllDropdowns);

  // Setup logo click to reset map view
  logo.addEventListener('click', (e) => {
    e.preventDefault();
    resetMapView();
  });

  // Setup theme toggle
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      toggleTheme();
    });
  }

  // Initialize theme
  initTheme();

  // Mount settings panel content
  mountSettingsMenu();

  // Close dropdowns on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllDropdowns();
    }
  });

  console.log('[Header] Initialized');
}

/**
 * Setup a dropdown toggle
 */
function setupDropdown(toggleBtn, dropdownPanel) {
  if (!toggleBtn || !dropdownPanel) return;

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = dropdownPanel.classList.contains('visible');

    // Close all other dropdowns first
    closeAllDropdowns();

    // Toggle this dropdown
    if (!isOpen) {
      openDropdown(dropdownPanel, toggleBtn);
    }
  });
}

/**
 * Open a dropdown panel
 */
function openDropdown(dropdownPanel, toggleBtn) {
  dropdownPanel.classList.add('visible');
  if (toggleBtn && dropdownPanel.classList.contains('header-dropdown-anchored')) {
    const toggleRect = toggleBtn.getBoundingClientRect();
    const panelRect = dropdownPanel.getBoundingClientRect();
    const margin = 8;
    const maxLeft = Math.max(margin, window.innerWidth - panelRect.width - margin);
    const preferredLeft = toggleRect.right - panelRect.width;
    const left = Math.min(Math.max(margin, preferredLeft), maxLeft);
    dropdownPanel.style.left = `${left}px`;
    dropdownPanel.style.right = 'auto';
    dropdownPanel.style.top = `${toggleRect.bottom + 6}px`;
  }
  if (toggleBtn) {
    toggleBtn.classList.add('open');
  }
  if (backdropElement) {
    backdropElement.classList.add('visible');
  }
  currentOpenDropdown = dropdownPanel;
}

/**
 * Close all dropdown panels
 */
export function closeAllDropdowns() {
  const dropdowns = document.querySelectorAll('.header-dropdown');
  dropdowns.forEach(d => d.classList.remove('visible'));

  const toggles = document.querySelectorAll('.header-btn-dropdown, #settings-toggle');
  toggles.forEach(t => t.classList.remove('open'));

  if (backdropElement) {
    backdropElement.classList.remove('visible');
  }

  currentOpenDropdown = null;
}

/**
 * Reset the map view to default position
 */
function resetMapView() {
  const defaultCenter = [2500000, 8000000]; // Finland center in EPSG:3857
  const defaultZoom = 5;

  if (state.map && state.map.getView()) {
    state.map.getView().animate({
      center: defaultCenter,
      zoom: defaultZoom,
      duration: 500
    });
  }

  if (state.leftMap && state.leftMap.getView()) {
    state.leftMap.getView().animate({
      center: defaultCenter,
      zoom: defaultZoom,
      duration: 500
    });
  }

  if (state.rightMap && state.rightMap.getView()) {
    state.rightMap.getView().animate({
      center: defaultCenter,
      zoom: defaultZoom,
      duration: 500
    });
  }
}

/**
 * Update the layers badge count
 * @param {number} count - Number of active layers
 */
export function updateLayersBadge(count) {
  const badge = document.getElementById('layers-badge');
  if (!badge) return;

  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : count.toString();
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

/**
 * Update the remove features button visibility
 * Shows when there are drawn features to remove
 */
export function updateRemoveFeaturesButton() {
  const btn = document.getElementById('remove-features-btn');
  if (!btn) return;

  // Check if there are any drawn features
  const hasFeatures = !!(
    state.markerCoords ||
    state.lineCoords ||
    state.polygonCoords ||
    state.circleCoords ||
    state.measureCoords ||
    (state.userMarkers && state.userMarkers.length > 0) ||
    (state.userPolygons && state.userPolygons.length > 0) ||
    (state.userCircles && state.userCircles.length > 0)
  );

  if (hasFeatures) {
    btn.classList.remove('header-hidden');
  } else {
    btn.classList.add('header-hidden');
  }
}

/**
 * Update split toggle button text
 * @param {boolean} isSplit - Whether split screen is active
 */
export function updateSplitToggleText(isSplit) {
  const btn = document.getElementById('split-toggle');
  if (!btn) return;

  const span = btn.querySelector('span');
  if (span) {
    span.textContent = isSplit ? 'Single' : 'Split';
  }

  if (isSplit) {
    btn.classList.add('active');
  } else {
    btn.classList.remove('active');
  }
}

/**
 * Update header button visibility based on split mode
 * @param {boolean} isSplit - Whether split screen is active
 */
export function updateHeaderButtonVisibility(isSplit) {
  const leftMapToggle = document.getElementById('left-map-toggle');
  const rightMapToggle = document.getElementById('right-map-toggle');
  const layersToggle = document.getElementById('layers-toggle');

  if (leftMapToggle && rightMapToggle && layersToggle) {
    if (isSplit) {
      // Show Left/Right buttons, hide Layers button
      leftMapToggle.classList.remove('header-hidden');
      rightMapToggle.classList.remove('header-hidden');
      layersToggle.classList.add('header-hidden');
    } else {
      // Hide Left/Right buttons, show Layers button
      leftMapToggle.classList.add('header-hidden');
      rightMapToggle.classList.add('header-hidden');
      layersToggle.classList.remove('header-hidden');
    }
  }
}

/**
 * Update active drawing tool button state
 * @param {string|null} mode - Current drawing mode
 */
export function updateActiveDrawTool(mode) {
  // Remove active class from all draw buttons
  const buttons = document.querySelectorAll('#draw-dropdown .header-dropdown-item');
  buttons.forEach(btn => btn.classList.remove('active'));

  // Add active class to current tool if any
  if (mode) {
    const buttonMap = {
      'marker': 'draw-marker-btn',
      'line': 'draw-line-btn',
      'polygon': 'draw-polygon-btn',
      'radius': 'draw-radius-btn',
      'measure': 'draw-measure-btn'
    };

    const activeBtnId = buttonMap[mode];
    if (activeBtnId) {
      const activeBtn = document.getElementById(activeBtnId);
      if (activeBtn) {
        activeBtn.classList.add('active');
      }
    }

    // Update the draw toggle button text
    const drawToggle = document.getElementById('draw-menu-toggle');
    if (drawToggle) {
      const span = drawToggle.querySelector('span');
      if (span) {
        span.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
      }
    }
  } else {
    // Reset draw toggle text
    const drawToggle = document.getElementById('draw-menu-toggle');
    if (drawToggle) {
      const span = drawToggle.querySelector('span');
      if (span) {
        span.textContent = 'Draw';
      }
    }
  }
}

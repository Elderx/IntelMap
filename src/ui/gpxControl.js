/**
 * GPX Control UI Module
 * Manages GPX file upload, file list, statistics display, and controls
 */

import { state } from '../state/store.js';
import { removeGpxFile, setCurrentGpxFile, setColorMode, setChartVisibility } from '../gpx/gpxManager.js';

let gpxPanel = null;
let gpxFileInput = null;
let gpxFileList = null;
let gpxStats = null;
let themeObserver = null;
let wasGpxEnabledBeforeClose = false;

/**
 * Initialize GPX control panel
 */
export function initGpxControl() {
  createGpxPanel();
  setupEventListeners();
  setupThemeObserver();
  console.log('[GPX] Control initialized');
}

/**
 * Setup theme observer to watch for dark mode changes
 */
function setupThemeObserver() {
  // Apply initial theme
  applyTheme();

  // Watch for theme changes
  themeObserver = new MutationObserver(() => {
    applyTheme();
  });

  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
  });
}

/**
 * Apply current theme to GPX panel
 */
function applyTheme() {
  if (!gpxPanel) return;

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  if (isDark) {
    gpxPanel.classList.add('gpx-panel-dark');
  } else {
    gpxPanel.classList.remove('gpx-panel-dark');
  }
}

/**
 * Create GPX control panel
 */
function createGpxPanel() {
  // Create panel container
  gpxPanel = document.createElement('div');
  gpxPanel.id = 'gpx-panel';
  gpxPanel.className = 'gpx-panel';
  gpxPanel.style.display = 'none';

  // Panel HTML
  gpxPanel.innerHTML = `
    <div class="gpx-panel-header">
      <h3>GPX Tracks</h3>
      <button class="gpx-panel-close" id="gpx-panel-close">&times;</button>
    </div>

    <div class="gpx-panel-section">
      <h4>Load GPX File</h4>
      <input type="file" id="gpx-file-input" accept=".gpx" multiple style="width: 100%; margin-bottom: 10px;">
      <div class="gpx-hint">Select one or more .gpx files to display on the map</div>
    </div>

    <div class="gpx-panel-section" id="gpx-file-section" style="display: none;">
      <h4>Loaded Files</h4>
      <div id="gpx-file-list"></div>
    </div>

    <div class="gpx-panel-section" id="gpx-stats-section" style="display: none;">
      <h4>Track Statistics</h4>
      <div id="gpx-stats"></div>
    </div>

    <div class="gpx-panel-section" id="gpx-controls-section" style="display: none;">
      <h4>Display Options</h4>

      <div class="gpx-control-group">
        <label>Color Mode:</label>
        <div class="gpx-radio-group">
          <label>
            <input type="radio" name="gpx-color-mode" value="elevation" checked>
            Elevation
          </label>
          <label>
            <input type="radio" name="gpx-color-mode" value="speed">
            Speed
          </label>
          <label>
            <input type="radio" name="gpx-color-mode" value="solid">
            Solid
          </label>
        </div>
      </div>

      <div class="gpx-control-group">
        <label>Show Charts:</label>
        <div class="gpx-checkbox-group">
          <label>
            <input type="checkbox" id="gpx-show-elevation" checked>
            Elevation Profile
          </label>
          <label>
            <input type="checkbox" id="gpx-show-speed">
            Speed Chart
          </label>
          <label>
            <input type="checkbox" id="gpx-show-distance">
            Distance Chart
          </label>
        </div>
      </div>
    </div>

    <div class="gpx-panel-section" id="gpx-charts-section" style="display: none;">
      <h4>Profile Charts</h4>
      <div id="gpx-charts-container"></div>
    </div>

    <div class="gpx-panel-section" id="gpx-error-section" style="display: none;">
      <div class="gpx-error" id="gpx-error-message"></div>
    </div>
  `;

  // Add panel to body
  document.body.appendChild(gpxPanel);

  // Store references
  gpxFileInput = gpxPanel.querySelector('#gpx-file-input');
  gpxFileList = gpxPanel.querySelector('#gpx-file-list');
  gpxStats = gpxPanel.querySelector('#gpx-stats');
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // File input change
  gpxFileInput.addEventListener('change', handleFileUpload);

  // Close button
  const closeBtn = gpxPanel.querySelector('#gpx-panel-close');
  closeBtn.addEventListener('click', () => {
    hideGpxPanel();
  });

  // Color mode radio buttons
  const colorModeRadios = gpxPanel.querySelectorAll('input[name="gpx-color-mode"]');
  colorModeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      setColorMode(e.target.value);
    });
  });

  // Chart visibility checkboxes
  const elevationCheckbox = gpxPanel.querySelector('#gpx-show-elevation');
  const speedCheckbox = gpxPanel.querySelector('#gpx-show-speed');
  const distanceCheckbox = gpxPanel.querySelector('#gpx-show-distance');

  elevationCheckbox.addEventListener('change', (e) => {
    setChartVisibility('elevation', e.target.checked);
  });

  speedCheckbox.addEventListener('change', (e) => {
    setChartVisibility('speed', e.target.checked);
  });

  distanceCheckbox.addEventListener('change', (e) => {
    setChartVisibility('distance', e.target.checked);
  });
}

/**
 * Handle file upload
 */
async function handleFileUpload(event) {
  const files = event.target.files;

  if (!files || files.length === 0) {
    return;
  }

  console.log(`[GPX] ${files.length} file(s) selected`);

  // Import manager dynamically to avoid circular dependency
  const { loadGpxFile } = await import('../gpx/gpxManager.js');

  // Load each file
  for (const file of files) {
    try {
      await loadGpxFile(file);
    } catch (error) {
      showGpxError(`Failed to load ${file.name}: ${error.message}`);
    }
  }

  // Clear input
  event.target.value = '';
}

/**
 * Update file list display
 */
export function updateFileList() {
  if (!state.gpxFiles || state.gpxFiles.length === 0) {
    gpxPanel.querySelector('#gpx-file-section').style.display = 'none';
    return;
  }

  gpxPanel.querySelector('#gpx-file-section').style.display = 'block';
  gpxFileList.innerHTML = '';

  state.gpxFiles.forEach(gpxFile => {
    const fileItem = document.createElement('div');
    fileItem.className = 'gpx-file-item';

    if (state.gpxCurrentFile && state.gpxCurrentFile.id === gpxFile.id) {
      fileItem.classList.add('gpx-file-item-current');
    }

    fileItem.innerHTML = `
      <span class="gpx-file-name">${gpxFile.name}</span>
      <button class="gpx-file-remove" data-file-id="${gpxFile.id}">&times;</button>
    `;

    // Click to select
    fileItem.addEventListener('click', (e) => {
      if (!e.target.classList.contains('gpx-file-remove')) {
        setCurrentGpxFile(gpxFile.id);
      }
    });

    // Remove button
    const removeBtn = fileItem.querySelector('.gpx-file-remove');
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeGpxFile(gpxFile.id);
    });

    gpxFileList.appendChild(fileItem);
  });
}

/**
 * Update statistics display
 */
export function updateStats(stats) {
  if (!stats) {
    gpxPanel.querySelector('#gpx-stats-section').style.display = 'none';
    return;
  }

  gpxPanel.querySelector('#gpx-stats-section').style.display = 'block';

  const statsHtml = `
    <div class="gpx-stats-grid">
      <div class="gpx-stat-item">
        <span class="gpx-stat-label">Distance:</span>
        <span class="gpx-stat-value">${stats.distance || 'N/A'}</span>
      </div>
      <div class="gpx-stat-item">
        <span class="gpx-stat-label">Duration:</span>
        <span class="gpx-stat-value">${stats.duration || 'N/A'}</span>
      </div>
      <div class="gpx-stat-item">
        <span class="gpx-stat-label">Elevation Gain:</span>
        <span class="gpx-stat-value">${stats.elevationGain || 'N/A'}</span>
      </div>
      <div class="gpx-stat-item">
        <span class="gpx-stat-label">Elevation Loss:</span>
        <span class="gpx-stat-value">${stats.elevationLoss || 'N/A'}</span>
      </div>
      <div class="gpx-stat-item">
        <span class="gpx-stat-label">Min Elevation:</span>
        <span class="gpx-stat-value">${stats.elevationMin || 'N/A'}</span>
      </div>
      <div class="gpx-stat-item">
        <span class="gpx-stat-label">Max Elevation:</span>
        <span class="gpx-stat-value">${stats.elevationMax || 'N/A'}</span>
      </div>
      ${stats.averageSpeed ? `
      <div class="gpx-stat-item">
        <span class="gpx-stat-label">Avg Speed:</span>
        <span class="gpx-stat-value">${stats.averageSpeed}</span>
      </div>
      ` : ''}
      ${stats.maxSpeed ? `
      <div class="gpx-stat-item">
        <span class="gpx-stat-label">Max Speed:</span>
        <span class="gpx-stat-value">${stats.maxSpeed}</span>
      </div>
      ` : ''}
      <div class="gpx-stat-item">
        <span class="gpx-stat-label">Start Time:</span>
        <span class="gpx-stat-value">${stats.startTime || 'N/A'}</span>
      </div>
      <div class="gpx-stat-item">
        <span class="gpx-stat-label">End Time:</span>
        <span class="gpx-stat-value">${stats.endTime || 'N/A'}</span>
      </div>
    </div>
  `;

  gpxStats.innerHTML = statsHtml;
}

/**
 * Show GPX panel
 */
export function showGpxPanel() {
  if (gpxPanel) {
    gpxPanel.style.display = 'block';
    gpxPanel.querySelector('#gpx-controls-section').style.display =
      state.gpxCurrentFile ? 'block' : 'none';
  }

  // Reset the "was enabled before close" flag since panel is now open
  wasGpxEnabledBeforeClose = false;
}

/**
 * Hide GPX panel
 * Also unchecks the GPX checkbox to keep state in sync
 */
export function hideGpxPanel() {
  if (gpxPanel) {
    gpxPanel.style.display = 'none';
  }

  // Track if GPX was enabled before closing (for accordion reopen behavior)
  wasGpxEnabledBeforeClose = state.gpxEnabled;

  // Update state and uncheck checkbox
  state.gpxEnabled = false;

  // Uncheck the GPX enabled checkbox in layers dropdown
  const checkbox = document.getElementById('gpx-enabled');
  if (checkbox) {
    checkbox.checked = false;
  }

  // Update header active layers display
  import('./headerLayerManager.js').then(({ updateHeaderActiveLayers }) => {
    updateHeaderActiveLayers();
  });
}

/**
 * Check if GPX was enabled before the panel was closed
 * @returns {boolean}
 */
export function wasGpxEnabledBeforeCloseFn() {
  return wasGpxEnabledBeforeClose;
}

/**
 * Reset the "was enabled before close" flag
 * Called when GPX is manually disabled via checkbox
 */
export function resetWasGpxEnabledBeforeClose() {
  wasGpxEnabledBeforeClose = false;
}

/**
 * Toggle GPX panel visibility
 */
export function toggleGpxPanel() {
  if (gpxPanel && gpxPanel.style.display === 'block') {
    hideGpxPanel();
  } else {
    showGpxPanel();
  }
}

/**
 * Show error message
 */
export function showGpxError(message) {
  const errorSection = gpxPanel.querySelector('#gpx-error-section');
  const errorMessage = gpxPanel.querySelector('#gpx-error-message');

  errorMessage.textContent = message;
  errorSection.style.display = 'block';

  // Auto-hide after 5 seconds
  setTimeout(() => {
    errorSection.style.display = 'none';
  }, 5000);
}

/**
 * Update charts section visibility
 */
export function updateChartsSection(visible) {
  const chartsSection = gpxPanel.querySelector('#gpx-charts-section');
  if (chartsSection) {
    chartsSection.style.display = visible ? 'block' : 'none';
  }
}

/**
 * Update color mode radio buttons
 */
export function updateColorModeUI(colorMode) {
  const radio = gpxPanel.querySelector(`input[name="gpx-color-mode"][value="${colorMode}"]`);
  if (radio) {
    radio.checked = true;
  }
}

/**
 * Update chart visibility checkboxes
 */
export function updateChartVisibilityUI(showElevation, showSpeed, showDistance) {
  const elevationCheckbox = gpxPanel.querySelector('#gpx-show-elevation');
  const speedCheckbox = gpxPanel.querySelector('#gpx-show-speed');
  const distanceCheckbox = gpxPanel.querySelector('#gpx-show-distance');

  if (elevationCheckbox) elevationCheckbox.checked = showElevation;
  if (speedCheckbox) speedCheckbox.checked = showSpeed;
  if (distanceCheckbox) distanceCheckbox.checked = showDistance;
}

/**
 * Get charts container element
 */
export function getChartsContainer() {
  return gpxPanel.querySelector('#gpx-charts-container');
}

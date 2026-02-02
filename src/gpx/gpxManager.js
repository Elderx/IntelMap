/**
 * GPX Manager Module
 * Orchestrates all GPX functionality: file loading, parsing, rendering, charts, and interactions
 */

import { state } from '../state/store.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import { Style, Stroke } from 'ol/style.js';
import { parseGpxFile, generateGpxFileId } from './gpxParser.js';
import { calculateStats, formatStats } from './gpxStats.js';
import { renderGpxTrack, clearGpxLayers, setGpxLayersVisible } from './gpxRenderer.js';
import { createCharts, destroyCharts, updateChartsVisibility, clearChartHighlights } from './gpxCharts.js';
import {
  setupMapHoverHandlers,
  removeMapHoverHandlers,
  clearMapMarker,
  cleanupInteractions
} from './gpxInteractions.js';
import {
  updateFileList,
  updateStats,
  showGpxPanel,
  updateChartsSection,
  updateColorModeUI,
  updateChartVisibilityUI,
  showGpxError
} from '../ui/gpxControl.js';

/**
 * Load a GPX file
 * @param {File} file - GPX file object
 */
export async function loadGpxFile(file) {
  try {
    console.log(`[GPX] Loading file: ${file.name}`);

    // Parse GPX file
    const { features, trackData } = await parseGpxFile(file);

    // Calculate statistics
    const stats = calculateStats(trackData, features);

    // Create GPX file metadata object
    const gpxFile = {
      id: generateGpxFileId(file),
      name: file.name,
      file: file,
      features: features,
      trackData: trackData,
      stats: stats,
      loadedAt: new Date()
    };

    // Add to state
    state.gpxFiles.push(gpxFile);

    // Set as current file
    state.gpxCurrentFile = gpxFile;

    // Enable GPX overlay
    state.gpxEnabled = true;

    // Render track
    renderGpxTrack(features, trackData, state.gpxColorMode);
    setGpxLayersVisible(true);

    // Create charts
    createCharts(trackData, stats);
    updateChartsSection(true);

    // Setup interactions
    setupMapHoverHandlers();

    // Update UI
    updateFileList();
    updateStats(formatStats(stats));
    updateColorModeUI(state.gpxColorMode);
    updateChartVisibilityUI(
      state.gpxShowElevationChart,
      state.gpxShowSpeedChart,
      state.gpxShowDistanceChart
    );
    showGpxPanel();

    console.log(`[GPX] File loaded successfully: ${file.name}`);
  } catch (error) {
    console.error('[GPX] Error loading file:', error);
    showGpxError(error.message);
    throw error;
  }
}

/**
 * Remove a GPX file
 * @param {string} fileId - File ID to remove
 */
export function removeGpxFile(fileId) {
  const index = state.gpxFiles.findIndex(f => f.id === fileId);
  if (index === -1) {
    console.warn('[GPX] File not found:', fileId);
    return;
  }

  const file = state.gpxFiles[index];
  console.log(`[GPX] Removing file: ${file.name}`);

  // Remove from array
  state.gpxFiles.splice(index, 1);

  // If this was the current file, clear it
  if (state.gpxCurrentFile && state.gpxCurrentFile.id === fileId) {
    // If there are other files, switch to the first one
    if (state.gpxFiles.length > 0) {
      setCurrentGpxFile(state.gpxFiles[0].id);
    } else {
      // No more files, clear everything
      state.gpxCurrentFile = null;
      clearGpxLayers();
      destroyCharts();
      removeMapHoverHandlers();
      clearMapMarker();

      // Update UI
      updateFileList();
      updateStats(null);
      updateChartsSection(false);

      // Disable GPX overlay if no files
      if (state.gpxFiles.length === 0) {
        state.gpxEnabled = false;
      }
    }
  } else {
    // Just update file list
    updateFileList();
  }

  console.log('[GPX] File removed:', fileId);
}

/**
 * Set current GPX file
 * @param {string} fileId - File ID to set as current
 */
export function setCurrentGpxFile(fileId) {
  const file = state.gpxFiles.find(f => f.id === fileId);
  if (!file) {
    console.warn('[GPX] File not found:', fileId);
    return;
  }

  console.log(`[GPX] Setting current file: ${file.name}`);

  state.gpxCurrentFile = file;

  // Re-render track with current color mode
  renderGpxTrack(file.features, file.trackData, state.gpxColorMode);

  // Update charts
  destroyCharts();
  createCharts(file.trackData, file.stats);

  // Update UI
  updateFileList();
  updateStats(formatStats(file.stats));
  updateColorModeUI(state.gpxColorMode);

  console.log('[GPX] Current file set:', fileId);
}

/**
 * Set color mode
 * @param {string} mode - 'elevation' | 'speed' | 'solid'
 */
export function setColorMode(mode) {
  if (!['elevation', 'speed', 'solid'].includes(mode)) {
    console.warn('[GPX] Invalid color mode:', mode);
    return;
  }

  console.log(`[GPX] Setting color mode: ${mode}`);

  state.gpxColorMode = mode;

  // Re-render track if file is loaded
  if (state.gpxCurrentFile) {
    const { features, trackData } = state.gpxCurrentFile;
    renderGpxTrack(features, trackData, mode);
  }

  // Update UI
  updateColorModeUI(mode);
}

/**
 * Set chart visibility
 * @param {string} type - 'elevation' | 'speed' | 'distance'
 * @param {boolean} visible - Visibility state
 */
export function setChartVisibility(type, visible) {
  console.log(`[GPX] Setting ${type} chart visibility: ${visible}`);

  switch (type) {
    case 'elevation':
      state.gpxShowElevationChart = visible;
      break;
    case 'speed':
      state.gpxShowSpeedChart = visible;
      break;
    case 'distance':
      state.gpxShowDistanceChart = visible;
      break;
    default:
      console.warn('[GPX] Invalid chart type:', type);
      return;
  }

  // Update charts
  updateChartsVisibility();
}

/**
 * Clear all GPX files
 */
export function clearAllGpxFiles() {
  console.log('[GPX] Clearing all files');

  state.gpxFiles = [];
  state.gpxCurrentFile = null;

  clearGpxLayers();
  destroyCharts();
  removeMapHoverHandlers();
  clearMapMarker();

  // Update UI
  updateFileList();
  updateStats(null);
  updateChartsSection(false);

  state.gpxEnabled = false;
}

/**
 * Start GPX updates (placeholder for future polling/updates)
 * Currently GPX is stateless, no polling needed
 */
export function startGpxUpdates() {
  console.log('[GPX] Starting updates (stateless, no polling)');
  state.gpxEnabled = true;
  setGpxLayersVisible(true);
}

/**
 * Stop GPX updates
 */
export function stopGpxUpdates() {
  console.log('[GPX] Stopping updates');
  state.gpxEnabled = false;
  setGpxLayersVisible(false);
  cleanupInteractions();
  clearChartHighlights();
}

/**
 * Rebuild GPX layers (for split-screen mode changes)
 */
export function rebuildGpxLayers() {
  console.log('[GPX] Rebuilding layers');
  rebuildGpxLayersInternal();

  // Re-render current file if exists
  if (state.gpxCurrentFile) {
    const { features, trackData } = state.gpxCurrentFile;
    renderGpxTrack(features, trackData, state.gpxColorMode);
  }

  // Re-setup hover handlers for new map configuration
  setupMapHoverHandlers();
}

/**
 * Internal function to rebuild layers without re-rendering
 */
function rebuildGpxLayersInternal() {
  // Ensure layers exist for current map configuration
  ['main', 'left', 'right'].forEach(key => {
    const map = key === 'main' ? state.map : key === 'left' ? state.leftMap : state.rightMap;
    if (!map) return;

    if (!state.gpxLayer[key]) {
      const source = new VectorSource();
      const layer = new VectorLayer({
        source: source,
        style: function(feature) {
          return feature.get('style') || getDefaultStyle();
        },
        zIndex: 180,
        visible: state.gpxEnabled
      });
      map.addLayer(layer);
      state.gpxLayer[key] = layer;
      console.log(`[GPX] Created layer for ${key} map`);
    }
  });
}

function getDefaultStyle() {
  return new Style({
    stroke: new Stroke({
      color: '#2196F3',
      width: 3
    })
  });
}

/**
 * Cleanup GPX overlay
 */
export function cleanupGpx() {
  console.log('[GPX] Cleaning up');

  stopGpxUpdates();

  state.gpxFiles = [];
  state.gpxCurrentFile = null;

  clearGpxLayers();
  destroyCharts();
  cleanupInteractions();
}

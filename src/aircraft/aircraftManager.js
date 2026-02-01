/**
 * Aircraft Manager Module
 * Handles polling, data updates, and layer lifecycle
 */

import { transformExtent } from 'ol/proj.js';
import { state } from '../state/store.js';
import { fetchAircraftStates } from '../api/opensky.js';
import { createAircraftLayer, stateToFeature } from './aircraftLayer.js';

/**
 * Update aircraft data for all active maps
 */
async function updateAircraftData() {
  if (!state.aircraftEnabled) return;

  // Check if we're in rate limit cooldown
  if (state.aircraftError && state.aircraftError.type === 'rate_limit') {
    const now = Date.now();
    if (state.aircraftError.retryAfter && now < state.aircraftError.retryAfter) {
      const remaining = Math.ceil((state.aircraftError.retryAfter - now) / 1000);
      console.log(`[Aircraft] Rate limit cooldown. Retry in ${remaining}s`);
      return; // Skip this update cycle
    }
    // Cooldown expired, clear error and proceed
    if (state.aircraftError.retryAfter && now >= state.aircraftError.retryAfter) {
      console.log('[Aircraft] Rate limit cooldown expired. Resuming updates.');
      state.aircraftError = null;
    }
  }

  // Determine which map's extent to use
  let map;
  if (state.isSplit) {
    map = state.leftMap;
  } else {
    map = state.map;
  }

  if (!map) {
    console.warn('[Aircraft] No map available for extent calculation');
    return;
  }

  // Get current view extent and transform to WGS84
  const extent = map.getView().calculateExtent();
  const bbox = transformExtent(extent, 'EPSG:3857', 'EPSG:4326');

  console.log('[Aircraft] Fetching for bbox:', bbox);

  // Fetch aircraft states
  const stateVectors = await fetchAircraftStates(bbox);

  if (!stateVectors) {
    // Error: fetchAircraftStates sets state.aircraftError
    // Keep existing data visible
    return;
  }

  // Convert state vectors to features
  const features = stateVectors
    .map(sv => stateToFeature(sv))
    .filter(f => f !== null);

  state.aircraftFeatures = features;

  // Update layers for all active maps
  if (state.isSplit) {
    updateAircraftLayer('left', features);
    updateAircraftLayer('right', features);
  } else {
    updateAircraftLayer('main', features);
  }

  // Update active layers panel
  import('../ui/activeLayers.js').then(({ updateActiveLayersPanel }) => {
    updateActiveLayersPanel();
  });
}

/**
 * Update features for a specific map layer
 * @param {string} mapKey - 'main', 'left', or 'right'
 * @param {Array<Feature>} features - OpenLayers Features
 */
function updateAircraftLayer(mapKey, features) {
  const layer = state.aircraftLayer[mapKey];
  if (!layer) return;

  const source = layer.getSource();
  source.clear();
  source.addFeatures(features);

  console.log(`[Aircraft] Updated ${mapKey} layer with ${features.length} aircraft`);
}

/**
 * Start aircraft polling updates
 */
export function startAircraftUpdates() {
  if (state.aircraftUpdateInterval) {
    console.warn('[Aircraft] Updates already running');
    return;
  }

  console.log('[Aircraft] Starting updates');

  // Create layers for active maps
  if (state.isSplit) {
    if (state.leftMap) {
      const leftLayer = createAircraftLayer();
      state.aircraftLayer.left = leftLayer;
      state.leftMap.addLayer(leftLayer);
    }
    if (state.rightMap) {
      const rightLayer = createAircraftLayer();
      state.aircraftLayer.right = rightLayer;
      state.rightMap.addLayer(rightLayer);
    }
  } else {
    if (state.map) {
      const mainLayer = createAircraftLayer();
      state.aircraftLayer.main = mainLayer;
      state.map.addLayer(mainLayer);
    }
  }

  state.aircraftEnabled = true;

  // Initial fetch
  updateAircraftData();

  // Start polling interval
  const intervalMs = state.aircraftRefreshInterval * 1000;
  state.aircraftUpdateInterval = setInterval(updateAircraftData, intervalMs);

  console.log(`[Aircraft] Polling every ${state.aircraftRefreshInterval}s`);
}

/**
 * Stop aircraft polling updates
 */
export function stopAircraftUpdates() {
  if (!state.aircraftUpdateInterval) {
    console.warn('[Aircraft] No updates running');
    return;
  }

  console.log('[Aircraft] Stopping updates');

  // Clear interval
  clearInterval(state.aircraftUpdateInterval);
  state.aircraftUpdateInterval = null;

  // Remove layers from maps
  ['main', 'left', 'right'].forEach(key => {
    const layer = state.aircraftLayer[key];
    if (!layer) return;

    const map = key === 'main' ? state.map : key === 'left' ? state.leftMap : state.rightMap;
    if (map) {
      map.removeLayer(layer);
    }
    state.aircraftLayer[key] = null;
  });

  // Clear state
  state.aircraftFeatures = [];
  state.aircraftEnabled = false;

  // Update active layers panel
  import('../ui/activeLayers.js').then(({ updateActiveLayersPanel }) => {
    updateActiveLayersPanel();
  });
}

/**
 * Set the update interval (restarts polling)
 * @param {number} seconds - Update interval in seconds
 * @returns {boolean} Success
 */
export function setUpdateInterval(seconds) {
  const minSec = 11; // From OPENSKY_CONFIG.minIntervalSeconds

  if (seconds < minSec) {
    console.warn(`[Aircraft] Interval ${seconds}s below minimum ${minSec}s`);
    return false;
  }

  state.aircraftRefreshInterval = seconds;

  // Restart polling if currently running
  if (state.aircraftUpdateInterval) {
    stopAircraftUpdates();
    startAircraftUpdates();
  }

  // Persist to localStorage
  try {
    localStorage.setItem('intelmap_aircraft_interval', seconds.toString());
  } catch (e) {
    console.warn('[Aircraft] Failed to persist interval to localStorage:', e);
  }

  console.log(`[Aircraft] Update interval set to ${seconds}s`);
  return true;
}

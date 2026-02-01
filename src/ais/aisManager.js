/**
 * AIS Manager Module
 * Handles polling, data updates, and layer lifecycle
 */

import { transformExtent } from 'ol/proj.js';
import { state } from '../state/store.js';
import { connectToAISStream, validateVesselData } from '../api/aisstream.js';
import { createAisLayer, vesselToFeature } from './aisLayer.js';

/**
 * Update AIS data for all active maps
 */
async function updateAisData() {
  if (!state.aisEnabled) return;

  // Check if we're in rate limit cooldown
  if (state.aisError && state.aisError.retryAfter) {
    const now = Date.now();
    if (now < state.aisError.retryAfter) {
      const remaining = Math.ceil((state.aisError.retryAfter - now) / 1000);
      console.log(`[AIS] Cooldown. Retry in ${remaining}s`);
      return; // Skip this update cycle
    }
    // Cooldown expired, clear error and proceed
    if (now >= state.aisError.retryAfter) {
      console.log('[AIS] Cooldown expired. Resuming updates.');
      state.aisError = null;
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
    console.warn('[AIS] No map available for extent calculation');
    return;
  }

  // Get current view extent and transform to WGS84
  const extent = map.getView().calculateExtent();
  const bbox = transformExtent(extent, 'EPSG:3857', 'EPSG:4326');

  console.log('[AIS] Fetching for bbox:', bbox);

  // Accumulate vessels
  const vessels = new Map();

  const onVessel = (vessel) => {
    if (validateVesselData(vessel)) {
      vessels.set(vessel.mmsi, vessel);
    }
  };

  const ws = await connectToAISStream(bbox, onVessel);

  if (!ws && vessels.size === 0) {
    // Connection failed and no vessels received
    // Keep existing data visible
    return;
  }

  // Convert vessels to features
  const features = Array.from(vessels.values())
    .map(v => vesselToFeature(v))
    .filter(f => f !== null);

  state.aisFeatures = features;
  state.aisLastUpdate = Date.now();

  // Clear error on success
  if (state.aisError) {
    state.aisError = null;
  }

  // Update layers for all active maps
  if (state.isSplit) {
    updateAisLayer('left', features);
    updateAisLayer('right', features);
  } else {
    updateAisLayer('main', features);
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
function updateAisLayer(mapKey, features) {
  const layer = state.aisLayer[mapKey];
  if (!layer) return;

  const source = layer.getSource();
  source.clear();
  source.addFeatures(features);

  console.log(`[AIS] Updated ${mapKey} layer with ${features.length} vessels`);
}

/**
 * Start AIS polling updates
 */
export function startAisUpdates() {
  if (state.aisUpdateInterval) {
    console.warn('[AIS] Updates already running');
    return;
  }

  console.log('[AIS] Starting updates');

  // Create layers for active maps
  if (state.isSplit) {
    if (state.leftMap) {
      const leftLayer = createAisLayer();
      state.aisLayer.left = leftLayer;
      state.leftMap.addLayer(leftLayer);
    }
    if (state.rightMap) {
      const rightLayer = createAisLayer();
      state.aisLayer.right = rightLayer;
      state.rightMap.addLayer(rightLayer);
    }
  } else {
    if (state.map) {
      const mainLayer = createAisLayer();
      state.aisLayer.main = mainLayer;
      state.map.addLayer(mainLayer);
    }
  }

  state.aisEnabled = true;

  // Initial fetch
  updateAisData();

  // Start polling interval
  const intervalMs = state.aisRefreshInterval * 1000;
  state.aisUpdateInterval = setInterval(updateAisData, intervalMs);

  console.log(`[AIS] Polling every ${state.aisRefreshInterval}s`);
}

/**
 * Stop AIS polling updates
 */
export function stopAisUpdates() {
  if (!state.aisUpdateInterval) {
    console.warn('[AIS] No updates running');
    return;
  }

  console.log('[AIS] Stopping updates');

  // Clear interval
  clearInterval(state.aisUpdateInterval);
  state.aisUpdateInterval = null;

  // Remove layers from maps
  ['main', 'left', 'right'].forEach(key => {
    const layer = state.aisLayer[key];
    if (!layer) return;

    const map = key === 'main' ? state.map : key === 'left' ? state.leftMap : state.rightMap;
    if (map) {
      map.removeLayer(layer);
    }
    state.aisLayer[key] = null;
  });

  // Clear state
  state.aisFeatures = [];
  state.aisEnabled = false;
  state.aisLastUpdate = null;

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
  const minSec = 30; // From AISSTREAM_CONFIG.minIntervalSeconds
  const maxSec = 300; // From AISSTREAM_CONFIG.maxIntervalSeconds

  if (seconds < minSec || seconds > maxSec) {
    console.warn(`[AIS] Interval ${seconds}s outside range [${minSec}, ${maxSec}]`);
    return false;
  }

  state.aisRefreshInterval = seconds;

  // Restart polling if currently running
  if (state.aisUpdateInterval) {
    stopAisUpdates();
    startAisUpdates();
  }

  // Persist to localStorage
  try {
    localStorage.setItem('intelmap_ais_interval', seconds.toString());
  } catch (e) {
    console.warn('[AIS] Failed to persist interval to localStorage:', e);
  }

  console.log(`[AIS] Update interval set to ${seconds}s`);
  return true;
}

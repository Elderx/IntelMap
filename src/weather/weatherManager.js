/**
 * Weather Manager Module
 * Orchestrates station data updates (no WMS layers)
 */

import { transformExtent } from 'ol/proj.js';
import { state } from '../state/store.js';
import { FMI_CONFIG } from '../config/constants.js';
import { fetchWeatherStations, stationToFeature } from './weatherStations.js';
import { Vector as VectorLayer } from 'ol/layer.js';
import { Vector as VectorSource } from 'ol/source.js';

/**
 * Start weather overlay updates
 */
export function startWeatherUpdates() {
  if (state.weatherPollingTimer) {
    console.warn('[Weather] Updates already running');
    return;
  }

  console.log('[Weather] Starting updates');

  // Create station marker layers for active maps
  if (state.isSplit) {
    if (state.leftMap) {
      state.weatherStationLayer.left = createStationLayer();
      state.leftMap.addLayer(state.weatherStationLayer.left);
    }
    if (state.rightMap) {
      state.weatherStationLayer.right = createStationLayer();
      state.rightMap.addLayer(state.weatherStationLayer.right);
    }
  } else {
    if (state.map) {
      state.weatherStationLayer.main = createStationLayer();
      state.map.addLayer(state.weatherStationLayer.main);
    }
  }

  state.weatherEnabled = true;

  // Immediate fetch
  updateWeatherStationData();

  // Start polling interval
  state.weatherPollingTimer = setInterval(updateWeatherStationData, FMI_CONFIG.pollingIntervalMs);

  console.log(`[Weather] Polling every ${FMI_CONFIG.pollingIntervalSec / 60} minutes`);
}

/**
 * Create station marker layer
 * @returns {VectorLayer} OpenLayers VectorLayer
 */
function createStationLayer() {
  return new VectorLayer({
    source: new VectorSource(),
    style: null, // Style set per-feature
    zIndex: FMI_CONFIG.zIndex.stations,
    className: 'weather-station-layer'
  });
}

/**
 * Update weather station data
 */
async function updateWeatherStationData() {
  if (!state.weatherEnabled) return;

  console.log('[Weather] Fetching station data');

  // Use Finland bounding box to ensure all Finnish stations are fetched
  const bbox = FMI_CONFIG.finlandBbox;
  console.log('[Weather] Using Finland bbox:', bbox);

  try {
    // Fetch station data
    const stations = await fetchWeatherStations(bbox);

    // Convert to features
    const features = stations.map(s => stationToFeature(s)).filter(f => f !== null);

    state.weatherStationFeatures = features;

    // Clear error on success
    if (state.weatherError) {
      state.weatherError = null;
    }

    console.log(`[Weather] Received ${features.length} station observations`);

    // Update station marker layers
    if (state.isSplit) {
      updateStationLayer('left', features);
      updateStationLayer('right', features);
    } else {
      updateStationLayer('main', features);
    }

    // Update UI
    import('../ui/activeLayers.js').then(({ updateActiveLayersPanel }) => {
      updateActiveLayersPanel();
    });
  } catch (error) {
    console.error('[Weather] Failed to update station data:', error);
    state.weatherError = {
      type: 'network',
      message: 'Failed to fetch weather data',
      time: Date.now()
    };
  }
}

/**
 * Update station marker layer for a specific map
 * @param {string} mapKey - 'main', 'left', or 'right'
 * @param {Array<Feature>} features - OpenLayers Features
 */
function updateStationLayer(mapKey, features) {
  const layer = state.weatherStationLayer[mapKey];
  if (!layer) return;

  const source = layer.getSource();
  source.clear();
  source.addFeatures(features);

  console.log(`[Weather] Updated ${mapKey} station layer with ${features.length} stations`);
}

/**
 * Stop weather overlay updates
 */
export function stopWeatherUpdates() {
  if (!state.weatherPollingTimer) {
    console.warn('[Weather] No updates running');
    return;
  }

  console.log('[Weather] Stopping updates');

  // Clear polling timer
  clearInterval(state.weatherPollingTimer);
  state.weatherPollingTimer = null;

  // Remove station marker layers
  ['main', 'left', 'right'].forEach(key => {
    const layer = state.weatherStationLayer[key];
    if (!layer) return;

    const map = key === 'main' ? state.map : key === 'left' ? state.leftMap : state.rightMap;
    if (map) {
      map.removeLayer(layer);
    }
    state.weatherStationLayer[key] = null;
  });

  // Clear state
  state.weatherStationFeatures = [];
  state.weatherEnabled = false;
  state.weatherError = null;

  // Update UI
  import('../ui/activeLayers.js').then(({ updateActiveLayersPanel }) => {
    updateActiveLayersPanel();
  });
}

/**
 * Rebuild weather station layers for current map configuration
 * Called when switching between single and split-screen modes
 */
export function rebuildWeatherLayers() {
  if (!state.weatherEnabled || !state.weatherStationFeatures.length) {
    return; // Not enabled or no features to display
  }

  console.log('[Weather] Rebuilding layers for map configuration (isSplit:', state.isSplit, ')');

  // Remove existing layers from all maps
  ['main', 'left', 'right'].forEach(key => {
    const layer = state.weatherStationLayer[key];
    if (!layer) return;

    const map = key === 'main' ? state.map : key === 'left' ? state.leftMap : state.rightMap;
    if (map) {
      map.removeLayer(layer);
    }
    state.weatherStationLayer[key] = null;
  });

  // Create layers for active maps
  if (state.isSplit) {
    if (state.leftMap) {
      state.weatherStationLayer.left = createStationLayer();
      state.leftMap.addLayer(state.weatherStationLayer.left);
      const source = state.weatherStationLayer.left.getSource();
      source.clear();
      source.addFeatures(state.weatherStationFeatures);
    }
    if (state.rightMap) {
      state.weatherStationLayer.right = createStationLayer();
      state.rightMap.addLayer(state.weatherStationLayer.right);
      const source = state.weatherStationLayer.right.getSource();
      source.clear();
      source.addFeatures(state.weatherStationFeatures);
    }
  } else {
    if (state.map) {
      state.weatherStationLayer.main = createStationLayer();
      state.map.addLayer(state.weatherStationLayer.main);
      const source = state.weatherStationLayer.main.getSource();
      source.clear();
      source.addFeatures(state.weatherStationFeatures);
    }
  }

  console.log('[Weather] Layers rebuilt successfully');
}

/**
 * Weather Manager Module
 * Orchestrates WMS layers and station data updates
 */

import { transformExtent } from 'ol/proj.js';
import { state } from '../state/store.js';
import { FMI_CONFIG } from '../config/constants.js';
import { createWeatherWmsLayers, updateAllWmsLayers } from './weatherWms.js';
import { fetchWeatherStations, stationToFeature } from './weatherStations.js';

/**
 * Start weather overlay updates
 */
export function startWeatherUpdates() {
  if (state.weatherPollingTimer) {
    console.warn('[Weather] Updates already running');
    return;
  }

  console.log('[Weather] Starting updates');

  // Create WMS layers for active maps
  if (state.isSplit) {
    if (state.leftMap) {
      state.weatherWmsLayers.left = createWeatherWmsLayers();
      addWmsLayersToMap(state.leftMap, state.weatherWmsLayers.left);
    }
    if (state.rightMap) {
      state.weatherWmsLayers.right = createWeatherWmsLayers();
      addWmsLayersToMap(state.rightMap, state.weatherWmsLayers.right);
    }
  } else {
    if (state.map) {
      state.weatherWmsLayers.main = createWeatherWmsLayers();
      addWmsLayersToMap(state.map, state.weatherWmsLayers.main);
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
 * Add WMS layers to map
 * @param {Object} map - OpenLayers Map instance
 * @param {Object} layers - Object with temperature, wind, precipitation layers
 */
function addWmsLayersToMap(map, layers) {
  Object.values(layers).forEach(layer => {
    if (layer) map.addLayer(layer);
  });
}

/**
 * Update weather station data
 */
async function updateWeatherStationData() {
  if (!state.weatherEnabled) return;

  console.log('[Weather] Fetching station data');

  // Determine which map's extent to use
  let map;
  if (state.isSplit) {
    map = state.leftMap;
  } else {
    map = state.map;
  }

  if (!map) {
    console.warn('[Weather] No map available for extent calculation');
    return;
  }

  // Get current view extent and transform to WGS84
  const extent = map.getView().calculateExtent();
  const bbox = transformExtent(extent, 'EPSG:3857', 'EPSG:4326');

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

  // Remove WMS layers from maps
  ['main', 'left', 'right'].forEach(key => {
    const layers = state.weatherWmsLayers[key];
    if (!layers) return;

    const map = key === 'main' ? state.map : key === 'left' ? state.leftMap : state.rightMap;
    if (map) {
      Object.values(layers).forEach(layer => {
        if (layer) map.removeLayer(layer);
      });
    }
    state.weatherWmsLayers[key] = null;
  });

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
 * Toggle specific WMS layer
 * @param {string} layerType - 'temperature', 'wind', or 'precipitation'
 * @param {boolean} enabled - Whether layer should be enabled
 */
export function toggleWmsLayer(layerType, enabled) {
  const index = state.weatherActiveWmsLayers.indexOf(layerType);

  if (enabled && index === -1) {
    state.weatherActiveWmsLayers.push(layerType);
  } else if (!enabled && index !== -1) {
    state.weatherActiveWmsLayers.splice(index, 1);
  }

  updateAllWmsLayers();

  // Update permalink
  import('../map/permalink.js').then(({ updatePermalinkWithFeatures }) => {
    updatePermalinkWithFeatures();
  });
}

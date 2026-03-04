import { state } from '../state/store.js';
import { TRAIN_OVERLAY_CONFIG } from '../config/constants.js';
import { fetchTrainLocationsGeoJson } from '../api/trains.js';
import { createTrainLocationLayer, trainLocationToFeature } from './trainLocationsLayer.js';

function updateTrainLocationLayer(mapKey, features) {
  const layer = state.trainLocationsLayer[mapKey];
  if (!layer) return;

  const source = layer.getSource();
  source.clear();
  source.addFeatures(features);
}

function removeTrainLocationLayers() {
  ['main', 'left', 'right'].forEach(key => {
    const layer = state.trainLocationsLayer[key];
    if (!layer) return;

    const map = key === 'main' ? state.map : key === 'left' ? state.leftMap : state.rightMap;
    if (map) {
      map.removeLayer(layer);
    }
    state.trainLocationsLayer[key] = null;
  });
}

function attachTrainLocationLayers() {
  if (state.isSplit) {
    if (state.leftMap && !state.trainLocationsLayer.left) {
      state.trainLocationsLayer.left = createTrainLocationLayer();
      state.leftMap.addLayer(state.trainLocationsLayer.left);
    }
    if (state.rightMap && !state.trainLocationsLayer.right) {
      state.trainLocationsLayer.right = createTrainLocationLayer();
      state.rightMap.addLayer(state.trainLocationsLayer.right);
    }
    return;
  }

  if (state.map && !state.trainLocationsLayer.main) {
    state.trainLocationsLayer.main = createTrainLocationLayer();
    state.map.addLayer(state.trainLocationsLayer.main);
  }
}

async function updateTrainLocationData() {
  if (!state.trainLocationsEnabled) return;

  try {
    const geojson = await fetchTrainLocationsGeoJson();
    const features = (geojson.features || []).map(trainLocationToFeature);

    state.trainLocationFeatures = features;
    state.trainLocationsLastUpdate = Date.now();
    state.trainLocationsError = null;

    if (state.isSplit) {
      updateTrainLocationLayer('left', features);
      updateTrainLocationLayer('right', features);
    } else {
      updateTrainLocationLayer('main', features);
    }
  } catch (error) {
    state.trainLocationsError = {
      type: 'fetch_error',
      message: error.message,
      time: new Date().toISOString()
    };
  }

  import('../ui/activeLayers.js').then(({ updateActiveLayersPanel }) => {
    updateActiveLayersPanel();
  });
}

export async function startTrainLocationUpdates() {
  if (state.trainLocationsUpdateInterval) {
    return;
  }

  state.trainLocationsEnabled = true;
  attachTrainLocationLayers();
  await updateTrainLocationData();
  state.trainLocationsUpdateInterval = setInterval(updateTrainLocationData, TRAIN_OVERLAY_CONFIG.locationsRefreshIntervalMs);
}

export function stopTrainLocationUpdates() {
  if (state.trainLocationsUpdateInterval) {
    clearInterval(state.trainLocationsUpdateInterval);
    state.trainLocationsUpdateInterval = null;
  }

  removeTrainLocationLayers();
  state.trainLocationFeatures = [];
  state.trainLocationsEnabled = false;
  state.trainLocationsError = null;
  state.trainLocationsLastUpdate = null;

  import('../ui/activeLayers.js').then(({ updateActiveLayersPanel }) => {
    updateActiveLayersPanel();
  });
}

export function rebuildTrainLocationLayers() {
  if (!state.trainLocationsEnabled) {
    return;
  }

  removeTrainLocationLayers();
  attachTrainLocationLayers();

  if (state.trainLocationFeatures.length) {
    if (state.isSplit) {
      updateTrainLocationLayer('left', state.trainLocationFeatures);
      updateTrainLocationLayer('right', state.trainLocationFeatures);
    } else {
      updateTrainLocationLayer('main', state.trainLocationFeatures);
    }
  }
}

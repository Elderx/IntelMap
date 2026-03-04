import { state } from '../state/store.js';
import { fetchTrainStationsGeoJson } from '../api/trains.js';
import { createTrainStationsLayer, trainStationToFeature } from './trainStationsLayer.js';

function updateTrainStationLayer(mapKey, features) {
  const layer = state.trainStationsLayer[mapKey];
  if (!layer) return;

  const source = layer.getSource();
  source.clear();
  source.addFeatures(features);
}

function removeTrainStationLayers() {
  ['main', 'left', 'right'].forEach(key => {
    const layer = state.trainStationsLayer[key];
    if (!layer) return;

    const map = key === 'main' ? state.map : key === 'left' ? state.leftMap : state.rightMap;
    if (map) {
      map.removeLayer(layer);
    }
    state.trainStationsLayer[key] = null;
  });
}

function attachTrainStationLayers() {
  if (state.isSplit) {
    if (state.leftMap && !state.trainStationsLayer.left) {
      state.trainStationsLayer.left = createTrainStationsLayer();
      state.leftMap.addLayer(state.trainStationsLayer.left);
    }
    if (state.rightMap && !state.trainStationsLayer.right) {
      state.trainStationsLayer.right = createTrainStationsLayer();
      state.rightMap.addLayer(state.trainStationsLayer.right);
    }
    return;
  }

  if (state.map && !state.trainStationsLayer.main) {
    state.trainStationsLayer.main = createTrainStationsLayer();
    state.map.addLayer(state.trainStationsLayer.main);
  }
}

export async function startTrainStations() {
  state.trainStationsEnabled = true;
  state.trainStationsError = null;

  if (!state.trainStationFeatures.length) {
    try {
      const geojson = await fetchTrainStationsGeoJson();
      state.trainStationFeatures = (geojson.features || []).map(trainStationToFeature);
      state.trainStationsLastFetch = Date.now();
      state.trainStationsError = null;
    } catch (error) {
      state.trainStationsError = {
        type: 'fetch_error',
        message: error.message,
        time: new Date().toISOString()
      };
    }
  }

  attachTrainStationLayers();

  if (state.isSplit) {
    updateTrainStationLayer('left', state.trainStationFeatures);
    updateTrainStationLayer('right', state.trainStationFeatures);
  } else {
    updateTrainStationLayer('main', state.trainStationFeatures);
  }

  import('../ui/activeLayers.js').then(({ updateActiveLayersPanel }) => {
    updateActiveLayersPanel();
  });
}

export function stopTrainStations() {
  removeTrainStationLayers();
  state.trainStationsEnabled = false;
  state.trainStationsError = null;

  import('../ui/activeLayers.js').then(({ updateActiveLayersPanel }) => {
    updateActiveLayersPanel();
  });
}

export function rebuildTrainStationLayers() {
  if (!state.trainStationsEnabled || !state.trainStationFeatures.length) {
    return;
  }

  removeTrainStationLayers();
  attachTrainStationLayers();

  if (state.isSplit) {
    updateTrainStationLayer('left', state.trainStationFeatures);
    updateTrainStationLayer('right', state.trainStationFeatures);
  } else {
    updateTrainStationLayer('main', state.trainStationFeatures);
  }
}

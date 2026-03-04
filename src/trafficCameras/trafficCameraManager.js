import { state } from '../state/store.js';
import { TRAFFIC_CAMERA_CONFIG } from '../config/constants.js';
import { cameraToFeature, createTrafficCameraLayer } from './trafficCameraLayer.js';

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Traffic camera request failed: ${response.status}`);
  }
  return response.json();
}

function buildFreshestPresetIndex(presetFeatures) {
  return presetFeatures.reduce((accumulator, feature) => {
    const preset = feature.attributes;
    if (preset.PresetActive !== 1 || preset.InCollection !== 1) {
      return accumulator;
    }

    const current = accumulator[preset.CameraId];
    if (!current || preset.PicLastModified > current.PicLastModified) {
      accumulator[preset.CameraId] = preset;
    }
    return accumulator;
  }, {});
}

function updateTrafficCameraLayer(mapKey, features) {
  const layer = state.trafficCameraLayer[mapKey];
  if (!layer) return;

  const source = layer.getSource();
  source.clear();
  source.addFeatures(features);
}

function attachLayers() {
  if (state.isSplit) {
    if (state.leftMap && !state.trafficCameraLayer.left) {
      state.trafficCameraLayer.left = createTrafficCameraLayer();
      state.leftMap.addLayer(state.trafficCameraLayer.left);
    }
    if (state.rightMap && !state.trafficCameraLayer.right) {
      state.trafficCameraLayer.right = createTrafficCameraLayer();
      state.rightMap.addLayer(state.trafficCameraLayer.right);
    }
    return;
  }

  if (state.map && !state.trafficCameraLayer.main) {
    state.trafficCameraLayer.main = createTrafficCameraLayer();
    state.map.addLayer(state.trafficCameraLayer.main);
  }
}

function removeLayers() {
  ['main', 'left', 'right'].forEach((mapKey) => {
    const layer = state.trafficCameraLayer[mapKey];
    if (!layer) return;

    const map = mapKey === 'main' ? state.map : mapKey === 'left' ? state.leftMap : state.rightMap;
    if (map) {
      map.removeLayer(layer);
    }
    state.trafficCameraLayer[mapKey] = null;
  });
}

function refreshActiveLayersPanel() {
  import('../ui/activeLayers.js').then(({ updateActiveLayersPanel }) => {
    updateActiveLayersPanel();
  });
}

export async function startTrafficCameraUpdates() {
  state.trafficCameraEnabled = true;
  state.trafficCameraError = null;
  attachLayers();

  try {
    const [locations, presets] = await Promise.all([
      fetchJson(TRAFFIC_CAMERA_CONFIG.locationsUrl),
      fetchJson(TRAFFIC_CAMERA_CONFIG.presetsUrl)
    ]);

    state.trafficCameraPresetIndex = buildFreshestPresetIndex(presets.features || []);
    state.trafficCameraFeatures = (locations.features || []).map((camera) => {
      return cameraToFeature(camera, state.trafficCameraPresetIndex[camera.attributes.CameraId]);
    });
    state.trafficCameraLastFetch = Date.now();

    if (state.isSplit) {
      updateTrafficCameraLayer('left', state.trafficCameraFeatures);
      updateTrafficCameraLayer('right', state.trafficCameraFeatures);
    } else {
      updateTrafficCameraLayer('main', state.trafficCameraFeatures);
    }
  } catch (error) {
    console.error('[TrafficCameras] Failed to preload traffic cameras:', error);
    state.trafficCameraError = {
      type: 'network',
      message: 'Failed to fetch traffic cameras',
      time: Date.now()
    };
    state.trafficCameraFeatures = [];
  }

  refreshActiveLayersPanel();
}

export function stopTrafficCameraUpdates() {
  removeLayers();
  state.trafficCameraEnabled = false;
  state.trafficCameraFeatures = [];
  state.trafficCameraError = null;
  state.trafficCameraLastFetch = null;
  state.trafficCameraPresetIndex = {};
  refreshActiveLayersPanel();
}

export function rebuildTrafficCameraLayers() {
  if (!state.trafficCameraEnabled || !state.trafficCameraFeatures.length) {
    return;
  }

  removeLayers();
  attachLayers();

  if (state.isSplit) {
    updateTrafficCameraLayer('left', state.trafficCameraFeatures);
    updateTrafficCameraLayer('right', state.trafficCameraFeatures);
  } else {
    updateTrafficCameraLayer('main', state.trafficCameraFeatures);
  }
}

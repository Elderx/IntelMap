import { state } from '../state/store.js';

export async function startTrafficCameraUpdates() {
  state.trafficCameraEnabled = true;
  state.trafficCameraError = null;

  import('../ui/activeLayers.js').then(({ updateActiveLayersPanel }) => {
    updateActiveLayersPanel();
  });
}

export function stopTrafficCameraUpdates() {
  state.trafficCameraEnabled = false;
  state.trafficCameraFeatures = [];
  state.trafficCameraError = null;

  import('../ui/activeLayers.js').then(({ updateActiveLayersPanel }) => {
    updateActiveLayersPanel();
  });
}

export function rebuildTrafficCameraLayers() {}

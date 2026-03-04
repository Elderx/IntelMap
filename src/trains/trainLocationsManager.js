import { state } from '../state/store.js';

export async function startTrainLocationUpdates() {
  state.trainLocationsEnabled = true;
  state.trainLocationsError = null;

  import('../ui/activeLayers.js').then(({ updateActiveLayersPanel }) => {
    updateActiveLayersPanel();
  });
}

export function stopTrainLocationUpdates() {
  state.trainLocationsEnabled = false;
  state.trainLocationFeatures = [];
  state.trainLocationsError = null;

  import('../ui/activeLayers.js').then(({ updateActiveLayersPanel }) => {
    updateActiveLayersPanel();
  });
}

export function rebuildTrainLocationLayers() {}

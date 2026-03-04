import { state } from '../state/store.js';

export async function startTrainStations() {
  state.trainStationsEnabled = true;
  state.trainStationsError = null;

  import('../ui/activeLayers.js').then(({ updateActiveLayersPanel }) => {
    updateActiveLayersPanel();
  });
}

export function stopTrainStations() {
  state.trainStationsEnabled = false;
  state.trainStationsError = null;

  import('../ui/activeLayers.js').then(({ updateActiveLayersPanel }) => {
    updateActiveLayersPanel();
  });
}

export function rebuildTrainStationLayers() {}

import { state } from '../state/store.js';

function syncFeatureSelectionFlag(mmsi, selected) {
  const id = String(mmsi);
  state.aisFeatures.forEach((feature) => {
    if (String(feature.get('mmsi')) !== id) return;
    feature.set('selected', selected);
    feature.changed();
  });
}

function refreshActiveLayersPanel() {
  import('../ui/activeLayers.js').then(({ updateActiveLayersPanel }) => {
    updateActiveLayersPanel();
  });
}

export function isAisVesselSelected(mmsi) {
  return state.aisSelectedMmsi.has(String(mmsi));
}

export function setAisVesselSelected(mmsi, selected) {
  const id = String(mmsi);
  if (!id) return;

  if (selected) {
    state.aisSelectedMmsi.add(id);
  } else {
    state.aisSelectedMmsi.delete(id);
  }

  syncFeatureSelectionFlag(id, selected);
  refreshActiveLayersPanel();
}

export function toggleAisVesselSelection(mmsi) {
  const selected = !isAisVesselSelected(mmsi);
  setAisVesselSelected(mmsi, selected);
  return selected;
}

export function clearAisSelection() {
  const selectedIds = Array.from(state.aisSelectedMmsi);
  state.aisSelectedMmsi.clear();
  selectedIds.forEach((mmsi) => syncFeatureSelectionFlag(mmsi, false));
  refreshActiveLayersPanel();
}

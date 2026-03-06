import Map from 'ol/Map.js';
import View from 'ol/View.js';
import WMTSCapabilities from 'ol/format/WMTSCapabilities.js';
import DragZoom from 'ol/interaction/DragZoom.js';
import { mouseOnly } from 'ol/events/condition.js';
import { fromLonLat } from 'ol/proj';
import { hardcodedLayers, capsUrl, mapboxAccessToken } from '../config/constants.js';
import { state } from '../state/store.js';
import { createTileLayerFromList } from './layers.js';
import { setupWeatherInteractions } from '../weather/weatherInteractions.js';

function createMiddleMouseDragZoomInteraction() {
  return new DragZoom({
    condition: (event) => {
      if (!mouseOnly(event)) {
        return false;
      }
      return event.originalEvent?.button === 1;
    }
  });
}

export async function loadCapabilities() {
  const parser = new WMTSCapabilities();
  const res = await fetch(capsUrl);
  const text = await res.text();
  return parser.read(text);
}

export function createBaseMap(result, initialCenter, initialZoom, initialLayerIdx) {
  state.currentLayerId = hardcodedLayers[initialLayerIdx].id;
  const currentLayer = createTileLayerFromList(result, state.currentLayerId, function () {
    alert('Failed to load tiles for layer: ' + hardcodedLayers[initialLayerIdx].name);
  }, mapboxAccessToken);
  state.map = new Map({
    layers: [currentLayer],
    target: 'map',
    view: new View({ center: initialCenter, zoom: initialZoom }),
    controls: []
  });
  state.map.addInteraction(createMiddleMouseDragZoomInteraction());

  // Setup weather interactions (will be active when weather is enabled)
  setupWeatherInteractions(state.map, 'main');

  return state.map;
}

export function createSplitMaps(result, center, zoom, rotation) {
  state.leftMap = new Map({ target: 'map-left', layers: [createTileLayerFromList(result, state.leftLayerId, null, mapboxAccessToken)], view: new View({ center: center.slice(), zoom, rotation }), controls: [] });
  state.rightMap = new Map({ target: 'map-right', layers: [createTileLayerFromList(result, state.rightLayerId, null, mapboxAccessToken)], view: new View({ center: center.slice(), zoom, rotation }), controls: [] });
  state.leftMap.addInteraction(createMiddleMouseDragZoomInteraction());
  state.rightMap.addInteraction(createMiddleMouseDragZoomInteraction());

  // Setup weather interactions
  setupWeatherInteractions(state.leftMap, 'left');
  setupWeatherInteractions(state.rightMap, 'right');
}

export function parseInitialFromParams(params) {
  state.initialLayerIdx = 1;
  let initialZoom = 5;
  let initialCenter = fromLonLat([24.94, 60.19]);
  let initialIsSplit = false;
  let initialLeftLayerId = hardcodedLayers[1].id;
  let initialRightLayerId = hardcodedLayers[0].id;
  if (params.lat && params.lon && params.z) {
    initialZoom = parseFloat(params.z);
    const lat = parseFloat(params.lat);
    const lon = parseFloat(params.lon);
    if (!isNaN(lat) && !isNaN(lon)) {
      initialCenter = fromLonLat([lon, lat]);
    }
  }
  if (params.split === '1') {
    initialIsSplit = true;
    if (params.leftLayer && hardcodedLayers.find(l => l.id === params.leftLayer)) initialLeftLayerId = params.leftLayer;
    if (params.rightLayer && hardcodedLayers.find(l => l.id === params.rightLayer)) initialRightLayerId = params.rightLayer;
  } else if (params.layer) {
    const idx = hardcodedLayers.findIndex(l => l.id === params.layer);
    if (idx !== -1) state.initialLayerIdx = idx;
  }
  if (params.groups) {
    state.activeLayerGroupIds = params.groups.split(';').filter(Boolean).map(id => parseInt(id, 10)).filter(id => !isNaN(id));
  }
  state.leftLayerId = initialLeftLayerId;
  state.rightLayerId = initialRightLayerId;
  state.currentLayerId = hardcodedLayers[state.initialLayerIdx].id;
  return { initialCenter, initialZoom, initialIsSplit };
}

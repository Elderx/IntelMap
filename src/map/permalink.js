import { toLonLat } from 'ol/proj';
import { state } from '../state/store.js';
import { hardcodedLayers } from '../config/constants.js';

export function updatePermalink(center, zoom, layerId, isSplit, leftLayerId, rightLayerId) {
  const [lon, lat] = toLonLat(center);
  const latStr = lat.toFixed(7);
  const lonStr = lon.toFixed(7);
  const z = Math.round(zoom * 1000) / 1000;
  let params = `?lat=${latStr}&lon=${lonStr}&z=${z}`;
  if (isSplit) {
    params += `&split=1&leftLayer=${leftLayerId}&rightLayer=${rightLayerId}`;
  } else {
    params += `&layer=${layerId}`;
  }
  // No longer serialize user markers into the URL
  window.history.replaceState({}, '', params);
}

export function updatePermalinkWithFeatures() {
  if (state.restoringFromPermalink || !state.permalinkInitialized) return;
  // Do not encode user markers in permalink
  let lineStr = '';
  if (state.lineCoords && state.lineCoords.length >= 2) {
    const coords = state.lineCoords.map(c => toLonLat(c).map(n => n.toFixed(7)));
    lineStr = `&line=${coords.map(pair => pair.join(",")).join(';')}`;
  }
  // Do not encode user polygons in permalink
  // Do not encode user circles in permalink
  let measureStr = '';
  if (state.measureCoords && state.measureCoords.length >= 2) {
    const coords = state.measureCoords.map(c => toLonLat(c).map(n => n.toFixed(7)));
    measureStr = `&measure=${coords.map(pair => pair.join(",")).join(';')}`;
  }
  let overlaysStr = '';
  const allOverlays = [...state.digiroadOverlayLayers, ...state.genericOverlayLayers];
  if (allOverlays.length > 0) {
    overlaysStr = `&overlays=${allOverlays.join(';')}`;
  }
  let osmStr = '';
  if (state.osmSelectedIds && state.osmSelectedIds.length > 0) {
    osmStr = `&osm=${state.osmSelectedIds.join(';')}`;
  }
  let groupsStr = '';
  if (state.activeLayerGroupIds && state.activeLayerGroupIds.length > 0) {
    groupsStr = `&groups=${state.activeLayerGroupIds.join(';')}`;
  }
  const view = state.isSplit && state.leftMap ? state.leftMap.getView() : state.map.getView();
  const zoom = view.getZoom();
  const center = view.getCenter();
  let params = `?lat=${toLonLat(center)[1].toFixed(7)}&lon=${toLonLat(center)[0].toFixed(7)}&z=${Math.round(zoom * 1000) / 1000}`;
  if (state.isSplit) {
    params += `&split=1&leftLayer=${state.leftLayerId}&rightLayer=${state.rightLayerId}`;
  } else {
    params += `&layer=${state.currentLayerId}`;
  }
  params += lineStr + measureStr + overlaysStr + osmStr + groupsStr;
  window.history.replaceState({}, '', params);
}



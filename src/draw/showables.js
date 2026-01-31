import { state } from '../state/store.js';
import { createLineLayer, createPolygonLayer, createCircleLayer, createMeasureLineLayer, createMeasureLabelOverlay, formatLength } from './helpers.js';

export function showLine(coords) {
  state.lineCoords = coords && coords.length >= 2 ? coords : null;
  if (!state.isSplit) {
    if (state.drawnLineLayer.main && state.map) state.map.removeLayer(state.drawnLineLayer.main);
    state.drawnLineLayer.main = null;
    state.drawnLineFeature.main = null;
    if (coords && coords.length >= 2) {
      const { layer, feature } = createLineLayer(coords);
      state.drawnLineLayer.main = layer;
      state.drawnLineFeature.main = feature;
      state.map.addLayer(layer);
    }
  } else {
    if (state.drawnLineLayer.left && state.leftMap) state.leftMap.removeLayer(state.drawnLineLayer.left);
    if (state.drawnLineLayer.right && state.rightMap) state.rightMap.removeLayer(state.drawnLineLayer.right);
    state.drawnLineLayer.left = state.drawnLineLayer.right = null;
    state.drawnLineFeature.left = state.drawnLineFeature.right = null;
    if (coords && coords.length >= 2) {
      const { layer: layerLeft, feature: featureLeft } = createLineLayer(coords);
      state.drawnLineLayer.left = layerLeft; state.drawnLineFeature.left = featureLeft; state.leftMap.addLayer(layerLeft);
      const { layer: layerRight, feature: featureRight } = createLineLayer(coords);
      state.drawnLineLayer.right = layerRight; state.drawnLineFeature.right = featureRight; state.rightMap.addLayer(layerRight);
    }
  }
}

export function showPolygon(coords) {
  state.polygonCoords = coords && coords.length >= 3 ? coords : null;
  if (!state.isSplit) {
    if (state.drawnPolygonLayer.main && state.map) state.map.removeLayer(state.drawnPolygonLayer.main);
    state.drawnPolygonLayer.main = null;
    state.drawnPolygonFeature.main = null;
    if (coords && coords.length >= 3) {
      const { layer, feature } = createPolygonLayer(coords);
      state.drawnPolygonLayer.main = layer;
      state.drawnPolygonFeature.main = feature;
      state.map.addLayer(layer);
    }
  } else {
    if (state.drawnPolygonLayer.left && state.leftMap) state.leftMap.removeLayer(state.drawnPolygonLayer.left);
    if (state.drawnPolygonLayer.right && state.rightMap) state.rightMap.removeLayer(state.drawnPolygonLayer.right);
    state.drawnPolygonLayer.left = state.drawnPolygonLayer.right = null;
    state.drawnPolygonFeature.left = state.drawnPolygonFeature.right = null;
    if (coords && coords.length >= 3) {
      const { layer: layerLeft, feature: featureLeft } = createPolygonLayer(coords);
      state.drawnPolygonLayer.left = layerLeft; state.drawnPolygonFeature.left = featureLeft; state.leftMap.addLayer(layerLeft);
      const { layer: layerRight, feature: featureRight } = createPolygonLayer(coords);
      state.drawnPolygonLayer.right = layerRight; state.drawnPolygonFeature.right = featureRight; state.rightMap.addLayer(layerRight);
    }
  }
}

export function showCircle(center, radius) {
  state.circleCoords = center && radius ? { center, radius } : null;
  if (!state.isSplit) {
    if (state.drawnCircleLayer.main && state.map) state.map.removeLayer(state.drawnCircleLayer.main);
    state.drawnCircleLayer.main = null;
    state.drawnCircleFeature.main = null;
    if (center && radius) {
      const { layer, feature } = createCircleLayer(center, radius);
      state.drawnCircleLayer.main = layer;
      state.drawnCircleFeature.main = feature;
      state.map.addLayer(layer);
    }
  } else {
    if (state.drawnCircleLayer.left && state.leftMap) state.leftMap.removeLayer(state.drawnCircleLayer.left);
    if (state.drawnCircleLayer.right && state.rightMap) state.rightMap.removeLayer(state.drawnCircleLayer.right);
    state.drawnCircleLayer.left = state.drawnCircleLayer.right = null;
    state.drawnCircleFeature.left = state.drawnCircleFeature.right = null;
    if (center && radius) {
      const { layer: layerLeft, feature: featureLeft } = createCircleLayer(center, radius);
      state.drawnCircleLayer.left = layerLeft; state.drawnCircleFeature.left = featureLeft; state.leftMap.addLayer(layerLeft);
      const { layer: layerRight, feature: featureRight } = createCircleLayer(center, radius);
      state.drawnCircleLayer.right = layerRight; state.drawnCircleFeature.right = featureRight; state.rightMap.addLayer(layerRight);
    }
  }
}

export function showMeasureLine(coords) {
  state.measureCoords = coords && coords.length >= 2 ? coords : null;
  if (!state.isSplit) {
    if (state.measureLineLayer.main && state.map) state.map.removeLayer(state.measureLineLayer.main);
    if (state.measureLabelOverlay.main && state.map) state.map.removeOverlay(state.measureLabelOverlay.main);
    state.measureLineLayer.main = null;
    state.measureLineFeature.main = null;
    state.measureLabelOverlay.main = null;
    if (coords && coords.length >= 2) {
      const { layer, feature } = createMeasureLineLayer(coords);
      state.measureLineLayer.main = layer;
      state.measureLineFeature.main = feature;
      state.map.addLayer(layer);
      const len = formatLength(feature.getGeometry());
      const overlay = createMeasureLabelOverlay(coords[coords.length - 1], len);
      state.map.addOverlay(overlay);
      state.measureLabelOverlay.main = overlay;
    }
  } else {
    if (state.measureLineLayer.left && state.leftMap) state.leftMap.removeLayer(state.measureLineLayer.left);
    if (state.measureLabelOverlay.left && state.leftMap) state.leftMap.removeOverlay(state.measureLabelOverlay.left);
    if (state.measureLineLayer.right && state.rightMap) state.rightMap.removeLayer(state.measureLineLayer.right);
    if (state.measureLabelOverlay.right && state.rightMap) state.rightMap.removeOverlay(state.measureLabelOverlay.right);
    state.measureLineLayer.left = state.measureLineLayer.right = null;
    state.measureLineFeature.left = state.measureLineFeature.right = null;
    state.measureLabelOverlay.left = state.measureLabelOverlay.right = null;
    if (coords && coords.length >= 2) {
      const { layer: layerLeft, feature: featureLeft } = createMeasureLineLayer(coords);
      state.measureLineLayer.left = layerLeft; state.measureLineFeature.left = featureLeft; state.leftMap.addLayer(layerLeft);
      const len = formatLength(featureLeft.getGeometry());
      const overlayLeft = createMeasureLabelOverlay(coords[coords.length - 1], len);
      state.leftMap.addOverlay(overlayLeft);
      state.measureLabelOverlay.left = overlayLeft;

      const { layer: layerRight, feature: featureRight } = createMeasureLineLayer(coords);
      state.measureLineLayer.right = layerRight; state.measureLineFeature.right = featureRight; state.rightMap.addLayer(layerRight);
      const overlayRight = createMeasureLabelOverlay(coords[coords.length - 1], len);
      state.rightMap.addOverlay(overlayRight);
      state.measureLabelOverlay.right = overlayRight;
    }
  }
}

export function clearMeasureLine(mapKey, mapObj) {
  if (state.measureLineLayer[mapKey] && mapObj) mapObj.removeLayer(state.measureLineLayer[mapKey]);
  state.measureLineLayer[mapKey] = null;
  state.measureLineFeature[mapKey] = null;
  if (state.measureLabelOverlay[mapKey] && mapObj) mapObj.removeOverlay(state.measureLabelOverlay[mapKey]);
  state.measureLabelOverlay[mapKey] = null;
}

export function copyDrawnFeatures(from, to, mapFrom, mapTo) {
  if (state.drawnLineLayer[to] && mapTo) mapTo.removeLayer(state.drawnLineLayer[to]);
  state.drawnLineLayer[to] = null; state.drawnLineFeature[to] = null;
  if (state.drawnLineFeature[from]) {
    const coords = state.drawnLineFeature[from].getGeometry().getCoordinates();
    const { layer, feature } = createLineLayer(coords);
    state.drawnLineLayer[to] = layer; state.drawnLineFeature[to] = feature; if (mapTo) mapTo.addLayer(layer);
  }
  if (state.drawnPolygonLayer[to] && mapTo) mapTo.removeLayer(state.drawnPolygonLayer[to]);
  state.drawnPolygonLayer[to] = null; state.drawnPolygonFeature[to] = null;
  if (state.drawnPolygonFeature[from]) {
    const coords = state.drawnPolygonFeature[from].getGeometry().getCoordinates()[0];
    const { layer, feature } = createPolygonLayer(coords);
    state.drawnPolygonLayer[to] = layer; state.drawnPolygonFeature[to] = feature; if (mapTo) mapTo.addLayer(layer);
  }
  if (state.drawnCircleLayer[to] && mapTo) mapTo.removeLayer(state.drawnCircleLayer[to]);
  state.drawnCircleLayer[to] = null; state.drawnCircleFeature[to] = null;
  if (state.drawnCircleFeature[from]) {
    const geom = state.drawnCircleFeature[from].getGeometry();
    const center = geom.getCenter();
    const radius = geom.getRadius();
    const { layer, feature } = createCircleLayer(center, radius);
    state.drawnCircleLayer[to] = layer; state.drawnCircleFeature[to] = feature; if (mapTo) mapTo.addLayer(layer);
  }
  if (state.measureLineLayer[to] && mapTo) mapTo.removeLayer(state.measureLineLayer[to]);
  if (state.measureLabelOverlay[to] && mapTo) mapTo.removeOverlay(state.measureLabelOverlay[to]);
  state.measureLineLayer[to] = null; state.measureLineFeature[to] = null; state.measureLabelOverlay[to] = null;
  if (state.measureLineFeature[from]) {
    const coords = state.measureLineFeature[from].getGeometry().getCoordinates();
    const { layer, feature } = createMeasureLineLayer(coords);
    state.measureLineLayer[to] = layer; state.measureLineFeature[to] = feature; if (mapTo) mapTo.addLayer(layer);
    const len = formatLength(feature.getGeometry());
    const overlay = createMeasureLabelOverlay(coords[coords.length - 1], len);
    if (mapTo) mapTo.addOverlay(overlay);
    state.measureLabelOverlay[to] = overlay;
  }
}

export function clearDrawnFeatures(mapKey, mapObj) {
  if (state.drawnLineLayer[mapKey] && mapObj) mapObj.removeLayer(state.drawnLineLayer[mapKey]);
  state.drawnLineLayer[mapKey] = null; state.drawnLineFeature[mapKey] = null;
  if (state.drawnPolygonLayer[mapKey] && mapObj) mapObj.removeLayer(state.drawnPolygonLayer[mapKey]);
  state.drawnPolygonLayer[mapKey] = null; state.drawnPolygonFeature[mapKey] = null;
  if (state.drawnCircleLayer[mapKey] && mapObj) mapObj.removeLayer(state.drawnCircleLayer[mapKey]);
  state.drawnCircleLayer[mapKey] = null; state.drawnCircleFeature[mapKey] = null;
  clearMeasureLine(mapKey, mapObj);
}

export function showAllDrawables(showClickMarkerFn) {
  const marker = state.markerCoords;
  if (marker) {
    const [lon, lat] = marker;
    showClickMarkerFn(lon, lat);
  } else {
    showClickMarkerFn(null, null);
  }
  showLine(state.lineCoords);
  showPolygon(state.polygonCoords);
  if (state.circleCoords) {
    showCircle(state.circleCoords.center, state.circleCoords.radius);
  }
  showMeasureLine(state.measureCoords);
}



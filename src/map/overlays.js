import TileLayer from 'ol/layer/Tile.js';
import TileWMS from 'ol/source/TileWMS.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import Style from 'ol/style/Style.js';
import Stroke from 'ol/style/Stroke.js';
import Fill from 'ol/style/Fill.js';
import CircleStyle from 'ol/style/Circle.js';
import { wmsUrl } from '../config/constants.js';
import { state } from '../state/store.js';

export function createWMSOverlayLayer(layerName) {
  return new TileLayer({
    opacity: 0.7,
    source: new TileWMS({ url: wmsUrl, params: { LAYERS: layerName, TRANSPARENT: true, VERSION: '1.3.0' }, crossOrigin: 'anonymous' }),
    zIndex: 50,
  });
}

export function updateAllOverlays() {
  ['main', 'left', 'right'].forEach(key => {
    (state.overlayLayerObjects[key] || []).forEach(layer => {
      if (key === 'main' && state.map) state.map.removeLayer(layer);
      if (key === 'left' && state.leftMap) state.leftMap.removeLayer(layer);
      if (key === 'right' && state.rightMap) state.rightMap.removeLayer(layer);
    });
    state.overlayLayerObjects[key] = [];
    (state.genericOverlayLayerObjects[key] || []).forEach(layer => {
      if (key === 'main' && state.map) state.map.removeLayer(layer);
      if (key === 'left' && state.leftMap) state.leftMap.removeLayer(layer);
      if (key === 'right' && state.rightMap) state.rightMap.removeLayer(layer);
    });
    state.genericOverlayLayerObjects[key] = [];
    (state.osmLayerObjects[key] || []).forEach(layer => {
      if (key === 'main' && state.map) state.map.removeLayer(layer);
      if (key === 'left' && state.leftMap) state.leftMap.removeLayer(layer);
      if (key === 'right' && state.rightMap) state.rightMap.removeLayer(layer);
    });
    state.osmLayerObjects[key] = [];
  });
  state.digiroadOverlayLayers.forEach(layerName => {
    const layer = createWMSOverlayLayer(layerName);
    state.overlayLayerObjects.main.push(layer);
    if (state.map) state.map.addLayer(layer);
    if (state.isSplit) {
      const leftLayer = createWMSOverlayLayer(layerName);
      state.overlayLayerObjects.left.push(leftLayer);
      if (state.leftMap) state.leftMap.addLayer(leftLayer);
      const rightLayer = createWMSOverlayLayer(layerName);
      state.overlayLayerObjects.right.push(rightLayer);
      if (state.rightMap) state.rightMap.addLayer(rightLayer);
    }
  });
  state.genericOverlayLayers.forEach(layerName => {
    const layer = createWMSOverlayLayer(layerName);
    state.genericOverlayLayerObjects.main.push(layer);
    if (state.map) state.map.addLayer(layer);
    if (state.isSplit) {
      const leftLayer = createWMSOverlayLayer(layerName);
      state.genericOverlayLayerObjects.left.push(leftLayer);
      if (state.leftMap) state.leftMap.addLayer(leftLayer);
      const rightLayer = createWMSOverlayLayer(layerName);
      state.genericOverlayLayerObjects.right.push(rightLayer);
      if (state.rightMap) state.rightMap.addLayer(rightLayer);
    }
  });

  // Add OSM GeoJSON overlays to all active maps
  state.osmSelectedIds.forEach((osmId) => {
    const item = state.osmItems.find(i => i.id === osmId);
    if (!item) return;

    // Assign stable color - use existing or assign new one
    let color = state.osmAssignedColors[osmId];
    if (!color) {
      // Find first available color not in use
      const usedColors = Object.values(state.osmAssignedColors);
      const availableColor = state.osmColorPalette.find(c => !usedColors.includes(c));
      color = availableColor || state.osmColorPalette[Object.keys(state.osmAssignedColors).length % state.osmColorPalette.length];
      state.osmAssignedColors[osmId] = color;
    }
    const makeOsmStyle = () => new Style({
      image: new CircleStyle({
        radius: 6,
        fill: new Fill({ color }),
        stroke: new Stroke({ color: 'white', width: 2 })
      }),
      stroke: new Stroke({ color, width: 2 }),
      fill: new Fill({ color: color + '20' }), // Add transparency
    });

    const mkLayer = () => {
      const layer = new VectorLayer({
        source: new VectorSource({ url: `/osm/${item.file}`, format: new GeoJSON() }),
        zIndex: 60,
        style: makeOsmStyle(),
      });
      // Store metadata for interactions
      layer.set('osmId', osmId);
      layer.set('osmTitle', item.title);
      layer.set('osmColor', color);
      return layer;
    };

    const mainLayer = mkLayer();
    state.osmLayerObjects.main.push(mainLayer);
    if (state.map) state.map.addLayer(mainLayer);
    if (state.isSplit) {
      const leftLayer = mkLayer();
      state.osmLayerObjects.left.push(leftLayer);
      if (state.leftMap) state.leftMap.addLayer(leftLayer);
      const rightLayer = mkLayer();
      state.osmLayerObjects.right.push(rightLayer);
      if (state.rightMap) state.rightMap.addLayer(rightLayer);
    }
  });

  // Update the Unified Active Layers Panel
  import('../ui/activeLayers.js').then(({ updateActiveLayersPanel }) => updateActiveLayersPanel());
}



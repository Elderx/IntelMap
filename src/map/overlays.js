import TileLayer from 'ol/layer/Tile.js';
import TileWMS from 'ol/source/TileWMS.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import Style from 'ol/style/Style.js';
import Stroke from 'ol/style/Stroke.js';
import Fill from 'ol/style/Fill.js';
import CircleStyle from 'ol/style/Circle.js';
import XYZ from 'ol/source/XYZ.js';
import { wmsUrl, tileCacheUrl } from '../config/constants.js';
import { state } from '../state/store.js';

export function createWMSOverlayLayer(layerName) {
  return new TileLayer({
    opacity: 0.7,
    source: new TileWMS({ url: wmsUrl, params: { LAYERS: layerName, TRANSPARENT: true, VERSION: '1.3.0' }, crossOrigin: 'anonymous' }),
    zIndex: 50,
  });
}

export function createOpenSeaMapOverlayLayer() {
  const openSeaMapUrl = tileCacheUrl
    ? `${tileCacheUrl}/tiles/openseamap/seamark/{z}/{x}/{y}.png`
    : `/tiles/openseamap/seamark/{z}/{x}/{y}.png`;
  return new TileLayer({
    opacity: 1,
    source: new XYZ({
      url: openSeaMapUrl,
      attributions: 'Map data: &copy; <a href="http://www.openseamap.org">OpenSeaMap</a> contributors',
      crossOrigin: 'anonymous'
    }),
    zIndex: 55, // Higher than WMS overlays
  });
}

export function createXYZOverlayLayer(layerInfo) {
  let url = layerInfo.url;
  // Rewrite URLs for cache proxy or relative paths
  if (url.includes('basemaps.cartocdn.com')) {
    url = url.replace('https://{a-c}.basemaps.cartocdn.com', `${tileCacheUrl || ''}/tiles/carto/{a-c}`);
  } else if (url.includes('tiles.openrailwaymap.org')) {
    url = url.replace('https://{a-c}.tiles.openrailwaymap.org', `${tileCacheUrl || ''}/tiles/openrailway/{a-c}`);
  } else if (url.includes('tile.waymarkedtrails.org')) {
    url = url.replace('https://tile.waymarkedtrails.org', `${tileCacheUrl || ''}/tiles/waymarked`);
  }
  return new TileLayer({
    opacity: 1,
    source: new XYZ({
      url: url,
      attributions: layerInfo.attributions,
      crossOrigin: 'anonymous'
    }),
    zIndex: 55,
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

  // Aggregate all unique active layer names from manual selection and active groups
  const allDigiroad = new Set(state.digiroadOverlayLayers || []);
  const allGeneric = new Set(state.genericOverlayLayers || []);
  const allOsmIds = new Set(state.osmSelectedIds || []);

  (state.activeLayerGroupIds || []).forEach(groupId => {
    const group = state.layerGroups.find(g => g.id === groupId);
    if (!group || !group.config) return;

    if (group.config.activeOverlays) group.config.activeOverlays.forEach(id => allDigiroad.add(id));
    if (group.config.genericOverlayLayers) group.config.genericOverlayLayers.forEach(id => allGeneric.add(id));
    if (group.config.activeOsmDatasets) group.config.activeOsmDatasets.forEach(id => allOsmIds.add(id));
  });

  allDigiroad.forEach(layerName => {
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

  allGeneric.forEach(layerId => {
    const layerInfo = state.genericOverlayList.find(l => l.name === layerId);
    let layer;
    if (layerInfo && layerInfo.type === 'openseamap') {
      layer = createOpenSeaMapOverlayLayer();
    } else if (layerInfo && layerInfo.type === 'xyz_overlay') {
      layer = createXYZOverlayLayer(layerInfo);
    } else {
      layer = createWMSOverlayLayer(layerId);
    }
    state.genericOverlayLayerObjects.main.push(layer);
    if (state.map) state.map.addLayer(layer);
    if (state.isSplit) {
      const getLayer = (info, id) => {
        if (info && info.type === 'openseamap') return createOpenSeaMapOverlayLayer();
        if (info && info.type === 'xyz_overlay') return createXYZOverlayLayer(info);
        return createWMSOverlayLayer(id);
      };
      const leftLayer = getLayer(layerInfo, layerId);
      state.genericOverlayLayerObjects.left.push(leftLayer);
      if (state.leftMap) state.leftMap.addLayer(leftLayer);
      const rightLayer = getLayer(layerInfo, layerId);
      state.genericOverlayLayerObjects.right.push(rightLayer);
      if (state.rightMap) state.rightMap.addLayer(rightLayer);
    }
  });

  // Add OSM GeoJSON overlays to all active maps
  allOsmIds.forEach((osmId) => {
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



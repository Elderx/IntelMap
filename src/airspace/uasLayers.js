// UAS Airspace Zones Layer Management
// Creates and manages OpenLayers VectorLayers for Finnish UAS zones

import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import { Style, Fill, Stroke } from 'ol/style.js';
import { state } from '../state/store.js';

// Restriction type colors (aviation standard)
const RESTRICTION_COLORS = {
  'PROHIBITED': '#e74c3c',          // Red
  'REQ_AUTHORISATION': '#f39c12',   // Orange
  'NO_RESTRICTION': '#2ecc71'       // Green
};

/**
 * Creates a styled VectorLayer for UAS zones
 * @returns {VectorLayer} Configured UAS layer with GeoJSON source
 */
export function createUASLayer() {
  const vectorSource = new VectorSource({
    url: 'https://flyk.com/api/uas.geojson',
    format: new GeoJSON(),
    loader: function(extent, resolution, projection, success, failure) {
      fetch('https://flyk.com/api/uas.geojson')
        .then(response => response.json())
        .then(json => {
          const format = new GeoJSON();
          const features = format.readFeatures(json, {
            dataProjection: 'EPSG:4326',
            featureProjection: projection
          });

          // Tag all features as UAS zones for interaction detection
          features.forEach(feature => {
            feature.set('isUASZone', true);
          });

          vectorSource.addFeatures(features);
          success(features);
        })
        .catch(error => {
          console.error('[UAS] Failed to load features:', error);
          failure();
        });
    }
  });

  const vectorLayer = new VectorLayer({
    source: vectorSource,
    style: uasStyleFunction,
    zIndex: 70  // Above WMS/OSM, below drawn features
  });

  return vectorLayer;
}

/**
 * Style function for UAS zone features
 * @param {import('ol/Feature').default} feature - The feature to style
 * @returns {Style} OpenLayers style with fill and stroke
 */
function uasStyleFunction(feature) {
  const props = feature.getProperties();
  const restriction = props.restriction || 'NO_RESTRICTION';
  const color = RESTRICTION_COLORS[restriction] || '#2ecc71';

  return new Style({
    fill: new Fill({
      color: hexToRgba(color, 0.3)  // 30% opacity
    }),
    stroke: new Stroke({
      color: color,
      width: 2
    })
  });
}

/**
 * Adds UAS layer to a specific map
 * @param {string} mapKey - Map identifier ('main', 'left', or 'right')
 */
export function addUASToMap(mapKey) {
  const mapObj = mapKey === 'main' ? state.map
    : mapKey === 'left' ? state.leftMap
    : state.rightMap;

  if (!mapObj) {
    console.warn(`[UAS] Cannot add layer: ${mapKey} map not available`);
    return;
  }

  // Create layer if it doesn't exist for this map
  if (!state.uasLayer[mapKey]) {
    const layer = createUASLayer();
    state.uasLayer[mapKey] = layer;
    mapObj.addLayer(layer);
    console.log(`[UAS] Added layer to ${mapKey} map`);
  }
}

/**
 * Removes UAS layers from all maps
 */
export function removeUASFromMaps() {
  ['main', 'left', 'right'].forEach(mapKey => {
    const mapObj = mapKey === 'main' ? state.map
      : mapKey === 'left' ? state.leftMap
      : state.rightMap;

    if (mapObj && state.uasLayer[mapKey]) {
      mapObj.removeLayer(state.uasLayer[mapKey]);
      state.uasLayer[mapKey] = null;
      console.log(`[UAS] Removed layer from ${mapKey} map`);
    }
  });
}

/**
 * Updates UAS layers based on current enabled state
 * Adds layers to all active maps if enabled, removes if disabled
 */
export function updateUASLayers() {
  if (state.uasEnabled) {
    // Add to all active maps
    if (state.map && !state.isSplit) {
      addUASToMap('main');
    } else if (state.isSplit) {
      if (state.leftMap) addUASToMap('left');
      if (state.rightMap) addUASToMap('right');
    }
  } else {
    // Remove from all maps
    removeUASFromMaps();
  }
}

/**
 * Converts hex color to RGBA string
 * @param {string} hex - Hex color (e.g., '#e74c3c')
 * @param {number} alpha - Alpha value (0-1)
 * @returns {string} RGBA color string (e.g., 'rgba(231, 76, 60, 0.3)')
 */
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Gets the color for a restriction type
 * @param {string} restriction - Restriction type
 * @returns {string} Hex color code
 */
export function getRestrictionColor(restriction) {
  return RESTRICTION_COLORS[restriction] || '#2ecc71';
}

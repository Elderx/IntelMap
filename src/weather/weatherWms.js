/**
 * Weather WMS Module
 * Creates and manages FMI WMS tile layers
 */

import TileLayer from 'ol/layer/Tile.js';
import TileWMS from 'ol/source/TileWMS.js';
import { FMI_CONFIG } from '../config/constants.js';
import { state } from '../state/store.js';

/**
 * Create weather WMS tile layer
 * @param {string} layerType - 'temperature', 'wind', or 'precipitation'
 * @returns {TileLayer} OpenLayers TileLayer
 */
export function createWeatherWmsLayer(layerType) {
  const layerName = FMI_CONFIG.layers[layerType];
  if (!layerName) {
    console.warn(`[Weather] Unknown layer type: ${layerType}`);
    return null;
  }

  return new TileLayer({
    source: new TileWMS({
      url: FMI_CONFIG.wmsUrl,
      params: {
        'LAYERS': layerName,
        'TILED': true,
        'VERSION': FMI_CONFIG.wmsVersion,
        'FORMAT': FMI_CONFIG.wmsFormat,
        'TRANSPARENT': FMI_CONFIG.wmsTransparent
      },
      transition: 0,
      projection: 'EPSG:3857'
    }),
    zIndex: FMI_CONFIG.zIndex[layerType],
    className: `weather-wms-layer weather-wms-${layerType}`,
    visible: state.weatherActiveWmsLayers.includes(layerType)
  });
}

/**
 * Create all weather WMS layers
 * @returns {Object} Object with temperature, wind, precipitation layers
 */
export function createWeatherWmsLayers() {
  return {
    temperature: createWeatherWmsLayer('temperature'),
    wind: createWeatherWmsLayer('wind'),
    precipitation: createWeatherWmsLayer('precipitation')
  };
}

/**
 * Update WMS layer visibility
 * @param {TileLayer} layer - The WMS layer
 * @param {boolean} visible - Whether layer should be visible
 */
export function updateWmsLayerVisibility(layer, visible) {
  if (layer) {
    layer.setVisible(visible);
  }
}

/**
 * Update all WMS layers based on active layers array
 */
export function updateAllWmsLayers() {
  const maps = [
    { key: 'main', map: state.map },
    { key: 'left', map: state.leftMap },
    { key: 'right', map: state.rightMap }
  ];

  maps.forEach(({ key, map }) => {
    if (!map) return;

    const layers = state.weatherWmsLayers[key];
    if (!layers) return;

    // Update each layer's visibility
    Object.keys(layers).forEach(layerType => {
      const layer = layers[layerType];
      const isActive = state.weatherActiveWmsLayers.includes(layerType);
      updateWmsLayerVisibility(layer, isActive);
    });
  });
}

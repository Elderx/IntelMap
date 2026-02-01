/**
 * Weather Interactions Module
 * Hover preview and click-to-pin popups
 */

import { state } from '../state/store.js';
import { Overlay } from 'ol/Overlay.js';

let hoverPopup = null;
let pinnedPopup = null;

/**
 * Get wind direction arrow
 * @param {number} degrees - Wind direction in degrees
 * @returns {string} Arrow character
 */
function getWindArrow(degrees) {
  if (degrees === null) return '';

  const normalized = ((degrees % 360) + 360) % 360;

  // 8 cardinal directions
  if (normalized >= 337.5 || normalized < 22.5) return '↓'; // N
  if (normalized >= 22.5 && normalized < 67.5) return '↙'; // NE
  if (normalized >= 67.5 && normalized < 112.5) return '←'; // E
  if (normalized >= 112.5 && normalized < 157.5) return '↖'; // SE
  if (normalized >= 157.5 && normalized < 202.5) return '↑'; // S
  if (normalized >= 202.5 && normalized < 247.5) return '↗'; // SW
  if (normalized >= 247.5 && normalized < 292.5) return '→'; // W
  return '↘'; // NW
}

/**
 * Create hover popup content
 * @param {Feature} feature - OpenLayers Feature
 * @returns {string} HTML content
 */
function createHoverPopupContent(feature) {
  const name = feature.get('name') || 'Unknown Station';
  const temperature = feature.get('temperature');
  const windSpeed = feature.get('windSpeed');
  const windDirection = feature.get('windDirection');

  const tempStr = temperature !== null ? `${temperature.toFixed(1)}°C` : 'N/A';
  const windStr = windSpeed !== null ? `${windSpeed.toFixed(1)} m/s` : 'N/A';
  const arrow = getWindArrow(windDirection);
  const directionStr = windDirection !== null ? `${arrow} (${windDirection.toFixed(0)}°)` : '';

  return `
    <div class="weather-popup hover">
      <strong>${name}</strong><br>
      🌡️ ${tempStr}<br>
      💨 ${windStr} ${directionStr}
    </div>
  `;
}

/**
 * Setup hover and click interactions for weather station layer
 * @param {Object} mapObj - OpenLayers Map instance
 * @param {string} mapKey - 'main', 'left', or 'right'
 */
export function setupWeatherInteractions(mapObj, mapKey) {
  const layer = state.weatherStationLayer[mapKey];
  if (!layer) return;

  // Create hover popup overlay
  hoverPopup = new Overlay({
    element: document.createElement('div'),
    positioning: 'bottom-center',
    stopEvent: false,
    className: 'weather-hover-popup'
  });
  mapObj.addOverlay(hoverPopup);

  // Create pinned popup overlay
  pinnedPopup = new Overlay({
    element: document.createElement('div'),
    positioning: 'bottom-center',
    className: 'weather-pinned-popup'
  });
  mapObj.addOverlay(pinnedPopup);

  let hoveredFeature = null;

  // Pointer move handler (hover preview)
  mapObj.on('pointermove', (evt) => {
    if (state.dragging) return;

    const feature = mapObj.forEachFeatureAtPixel(evt.pixel, (f) => {
      if (f.get('stationId')) return f;
      return null;
    });

    if (feature && feature.get('stationId')) {
      const coordinate = feature.getGeometry().getCoordinates();
      hoverPopup.getElement().innerHTML = createHoverPopupContent(feature);
      hoverPopup.setPosition(coordinate);
      hoveredFeature = feature;
      mapObj.getTargetElement().style.cursor = 'pointer';
    } else {
      hoverPopup.setPosition(undefined);
      hoveredFeature = null;
      mapObj.getTargetElement().style.cursor = '';
    }
  });

  // Click handler (pin popup)
  mapObj.on('click', (evt) => {
    const feature = mapObj.forEachFeatureAtPixel(evt.pixel, (f) => {
      if (f.get('stationId')) return f;
      return null;
    });

    if (feature && feature.get('stationId')) {
      const coordinate = feature.getGeometry().getCoordinates();
      pinnedPopup.getElement().innerHTML = createPinnedPopupContent(feature);
      pinnedPopup.setPosition(coordinate);

      // Add close button handler
      const closeBtn = pinnedPopup.getElement().querySelector('.popup-close');
      if (closeBtn) {
        closeBtn.onclick = () => {
          pinnedPopup.setPosition(undefined);
        };
      }
    } else {
      pinnedPopup.setPosition(undefined);
    }
  });
}

/**
 * Create pinned popup content
 * @param {Feature} feature - OpenLayers Feature
 * @returns {string} HTML content
 */
function createPinnedPopupContent(feature) {
  const content = createHoverPopupContent(feature);
  return content.replace('weather-popup hover', 'weather-popup pinned') + '<button class="popup-close">&times;</button>';
}

/**
 * Remove weather interactions from map
 * @param {Object} mapObj - OpenLayers Map instance
 */
export function removeWeatherInteractions(mapObj) {
  if (hoverPopup && mapObj.getOverlays().getArray().includes(hoverPopup)) {
    mapObj.removeOverlay(hoverPopup);
  }
  if (pinnedPopup && mapObj.getOverlays().getArray().includes(pinnedPopup)) {
    mapObj.removeOverlay(pinnedPopup);
  }
}

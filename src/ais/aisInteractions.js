/**
 * AIS Interactions Module
 * Hover preview and click-to-pin popups
 */

import { state } from '../state/store.js';
import Overlay from 'ol/Overlay.js';

let hoverPopup = null;
let pinnedPopup = null;

/**
 * Create hover popup content
 * @param {Feature} feature - OpenLayers Feature
 * @returns {string} HTML content
 */
function createHoverPopupContent(feature) {
  const mmsi = feature.get('mmsi');
  const name = feature.get('name');
  const shipType = feature.get('shipType');
  const destination = feature.get('destination');
  const speed = feature.get('speed');

  return `
    <div class="ais-popup hover">
      <strong>${name}</strong> <span class="text-muted">(${shipType})</span><br>
      MMSI: ${mmsi}<br>
      ${destination ? `Destination: ${destination}<br>` : ''}
      Speed: ${speed.toFixed(1)} knots
    </div>
  `;
}

/**
 * Create pinned popup content
 * @param {Feature} feature - OpenLayers Feature
 * @returns {string} HTML content
 */
function createPinnedPopupContent(feature) {
  const mmsi = feature.get('mmsi');
  const name = feature.get('name');
  const shipType = feature.get('shipType');
  const destination = feature.get('destination');
  const speed = feature.get('speed');
  const course = feature.get('course');
  const imo = feature.get('imo');
  const callSign = feature.get('callSign');
  const dimension = feature.get('dimension');
  const draft = feature.get('draft');
  const cargo = feature.get('cargo');

  const length = dimension?.length || 'N/A';
  const width = dimension?.width || 'N/A';

  return `
    <div class="ais-popup pinned">
      <button class="popup-close">&times;</button>
      <h3>${name}</h3>
      <table class="popup-table">
        <tr><td>MMSI:</td><td>${mmsi}</td></tr>
        ${imo ? `<tr><td>IMO:</td><td>${imo}</td></tr>` : ''}
        ${callSign ? `<tr><td>Call Sign:</td><td>${callSign}</td></tr>` : ''}
        <tr><td>Type:</td><td>${shipType}</td></tr>
        ${destination ? `<tr><td>Destination:</td><td>${destination}</td></tr>` : ''}
        <tr><td>Speed:</td><td>${speed.toFixed(1)} knots</td></tr>
        <tr><td>Course:</td><td>${course.toFixed(0)}°</td></tr>
        ${length !== 'N/A' ? `<tr><td>Length:</td><td>${length}m</td></tr>` : ''}
        ${width !== 'N/A' ? `<tr><td>Width:</td><td>${width}m</td></tr>` : ''}
        ${draft ? `<tr><td>Draft:</td><td>${draft}m</td></tr>` : ''}
        ${cargo ? `<tr><td>Cargo:</td><td>${cargo}</td></tr>` : ''}
      </table>
    </div>
  `;
}

/**
 * Setup hover and click interactions for AIS layer
 * @param {Object} mapObj - OpenLayers Map instance
 * @param {string} mapKey - 'main', 'left', or 'right'
 */
export function setupAisInteractions(mapObj, mapKey) {
  const layer = state.aisLayer[mapKey];
  if (!layer) return;

  // Create hover popup overlay
  hoverPopup = new Overlay({
    element: document.createElement('div'),
    positioning: 'bottom-center',
    stopEvent: false,
    className: 'ais-hover-popup'
  });
  mapObj.addOverlay(hoverPopup);

  // Create pinned popup overlay
  pinnedPopup = new Overlay({
    element: document.createElement('div'),
    positioning: 'bottom-center',
    className: 'ais-pinned-popup'
  });
  mapObj.addOverlay(pinnedPopup);

  let hoveredFeature = null;

  // Pointer move handler (hover preview)
  mapObj.on('pointermove', (evt) => {
    if (state.dragging) return;

    const feature = mapObj.forEachFeatureAtPixel(evt.pixel, (f) => {
      if (f.get('mmsi')) return f;
      return null;
    });

    if (feature && feature.get('mmsi')) {
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
      if (f.get('mmsi')) return f;
      return null;
    });

    if (feature && feature.get('mmsi')) {
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
 * Remove AIS interactions from map
 * @param {Object} mapObj - OpenLayers Map instance
 */
export function removeAisInteractions(mapObj) {
  if (hoverPopup && mapObj.getOverlays().getArray().includes(hoverPopup)) {
    mapObj.removeOverlay(hoverPopup);
  }
  if (pinnedPopup && mapObj.getOverlays().getArray().includes(pinnedPopup)) {
    mapObj.removeOverlay(pinnedPopup);
  }
}

/**
 * Aircraft Interactions Module
 * Handles click events and popup display
 */

import Overlay from 'ol/Overlay.js';
import { state } from '../state/store.js';

let aircraftPopups = { main: null, left: null, right: null };

/**
 * Format altitude for display
 * @param {number|null} altitudeMeters - Altitude in meters
 * @returns {string} Formatted altitude
 */
function formatAltitude(altitudeMeters) {
  if (altitudeMeters === null) return '-';
  const feet = Math.round(altitudeMeters * 3.28084);
  return `${feet.toLocaleString()} ft`;
}

/**
 * Format speed for display
 * @param {number|null} velocityMs - Velocity in m/s
 * @returns {string} Formatted speed
 */
function formatSpeed(velocityMs) {
  if (velocityMs === null) return '-';
  const knots = Math.round(velocityMs * 1.94384);
  return `${knots} kts`;
}

/**
 * Build popup content HTML
 * @param {Array} stateVector - OpenSky state vector
 * @returns {HTMLElement} Popup content element
 */
function buildPopupContent(stateVector) {
  const container = document.createElement('div');
  container.className = 'aircraft-popup';

  // OpenSky state vector indices (same as in aircraftLayer.js)
  const icao24 = stateVector[0];
  const callsign = stateVector[1] || 'N/A';
  const country = stateVector[2] || 'Unknown';
  const altitude = formatAltitude(stateVector[7]);
  const speed = formatSpeed(stateVector[9]);
  const heading = stateVector[10];
  const onGround = stateVector[8];

  container.innerHTML = `
    <div class="aircraft-popup-content">
      <h3>✈️ ${callsign}</h3>
      <table>
        <tr><td>Transponder</td><td><code>${icao24}</code></td></tr>
        <tr><td>Country</td><td>${country}</td></tr>
        <tr><td>Altitude</td><td>${altitude}</td></tr>
        <tr><td>Speed</td><td>${speed}</td></tr>
        <tr><td>Heading</td><td>${heading !== null ? heading + '°' : '-'}</td></tr>
        <tr><td>Status</td><td>${onGround ? '🛬 Grounded' : '✈️ In flight'}</td></tr>
      </table>
    </div>
  `;

  return container;
}

/**
 * Show popup for aircraft
 * @param {Feature} feature - Aircraft feature
 * @param {string} mapKey - 'main', 'left', or 'right'
 * @param {Array} coordinate - Coordinate in EPSG:3857
 * @param {boolean} pinned - Whether popup should be pinned
 */
function showAircraftPopup(feature, mapKey, coordinate, pinned = false) {
  const map = mapKey === 'main' ? state.map : mapKey === 'left' ? state.leftMap : state.rightMap;
  if (!map) return;

  // Remove existing popup for this map
  if (aircraftPopups[mapKey]) {
    map.removeOverlay(aircraftPopups[mapKey]);
  }

  const stateVector = feature.get('openskyState');
  const content = buildPopupContent(stateVector);

  const popup = new Overlay({
    element: content,
    position: coordinate,
    positioning: 'bottom-center',
    stopEvent: false,
    autoPan: {
      margin: 50
    }
  });

  // Store pinned state on the overlay
  popup.set('pinned', pinned);
  popup.set('aircraftFeature', feature);

  map.addOverlay(popup);
  aircraftPopups[mapKey] = popup;

  // Add close button handler
  const closeBtn = content.querySelector('.popup-close-button');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      map.removeOverlay(popup);
      aircraftPopups[mapKey] = null;
    });
  }
}

/**
 * Setup hover and click handlers for aircraft features
 */
export function setupAircraftClickHandlers() {
  ['main', 'left', 'right'].forEach(key => {
    const map = key === 'main' ? state.map : key === 'left' ? state.leftMap : state.rightMap;
    if (!map) return;

    let hoveredFeature = null;

    // Handle pointer move for hover preview
    map.on('pointermove', (evt) => {
      // Check if hovering over an aircraft
      const feature = map.forEachFeatureAtPixel(evt.pixel, (f) => f);

      if (feature && feature.get('isAircraft')) {
        // Only show popup if not already showing this feature or if it's not pinned
        const currentPopup = aircraftPopups[key];
        const shouldShow = !currentPopup ||
                          !currentPopup.get('aircraftFeature') ||
                          currentPopup.get('aircraftFeature') !== feature ||
                          !currentPopup.get('pinned');

        if (shouldShow) {
          showAircraftPopup(feature, key, evt.coordinate, false);
        }
        hoveredFeature = feature;
      } else if (hoveredFeature && (!feature || !feature.get('isAircraft'))) {
        // Left the aircraft feature - close popup if not pinned
        const currentPopup = aircraftPopups[key];
        if (currentPopup && !currentPopup.get('pinned')) {
          map.removeOverlay(currentPopup);
          aircraftPopups[key] = null;
        }
        hoveredFeature = null;
      }
    });

    // Handle pointer leave to close unpinned popups when leaving the map
    map.getViewport().addEventListener('pointerleave', () => {
      const currentPopup = aircraftPopups[key];
      if (currentPopup && !currentPopup.get('pinned')) {
        map.removeOverlay(currentPopup);
        aircraftPopups[key] = null;
      }
      hoveredFeature = null;
    });

    // Handle click to pin popup
    map.on('click', (evt) => {
      const feature = map.forEachFeatureAtPixel(evt.pixel, (f) => f);

      if (feature && feature.get('isAircraft')) {
        // Pin the popup on click
        showAircraftPopup(feature, key, evt.coordinate, true);
        // Stop event from propagating to map click handler
        evt.stopPropagation();
      } else {
        // Clicked outside - close pinned popup
        const currentPopup = aircraftPopups[key];
        if (currentPopup && currentPopup.get('pinned')) {
          map.removeOverlay(currentPopup);
          aircraftPopups[key] = null;
        }
      }
    });
  });

  console.log('[Aircraft] Hover and click handlers installed');
}

/**
 * Clean up aircraft interactions
 */
export function cleanupAircraftInteractions() {
  // Remove all popups
  ['main', 'left', 'right'].forEach(key => {
    const map = key === 'main' ? state.map : key === 'left' ? state.leftMap : state.rightMap;
    if (!map) return;

    if (aircraftPopups[key]) {
      map.removeOverlay(aircraftPopups[key]);
      aircraftPopups[key] = null;
    }
  });
}

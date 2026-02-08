/**
 * UAS Airspace Interactions Module
 * Handles click events and popup display for UAS zones
 */

import Overlay from 'ol/Overlay.js';
import { state } from '../state/store.js';
import { getRestrictionColor } from './uasLayers.js';

let uasPopups = { main: null, left: null, right: null };

/**
 * Build popup content HTML for a UAS zone
 * @param {import('ol/Feature').default} feature - UAS zone feature
 * @returns {HTMLElement} Popup content element
 */
function buildPopupContent(feature) {
  const props = feature.getProperties();
  const container = document.createElement('div');
  container.className = 'uas-popup';

  const restriction = props.restriction || 'NO_RESTRICTION';
  const color = getRestrictionColor(restriction);

  // Build restriction label with emoji
  let restrictionEmoji = '';
  let restrictionLabel = restriction;

  switch (restriction) {
    case 'PROHIBITED':
      restrictionEmoji = '🚫';
      restrictionLabel = 'Prohibited';
      break;
    case 'REQ_AUTHORISATION':
      restrictionEmoji = '⚠️';
      restrictionLabel = 'Authorization Required';
      break;
    case 'NO_RESTRICTION':
      restrictionEmoji = '✅';
      restrictionLabel = 'No Restriction';
      break;
    default:
      restrictionEmoji = 'ℹ️';
      restrictionLabel = restriction.replace(/_/g, ' ');
  }

  // Get zone ID if available
  const zoneId = props.zone_id || props.id || 'N/A';
  const zoneName = props.name || props.zone_name || 'Unnamed Zone';

  // Get altitude limits if available
  const minAltitude = props.min_altitude !== undefined ? props.min_altitude : null;
  const maxAltitude = props.max_altitude !== undefined ? props.max_altitude : null;

  // Format altitude for display
  const formatAltitude = (alt) => {
    if (alt === null || alt === undefined) return null;
    // Assume meters, convert to feet
    const feet = Math.round(alt * 3.28084);
    return `${feet.toLocaleString()} ft`;
  };

  let altitudeInfo = '';
  if (minAltitude !== null || maxAltitude !== null) {
    const min = formatAltitude(minAltitude);
    const max = formatAltitude(maxAltitude);
    if (min && max) {
      altitudeInfo = `${min} - ${max}`;
    } else if (min) {
      altitudeInfo = `${min} and above`;
    } else if (max) {
      altitudeInfo = `${max} and below`;
    }
  }

  // Build HTML
  let html = `
    <div class="uas-popup-content" style="min-width: 250px;">
      <div style="display: flex; align-items: center; margin-bottom: 12px;">
        <div style="width: 12px; height: 12px; background: ${color}; border-radius: 50%; margin-right: 8px;"></div>
        <h3 style="margin: 0; flex: 1;">${restrictionEmoji} ${restrictionLabel}</h3>
      </div>
  `;

  html += `
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 4px 0; color: #666; font-size: 0.9em;">Zone ID</td>
          <td style="padding: 4px 0; text-align: right;"><code>${zoneId}</code></td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #666; font-size: 0.9em;">Name</td>
          <td style="padding: 4px 0; text-align: right;"><strong>${zoneName}</strong></td>
        </tr>
  `;

  if (altitudeInfo) {
    html += `
        <tr>
          <td style="padding: 4px 0; color: #666; font-size: 0.9em;">Altitude</td>
          <td style="padding: 4px 0; text-align: right;">${altitudeInfo}</td>
        </tr>
    `;
  }

  // Add any additional properties
  const excludeProps = ['restriction', 'zone_id', 'id', 'name', 'zone_name', 'min_altitude', 'max_altitude', 'geometry'];
  const extraProps = Object.keys(props).filter(key => !excludeProps.includes(key));

  if (extraProps.length > 0) {
    html += `<tr><td colspan="2" style="padding: 8px 0 4px 0; border-top: 1px solid #eee; font-size: 0.85em; color: #888;">Additional Information</td></tr>`;

    extraProps.forEach(key => {
      const value = props[key];
      if (value !== null && value !== undefined && value !== '') {
        const displayKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        const displayValue = typeof value === 'object' ? JSON.stringify(value) : value;
        html += `
          <tr>
            <td style="padding: 4px 0; color: #666; font-size: 0.9em;">${displayKey}</td>
            <td style="padding: 4px 0; text-align: right; word-break: break-word; max-width: 150px;">${displayValue}</td>
          </tr>
        `;
      }
    });
  }

  html += `
      </table>
    </div>
  `;

  container.innerHTML = html;
  return container;
}

/**
 * Show popup for UAS zone
 * @param {import('ol/Feature').default} feature - UAS zone feature
 * @param {string} mapKey - 'main', 'left', or 'right'
 * @param {Array<number>} coordinate - Coordinate in EPSG:3857
 * @param {boolean} pinned - Whether popup should be pinned
 */
function showUASPopup(feature, mapKey, coordinate, pinned = false) {
  const map = mapKey === 'main' ? state.map : mapKey === 'left' ? state.leftMap : state.rightMap;
  if (!map) return;

  // Remove existing popup for this map
  if (uasPopups[mapKey]) {
    map.removeOverlay(uasPopups[mapKey]);
  }

  const content = buildPopupContent(feature);

  const popup = new Overlay({
    element: content,
    position: coordinate,
    positioning: 'bottom-center',
    stopEvent: true,
    autoPan: {
      margin: 50
    }
  });

  // Store pinned state on the overlay
  popup.set('pinned', pinned);
  popup.set('uasFeature', feature);

  map.addOverlay(popup);
  uasPopups[mapKey] = popup;

  // Add close button handler
  const closeBtn = content.querySelector('.popup-close-button');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      map.removeOverlay(popup);
      uasPopups[mapKey] = null;
    });
  }
}

/**
 * Setup hover and click handlers for UAS zones
 */
export function setupUASClickHandlers() {
  ['main', 'left', 'right'].forEach(key => {
    const map = key === 'main' ? state.map : key === 'left' ? state.leftMap : state.rightMap;
    if (!map) return;

    let hoveredFeature = null;

    // Handle pointer move for hover preview
    map.on('pointermove', (evt) => {
      // Check if hovering over a UAS zone
      const feature = map.forEachFeatureAtPixel(evt.pixel, (f) => f);

      if (feature && feature.get('isUASZone')) {
        // Only show popup if not already showing this feature or if it's not pinned
        const currentPopup = uasPopups[key];
        const shouldShow = !currentPopup ||
                          !currentPopup.get('uasFeature') ||
                          currentPopup.get('uasFeature') !== feature ||
                          !currentPopup.get('pinned');

        if (shouldShow) {
          showUASPopup(feature, key, evt.coordinate, false);
        }
        hoveredFeature = feature;
      } else if (hoveredFeature && (!feature || !feature.get('isUASZone'))) {
        // Left the UAS zone feature - close popup if not pinned
        const currentPopup = uasPopups[key];
        if (currentPopup && !currentPopup.get('pinned')) {
          map.removeOverlay(currentPopup);
          uasPopups[key] = null;
        }
        hoveredFeature = null;
      }
    });

    // Handle pointer leave to close unpinned popups when leaving the map
    map.getViewport().addEventListener('pointerleave', () => {
      const currentPopup = uasPopups[key];
      if (currentPopup && !currentPopup.get('pinned')) {
        map.removeOverlay(currentPopup);
        uasPopups[key] = null;
      }
      hoveredFeature = null;
    });

    // Handle click to pin popup
    map.on('click', (evt) => {
      const feature = map.forEachFeatureAtPixel(evt.pixel, (f) => f);

      if (feature && feature.get('isUASZone')) {
        // Pin the popup on click
        showUASPopup(feature, key, evt.coordinate, true);
        // Stop event from propagating to map click handler
        evt.stopPropagation();
      } else {
        // Clicked outside - close pinned popup
        const currentPopup = uasPopups[key];
        if (currentPopup && currentPopup.get('pinned')) {
          map.removeOverlay(currentPopup);
          uasPopups[key] = null;
        }
      }
    });
  });

  console.log('[UAS] Hover and click handlers installed');
}

/**
 * Clean up UAS interactions
 */
export function cleanupUASInteractions() {
  // Remove all popups
  ['main', 'left', 'right'].forEach(key => {
    const map = key === 'main' ? state.map : key === 'left' ? state.leftMap : state.rightMap;
    if (!map) return;

    if (uasPopups[key]) {
      map.removeOverlay(uasPopups[key]);
      uasPopups[key] = null;
    }
  });

  console.log('[UAS] Interactions cleaned up');
}

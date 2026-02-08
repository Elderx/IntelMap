/**
 * UAS Airspace Interactions Module
 * Handles click events and popup display for UAS zones
 */

import { state } from '../state/store.js';
import { showOverlayInfoPopup } from '../ui/overlayInfo.js';
import { getRestrictionColor } from './uasLayers.js';

const clickHandlers = { main: null, left: null, right: null };

/**
 * Format restriction type for display
 */
function formatRestriction(restriction) {
  const labels = {
    'PROHIBITED': 'Prohibited',
    'REQ_AUTHORISATION': 'Authorization Required',
    'NO_RESTRICTION': 'No Restriction'
  };
  return labels[restriction] || restriction;
}

/**
 * Build simplified hover popup content (name, altitude, dates only)
 */
function buildHoverPopupContent(feature) {
  const props = feature.getProperties();

  const name = props.name || 'Unnamed Zone';
  const lowerAlt = props.lowerMeters ?? 0;
  const upperAlt = props.upperMeters ?? '—';

  let html = `<div style="font-weight:bold; margin-bottom:4px;">${name}</div>`;
  html += `<div style="font-size:0.9em; color:#555;">Altitude: ${lowerAlt}m - ${upperAlt}m</div>`;

  // Add date range if available
  const applicability = props.applicability?.[0];
  if (applicability) {
    const start = new Date(applicability.startDateTime).toLocaleDateString();
    const end = new Date(applicability.endDateTime).toLocaleDateString();
    html += `<div style="font-size:0.9em; color:#555;">Valid: ${start} - ${end}</div>`;
  }

  return html;
}

/**
 * Build full click popup content
 */
function buildFullPopupContent(feature) {
  const props = feature.getProperties();

  if (!props.identifier) return null;

  const restriction = props.restriction || 'NO_RESTRICTION';
  const color = getRestrictionColor(restriction);

  let html = `<div style="font-weight:bold; margin-bottom:8px; font-size:1.1em; color:${color};">`;
  html += `${formatRestriction(restriction)}</div>`;
  html += `<div style="margin-bottom:4px;"><strong>Name:</strong> ${props.name || 'Unknown'}</div>`;
  html += `<div style="margin-bottom:4px;"><strong>Identifier:</strong> ${props.identifier}</div>`;
  html += `<div style="margin-bottom:4px;"><strong>Altitude:</strong> ${props.lowerMeters ?? 0}m - ${props.upperMeters ?? '—'}m</div>`;
  html += `<div style="margin-bottom:4px;"><strong>Reason:</strong> ${props.reason?.join(', ') || '—'}</div>`;

  const authority = props.zoneAuthority?.[0];
  if (authority) {
    html += `<div style="margin-bottom:4px;"><strong>Authority:</strong> <a href="${authority.siteUrl}" target="_blank" rel="noopener">${authority.name}</a></div>`;
  }

  html += `<div style="margin-bottom:4px;"><strong>Status:</strong> ${props.active ? 'Active' : 'Inactive'}</div>`;

  // Add schedule if available
  const applicability = props.applicability?.[0];
  if (applicability) {
    const start = new Date(applicability.startDateTime).toLocaleDateString();
    const end = new Date(applicability.endDateTime).toLocaleDateString();
    html += `<div style="margin-bottom:4px;"><strong>Valid:</strong> ${start} - ${end}</div>`;
    if (applicability.permanent === 'YES') {
      html += `<div style="font-size:0.9em; color:#777;">Permanent: Yes</div>`;
    }
  }

  return html;
}

/**
 * Handle map click for UAS zones
 */
function handleMapClick(mapKey, event) {
  const mapObj = mapKey === 'main' ? state.map : mapKey === 'left' ? state.leftMap : state.rightMap;
  if (!mapObj) return;

  let foundFeature = null;

  mapObj.forEachFeatureAtPixel(event.pixel, (feature) => {
    if (feature.get('isUASZone')) {
      foundFeature = feature;
      return true;
    }
  });

  if (foundFeature) {
    const html = buildFullPopupContent(foundFeature);
    if (html) {
      showOverlayInfoPopup(html, event.pixel);
    }
  }
}

/**
 * Setup click handlers for UAS zones (click only, no hover)
 * Hover is disabled to avoid popup spam on mouse movement
 */
export function setupUASClickHandlers() {
  ['main', 'left', 'right'].forEach(key => {
    const mapObj = key === 'main' ? state.map : key === 'left' ? state.leftMap : state.rightMap;
    if (!mapObj) return;

    // Remove existing handler if present
    if (clickHandlers[key]) {
      mapObj.un('singleclick', clickHandlers[key]);
    }

    // Create click handler
    clickHandlers[key] = (event) => {
      handleMapClick(key, event);
    };

    mapObj.on('singleclick', clickHandlers[key]);
  });
}

/**
 * Cleanup UAS interactions
 */
export function cleanupUASInteractions() {
  ['main', 'left', 'right'].forEach(key => {
    const mapObj = key === 'main' ? state.map : key === 'left' ? state.leftMap : state.rightMap;
    if (!mapObj) return;

    if (clickHandlers[key]) {
      mapObj.un('singleclick', clickHandlers[key]);
      clickHandlers[key] = null;
    }
  });
}

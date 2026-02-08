/**
 * UAS Airspace Interactions Module
 * Handles click events and popup display for UAS zones
 */

import { state } from '../state/store.js';
import { showOverlayInfoPopup } from '../ui/overlayInfo.js';
import { getRestrictionColor } from './uasLayers.js';

const clickHandlers = { main: null, left: null, right: null };
const currentPopupFeatures = { main: null, left: null, right: null };

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
 * Build list view when multiple UAS zones overlap
 */
function buildZoneList(features) {
  let html = `<div id="uas-zone-list">`;
  html += `<div style="font-weight:bold; margin-bottom:8px;">${features.length} Zones Found</div>`;
  html += `<div style="border-bottom:1px solid #ddd; padding-bottom:4px; margin-bottom:8px;"></div>`;

  features.forEach((feature, index) => {
    const props = feature.getProperties();
    const name = props.name || 'Unnamed Zone';
    const color = getRestrictionColor(props.restriction || 'NO_RESTRICTION');

    html += `<div class="uas-zone-item" data-index="${index}" style="
      display:flex;
      align-items:center;
      padding:6px;
      cursor:pointer;
      border-radius:4px;
      margin-bottom:2px;
    ">`;
    html += `<div style="width:10px;height:10px;border-radius:50%;background:${color};margin-right:8px;flex-shrink:0;"></div>`;
    html += `<div style="flex-grow:1;"><div style="font-weight:500;">${name}</div><div style="font-size:0.8em;color:#666;">${formatRestriction(props.restriction || 'NO_RESTRICTION')}</div></div>`;
    html += `</div>`;
  });

  html += `</div>`;
  return html;
}

/**
 * Build full detail view for a single UAS zone
 */
function buildZoneDetail(feature) {
  const props = feature.getProperties();

  if (!props.identifier) return null;

  const restriction = props.restriction || 'NO_RESTRICTION';
  const color = getRestrictionColor(restriction);

  let html = `<div id="uas-zone-detail">`;

  // Back button
  html += `<div id="uas-popup-back" style="cursor:pointer;color:#0077cc;font-size:0.9em;margin-bottom:8px;display:flex;align-items:center;">
    <span style="font-size:1.2em;margin-right:4px;">‹</span> Back to list
  </div>`;

  // Restriction header
  html += `<div style="font-weight:bold; font-size:1.1em; margin-bottom:8px; color:${color}; display:flex; align-items:center;">
    <div style="width:12px;height:12px;background:${color};border-radius:50%;margin-right:8px;"></div>
    ${formatRestriction(restriction)}
  </div>`;

  html += `<div style="font-size:0.85em;color:#666;margin-bottom:8px;">${restriction}</div>`;

  // Details
  html += `<div style="margin-bottom:4px;"><strong>Name:</strong> ${props.name || 'Unknown'}</div>`;
  html += `<div style="margin-bottom:4px;"><strong>Identifier:</strong> ${props.identifier}</div>`;
  html += `<div style="margin-bottom:4px;"><strong>Altitude:</strong> ${props.lowerMeters ?? 0}m - ${props.upperMeters ?? '—'}m</div>`;
  html += `<div style="margin-bottom:4px;"><strong>Reason:</strong> ${props.reason?.join(', ') || '—'}</div>`;

  const authority = props.zoneAuthority?.[0];
  if (authority) {
    html += `<div style="margin-bottom:4px;"><strong>Authority:</strong> <a href="${authority.siteUrl}" target="_blank" rel="noopener">${authority.name}</a></div>`;
  }

  html += `<div style="margin-bottom:4px;"><strong>Status:</strong> ${props.active ? 'Active' : 'Inactive'}</div>`;

  const applicability = props.applicability?.[0];
  if (applicability) {
    const start = new Date(applicability.startDateTime).toLocaleDateString();
    const end = new Date(applicability.endDateTime).toLocaleDateString();
    html += `<div style="margin-bottom:4px;"><strong>Valid:</strong> ${start} - ${end}</div>`;
    if (applicability.permanent === 'YES') {
      html += `<div style="font-size:0.9em;color:#777;">Permanent: Yes</div>`;
    }
  }

  html += `</div>`;
  return html;
}

/**
 * Setup list item click handlers
 */
function attachListHandlers(features) {
  const listEl = document.getElementById('uas-zone-list');
  if (!listEl) return;

  const items = listEl.querySelectorAll('.uas-zone-item');
  items.forEach(item => {
    item.addEventListener('click', () => {
      const index = parseInt(item.dataset.index);
      const feature = features[index];
      const detailHtml = buildZoneDetail(feature);
      if (detailHtml) {
        const popup = document.querySelector('.overlay-info-popup');
        if (popup) {
          const container = popup.querySelector('div:not(.overlay-info-popup-closer)') || popup;
          container.innerHTML = detailHtml;
          attachBackHandler(features);
        }
      }
    });
  });
}

/**
 * Setup back button handler
 */
function attachBackHandler(features) {
  const backBtn = document.getElementById('uas-popup-back');
  if (!backBtn) return;

  backBtn.addEventListener('click', () => {
    if (features.length > 1) {
      const listHtml = buildZoneList(features);
      const popup = document.querySelector('.overlay-info-popup');
      if (popup) {
        const container = popup.querySelector('div:not(.overlay-info-popup-closer)') || popup;
        container.innerHTML = listHtml;
        attachListHandlers(features);
      }
    } else {
      // Close popup if only one feature
      const popup = document.querySelector('.overlay-info-popup');
      if (popup) popup.style.display = 'none';
    }
  });
}

/**
 * Handle map click for UAS zones
 */
function handleMapClick(mapKey, event) {
  const mapObj = mapKey === 'main' ? state.map : mapKey === 'left' ? state.leftMap : state.rightMap;
  if (!mapObj) return;

  const features = [];
  mapObj.forEachFeatureAtPixel(event.pixel, (feature) => {
    if (feature.get('isUASZone')) {
      features.push(feature);
      return true; // Collect all, not just first
    }
  });

  if (features.length === 0) return;

  currentPopupFeatures[mapKey] = features;

  if (features.length === 1) {
    // Single feature - show details directly
    const html = buildZoneDetail(features[0]);
    if (html) {
      showOverlayInfoPopup(html, event.pixel);
    }
  } else {
    // Multiple features - show list
    const html = buildZoneList(features);
    if (html) {
      showOverlayInfoPopup(html, event.pixel);
      // Attach handlers after popup is shown
      setTimeout(() => attachListHandlers(features), 100);
    }
  }
}

/**
 * Setup click handlers for UAS zones
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

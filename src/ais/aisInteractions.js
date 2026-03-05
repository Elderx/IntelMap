import Overlay from 'ol/Overlay.js';
import { unByKey } from 'ol/Observable.js';
import { state } from '../state/store.js';
import { isAisVesselSelected, toggleAisVesselSelection } from './aisSelection.js';

const popupOverlays = { main: null, left: null, right: null };
const clickKeys = { main: null, left: null, right: null };
const hoverOverlays = { main: null, left: null, right: null };
const hoverKeys = { main: null, left: null, right: null };

function getMap(mapKey) {
  return mapKey === 'main' ? state.map : mapKey === 'left' ? state.leftMap : state.rightMap;
}

function findAisFeatureNearPixel(map, pixel, maxDistance = 18) {
  let closestFeature = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  state.aisFeatures.forEach((feature) => {
    const geometry = feature.getGeometry();
    if (!geometry) {
      return;
    }

    const candidatePixel = map.getPixelFromCoordinate(geometry.getCoordinates());
    const deltaX = candidatePixel[0] - pixel[0];
    const deltaY = candidatePixel[1] - pixel[1];
    const distance = Math.sqrt((deltaX * deltaX) + (deltaY * deltaY));

    if (distance <= maxDistance && distance < closestDistance) {
      closestDistance = distance;
      closestFeature = feature;
    }
  });

  return closestFeature;
}

function findAisFeatureAtPixel(map, pixel) {
  let feature = map.forEachFeatureAtPixel(pixel, (candidate) => {
    return candidate.get('isAisVessel') ? candidate : null;
  });

  if (!feature) {
    feature = findAisFeatureNearPixel(map, pixel);
  }

  return feature;
}

function formatTimestamp(value) {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString();
}

function populateAisSearchField(mmsi) {
  const inputs = Array.from(document.querySelectorAll('#ais-mmsi-search-input'));
  if (!inputs.length) {
    return;
  }

  const value = String(mmsi || '');
  state.aisMmsiSearchQuery = value;
  inputs.forEach((input) => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function buildPopupContent(feature, mode = 'click') {
  const selected = isAisVesselSelected(feature.get('mmsi'));
  const mmsi = String(feature.get('mmsi') || '');
  const vesselFinderUrl = `https://www.vesselfinder.com/?mmsi=${encodeURIComponent(mmsi)}`;
  const container = document.createElement('div');
  container.className = `ais-popup ais-popup-${mode}`;
  container.innerHTML = `
    <h3>${feature.get('name')}</h3>
    <table class="ais-popup-table">
      <tr>
        <td>MMSI</td>
        <td>
          <a class="ais-popup-link" href="${vesselFinderUrl}" target="_blank" rel="noopener noreferrer">${mmsi}</a>
          <button type="button" class="ais-popup-search-btn" data-mmsi="${mmsi}">Search</button>
        </td>
      </tr>
      ${feature.get('imo') ? `<tr><td>IMO</td><td>${feature.get('imo')}</td></tr>` : ''}
      ${feature.get('callSign') ? `<tr><td>Call sign</td><td>${feature.get('callSign')}</td></tr>` : ''}
      <tr><td>Type</td><td>${feature.get('vesselType')}</td></tr>
      ${feature.get('destination') ? `<tr><td>Destination</td><td>${feature.get('destination')}</td></tr>` : ''}
      <tr><td>Speed</td><td>${(feature.get('speed') || 0).toFixed(1)} kn</td></tr>
      <tr><td>Course</td><td>${feature.get('course') ?? '-'}</td></tr>
      <tr><td>Status</td><td>${feature.get('navStatus')}</td></tr>
      ${feature.get('draught') ? `<tr><td>Draught</td><td>${feature.get('draught')}</td></tr>` : ''}
      ${feature.get('length') ? `<tr><td>Length</td><td>${feature.get('length')} m</td></tr>` : ''}
      ${feature.get('width') ? `<tr><td>Width</td><td>${feature.get('width')} m</td></tr>` : ''}
      <tr><td>Selected</td><td>${selected ? 'Yes' : 'No'}</td></tr>
      <tr><td>Updated</td><td>${formatTimestamp(feature.get('lastUpdate'))}</td></tr>
    </table>
  `;

  const searchBtn = container.querySelector('.ais-popup-search-btn');
  if (searchBtn) {
    searchBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const targetMmsi = searchBtn.getAttribute('data-mmsi') || mmsi;
      populateAisSearchField(targetMmsi);
    });
  }

  return container;
}

function showPopup(feature, mapKey, coordinate) {
  const map = getMap(mapKey);
  if (!map) {
    return;
  }

  if (popupOverlays[mapKey]) {
    map.removeOverlay(popupOverlays[mapKey]);
  }

  const overlay = new Overlay({
    element: buildPopupContent(feature, 'click'),
    position: coordinate,
    positioning: 'bottom-center',
    stopEvent: true,
    autoPan: { margin: 40 }
  });

  map.addOverlay(overlay);
  popupOverlays[mapKey] = overlay;
}

function showHoverPopup(feature, mapKey, coordinate) {
  const map = getMap(mapKey);
  if (!map) {
    return;
  }

  if (!hoverOverlays[mapKey]) {
    hoverOverlays[mapKey] = new Overlay({
      element: document.createElement('div'),
      positioning: 'bottom-center',
      stopEvent: false
    });
    map.addOverlay(hoverOverlays[mapKey]);
  }

  const hoverOverlay = hoverOverlays[mapKey];
  const content = buildPopupContent(feature, 'hover');
  hoverOverlay.getElement().replaceChildren(content);
  hoverOverlay.setPosition(coordinate);
}

function hideHoverPopup(mapKey) {
  const hoverOverlay = hoverOverlays[mapKey];
  if (hoverOverlay) {
    hoverOverlay.setPosition(undefined);
  }
}

export function setupAisClickHandlers() {
  cleanupAisInteractions();

  ['main', 'left', 'right'].forEach((mapKey) => {
    const map = getMap(mapKey);
    if (!map) {
      return;
    }

    clickKeys[mapKey] = map.on('click', (evt) => {
      const feature = findAisFeatureAtPixel(map, evt.pixel);

      if (!feature) {
        if (popupOverlays[mapKey]) {
          map.removeOverlay(popupOverlays[mapKey]);
          popupOverlays[mapKey] = null;
        }
        return;
      }

      toggleAisVesselSelection(feature.get('mmsi'));
      showPopup(feature, mapKey, feature.getGeometry().getCoordinates());
    });

    hoverKeys[mapKey] = map.on('pointermove', (evt) => {
      if (evt.dragging) {
        hideHoverPopup(mapKey);
        return;
      }

      const feature = findAisFeatureAtPixel(map, evt.pixel);
      if (!feature) {
        map.getTargetElement().style.cursor = '';
        hideHoverPopup(mapKey);
        return;
      }

      map.getTargetElement().style.cursor = 'pointer';
      showHoverPopup(feature, mapKey, feature.getGeometry().getCoordinates());
    });
  });
}

export function cleanupAisInteractions() {
  ['main', 'left', 'right'].forEach((mapKey) => {
    const map = getMap(mapKey);

    if (clickKeys[mapKey]) {
      unByKey(clickKeys[mapKey]);
      clickKeys[mapKey] = null;
    }
    if (hoverKeys[mapKey]) {
      unByKey(hoverKeys[mapKey]);
      hoverKeys[mapKey] = null;
    }

    if (map && popupOverlays[mapKey]) {
      map.removeOverlay(popupOverlays[mapKey]);
      popupOverlays[mapKey] = null;
    }
    if (map) {
      map.getTargetElement().style.cursor = '';
    }
    if (map && hoverOverlays[mapKey]) {
      map.removeOverlay(hoverOverlays[mapKey]);
      hoverOverlays[mapKey] = null;
    }
  });
}

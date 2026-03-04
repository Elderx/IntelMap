import Overlay from 'ol/Overlay.js';
import { state } from '../state/store.js';
import { fetchTrainDetails } from '../api/trains.js';

let popupOverlays = { main: null, left: null, right: null };
let mapClickHandlers = [];

function formatTrainTime(row) {
  const value = row.actualTime || row.liveEstimateTime || row.scheduledTime;
  if (!value) {
    return '-';
  }
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatTimestamp(value) {
  if (!value) {
    return '-';
  }
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function buildTimetableRows(detail) {
  const rows = (detail?.timeTableRows || [])
    .filter(row => row.commercialStop !== false)
    .slice(0, 6);

  return rows.map(row => {
    const track = row.commercialTrack ? `Track ${row.commercialTrack}` : '-';
    return `<tr><td>${row.stationShortCode}</td><td>${row.type}</td><td>${formatTrainTime(row)}</td><td>${track}</td></tr>`;
  }).join('');
}

function buildPopupMarkup(feature, detail = null, message = 'Loading details...') {
  const trainNumber = feature.get('trainNumber');
  const departureDate = feature.get('departureDate');
  const timestamp = formatTimestamp(feature.get('timestamp'));
  const speed = feature.get('speed');
  const accuracy = feature.get('accuracy');
  const timetable = detail
    ? `<table class="train-popup-table timetable-table">${buildTimetableRows(detail)}</table>`
    : `<p class="train-popup-message">${message}</p>`;

  return `
    <h3>Train ${trainNumber}</h3>
    <table class="train-popup-table">
      <tr><td>Departure date</td><td>${departureDate}</td></tr>
      <tr><td>Last update</td><td>${timestamp}</td></tr>
      <tr><td>Speed</td><td>${speed ?? '-'}</td></tr>
      <tr><td>Accuracy</td><td>${accuracy ?? '-'}</td></tr>
      ${detail ? `<tr><td>Type</td><td>${detail.trainType}</td></tr>` : ''}
      ${detail ? `<tr><td>Category</td><td>${detail.trainCategory}</td></tr>` : ''}
      ${detail ? `<tr><td>Operator</td><td>${detail.operatorShortCode}</td></tr>` : ''}
      ${detail ? `<tr><td>Status</td><td>${detail.runningCurrently ? 'Running' : 'Not running'}</td></tr>` : ''}
    </table>
    ${timetable}
  `;
}

function getMap(mapKey) {
  return mapKey === 'main' ? state.map : mapKey === 'left' ? state.leftMap : state.rightMap;
}

function createPopupElement(feature) {
  const container = document.createElement('div');
  container.className = 'train-location-popup';
  container.innerHTML = buildPopupMarkup(feature);
  return container;
}

function showTrainLocationPopup(mapKey, feature, coordinate) {
  const map = getMap(mapKey);
  if (!map) {
    return null;
  }

  if (popupOverlays[mapKey]) {
    map.removeOverlay(popupOverlays[mapKey]);
  }

  const element = createPopupElement(feature);
  const overlay = new Overlay({
    element,
    position: coordinate,
    positioning: 'bottom-center',
    stopEvent: false,
    autoPan: { margin: 50 }
  });

  map.addOverlay(overlay);
  popupOverlays[mapKey] = overlay;
  return overlay;
}

export function setupTrainLocationClickHandlers() {
  cleanupTrainLocationInteractions();

  ['main', 'left', 'right'].forEach(mapKey => {
    const map = getMap(mapKey);
    if (!map) {
      return;
    }

    const handler = async (evt) => {
      const feature = map.forEachFeatureAtPixel(evt.pixel, candidate => {
        if (candidate.get('isTrainLocation')) {
          return candidate;
        }
        return null;
      });

      if (!feature) {
        if (popupOverlays[mapKey]) {
          map.removeOverlay(popupOverlays[mapKey]);
          popupOverlays[mapKey] = null;
        }
        return;
      }

      const coordinate = feature.getGeometry().getCoordinates();
      const overlay = showTrainLocationPopup(mapKey, feature, coordinate);
      if (!overlay) {
        return;
      }

      try {
        const detail = await fetchTrainDetails(feature.get('trainNumber'), feature.get('departureDate'));
        if (popupOverlays[mapKey] !== overlay) {
          return;
        }
        overlay.getElement().innerHTML = buildPopupMarkup(feature, detail, '');
      } catch (error) {
        if (popupOverlays[mapKey] !== overlay) {
          return;
        }
        overlay.getElement().innerHTML = buildPopupMarkup(feature, null, 'Details unavailable');
      }

      if (typeof evt.stopPropagation === 'function') {
        evt.stopPropagation();
      }
    };

    map.on('click', handler);
    mapClickHandlers.push({ map, handler });
  });
}

export function cleanupTrainLocationInteractions() {
  mapClickHandlers.forEach(({ map, handler }) => {
    map.un('click', handler);
  });
  mapClickHandlers = [];

  ['main', 'left', 'right'].forEach(mapKey => {
    const map = getMap(mapKey);
    if (!map || !popupOverlays[mapKey]) {
      return;
    }

    map.removeOverlay(popupOverlays[mapKey]);
    popupOverlays[mapKey] = null;
  });
}

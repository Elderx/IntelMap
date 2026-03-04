import Overlay from 'ol/Overlay.js';
import { state } from '../state/store.js';

let popupOverlays = { main: null, left: null, right: null };
let mapClickHandlers = [];

function getMap(mapKey) {
  return mapKey === 'main' ? state.map : mapKey === 'left' ? state.leftMap : state.rightMap;
}

function buildStationPopupContent(feature) {
  const container = document.createElement('div');
  container.className = 'train-station-popup';
  container.innerHTML = `
    <h3>${feature.get('stationName')}</h3>
    <table class="train-popup-table">
      <tr><td>Short code</td><td>${feature.get('stationShortCode')}</td></tr>
      <tr><td>UIC code</td><td>${feature.get('stationUICCode')}</td></tr>
      <tr><td>Type</td><td>${feature.get('type')}</td></tr>
      <tr><td>Country</td><td>${feature.get('countryCode')}</td></tr>
      <tr><td>Passenger traffic</td><td>${feature.get('passengerTraffic') ? 'Yes' : 'No'}</td></tr>
    </table>
  `;
  return container;
}

export function setupTrainStationClickHandlers() {
  cleanupTrainStationInteractions();

  ['main', 'left', 'right'].forEach(mapKey => {
    const map = getMap(mapKey);
    if (!map) {
      return;
    }

    const handler = (evt) => {
      const trainFeature = map.forEachFeatureAtPixel(evt.pixel, candidate => {
        if (candidate.get('isTrainLocation')) {
          return candidate;
        }
        return null;
      });
      if (trainFeature) {
        return;
      }

      const feature = map.forEachFeatureAtPixel(evt.pixel, candidate => {
        if (candidate.get('isTrainStation')) {
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

      if (popupOverlays[mapKey]) {
        map.removeOverlay(popupOverlays[mapKey]);
      }

      const overlay = new Overlay({
        element: buildStationPopupContent(feature),
        position: feature.getGeometry().getCoordinates(),
        positioning: 'bottom-center',
        stopEvent: false,
        autoPan: { margin: 50 }
      });

      map.addOverlay(overlay);
      popupOverlays[mapKey] = overlay;
    };

    map.on('click', handler);
    mapClickHandlers.push({ map, handler });
  });
}

export function cleanupTrainStationInteractions() {
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

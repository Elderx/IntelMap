import Overlay from 'ol/Overlay.js';
import { unByKey } from 'ol/Observable.js';
import { state } from '../state/store.js';

const popupOverlays = { main: null, left: null, right: null };
const clickKeys = { main: null, left: null, right: null };

function formatTimestamp(value) {
  if (!value) return 'Unknown';
  return new Date(value).toLocaleString();
}

function buildPopupContent(feature) {
  const container = document.createElement('div');
  container.className = 'traffic-camera-popup';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'popup-close';
  closeBtn.type = 'button';
  closeBtn.textContent = '×';

  const title = document.createElement('h3');
  title.textContent = feature.get('name');

  const meta = document.createElement('div');
  meta.className = 'traffic-camera-meta';
  meta.innerHTML = `
    <div><strong>Camera ID:</strong> ${feature.get('cameraId')}</div>
    <div><strong>Direction:</strong> ${feature.get('directionName') || 'N/A'}</div>
    <div><strong>Updated:</strong> ${formatTimestamp(feature.get('picLastModified'))}</div>
  `;

  const imageRegion = document.createElement('div');
  imageRegion.className = 'traffic-camera-image-region';

  const img = document.createElement('img');
  img.src = feature.get('imageUrl');
  img.alt = `${feature.get('name')} latest image`;
  img.className = 'traffic-camera-image';
  imageRegion.appendChild(img);

  const link = document.createElement('a');
  link.href = feature.get('cameraPageUrl');
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Open camera page';
  link.className = 'traffic-camera-link';

  container.append(closeBtn, title, meta, imageRegion, link);
  return { container, closeBtn };
}

function getMapForKey(mapKey) {
  return mapKey === 'main' ? state.map : mapKey === 'left' ? state.leftMap : state.rightMap;
}

function showPopup(feature, mapKey, coordinate) {
  const map = getMapForKey(mapKey);
  if (!map) return;

  if (popupOverlays[mapKey]) {
    map.removeOverlay(popupOverlays[mapKey]);
  }

  const { container, closeBtn } = buildPopupContent(feature);
  const overlay = new Overlay({
    element: container,
    position: coordinate,
    positioning: 'bottom-center',
    stopEvent: true,
    autoPan: { margin: 24 }
  });

  map.addOverlay(overlay);
  popupOverlays[mapKey] = overlay;

  closeBtn.addEventListener('click', () => {
    map.removeOverlay(overlay);
    popupOverlays[mapKey] = null;
  });
}

export function setupTrafficCameraClickHandlers() {
  ['main', 'left', 'right'].forEach((mapKey) => {
    const map = getMapForKey(mapKey);
    if (!map) return;

    if (clickKeys[mapKey]) {
      unByKey(clickKeys[mapKey]);
    }

    clickKeys[mapKey] = map.on('click', (evt) => {
      const feature = map.forEachFeatureAtPixel(evt.pixel, (candidate) => {
        return candidate.get('isTrafficCamera') ? candidate : null;
      });

      if (feature) {
        showPopup(feature, mapKey, feature.getGeometry().getCoordinates());
      } else if (popupOverlays[mapKey]) {
        map.removeOverlay(popupOverlays[mapKey]);
        popupOverlays[mapKey] = null;
      }
    });
  });
}

export function cleanupTrafficCameraInteractions() {
  ['main', 'left', 'right'].forEach((mapKey) => {
    const map = getMapForKey(mapKey);

    if (clickKeys[mapKey]) {
      unByKey(clickKeys[mapKey]);
      clickKeys[mapKey] = null;
    }

    if (map && popupOverlays[mapKey]) {
      map.removeOverlay(popupOverlays[mapKey]);
      popupOverlays[mapKey] = null;
    }
  });
}

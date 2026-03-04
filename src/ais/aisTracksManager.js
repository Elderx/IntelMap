import Feature from 'ol/Feature.js';
import LineString from 'ol/geom/LineString.js';
import Point from 'ol/geom/Point.js';
import { fromLonLat } from 'ol/proj.js';
import { Fill, Stroke, Style, Circle, Text } from 'ol/style.js';
import { Vector as VectorSource } from 'ol/source.js';
import { Vector as VectorLayer } from 'ol/layer.js';
import { state } from '../state/store.js';
import { fetchAisTracks } from '../api/client.js';

function refreshActiveLayersPanel() {
  import('../ui/activeLayers.js').then(({ updateActiveLayersPanel }) => {
    updateActiveLayersPanel();
  });
}

function getMap(mapKey) {
  return mapKey === 'main' ? state.map : mapKey === 'left' ? state.leftMap : state.rightMap;
}

function getColorForMmsi(mmsi) {
  let hash = 0;
  const value = String(mmsi);
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 78%, 42%)`;
}

function createTrackLayer() {
  return new VectorLayer({
    source: new VectorSource(),
    zIndex: 106,
    className: 'ais-track-layer',
    style: (feature) => {
      const color = feature.get('trackColor') || '#1976d2';
      return new Style({
        stroke: new Stroke({
          color,
          width: 3
        })
      });
    }
  });
}

function createTrackHeadLayer() {
  return new VectorLayer({
    source: new VectorSource(),
    zIndex: 107,
    className: 'ais-track-head-layer',
    style: (feature) => {
      const color = feature.get('trackColor') || '#1976d2';
      return new Style({
        image: new Circle({
          radius: 6,
          fill: new Fill({ color }),
          stroke: new Stroke({ color: '#102027', width: 1.5 })
        }),
        text: new Text({
          text: feature.get('mmsi') || '',
          font: '600 11px sans-serif',
          offsetY: -15,
          fill: new Fill({ color: '#102027' }),
          stroke: new Stroke({ color: '#fff', width: 2 })
        })
      });
    }
  });
}

function attachLayers() {
  if (state.isSplit) {
    if (state.leftMap && !state.aisTrackLayer.left) {
      state.aisTrackLayer.left = createTrackLayer();
      state.leftMap.addLayer(state.aisTrackLayer.left);
    }
    if (state.rightMap && !state.aisTrackLayer.right) {
      state.aisTrackLayer.right = createTrackLayer();
      state.rightMap.addLayer(state.aisTrackLayer.right);
    }
    if (state.leftMap && !state.aisTrackHeadLayer.left) {
      state.aisTrackHeadLayer.left = createTrackHeadLayer();
      state.leftMap.addLayer(state.aisTrackHeadLayer.left);
    }
    if (state.rightMap && !state.aisTrackHeadLayer.right) {
      state.aisTrackHeadLayer.right = createTrackHeadLayer();
      state.rightMap.addLayer(state.aisTrackHeadLayer.right);
    }
    return;
  }

  if (state.map && !state.aisTrackLayer.main) {
    state.aisTrackLayer.main = createTrackLayer();
    state.map.addLayer(state.aisTrackLayer.main);
  }
  if (state.map && !state.aisTrackHeadLayer.main) {
    state.aisTrackHeadLayer.main = createTrackHeadLayer();
    state.map.addLayer(state.aisTrackHeadLayer.main);
  }
}

function removeLayers() {
  ['main', 'left', 'right'].forEach((mapKey) => {
    const trackLayer = state.aisTrackLayer[mapKey];
    const headLayer = state.aisTrackHeadLayer[mapKey];
    const map = getMap(mapKey);

    if (map && trackLayer) {
      map.removeLayer(trackLayer);
    }
    if (map && headLayer) {
      map.removeLayer(headLayer);
    }
    state.aisTrackLayer[mapKey] = null;
    state.aisTrackHeadLayer[mapKey] = null;
  });
}

function updateLayerFeatures(mapKey, features, headFeatures) {
  const trackLayer = state.aisTrackLayer[mapKey];
  const headLayer = state.aisTrackHeadLayer[mapKey];
  if (trackLayer) {
    const source = trackLayer.getSource();
    source.clear();
    source.addFeatures(features);
  }
  if (headLayer) {
    const source = headLayer.getSource();
    source.clear();
    source.addFeatures(headFeatures);
  }
}

function renderLayers() {
  if (state.isSplit) {
    updateLayerFeatures('left', state.aisTrackFeatures, state.aisTrackHeadFeatures);
    updateLayerFeatures('right', state.aisTrackFeatures, state.aisTrackHeadFeatures);
  } else {
    updateLayerFeatures('main', state.aisTrackFeatures, state.aisTrackHeadFeatures);
  }
}

function getSelectedPointForTime(points, timestampMs) {
  if (!points?.length) return null;
  let candidate = points[0];
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    if (point.timestampMs <= timestampMs) {
      candidate = point;
    } else {
      break;
    }
  }
  return candidate;
}

function updatePlaybackTimeLabel() {
  const display = document.getElementById('ais-playback-time');
  if (!display) return;
  const timestamps = state.aisTrackPlaybackTimestamps;
  if (!timestamps.length) {
    display.textContent = '-';
    return;
  }
  const current = timestamps[state.aisTrackPlaybackIndex] || timestamps[0];
  const dt = new Date(current);
  dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
  display.textContent = dt.toISOString().slice(0, 16).replace('T', ' ');
}

function updatePlaybackHeadFeatures() {
  const timestamps = state.aisTrackPlaybackTimestamps;
  if (!timestamps.length) {
    state.aisTrackHeadFeatures = [];
    renderLayers();
    updatePlaybackTimeLabel();
    return;
  }

  const activeTimestamp = timestamps[state.aisTrackPlaybackIndex] || timestamps[0];
  const features = [];
  state.aisTrackDataByMmsi.forEach((points, mmsi) => {
    const selectedPoint = getSelectedPointForTime(points, activeTimestamp);
    if (!selectedPoint) return;
    const feature = new Feature({
      geometry: new Point(fromLonLat([selectedPoint.lon, selectedPoint.lat], 'EPSG:3857')),
      mmsi: String(mmsi),
      trackColor: getColorForMmsi(mmsi)
    });
    features.push(feature);
  });

  state.aisTrackHeadFeatures = features;
  renderLayers();
  updatePlaybackTimeLabel();
}

export function setAisPlaybackIndex(index) {
  const timestamps = state.aisTrackPlaybackTimestamps;
  if (!timestamps.length) return;
  const maxIndex = timestamps.length - 1;
  const nextIndex = Math.min(Math.max(0, index), maxIndex);
  state.aisTrackPlaybackIndex = nextIndex;

  const slider = document.getElementById('ais-playback-slider');
  if (slider) {
    slider.value = String(nextIndex);
  }

  updatePlaybackHeadFeatures();
}

function updatePlaybackButtons() {
  const playBtn = document.getElementById('ais-playback-play');
  const pauseBtn = document.getElementById('ais-playback-pause');
  if (playBtn) playBtn.style.display = state.aisTrackPlaybackTimer ? 'none' : 'inline-block';
  if (pauseBtn) pauseBtn.style.display = state.aisTrackPlaybackTimer ? 'inline-block' : 'none';
}

export function stopAisPlayback() {
  if (state.aisTrackPlaybackTimer) {
    clearInterval(state.aisTrackPlaybackTimer);
    state.aisTrackPlaybackTimer = null;
  }
  updatePlaybackButtons();
}

export function startAisPlayback() {
  stopAisPlayback();
  const timestamps = state.aisTrackPlaybackTimestamps;
  if (!timestamps.length) return;

  const fps = Math.max(0.25, Number(state.aisTrackPlaybackSpeed) || 2);
  state.aisTrackPlaybackTimer = setInterval(() => {
    const next = (state.aisTrackPlaybackIndex + 1) % timestamps.length;
    setAisPlaybackIndex(next);
  }, 1000 / fps);
  updatePlaybackButtons();
}

export function setAisPlaybackSpeed(speed) {
  state.aisTrackPlaybackSpeed = Math.max(0.25, Number(speed) || 2);
  if (state.aisTrackPlaybackTimer) {
    startAisPlayback();
  }
}

function removePlaybackBar() {
  const bar = document.getElementById('ais-playback-bar');
  if (bar) {
    bar.remove();
  }
}

function createPlaybackBar() {
  removePlaybackBar();
  if (!state.aisTrackPlaybackTimestamps.length) {
    return;
  }

  const bar = document.createElement('div');
  bar.id = 'ais-playback-bar';
  bar.className = 'ais-playback-bar';

  const title = document.createElement('div');
  title.className = 'ais-playback-title';
  title.textContent = 'AIS Playback';
  bar.appendChild(title);

  const timeLabel = document.createElement('div');
  timeLabel.id = 'ais-playback-time';
  timeLabel.className = 'ais-playback-time';
  timeLabel.textContent = '-';
  bar.appendChild(timeLabel);

  const prevBtn = document.createElement('button');
  prevBtn.id = 'ais-playback-prev';
  prevBtn.className = 'btn btn-sm btn-secondary';
  prevBtn.textContent = '«';
  prevBtn.addEventListener('click', () => setAisPlaybackIndex(state.aisTrackPlaybackIndex - 1));
  bar.appendChild(prevBtn);

  const playBtn = document.createElement('button');
  playBtn.id = 'ais-playback-play';
  playBtn.className = 'btn btn-sm btn-success';
  playBtn.textContent = '▶';
  playBtn.addEventListener('click', () => startAisPlayback());
  bar.appendChild(playBtn);

  const pauseBtn = document.createElement('button');
  pauseBtn.id = 'ais-playback-pause';
  pauseBtn.className = 'btn btn-sm btn-warning';
  pauseBtn.textContent = '⏸';
  pauseBtn.style.display = 'none';
  pauseBtn.addEventListener('click', () => stopAisPlayback());
  bar.appendChild(pauseBtn);

  const nextBtn = document.createElement('button');
  nextBtn.id = 'ais-playback-next';
  nextBtn.className = 'btn btn-sm btn-secondary';
  nextBtn.textContent = '»';
  nextBtn.addEventListener('click', () => setAisPlaybackIndex(state.aisTrackPlaybackIndex + 1));
  bar.appendChild(nextBtn);

  const speed = document.createElement('select');
  speed.id = 'ais-playback-speed';
  speed.className = 'form-select';
  speed.style.width = '72px';
  [0.5, 1, 2, 4, 6].forEach((value) => {
    const option = document.createElement('option');
    option.value = String(value);
    option.textContent = `${value}x`;
    if (value === state.aisTrackPlaybackSpeed) {
      option.selected = true;
    }
    speed.appendChild(option);
  });
  speed.addEventListener('change', () => setAisPlaybackSpeed(Number(speed.value)));
  bar.appendChild(speed);

  const sliderWrap = document.createElement('div');
  sliderWrap.className = 'ais-playback-slider-wrap';
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.id = 'ais-playback-slider';
  slider.min = '0';
  slider.max = String(Math.max(0, state.aisTrackPlaybackTimestamps.length - 1));
  slider.value = String(state.aisTrackPlaybackIndex);
  slider.addEventListener('input', () => setAisPlaybackIndex(Number(slider.value)));
  sliderWrap.appendChild(slider);
  bar.appendChild(sliderWrap);

  document.body.appendChild(bar);
  updatePlaybackButtons();
  updatePlaybackTimeLabel();
}

function buildTrackFeatures(responseTracks) {
  const lineFeatures = [];
  const dataByMmsi = new Map();
  const timestampSet = new Set();

  responseTracks.forEach((track) => {
    const mmsi = String(track?.mmsi || '').trim();
    if (!mmsi || !Array.isArray(track?.points) || !track.points.length) {
      return;
    }

    const points = track.points
      .map((point) => {
        const lon = Number(point?.lon);
        const lat = Number(point?.lat);
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
        const date = new Date(point?.timestamp || point?.observedAt || point?.observed_at || 0);
        if (Number.isNaN(date.getTime())) return null;
        return {
          lon,
          lat,
          timestampMs: date.getTime()
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.timestampMs - b.timestampMs);

    if (!points.length) return;
    dataByMmsi.set(mmsi, points);
    points.forEach((point) => timestampSet.add(point.timestampMs));

    if (points.length >= 2) {
      const lineString = new LineString(points.map((point) => fromLonLat([point.lon, point.lat], 'EPSG:3857')));
      const feature = new Feature({
        geometry: lineString,
        mmsi,
        trackColor: getColorForMmsi(mmsi)
      });
      lineFeatures.push(feature);
    }
  });

  state.aisTrackDataByMmsi = dataByMmsi;
  state.aisTrackFeatures = lineFeatures;
  state.aisTrackPlaybackTimestamps = Array.from(timestampSet.values()).sort((a, b) => a - b);
  state.aisTrackPlaybackIndex = Math.max(0, state.aisTrackPlaybackTimestamps.length - 1);
  updatePlaybackHeadFeatures();
}

export async function loadAisTracksForSelection({ start, end }) {
  const mmsis = Array.from(state.aisSelectedMmsi);
  if (!mmsis.length) {
    state.aisTrackError = 'No selected ships';
    state.aisTrackFeatures = [];
    state.aisTrackHeadFeatures = [];
    state.aisTrackPlaybackTimestamps = [];
    removePlaybackBar();
    renderLayers();
    refreshActiveLayersPanel();
    return false;
  }

  state.aisTrackLoading = true;
  state.aisTrackError = null;
  state.aisTrackRangeStart = start || null;
  state.aisTrackRangeEnd = end || null;
  refreshActiveLayersPanel();

  const response = await fetchAisTracks({ mmsis, start, end });
  state.aisTrackLoading = false;

  if (!response || !Array.isArray(response.tracks)) {
    state.aisTrackError = 'Failed to load track history';
    refreshActiveLayersPanel();
    return false;
  }

  buildTrackFeatures(response.tracks);
  attachLayers();
  renderLayers();
  createPlaybackBar();
  refreshActiveLayersPanel();
  return true;
}

export function clearAisTracks() {
  stopAisPlayback();
  removePlaybackBar();
  removeLayers();
  state.aisTrackFeatures = [];
  state.aisTrackHeadFeatures = [];
  state.aisTrackDataByMmsi = new Map();
  state.aisTrackPlaybackTimestamps = [];
  state.aisTrackPlaybackIndex = 0;
  state.aisTrackError = null;
  state.aisTrackLoading = false;
  state.aisTrackRangeStart = null;
  state.aisTrackRangeEnd = null;
}

export function rebuildAisTrackLayers() {
  if (!state.aisTrackFeatures.length && !state.aisTrackHeadFeatures.length) {
    return;
  }
  removeLayers();
  attachLayers();
  renderLayers();
}

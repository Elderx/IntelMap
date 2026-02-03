/**
 * FMI Radar Overlay Manager
 * Manages WMS radar layer with time dimension support
 */

import TileLayer from 'ol/layer/Tile.js';
import TileWMS from 'ol/source/TileWMS.js';
import { state } from '../state/store.js';

const FMI_RADAR_URL = 'https://openwms.fmi.fi/geoserver/Radar/wms';
const FMI_RADAR_LAYER = 'Radar:suomi_dbz_eureffin';
const TIME_INTERVAL_MINUTES = 5;
const HOURS_BACK = 12;

// Animation state
let animationId = null;
let frameRate = 2; // frames per second

/**
 * Generate time steps for last N hours at 5-minute intervals
 * @returns {Array<Date>} Array of time steps
 */
function generateTimeSteps() {
  const times = [];
  const now = new Date();
  const startTime = new Date(now.getTime() - HOURS_BACK * 60 * 60 * 1000);

  // Round to nearest 5 minutes
  startTime.setMinutes(Math.floor(startTime.getMinutes() / TIME_INTERVAL_MINUTES) * TIME_INTERVAL_MINUTES);
  startTime.setSeconds(0);
  startTime.setMilliseconds(0);

  for (let t = new Date(startTime); t <= now; t.setMinutes(t.getMinutes() + TIME_INTERVAL_MINUTES)) {
    times.push(new Date(t));
  }

  return times;
}

/**
 * Create the radar WMS layer
 * @returns {TileLayer} OpenLayers TileLayer
 */
function createRadarLayer() {
  const timeSteps = generateTimeSteps();
  const latestTime = timeSteps[timeSteps.length - 1];

  const layer = new TileLayer({
    opacity: 0.6,
    source: new TileWMS({
      url: FMI_RADAR_URL,
      params: {
        'LAYERS': FMI_RADAR_LAYER,
        'TIME': latestTime.toISOString(),
        'FORMAT': 'image/png',
        'TRANSPARENT': 'true'
      },
      transition: 0,
      attributions: 'Finnish Meteorological Institute'
    }),
    zIndex: 55, // Above WMS overlays (50), below OSM GeoJSON (60)
    visible: false
  });

  // Store current time index
  layer.radarTimeIndex = timeSteps.length - 1;
  layer.radarTimeSteps = timeSteps;

  return layer;
}

/**
 * Initialize radar layers for all maps
 */
export function initRadarLayers() {
  ['main', 'left', 'right'].forEach(key => {
    const mapObj = key === 'main' ? state.map : key === 'left' ? state.leftMap : state.rightMap;
    if (!mapObj) return;

    const layer = createRadarLayer();
    state.radarLayer[key] = layer;
    mapObj.addLayer(layer);
  });

  console.log('[Radar] Initialized WMS layers');
}

/**
 * Enable radar overlay
 */
export function enableRadar() {
  ['main', 'left', 'right'].forEach(key => {
    const layer = state.radarLayer[key];
    if (layer) {
      layer.setVisible(true);
    }
  });
  state.radarEnabled = true;

  // Update unified time bar (create or update to include radar)
  import('../ui/headerLayerManager.js').then(({ createUnifiedTimeBar }) => {
    createUnifiedTimeBar();
  });

  // Update active layers panel and permalink
  import('../ui/activeLayers.js').then(({ updateActiveLayersPanel }) => {
    updateActiveLayersPanel();
  });
  import('../map/permalink.js').then(({ updatePermalinkWithFeatures }) => {
    updatePermalinkWithFeatures();
  });

  console.log('[Radar] Enabled');
}

/**
 * Disable radar overlay
 */
export function disableRadar() {
  stopRadarAnimation();
  ['main', 'left', 'right'].forEach(key => {
    const layer = state.radarLayer[key];
    if (layer) {
      layer.setVisible(false);
    }
  });
  state.radarEnabled = false;

  // Update unified time bar (remove or update to exclude radar)
  import('../ui/headerLayerManager.js').then(({ createUnifiedTimeBar }) => {
    createUnifiedTimeBar();
  });

  // Update active layers panel and permalink
  import('../ui/activeLayers.js').then(({ updateActiveLayersPanel }) => {
    updateActiveLayersPanel();
  });
  import('../map/permalink.js').then(({ updatePermalinkWithFeatures }) => {
    updatePermalinkWithFeatures();
  });

  console.log('[Radar] Disabled');
}

/**
 * Toggle radar overlay
 */
export function toggleRadar() {
  if (state.radarEnabled) {
    disableRadar();
  } else {
    enableRadar();
  }
  return state.radarEnabled;
}

/**
 * Set radar time by index
 * @param {number} index - Time step index
 */
export function setRadarTimeByIndex(index) {
  const timeSteps = state.radarLayer.main?.radarTimeSteps;
  if (!timeSteps || index < 0 || index >= timeSteps.length) return;

  const time = timeSteps[index];

  ['main', 'left', 'right'].forEach(key => {
    const layer = state.radarLayer[key];
    if (layer) {
      layer.radarTimeIndex = index;
      layer.getSource()?.updateParams({ 'TIME': time.toISOString() });
    }
  });

  state.radarCurrentTimeIndex = index;
  updateRadarTimeDisplay();
}

/**
 * Set radar time by Date object
 * @param {Date} time - Time to set
 */
export function setRadarTime(time) {
  const timeSteps = state.radarLayer.main?.radarTimeSteps;
  if (!timeSteps) return;

  // Find closest time step
  let closestIndex = 0;
  let minDiff = Infinity;

  timeSteps.forEach((t, i) => {
    const diff = Math.abs(t.getTime() - time.getTime());
    if (diff < minDiff) {
      minDiff = diff;
      closestIndex = i;
    }
  });

  setRadarTimeByIndex(closestIndex);
}

/**
 * Get current radar time
 * @returns {Date|null} Current radar time or null
 */
export function getCurrentRadarTime() {
  const layer = state.radarLayer.main;
  if (!layer || !layer.radarTimeSteps || layer.radarTimeIndex === undefined) {
    return null;
  }
  return layer.radarTimeSteps[layer.radarTimeIndex];
}

/**
 * Get radar time steps
 * @returns {Array<Date>} Array of available times
 */
export function getRadarTimeSteps() {
  return state.radarLayer.main?.radarTimeSteps || [];
}

/**
 * Get current time index
 * @returns {number} Current time index
 */
export function getCurrentTimeIndex() {
  return state.radarLayer.main?.radarTimeIndex ?? 0;
}

/**
 * Update radar time display in UI
 */
function updateRadarTimeDisplay() {
  // Use unified time bar instead of separate radar display
  import('../ui/headerLayerManager.js').then(({ updateUnifiedTimeDisplay }) => {
    updateUnifiedTimeDisplay();
  });
}

/**
 * Start radar animation
 */
export function startRadarAnimation() {
  stopRadarAnimation();

  animationId = setInterval(() => {
    const timeSteps = state.radarLayer.main?.radarTimeSteps;
    const currentIndex = state.radarLayer.main?.radarTimeIndex ?? 0;

    if (!timeSteps || timeSteps.length === 0) return;

    let nextIndex = currentIndex + 1;
    if (nextIndex >= timeSteps.length) {
      nextIndex = 0; // Loop back to start
    }

    setRadarTimeByIndex(nextIndex);
  }, 1000 / frameRate);

  state.radarAnimating = true;

  // Update play/pause button (unified bar)
  const playBtn = document.getElementById('unified-play-btn');
  const pauseBtn = document.getElementById('unified-pause-btn');
  if (playBtn) playBtn.style.display = 'none';
  if (pauseBtn) pauseBtn.style.display = 'inline-block';

  console.log('[Radar] Animation started');
}

/**
 * Stop radar animation
 */
export function stopRadarAnimation() {
  if (animationId) {
    clearInterval(animationId);
    animationId = null;
  }
  state.radarAnimating = false;

  // Update play/pause button (unified bar)
  const playBtn = document.getElementById('unified-play-btn');
  const pauseBtn = document.getElementById('unified-pause-btn');
  if (playBtn) playBtn.style.display = 'inline-block';
  if (pauseBtn) pauseBtn.style.display = 'none';

  console.log('[Radar] Animation stopped');
}

/**
 * Toggle radar animation
 */
export function toggleRadarAnimation() {
  if (state.radarAnimating) {
    stopRadarAnimation();
  } else {
    startRadarAnimation();
  }
}

/**
 * Step backward one frame
 */
export function radarStepBackward() {
  const currentIndex = state.radarLayer.main?.radarTimeIndex ?? 0;
  const timeSteps = state.radarLayer.main?.radarTimeSteps;
  if (!timeSteps) return;

  let prevIndex = currentIndex - 1;
  if (prevIndex < 0) {
    prevIndex = timeSteps.length - 1; // Wrap to end
  }

  setRadarTimeByIndex(prevIndex);
}

/**
 * Step forward one frame
 */
export function radarStepForward() {
  const currentIndex = state.radarLayer.main?.radarTimeIndex ?? 0;
  const timeSteps = state.radarLayer.main?.radarTimeSteps;
  if (!timeSteps) return;

  let nextIndex = currentIndex + 1;
  if (nextIndex >= timeSteps.length) {
    nextIndex = 0; // Wrap to start
  }

  setRadarTimeByIndex(nextIndex);
}

/**
 * Set radar animation speed
 * @param {number} fps - Frames per second
 */
export function setRadarSpeed(fps) {
  frameRate = Math.max(0.1, Math.min(10, fps));
  state.radarSpeed = frameRate;

  // Restart animation if running
  if (state.radarAnimating) {
    startRadarAnimation();
  }

  console.log(`[Radar] Speed set to ${frameRate} fps`);
}

/**
 * Get radar animation speed
 * @returns {number} Frames per second
 */
export function getRadarSpeed() {
  return frameRate;
}

/**
 * Refresh radar time steps (call periodically to get new data)
 */
export function refreshRadarData() {
  const newTimeSteps = generateTimeSteps();
  const currentTime = getCurrentRadarTime();

  ['main', 'left', 'right'].forEach(key => {
    const layer = state.radarLayer[key];
    if (layer) {
      layer.radarTimeSteps = newTimeSteps;

      // Try to maintain current time, or go to latest if not found
      let newIndex = newTimeSteps.length - 1;
      if (currentTime) {
        const closestIndex = newTimeSteps.findIndex(t => t.getTime() === currentTime.getTime());
        if (closestIndex !== -1) {
          newIndex = closestIndex;
        }
      }
      layer.radarTimeIndex = newIndex;
    }
  });

  console.log(`[Radar] Refreshed data (${newTimeSteps.length} time steps)`);
  updateRadarTimeDisplay();
}

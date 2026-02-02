/**
 * GPX Interactions Module
 * Handles hover correlation between map and charts
 */

import Overlay from 'ol/Overlay.js';
import { state } from '../state/store.js';
import { highlightChartPoint, clearChartHighlights } from './gpxCharts.js';

let mapHoverHandlers = [];

/**
 * Setup map hover handlers for all active maps
 */
export function setupMapHoverHandlers() {
  // Clear existing handlers
  removeMapHoverHandlers();

  ['main', 'left', 'right'].forEach(key => {
    const map = key === 'main' ? state.map : key === 'left' ? state.leftMap : state.rightMap;
    if (!map) return;

    const handler = (event) => handleMapHover(event, map);
    map.on('pointermove', handler);
    mapHoverHandlers.push({ map, handler });
  });

  console.log('[GPX] Map hover handlers setup');
}

/**
 * Remove map hover handlers
 */
export function removeMapHoverHandlers() {
  mapHoverHandlers.forEach(({ map, handler }) => {
    map.un('pointermove', handler);
  });
  mapHoverHandlers = [];
}

/**
 * Handle map hover event
 * @param {MapBrowserEvent<PointerType>} event - OpenLayers map browser event
 * @param {PluggableMap} map - Map instance
 */
function handleMapHover(event, map) {
  if (!state.gpxEnabled || !state.gpxCurrentFile) {
    return;
  }

  const trackData = state.gpxCurrentFile.trackData;
  if (!trackData || trackData.length === 0) {
    return;
  }

  // Get cursor coordinate in map projection
  const cursorCoord = event.coordinate;
  if (!cursorCoord) {
    clearMapMarker();
    clearChartHighlights();
    return;
  }

  // Find nearest track point
  const nearestIndex = findNearestTrackPoint(cursorCoord, trackData);

  if (nearestIndex !== null) {
    setMapMarkerAtIndex(nearestIndex);
    highlightChartPoint(nearestIndex);
  } else {
    clearMapMarker();
    clearChartHighlights();
  }
}

/**
 * Find nearest track point to cursor coordinate
 * @param {number[]} cursorCoord - [x, y] cursor coordinate
 * @param {TrackPoint[]} trackData - Track point data
 * @returns {number|null} Index of nearest point or null if not within threshold
 */
function findNearestTrackPoint(cursorCoord, trackData) {
  const threshold = 50; // pixels
  let nearestIndex = null;
  let minDistance = Infinity;

  for (let i = 0; i < trackData.length; i++) {
    const point = trackData[i];
    const distance = Math.sqrt(
      Math.pow(cursorCoord[0] - point.coordinates[0], 2) +
      Math.pow(cursorCoord[1] - point.coordinates[1], 2)
    );

    if (distance < minDistance) {
      minDistance = distance;
      nearestIndex = i;
    }
  }

  // Check if within threshold (convert pixels to map units)
  // For simplicity, we'll use a fixed threshold in map units
  // This could be improved by using the map's pixel-to-coordinate conversion
  const mapUnitsThreshold = 100; // Adjust based on zoom level

  if (minDistance <= mapUnitsThreshold) {
    return nearestIndex;
  }

  return null;
}

/**
 * Set map marker at track point index
 * @param {number} index - Track point index
 */
export function setMapMarkerAtIndex(index) {
  if (!state.gpxCurrentFile || !state.gpxCurrentFile.trackData) {
    return;
  }

  const trackData = state.gpxCurrentFile.trackData;
  if (index < 0 || index >= trackData.length) {
    return;
  }

  const point = trackData[index];

  // Create or update overlay marker
  createOrUpdateMarker(point, index);
}

/**
 * Create or update hover marker
 * @param {TrackPoint} point - Track point
 * @param {number} index - Point index
 */
function createOrUpdateMarker(point, index) {
  if (!state.gpxHoverMarker) {
    // Create marker element with absolute positioning for precise control
    const markerElement = document.createElement('div');
    markerElement.className = 'gpx-hover-marker';
    markerElement.style.cssText = `
      position: absolute;
      width: 16px;
      height: 16px;
      background: rgba(255, 255, 255, 0.9);
      border: 3px solid #2196F3;
      border-radius: 50%;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      pointer-events: none;
      transform: translate(-50%, -50%);
      left: 50%;
      top: 50%;
    `;

    // Create tooltip element
    const tooltipElement = document.createElement('div');
    tooltipElement.className = 'gpx-hover-tooltip';
    tooltipElement.style.cssText = `
      background: rgba(0, 0, 0, 0.8);
      color: #fff;
      padding: 6px 10px;
      border-radius: 4px;
      font-size: 12px;
      white-space: nowrap;
      margin-top: 20px;
      pointer-events: none;
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
    `;

    // Combine marker and tooltip
    const container = document.createElement('div');
    container.style.cssText = `
      position: relative;
      width: 0;
      height: 0;
    `;
    container.appendChild(markerElement);
    container.appendChild(tooltipElement);

    // Create overlay
    state.gpxHoverMarker = new Overlay({
      element: container,
      positioning: 'center-center',
      stopEvent: false,
      autoPan: false
    });

    // Add overlay to all maps
    ['main', 'left', 'right'].forEach(key => {
      const map = key === 'main' ? state.map : key === 'left' ? state.leftMap : state.rightMap;
      if (map) {
        map.addOverlay(state.gpxHoverMarker);
      }
    });

    state.gpxHoverTooltip = tooltipElement;
  }

  // Update marker position
  state.gpxHoverMarker.setPosition(point.coordinates);

  // Update tooltip content
  const tooltip = state.gpxHoverTooltip;
  const elevation = point.elevation !== null ? `${point.elevation.toFixed(0)} m` : 'N/A';
  const speed = point.speed !== null ? `${(point.speed * 3.6).toFixed(1)} km/h` : 'N/A';
  const distance = (point.distance / 1000).toFixed(2) + ' km';

  tooltip.innerHTML = `
    <div style="margin-bottom: 2px;"><strong>Point ${index + 1}</strong></div>
    ${point.elevation !== null ? `<div>Elevation: ${elevation}</div>` : ''}
    ${point.speed !== null && point.speed > 0 ? `<div>Speed: ${speed}</div>` : ''}
    <div>Distance: ${distance}</div>
    ${point.time ? `<div>Time: ${point.time.toLocaleTimeString()}</div>` : ''}
  `;
}

/**
 * Clear map marker
 */
export function clearMapMarker() {
  if (state.gpxHoverMarker) {
    state.gpxHoverMarker.setPosition(undefined);
  }
}

/**
 * Setup chart hover handlers
 * Chart hover handlers are setup directly in the chart configuration
 * This function is a placeholder for any additional setup needed
 */
export function setupChartHoverHandlers() {
  // Chart hover handlers are configured in gpxCharts.js
  // This function can be used for additional setup if needed
  console.log('[GPX] Chart hover handlers setup');
}

/**
 * Cleanup interactions
 */
export function cleanupInteractions() {
  removeMapHoverHandlers();
  clearMapMarker();

  // Remove overlays from all maps
  if (state.gpxHoverMarker) {
    ['main', 'left', 'right'].forEach(key => {
      const map = key === 'main' ? state.map : key === 'left' ? state.leftMap : state.rightMap;
      if (map) {
        map.removeOverlay(state.gpxHoverMarker);
      }
    });

    state.gpxHoverMarker = null;
    state.gpxHoverTooltip = null;
  }

  console.log('[GPX] Interactions cleaned up');
}

/**
 * GPX Renderer Module
 * Renders GPX tracks on OpenLayers maps with color-coded segments
 */

import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import { Style, Stroke, Circle, Fill } from 'ol/style.js';
import Feature from 'ol/Feature.js';
import LineString from 'ol/geom/LineString.js';
import Point from 'ol/geom/Point.js';
import { state } from '../state/store.js';

/**
 * Ensure GPX layers exist for all maps
 */
export function ensureGpxLayers() {
  ['main', 'left', 'right'].forEach(key => {
    const map = key === 'main' ? state.map : key === 'left' ? state.leftMap : state.rightMap;
    if (!map) return;

    if (!state.gpxLayer[key]) {
      const source = new VectorSource();
      const layer = new VectorLayer({
        source: source,
        style: function(feature) {
          return feature.get('style') || getDefaultStyle();
        },
        zIndex: 180, // Above user polygons, below user markers
        visible: state.gpxEnabled
      });
      map.addLayer(layer);
      state.gpxLayer[key] = layer;
      console.log(`[GPX] Created layer for ${key} map`);
    }
  });
}

/**
 * Render GPX features on all maps with specified color mode
 * @param {Feature[]} features - OpenLayers features from GPX parser
 * @param {TrackPoint[]} trackData - Track point data
 * @param {string} colorMode - 'elevation' | 'speed' | 'solid'
 */
export function renderGpxTrack(features, trackData, colorMode) {
  if (!features || features.length === 0) {
    console.warn('[GPX] No features to render');
    return;
  }

  ensureGpxLayers();

  // Clear existing features
  clearGpxLayers();

  // Create colored segment features based on color mode
  const styledFeatures = colorMode === 'solid'
    ? createSolidFeatures(features)
    : createSegmentFeatures(trackData, colorMode);

  // Add features to all map layers
  ['main', 'left', 'right'].forEach(key => {
    if (!state.gpxLayer[key]) return;
    const source = state.gpxLayer[key].getSource();
    styledFeatures.forEach(f => source.addFeature(f));
  });

  console.log(`[GPX] Rendered ${styledFeatures.length} features with color mode: ${colorMode}`);

  // Fit map view to track extent (only on main map)
  fitViewToTrack(styledFeatures);
}

/**
 * Create solid-colored features (no gradient)
 * @param {Feature[]} features
 * @returns {Feature[]}
 */
function createSolidFeatures(features) {
  return features.map(feature => {
    const clone = feature.clone();
    clone.set('style', getSolidStyle());
    return clone;
  });
}

/**
 * Create segment features with color coding
 * @param {TrackPoint[]} trackData
 * @param {string} colorMode - 'elevation' | 'speed'
 * @returns {Feature[]}
 */
function createSegmentFeatures(trackData, colorMode) {
  if (!trackData || trackData.length < 2) {
    console.warn('[GPX] Not enough track points for segments');
    return [];
  }

  // Get min/max values for normalization
  let minVal, maxVal;

  if (colorMode === 'elevation') {
    const elevations = trackData.filter(p => p.elevation !== null).map(p => p.elevation);
    if (elevations.length === 0) {
      console.warn('[GPX] No elevation data for color coding');
      return [];
    }
    minVal = Math.min(...elevations);
    maxVal = Math.max(...elevations);
  } else if (colorMode === 'speed') {
    const speeds = trackData.filter(p => p.speed !== null && p.speed > 0).map(p => p.speed);
    if (speeds.length === 0) {
      console.warn('[GPX] No speed data for color coding');
      return [];
    }
    minVal = Math.min(...speeds);
    maxVal = Math.max(...speeds);
  }

  const segmentFeatures = [];

  // Create segment for each pair of adjacent points
  for (let i = 0; i < trackData.length - 1; i++) {
    const point1 = trackData[i];
    const point2 = trackData[i + 1];

    // Get color based on value at point1 (or average of both)
    let value;
    if (colorMode === 'elevation') {
      value = point1.elevation;
    } else if (colorMode === 'speed') {
      value = point1.speed || point2.speed;
    }

    if (value === null || value === undefined) continue;

    // Normalize value to 0-1 range
    const normalized = (value - minVal) / (maxVal - minVal);

    // Get color for this normalized value
    const color = getColorForValue(normalized, colorMode);

    // Create LineString segment
    const segment = new Feature({
      geometry: new LineString([point1.coordinates, point2.coordinates])
    });

    segment.set('style', new Style({
      stroke: new Stroke({
        color: color,
        width: 3
      })
    }));

    segmentFeatures.push(segment);
  }

  // Add waypoint markers if track has gaps (optional)
  addWaypointMarkers(trackData, segmentFeatures, colorMode, minVal, maxVal);

  return segmentFeatures;
}

/**
 * Add waypoint markers for track points
 * @param {TrackPoint[]} trackData
 * @param {Feature[]} segmentFeatures
 * @param {string} colorMode
 * @param {number} minVal
 * @param {number} maxVal
 */
function addWaypointMarkers(trackData, segmentFeatures, colorMode, minVal, maxVal) {
  // Add markers at start and end
  const startPoint = trackData[0];
  const endPoint = trackData[trackData.length - 1];

  const startMarker = new Feature({
    geometry: new Point(startPoint.coordinates)
  });
  startMarker.set('style', new Style({
    image: new Circle({
      radius: 6,
      fill: new Fill({ color: '#4CAF50' }), // Green for start
      stroke: new Stroke({ color: '#fff', width: 2 })
    })
  }));
  segmentFeatures.push(startMarker);

  const endMarker = new Feature({
    geometry: new Point(endPoint.coordinates)
  });
  endMarker.set('style', new Style({
    image: new Circle({
      radius: 6,
      fill: new Fill({ color: '#F44336' }), // Red for end
      stroke: new Stroke({ color: '#fff', width: 2 })
    })
  }));
  segmentFeatures.push(endMarker);
}

/**
 * Get color for normalized value (0-1)
 * @param {number} normalized - Value between 0 and 1
 * @param {string} mode - 'elevation' | 'speed'
 * @returns {string} CSS color
 */
function getColorForValue(normalized, mode) {
  // Clamp normalized value to 0-1
  const t = Math.max(0, Math.min(1, normalized));

  if (mode === 'elevation') {
    // Elevation color scale: blue (low) → green → yellow → red (high)
    return getElevationColor(t);
  } else if (mode === 'speed') {
    // Speed color scale: green (slow) → yellow → orange → red (fast)
    return getSpeedColor(t);
  }

  return '#2196F3'; // Default blue
}

/**
 * Get elevation color (blue → green → yellow → red)
 * @param {number} t - Normalized value 0-1
 * @returns {string}
 */
function getElevationColor(t) {
  // Color stops
  const stops = [
    { pos: 0.0, color: [33, 150, 243] },   // Blue
    { pos: 0.33, color: [76, 175, 80] },  // Green
    { pos: 0.66, color: [255, 193, 7] },  // Yellow
    { pos: 1.0, color: [244, 67, 54] }    // Red
  ];

  return interpolateColor(t, stops);
}

/**
 * Get speed color (green → yellow → orange → red)
 * @param {number} t - Normalized value 0-1
 * @returns {string}
 */
function getSpeedColor(t) {
  // Color stops
  const stops = [
    { pos: 0.0, color: [76, 175, 80] },   // Green (slow)
    { pos: 0.5, color: [255, 193, 7] },   // Yellow
    { pos: 0.75, color: [255, 152, 0] },  // Orange
    { pos: 1.0, color: [244, 67, 54] }    // Red (fast)
  ];

  return interpolateColor(t, stops);
}

/**
 * Interpolate between color stops
 * @param {number} t - Normalized value 0-1
 * @param {Array} stops - Array of {pos, color} objects
 * @returns {string} RGB color string
 */
function interpolateColor(t, stops) {
  // Find surrounding stops
  let lower = stops[0];
  let upper = stops[stops.length - 1];

  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].pos && t <= stops[i + 1].pos) {
      lower = stops[i];
      upper = stops[i + 1];
      break;
    }
  }

  // Interpolate
  const range = upper.pos - lower.pos;
  const normalized = range === 0 ? 0 : (t - lower.pos) / range;

  const r = Math.round(lower.color[0] + (upper.color[0] - lower.color[0]) * normalized);
  const g = Math.round(lower.color[1] + (upper.color[1] - lower.color[1]) * normalized);
  const b = Math.round(lower.color[2] + (upper.color[2] - lower.color[2]) * normalized);

  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Get solid style (no gradient)
 * @returns {Style}
 */
function getSolidStyle() {
  return new Style({
    stroke: new Stroke({
      color: '#2196F3',
      width: 3
    })
  });
}

/**
 * Get default style
 * @returns {Style}
 */
function getDefaultStyle() {
  return getSolidStyle();
}

/**
 * Clear all GPX features from layers
 */
export function clearGpxLayers() {
  ['main', 'left', 'right'].forEach(key => {
    if (!state.gpxLayer[key]) return;
    const source = state.gpxLayer[key].getSource();
    source.clear();
  });
}

/**
 * Fit map view to track extent
 * @param {Feature[]} features
 */
function fitViewToTrack(features) {
  if (!state.map || features.length === 0) return;

  try {
    // Calculate extent from all features
    let extent = null;
    features.forEach(f => {
      const geom = f.getGeometry();
      if (geom) {
        const geomExtent = geom.getExtent();
        if (!extent) {
          extent = geomExtent;
        } else {
          extent = [
            Math.min(extent[0], geomExtent[0]),
            Math.min(extent[1], geomExtent[1]),
            Math.max(extent[2], geomExtent[2]),
            Math.max(extent[3], geomExtent[3])
          ];
        }
      }
    });

    if (extent) {
      const view = state.map.getView();
      view.fit(extent, {
        padding: [50, 50, 50, 50],
        duration: 1000
      });
    }
  } catch (error) {
    console.warn('[GPX] Could not fit view to track:', error);
  }
}

/**
 * Update GPX layers visibility
 * @param {boolean} visible
 */
export function setGpxLayersVisible(visible) {
  ['main', 'left', 'right'].forEach(key => {
    if (!state.gpxLayer[key]) return;
    state.gpxLayer[key].setVisible(visible);
  });
}

/**
 * Rebuild GPX layers (for split-screen mode changes)
 */
export function rebuildGpxLayers() {
  // Re-ensure layers exist for current map configuration
  ensureGpxLayers();
}

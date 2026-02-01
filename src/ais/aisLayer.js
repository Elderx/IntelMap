/**
 * AIS Layer Module
 * Layer creation, styling, vessel-to-feature conversion
 */

import { Vector as VectorLayer } from 'ol/layer.js';
import { Vector as VectorSource } from 'ol/source.js';
import Feature from 'ol/Feature.js';
import { Point, LineString } from 'ol/geom.js';
import { Style, Icon, Fill, Stroke, Circle as CircleStyle, Text } from 'ol/style.js';
import { fromLonLat } from 'ol/proj.js';

/**
 * Create AIS vessel layer
 * @returns {VectorLayer} OpenLayers VectorLayer
 */
export function createAisLayer() {
  return new VectorLayer({
    source: new VectorSource(),
    style: aisStyleFunction,
    zIndex: 105, // Above aircraft (100), below user features (190+)
    className: 'ais-layer'
  });
}

/**
 * Get ship icon SVG path based on ship type
 * @param {string} shipType - AIS ship type
 * @returns {string} SVG data URI
 */
function getShipIconPath(shipType) {
  const type = (shipType || 'unknown').toLowerCase();
  let color = '#888888'; // Default gray

  if (type.includes('passenger') || type.includes('ferry')) {
    color = '#2196F3'; // Blue
  } else if (type.includes('cargo') || type.includes('container')) {
    color = '#4CAF50'; // Green
  } else if (type.includes('tanker')) {
    color = '#F44336'; // Red
  } else if (type.includes('fishing')) {
    color = '#FF9800'; // Orange
  } else if (type.includes('tug') || type.includes('pilot')) {
    color = '#9C27B0'; // Purple
  } else if (type.includes('pleasure') || type.includes('sailing')) {
    color = '#00BCD4'; // Cyan
  }

  // Simple ship icon (triangle pointing up)
  const svg = `
    <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2L2 20h20L12 2z" fill="${color}" stroke="#000" stroke-width="0.5"/>
    </svg>
  `;

  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
}

/**
 * Style function for AIS vessel features
 * @param {Feature} feature - OpenLayers Feature
 * @returns {Style} OpenLayers Style
 */
function aisStyleFunction(feature) {
  const shipType = feature.get('shipType') || 'unknown';
  const course = feature.get('course') || 0;
  const speed = feature.get('speed') || 0;

  return new Style({
    image: new Icon({
      src: getShipIconPath(shipType),
      rotation: course * Math.PI / 180, // Convert degrees to radians
      anchor: [0.5, 0.5],
      scale: 1
    }),
    text: speed > 0 ? new Text({
      text: speed.toFixed(0),
      font: '10px sans-serif',
      offsetY: -15,
      fill: new Fill({ color: '#000' }),
      stroke: new Stroke({ color: '#fff', width: 2 })
    }) : undefined
  });
}

/**
 * Convert AISStream vessel data to OpenLayers Feature
 * @param {Object} vessel - Vessel data from AISStream
 * @returns {Feature|null} OpenLayers Feature or null if invalid
 */
export function vesselToFeature(vessel) {
  const {
    mmsi, latitude, longitude, speed, course,
    shipType, name, destination, imo, callSign,
    dimension, draft, cargo
  } = vessel;

  if (!latitude || !longitude) return null;

  // Convert WGS84 to Web Mercator
  const coord = fromLonLat([longitude, latitude], 'EPSG:3857');

  const feature = new Feature({
    geometry: new Point(coord),
    mmsi: mmsi.toString(),
    name: name || 'Unknown',
    shipType: shipType || 'Unknown',
    speed: speed || 0,
    course: course || 0,
    destination: destination || '',
    imo: imo || '',
    callSign: callSign || '',
    dimension: dimension || {},
    draft: draft || 0,
    cargo: cargo || ''
  });

  return feature;
}

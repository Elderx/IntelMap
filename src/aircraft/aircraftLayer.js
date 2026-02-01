/**
 * Aircraft Layer Module
 * Creates and styles aircraft overlay layers
 */

import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import Style from 'ol/style/Style.js';
import Icon from 'ol/style/Icon.js';
import { transform } from 'ol/proj.js';
import { OPENSKY_CONFIG } from '../config/constants.js';
import { state } from '../state/store.js';

// SVG path for airplane silhouette (simple shape)
const AIRCRAFT_ICON_PATH = 'M 0 -10 L 8 8 L 0 4 L -8 8 Z';

/**
 * Get aircraft icon style with rotation
 * @param {number} heading - True track in degrees (0 = north)
 * @returns {Style} OpenLayers Style
 */
export function getAircraftStyle(heading) {
  // Convert heading to radians (OpenLayers rotation is clockwise from east)
  // OpenSky heading is clockwise from north, so we need to adjust
  const rotation = heading ? (heading * Math.PI / 180) : 0;

  return new Style({
    image: new Icon({
      src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="-12 -12 24 24" width="24" height="24">
          <path d="${AIRCRAFT_ICON_PATH}"
                fill="${OPENSKY_CONFIG.aircraftIconColor}"
                stroke="white" stroke-width="1.5"/>
        </svg>
      `),
      rotation: rotation,
      anchor: [0.5, 0.5],
      scale: OPENSKY_CONFIG.aircraftIconScale
    }),
    zIndex: 200  // Same as user markers
  });
}

/**
 * Convert OpenSky state vector to OpenLayers Feature
 * @param {Array} stateVector - OpenSky state array
 * @returns {Feature|null} OpenLayers Feature or null if no position
 */
export function stateToFeature(stateVector) {
  // OpenSky state vector indices:
  // 0: icao24, 1: callsign, 2: origin_country, 3: time_position, 4: last_contact,
  // 5: longitude, 6: latitude, 7: baro_altitude, 8: on_ground, 9: velocity,
  // 10: true_track, 11: vertical_rate, 12: sensors, 13: geo_altitude,
  // 14: squawk, 15: spi, 16: position_source, 17: category

  const lon = stateVector[5];
  const lat = stateVector[6];

  // Skip if no position
  if (lon === null || lat === null) {
    return null;
  }

  // Transform from WGS84 to Web Mercator
  const coordinates = transform([lon, lat], 'EPSG:4326', 'EPSG:3857');

  const feature = new Feature({
    geometry: new Point(coordinates)
  });

  // Set style with heading rotation
  const heading = stateVector[10];
  feature.setStyle(getAircraftStyle(heading));

  // Store metadata for interactions
  feature.set('isAircraft', true);
  feature.set('openskyState', stateVector);

  return feature;
}

/**
 * Create aircraft vector layer for a map
 * @returns {VectorLayer} OpenLayers VectorLayer
 */
export function createAircraftLayer() {
  return new VectorLayer({
    source: new VectorSource(),
    zIndex: 200  // Same as user markers
  });
}

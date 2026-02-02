/**
 * GPX Parser Module
 * Parses GPX files using OpenLayers ol/format/GPX
 * Extracts track points with elevation, time, and calculated distance/speed
 */

import GPX from 'ol/format/GPX.js';
import { toLonLat as olToLonLat } from 'ol/proj.js';

/**
 * Parse a GPX file and extract features and track data
 * @param {File} file - GPX file object
 * @returns {Promise<{features: Feature[], trackData: TrackPoint[]}>}
 */
export async function parseGpxFile(file) {
  try {
    const text = await readFileAsText(file);

    console.log('[GPX] File read, size:', text.length, 'characters');

    if (!text || text.length === 0) {
      throw new Error('File is empty or could not be read');
    }

    // Parse XML string to DOM Document
    // This is more reliable than passing raw string to OpenLayers
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, 'text/xml');

    // Check for XML parsing errors
    const parseError = xmlDoc.querySelector('parsererror');
    if (parseError) {
      throw new Error(`XML parsing error: ${parseError.textContent}`);
    }

    console.log('[GPX] XML parsed successfully');

    const gpxFormat = new GPX();

    // Read features from GPX Document
    const features = gpxFormat.readFeatures(xmlDoc, {
      dataProjection: 'EPSG:4326',    // GPX uses WGS84
      featureProjection: 'EPSG:3857'  // OpenLayers uses Web Mercator
    });

    console.log('[GPX] Features parsed:', features?.length || 0);

    if (!features || features.length === 0) {
      throw new Error('No valid features found in GPX file');
    }

    // Extract track data from features
    const trackData = extractTrackData(features, file.name);

    console.log(`[GPX] Parsed ${features.length} features, ${trackData.length} track points from ${file.name}`);

    return { features, trackData };
  } catch (error) {
    console.error('[GPX] Error parsing file:', error);
    throw new Error(`Failed to parse GPX file: ${error.message}`);
  }
}

/**
 * Read file as text
 * @param {File} file
 * @returns {Promise<string>}
 */
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

/**
 * Extract track point data from OpenLayers features
 * @param {Feature[]} features - OpenLayers features from GPX
 * @param {string} fileName - Original filename
 * @returns {TrackPoint[]}
 */
function extractTrackData(features, fileName) {
  const trackPoints = [];

  for (const feature of features) {
    const geometry = feature.getGeometry();

    if (!geometry) {
      console.warn('[GPX] Feature has no geometry, skipping');
      continue;
    }

    // Get coordinates based on geometry type
    let coordinates = [];

    if (geometry.getType() === 'LineString') {
      coordinates = geometry.getCoordinates();
    } else if (geometry.getType() === 'MultiLineString') {
      // MultiLineString has multiple line segments
      const lineStrings = geometry.getLineStrings();
      for (const lineString of lineStrings) {
        coordinates.push(...lineString.getCoordinates());
      }
    } else if (geometry.getType() === 'Point') {
      // Single waypoint point
      coordinates = [geometry.getCoordinates()];
    }

    // Extract properties from feature
    const properties = feature.getProperties();

    // Process each coordinate
    for (let i = 0; i < coordinates.length; i++) {
      const coord = coordinates[i]; // [x, y] in EPSG:3857

      // Convert back to lon/lat for storage
      const lonLatCoord = toLonLat(coord);
      const [lon, lat] = lonLatCoord;

      // Get elevation from properties (if available)
      // GPX format stores elevation in geometry or properties
      let elevation = null;

      // Try to get elevation from various possible locations
      if (properties.ele !== undefined) {
        elevation = parseFloat(properties.ele);
      } else if (Array.isArray(coord) && coord.length >= 3) {
        // Some GPX files include elevation in z-coordinate
        elevation = coord[2];
      }

      // Get time from properties (if available)
      let time = null;
      if (properties.time) {
        time = new Date(properties.time);
      }

      trackPoints.push({
        index: trackPoints.length,
        coordinates: coord,           // [x, y] in EPSG:3857
        lon: lon,                      // Longitude in WGS84
        lat: lat,                      // Latitude in WGS84
        elevation: elevation || null,  // Elevation in meters
        time: time,                    // Timestamp
        speed: null,                   // Speed in m/s (calculated later)
        distance: 0                    // Cumulative distance (calculated later)
      });
    }
  }

  // Calculate cumulative distance and speed
  calculateDistanceAndSpeed(trackPoints);

  return trackPoints;
}

/**
 * Convert EPSG:3857 coordinates to lon/lat (EPSG:4326)
 * @param {number[]} coord - [x, y] in EPSG:3857
 * @returns {number[]} [lon, lat] in EPSG:4326
 */
function toLonLat(coord) {
  return olToLonLat(coord, 'EPSG:3857');
}

/**
 * Calculate cumulative distance and speed for track points
 * @param {TrackPoint[]} trackPoints
 */
function calculateDistanceAndSpeed(trackPoints) {
  if (trackPoints.length === 0) return;

  let cumulativeDistance = 0;

  for (let i = 0; i < trackPoints.length; i++) {
    const point = trackPoints[i];
    point.distance = cumulativeDistance;

    if (i > 0) {
      const prevPoint = trackPoints[i - 1];

      // Calculate distance between points using Haversine formula
      const segmentDistance = calculateHaversineDistance(
        prevPoint.lat, prevPoint.lon,
        point.lat, point.lon
      );
      cumulativeDistance += segmentDistance;

      // Calculate speed if we have time data
      if (point.time && prevPoint.time) {
        const timeDiff = (point.time - prevPoint.time) / 1000; // seconds
        if (timeDiff > 0) {
          point.speed = segmentDistance / timeDiff; // m/s
        }
      }
    }
  }
}

/**
 * Calculate distance between two points using Haversine formula
 * @param {number} lat1 - Latitude of first point (degrees)
 * @param {number} lon1 - Longitude of first point (degrees)
 * @param {number} lat2 - Latitude of second point (degrees)
 * @param {number} lon2 - Longitude of second point (degrees)
 * @returns {number} Distance in meters
 */
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Generate unique ID for a GPX file
 * @param {File} file
 * @returns {string}
 */
export function generateGpxFileId(file) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const sanitizedName = file.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  return `gpx-${sanitizedName}-${timestamp}-${random}`;
}

/**
 * Check if GPX file has elevation data
 * @param {TrackPoint[]} trackData
 * @returns {boolean}
 */
export function hasElevationData(trackData) {
  return trackData.some(p => p.elevation !== null && p.elevation !== undefined);
}

/**
 * Check if GPX file has time data
 * @param {TrackPoint[]} trackData
 * @returns {boolean}
 */
export function hasTimeData(trackData) {
  return trackData.some(p => p.time !== null && p.time !== undefined);
}

/**
 * Check if GPX file has speed data
 * @param {TrackPoint[]} trackData
 * @returns {boolean}
 */
export function hasSpeedData(trackData) {
  return trackData.some(p => p.speed !== null && p.speed !== undefined && p.speed > 0);
}

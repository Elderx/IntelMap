/**
 * Weather Stations Module
 * Fetches observation data from FMI WFS API
 */

import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import { Style, Circle, Fill, Stroke, Text } from 'ol/style.js';
import { fromLonLat } from 'ol/proj.js';
import { FMI_CONFIG } from '../config/constants.js';
import { state } from '../state/store.js';

/**
 * Fetch weather station observations from FMI WFS
 * @param {Array} bbox - [minLon, minLat, maxLon, maxLat] in WGS84
 * @returns {Promise<Array>} Array of station observations
 */
export async function fetchWeatherStations(bbox) {
  const [minLon, minLat, maxLon, maxLat] = bbox;

  // Calculate start time 20 minutes ago
  const now = new Date();
  const twentyMinsAgo = new Date(now.getTime() - 20 * 60000).toISOString();

  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'getFeature',
    storedquery_id: 'fmi::observations::weather::simple',
    bbox: `${minLon},${minLat},${maxLon},${maxLat}`,
    parameters: 't2m,ws_10min,r_1h',
    starttime: twentyMinsAgo,
    crs: 'EPSG:4326'
  });

  const url = `${FMI_CONFIG.wfsBaseUrl}?${params.toString()}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`FMI WFS request failed: ${response.status} ${response.statusText}`);
    }

    const xmlText = await response.text();
    return parseFmiXml(xmlText);
  } catch (error) {
    console.error('[Weather] Failed to fetch station data:', error);
    throw error;
  }
}

/**
 * Parse FMI WFS simple XML response
 * @param {string} xmlText - XML response from FMI
 * @returns {Array} Array of station observation objects
 */
function parseFmiXml(xmlText) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

  const stationMap = new Map();
  const featureMembers = xmlDoc.getElementsByTagName('wfs:member');

  for (let i = 0; i < featureMembers.length; i++) {
    const featureMember = featureMembers[i];
    const bsWfsElem = featureMember.getElementsByTagName('BsWfs:BsWfsElement')[0];

    if (!bsWfsElem) continue;

    // Extract location (lat, lon - note order!)
    const locationElem = bsWfsElem.getElementsByTagName('BsWfs:Location')[0];
    if (!locationElem) continue;

    const pointElem = locationElem.getElementsByTagName('gml:Point')[0];
    if (!pointElem) continue;

    const posElem = pointElem.getElementsByTagName('gml:pos')[0];
    if (!posElem) continue;

    const coords = posElem.textContent.trim().split(/\s+/);
    if (coords.length < 2) continue;

    const latitude = parseFloat(coords[0]);
    const longitude = parseFloat(coords[1]);

    if (isNaN(latitude) || isNaN(longitude)) continue;

    // Create unique key for this location
    const locationKey = `${latitude.toFixed(4)}_${longitude.toFixed(4)}`;

    // Extract parameter and value
    const paramName = bsWfsElem.getElementsByTagName('BsWfs:ParameterName')[0]?.textContent;
    const paramValue = bsWfsElem.getElementsByTagName('BsWfs:ParameterValue')[0]?.textContent;

    if (!paramName || !paramValue) continue;

    // Convert value to number
    const value = parseFloat(paramValue);
    if (isNaN(value)) continue;

    // Initialize station if not exists
    if (!stationMap.has(locationKey)) {
      stationMap.set(locationKey, {
        location: [longitude, latitude], // lon, lat order for OpenLayers
        temperature: null,
        windSpeed: null,
        precipitation: null,
        timestamp: new Date().toISOString()
      });
    }

    // Assign value to correct parameter
    const station = stationMap.get(locationKey);
    if (paramName === 't2m') {
      station.temperature = value;
    } else if (paramName === 'ws_10min') {
      station.windSpeed = value;
    } else if (paramName === 'r_1h') {
      station.precipitation = value;
    }
  }

  // Convert map to array and generate station names
  return Array.from(stationMap.values()).map((station, index) => ({
    ...station,
    stationId: `station-${index}`,
    name: `Weather Station ${index + 1}`
  }));
}

/**
 * Convert station observation to OpenLayers Feature
 * @param {Object} station - Station observation object
 * @returns {Feature|null} OpenLayers Feature or null if invalid
 */
export function stationToFeature(station) {
  const { location, temperature, windSpeed, precipitation, name, stationId } = station;

  if (!location || location.length !== 2) return null;

  const coord = fromLonLat(location, 'EPSG:3857');

  const feature = new Feature({
    geometry: new Point(coord),
    stationId: stationId || name,
    name,
    temperature: temperature ?? null,
    windSpeed: windSpeed ?? null,
    precipitation: precipitation ?? null
  });

  // Set style based on current state
  setFeatureStyle(feature, temperature);

  return feature;
}

/**
 * Set style for a weather station feature
 * @param {Feature} feature - OpenLayers Feature
 * @param {number|null} temperature - Temperature in Celsius
 */
function setFeatureStyle(feature, temperature) {
  const showCircles = state.weatherCirclesVisible;
  const textSize = state.weatherTextSize;

  const styleConfig = {
    text: temperature !== null ? new Text({
      text: Math.round(temperature).toString() + '°',
      font: `${textSize}px sans-serif`,
      fill: new Fill({ color: '#fff' }),
      stroke: new Stroke({ color: '#000', width: 2 })
    }) : undefined
  };

  // Only add circle image if toggle is enabled
  if (showCircles) {
    styleConfig.image = new Circle({
      radius: 12,
      fill: new Fill({ color: getTemperatureColor(temperature ?? null) }),
      stroke: new Stroke({ color: '#000', width: 1 })
    });
  }

  feature.setStyle(new Style(styleConfig));
}

/**
 * Update all weather station feature styles
 * Called when circles visibility toggle changes
 */
export function updateWeatherStationStyles() {
  if (!state.weatherStationFeatures || state.weatherStationFeatures.length === 0) return;

  state.weatherStationFeatures.forEach(feature => {
    const temperature = feature.get('temperature');
    setFeatureStyle(feature, temperature);
  });

  console.log(`[Weather] Updated styles for ${state.weatherStationFeatures.length} stations (circles: ${state.weatherCirclesVisible ? 'visible' : 'hidden'})`);
}

/**
 * Get color based on temperature
 * @param {number|null} temp - Temperature in Celsius
 * @returns {string} Color hex code
 */
function getTemperatureColor(temp) {
  if (temp === null) return '#999999'; // Gray (no data)
  if (temp > 20) return '#F44336'; // Red (hot)
  if (temp > 10) return '#FF9800'; // Orange (warm)
  if (temp > 0) return '#4CAF50'; // Green (mild)
  return '#2196F3'; // Blue (cold)
}

/**
 * Weather Stations Module
 * Fetches observation data from FMI WFS API
 */

import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import { Style, Circle, Fill, Stroke, Text } from 'ol/style.js';
import { fromLonLat } from 'ol/proj.js';
import { FMI_CONFIG } from '../config/constants.js';

/**
 * Fetch weather station observations from FMI WFS
 * @param {Array} bbox - [minLon, minLat, maxLon, maxLat] in WGS84
 * @returns {Promise<Array>} Array of station observations
 */
export async function fetchWeatherStations(bbox) {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const params = new URLSearchParams({
    request: 'getFeature',
    storedquery_id: FMI_CONFIG.storedQueryId,
    crs: 'EPSG:4326',
    bbox: `${minLon},${minLat},${maxLon},${maxLat},EPSG:4326`
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
 * Parse FMI WFS XML response to extract station observations
 * @param {string} xmlText - XML response from FMI
 * @returns {Array} Array of station observation objects
 */
function parseFmiXml(xmlText) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

  const stations = [];
  const observationFeatures = xmlDoc.getElementsByTagName('wfs:member');

  for (let i = 0; i < observationFeatures.length; i++) {
    const feature = observationFeatures[i];
    const stationElem = feature.getElementsByTagName('omso:StationTimeSeriesObservation')[0];

    if (!stationElem) continue;

    // Extract station ID
    const stationIdElem = stationElem.getElementsByTagName('target:StationName')[0];
    const stationId = stationIdElem?.textContent;

    // Extract station name
    const nameElem = stationElem.getElementsByTagName('gml:identifier')[0];
    const name = nameElem?.textContent || stationId || 'Unknown Station';

    // Extract location
    const posElem = stationElem.getElementsByTagName('gml:pos')[0];
    const position = posElem?.textContent?.split(' ').map(Number).reverse(); // lon, lat

    if (!position || position.length !== 2) continue;

    // Extract observation data
    const resultElem = stationElem.getElementsByTagName('wml2:MeasurementTVP')[0];
    const valueElem = resultElem?.getElementsByTagName('wml2:value')[0];
    const value = valueElem?.textContent ? parseFloat(valueElem.textContent) : null;

    // Determine observation type from parameter name
    const parameterElem = stationElem.getElementsByTagName('wml2:parameter')[0];
    const parameter = parameterElem?.getAttribute('xlink:href')?.split(':').pop() || 'temperature';

    stations.push({
      stationId,
      name,
      location: position,
      [parameter]: value,
      timestamp: new Date().toISOString()
    });
  }

  // Combine multiple observations for same station
  return combineStationObservations(stations);
}

/**
 * Combine multiple observation types for each station
 * @param {Array} observations - Array of individual observations
 * @returns {Array} Array of stations with combined observations
 */
function combineStationObservations(observations) {
  const stationMap = new Map();

  observations.forEach(obs => {
    const { stationId, name, location, timestamp } = obs;
    const key = stationId || name;

    if (!stationMap.has(key)) {
      stationMap.set(key, {
        stationId,
        name,
        location,
        temperature: null,
        windSpeed: null,
        windDirection: null,
        precipitation: null,
        timestamp
      });
    }

    const station = stationMap.get(key);

    // Merge observation values
    if (obs.temperature !== undefined) station.temperature = obs.temperature;
    if (obs.windSpeed !== undefined) station.windSpeed = obs.windSpeed;
    if (obs.windDirection !== undefined) station.windDirection = obs.windDirection;
    if (obs.precipitation !== undefined) station.precipitation = obs.precipitation;
  });

  return Array.from(stationMap.values());
}

/**
 * Get station icon SVG based on temperature
 * @param {number|null} temperature - Temperature in Celsius
 * @returns {string} SVG data URI
 */
function getStationIconPath(temperature) {
  const temp = temperature ?? 0;
  let color = '#2196F3'; // Blue (cold)

  if (temp > 20) color = '#F44336'; // Red (hot)
  else if (temp > 10) color = '#FF9800'; // Orange (warm)
  else if (temp > 0) color = '#4CAF50'; // Green (mild)

  const svg = `
    <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" fill="${color}" stroke="#000" stroke-width="0.5"/>
      <text x="12" y="16" font-size="10" text-anchor="middle" fill="#fff" font-weight="bold">
        ${Math.round(temp)}°
      </text>
    </svg>
  `;

  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
}

/**
 * Convert station observation to OpenLayers Feature
 * @param {Object} station - Station observation object
 * @returns {Feature|null} OpenLayers Feature or null if invalid
 */
export function stationToFeature(station) {
  const { location, temperature, windSpeed, windDirection, name, stationId } = station;

  if (!location || location.length !== 2) return null;

  const coord = fromLonLat(location, 'EPSG:3857');

  const feature = new Feature({
    geometry: new Point(coord),
    stationId: stationId || name,
    name,
    temperature: temperature ?? null,
    windSpeed: windSpeed ?? null,
    windDirection: windDirection ?? null
  });

  // Set style
  feature.setStyle(new Style({
    image: new Circle({
      radius: 12,
      fill: new Fill({ color: getTemperatureColor(temperature ?? 0) }),
      stroke: new Stroke({ color: '#000', width: 1 })
    }),
    text: temperature !== null ? new Text({
      text: Math.round(temperature).toString(),
      font: '10px sans-serif',
      fill: new Fill({ color: '#fff' }),
      stroke: new Stroke({ color: '#000', width: 2 })
    }) : undefined
  }));

  return feature;
}

/**
 * Get color based on temperature
 * @param {number} temp - Temperature in Celsius
 * @returns {string} Color hex code
 */
function getTemperatureColor(temp) {
  if (temp > 20) return '#F44336'; // Red
  if (temp > 10) return '#FF9800'; // Orange
  if (temp > 0) return '#4CAF50'; // Green
  return '#2196F3'; // Blue
}

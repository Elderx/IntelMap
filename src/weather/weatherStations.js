/**
 * Weather Stations Module
 * Fetches observation data from FMI WFS API
 */

import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import { Style, Circle, Fill, Stroke, Text, Icon } from 'ol/style.js';
import { fromLonLat } from 'ol/proj.js';
import { FMI_CONFIG } from '../config/constants.js';
import { state } from '../state/store.js';

/**
 * Create an arrow icon on canvas
 * @param {string} color - Fill color
 * @param {number} size - Arrow size in pixels
 * @returns {string} Data URL of the arrow image
 */
function createArrowIcon(color, size) {
  const canvas = document.createElement('canvas');
  const canvasSize = size * 2;
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  const ctx = canvas.getContext('2d');

  // Center of canvas
  const cx = canvasSize / 2;
  const cy = canvasSize / 2;

  // Arrow pointing up (north)
  ctx.beginPath();
  ctx.moveTo(cx, cy - size); // Tip
  ctx.lineTo(cx - size * 0.6, cy + size * 0.6); // Left corner
  ctx.lineTo(cx - size * 0.3, cy + size * 0.3); // Inner left
  ctx.lineTo(cx, cy + size * 0.8); // Bottom center (notch)
  ctx.lineTo(cx + size * 0.3, cy + size * 0.3); // Inner right
  ctx.lineTo(cx + size * 0.6, cy + size * 0.6); // Right corner
  ctx.closePath();

  // Fill
  ctx.fillStyle = color;
  ctx.fill();

  // Stroke
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.stroke();

  return canvas.toDataURL();
}

/**
 * Fetch weather station observations from FMI WFS
 * @param {Array} bbox - [minLon, minLat, maxLon, maxLat] in WGS84
 * @param {Object} options - Options for fetching
 * @param {number} options.hoursBack - Hours of historical data to fetch (default: 12)
 * @returns {Promise<Array>} Array of station observations
 */
export async function fetchWeatherStations(bbox, options = {}) {
  const { hoursBack = 12 } = options;
  const [minLon, minLat, maxLon, maxLat] = bbox;

  // Calculate start time (N hours ago)
  const now = new Date();
  const startTime = new Date(now.getTime() - hoursBack * 60 * 60 * 1000).toISOString();
  const endTime = now.toISOString();

  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'getFeature',
    storedquery_id: 'fmi::observations::weather::simple',
    bbox: `${minLon},${minLat},${maxLon},${maxLat}`,
    parameters: 't2m,ws_10min,wd_10min,r_1h,rh,snow_aws,p_sea',
    starttime: startTime,
    endtime: endTime,
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
 * Parse FMI WFS simple XML response with time series support
 * @param {string} xmlText - XML response from FMI
 * @returns {Object} Object containing timeSteps array and current observations
 */
function parseFmiXml(xmlText) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

  // Round time to nearest 5 minutes (for time step grouping)
  function roundTo5Minutes(date) {
    const rounded = new Date(date);
    rounded.setSeconds(0);
    rounded.setMilliseconds(0);
    rounded.setMinutes(Math.floor(rounded.getMinutes() / 5) * 5);
    return rounded;
  }

  // Structure: timeStepsMap<timestampStr, Array<observations>>
  const timeStepsMap = new Map();
  const stationMap = new Map(); // Latest observation per station (for current display)

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

    // Extract observation time
    const timeElem = bsWfsElem.getElementsByTagName('BsWfs:Time')[0];
    const observationTime = timeElem?.textContent ? new Date(timeElem.textContent) : new Date();

    // Extract parameter and value
    const paramName = bsWfsElem.getElementsByTagName('BsWfs:ParameterName')[0]?.textContent;
    const paramValue = bsWfsElem.getElementsByTagName('BsWfs:ParameterValue')[0]?.textContent;

    if (!paramName || !paramValue) continue;

    // Convert value to number
    const value = parseFloat(paramValue);
    if (isNaN(value)) continue;

    // Round time to 5-minute interval for time step grouping
    const roundedTime = roundTo5Minutes(observationTime);
    const timeKey = roundedTime.toISOString();

    // Initialize time step if not exists
    if (!timeStepsMap.has(timeKey)) {
      timeStepsMap.set(timeKey, []);
    }

    // Find or create observation for this station at this time step
    const timeStepObservations = timeStepsMap.get(timeKey);
    let obs = timeStepObservations.find(o => o.locationKey === locationKey);

    if (!obs) {
      obs = {
        locationKey,
        location: [longitude, latitude],
        temperature: null,
        windSpeed: null,
        windDirection: null,
        precipitation: null,
        humidity: null,
        snowDepth: null,
        pressure: null,
        timestamp: roundedTime
      };
      timeStepObservations.push(obs);
    }

    // Assign value to correct parameter
    if (paramName === 't2m') {
      obs.temperature = value;
    } else if (paramName === 'ws_10min') {
      obs.windSpeed = value;
    } else if (paramName === 'wd_10min') {
      obs.windDirection = value;
    } else if (paramName === 'r_1h') {
      obs.precipitation = value;
    } else if (paramName === 'rh') {
      obs.humidity = value;
    } else if (paramName === 'snow_aws') {
      obs.snowDepth = value;
    } else if (paramName === 'p_sea') {
      obs.pressure = value;
    }

    // Update latest observation for this station (for current display)
    if (!stationMap.has(locationKey) || observationTime > stationMap.get(locationKey).timestamp) {
      stationMap.set(locationKey, { ...obs, timestamp: observationTime });
    }
  }

  // Convert timeStepsMap to sorted array of Dates
  const timeSteps = Array.from(timeStepsMap.keys())
    .map(k => new Date(k))
    .sort((a, b) => a - b);

  // Store time series data globally
  if (typeof window !== 'undefined') {
    window._weatherTimeSteps = timeSteps;
    window._weatherTimeSeriesMap = timeStepsMap;
  }

  // Return current observations (most recent time step)
  const latestTimeKey = timeSteps.length > 0 ? timeSteps[timeSteps.length - 1].toISOString() : null;
  const currentObservations = latestTimeKey ? timeStepsMap.get(latestTimeKey) || [] : [];

  // Convert to array and generate station names
  return Array.from(currentObservations).map((obs, index) => ({
    ...obs,
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
  const { location, temperature, windSpeed, windDirection, precipitation, humidity, snowDepth, pressure, name, stationId } = station;

  if (!location || location.length !== 2) return null;

  const coord = fromLonLat(location, 'EPSG:3857');

  const feature = new Feature({
    geometry: new Point(coord),
    stationId: stationId || name,
    name,
    temperature: temperature ?? null,
    windSpeed: windSpeed ?? null,
    windDirection: windDirection ?? null,
    precipitation: precipitation ?? null,
    humidity: humidity ?? null,
    snowDepth: snowDepth ?? null,
    pressure: pressure ?? null
  });

  // Set style based on current state
  setFeatureStyle(feature, temperature, windSpeed, windDirection, humidity, snowDepth, pressure);

  return feature;
}

/**
 * Set style for a weather station feature
 * @param {Feature} feature - OpenLayers Feature
 * @param {number|null} temperature - Temperature in Celsius
 * @param {number|null} windSpeed - Wind speed in m/s
 * @param {number|null} windDirection - Wind direction in degrees (0-360, where 0=N)
 */
function setFeatureStyle(feature, temperature, windSpeed, windDirection, humidity, snowDepth, pressure) {
  const showTemp = state.weatherShowTemperature;
  const showWind = state.weatherShowWind;
  const showHumidity = state.weatherShowHumidity;
  const showSnowDepth = state.weatherShowSnowDepth;
  const showPressure = state.weatherShowPressure;
  const showCircles = state.weatherCirclesVisible;
  const textSize = state.weatherTextSize;

  const styleConfig = {};

  // Build text based on what's displayed
  let textLines = [];
  let offsetY = 0;
  const arrowSize = state.weatherArrowSize;
  let lineCount = 0;

  // Wind arrow (if showing wind)
  if (showWind && windSpeed !== null) {
    const arrowColor = getWindSpeedColor(windSpeed);
    // Wind direction is where wind comes FROM, but arrow points where it's going TO
    // So we add 180° to flip the direction
    const rotation = windDirection !== null
      ? ((windDirection + 180) * Math.PI) / 180
      : 0;

    styleConfig.image = new Icon({
      src: createArrowIcon(arrowColor, arrowSize),
      anchor: [0.5, 0.5],
      rotation: rotation
    });

    // Add wind speed text with "m/s" unit
    textLines.push(`${windSpeed.toFixed(1)} m/s`);
    offsetY = arrowSize + textSize / 2;
    lineCount++;
  }

  // Temperature text (if showing temperature)
  if (showTemp && temperature !== null) {
    textLines.push(temperature.toFixed(1) + '°');
    if (lineCount === 0) {
      offsetY = 0; // First line
    } else {
      offsetY = arrowSize + textSize * (lineCount + 1) / 2; // Below arrow
    }
    lineCount++;
  }

  // Humidity text (if showing humidity)
  if (showHumidity && humidity !== null) {
    textLines.push(`${humidity.toFixed(1)}% RH`);
    if (lineCount === 0) {
      offsetY = 0; // First line
    } else {
      offsetY = arrowSize + textSize * (lineCount + 1) / 2; // Below previous
    }
    lineCount++;
  }

  // Snow depth text (if showing snow depth)
  if (showSnowDepth && snowDepth !== null) {
    textLines.push(`${snowDepth.toFixed(1)} cm`);
    if (lineCount === 0) {
      offsetY = 0; // First line
    } else {
      offsetY = arrowSize + textSize * (lineCount + 1) / 2; // Below previous
    }
    lineCount++;
  }

  // Pressure text (if showing pressure)
  if (showPressure && pressure !== null) {
    textLines.push(`${pressure.toFixed(1)} hPa`);
    if (lineCount === 0) {
      offsetY = 0; // First line
    } else {
      offsetY = arrowSize + textSize * (lineCount + 1) / 2; // Below previous
    }
    lineCount++;
  }

  // Apply text if we have any
  if (textLines.length > 0) {
    styleConfig.text = new Text({
      text: textLines.join('\n'),
      font: `bold ${textSize}px sans-serif`,
      fill: new Fill({ color: '#fff' }),
      stroke: new Stroke({ color: '#000', width: 2 }),
      offsetY: offsetY
    });
  }

  // Add circles for temperature-only mode
  if (showTemp && !showWind && temperature !== null && showCircles) {
    styleConfig.image = new Circle({
      radius: 12,
      fill: new Fill({ color: getTemperatureColor(temperature) }),
      stroke: new Stroke({ color: '#000', width: 1 })
    });
  }

  feature.setStyle(new Style(styleConfig));
}

/**
 * Update all weather station feature styles
 * Called when display settings change
 */
export function updateWeatherStationStyles() {
  if (!state.weatherStationFeatures || state.weatherStationFeatures.length === 0) return;

  state.weatherStationFeatures.forEach(feature => {
    const temperature = feature.get('temperature');
    const windSpeed = feature.get('windSpeed');
    const windDirection = feature.get('windDirection');
    const humidity = feature.get('humidity');
    const snowDepth = feature.get('snowDepth');
    const pressure = feature.get('pressure');
    setFeatureStyle(feature, temperature, windSpeed, windDirection, humidity, snowDepth, pressure);
  });

  const showTemp = state.weatherShowTemperature ? 'temp' : '';
  const showWind = state.weatherShowWind ? 'wind' : '';
  const showHumidity = state.weatherShowHumidity ? 'humidity' : '';
  const showSnowDepth = state.weatherShowSnowDepth ? 'snow' : '';
  const showPressure = state.weatherShowPressure ? 'pressure' : '';
  console.log(`[Weather] Updated styles for ${state.weatherStationFeatures.length} stations (showing: ${showTemp} ${showWind} ${showHumidity} ${showSnowDepth} ${showPressure})`);
}

/**
 * Get color based on wind speed
 * @param {number} speed - Wind speed in m/s
 * @returns {string} Color hex code
 */
function getWindSpeedColor(speed) {
  if (speed < 3) return '#4CAF50'; // Green - calm
  if (speed < 8) return '#FFC107'; // Amber - moderate
  if (speed < 14) return '#FF9800'; // Orange - fresh
  return '#F44336'; // Red - strong/gale
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

// ===== Time Series Management =====

/**
 * Get weather time steps
 * @returns {Array<Date>} Array of available time steps
 */
export function getWeatherTimeSteps() {
  if (typeof window !== 'undefined' && window._weatherTimeSteps) {
    return window._weatherTimeSteps;
  }
  return [];
}

/**
 * Get current weather time index
 * @returns {number} Current time index
 */
export function getCurrentWeatherTimeIndex() {
  const timeSteps = getWeatherTimeSteps();
  if (timeSteps.length === 0) return 0;
  return timeSteps.length - 1; // Default to latest
}

/**
 * Set weather observations for a specific time index
 * @param {number} index - Time step index
 */
export function setWeatherTimeByIndex(index) {
  const timeSteps = getWeatherTimeSteps();
  if (!timeSteps || index < 0 || index >= timeSteps.length) return;

  const targetTime = timeSteps[index];

  // Get all unique station locations across all time steps
  const timeSeriesMap = typeof window !== 'undefined' ? window._weatherTimeSeriesMap : null;
  if (!timeSeriesMap) {
    console.warn('[Weather] No time series data available');
    return;
  }

  // Build a map of all station locations and their latest available data before/at target time
  const stationDataMap = new Map();
  const allLocationKeys = new Set();

  // First pass: collect all location keys and their data across all time steps
  for (const [timeKey, observations] of timeSeriesMap.entries()) {
    const stepTime = new Date(timeKey);
    // Only consider time steps up to and including the target time
    if (stepTime > targetTime) continue;

    observations.forEach(obs => {
      allLocationKeys.add(obs.locationKey);

      if (!stationDataMap.has(obs.locationKey)) {
        // First time seeing this station - store data
        stationDataMap.set(obs.locationKey, {
          locationKey: obs.locationKey,
          location: obs.location,
          temperature: obs.temperature,
          windSpeed: obs.windSpeed,
          windDirection: obs.windDirection,
          precipitation: obs.precipitation,
          humidity: obs.humidity,
          snowDepth: obs.snowDepth,
          pressure: obs.pressure,
          timestamp: obs.timestamp
        });
      } else {
        // Station exists - update data if this observation is more recent
        const existing = stationDataMap.get(obs.locationKey);
        if (obs.timestamp > existing.timestamp) {
          stationDataMap.set(obs.locationKey, {
            locationKey: obs.locationKey,
            location: obs.location,
            temperature: obs.temperature ?? existing.temperature,
            windSpeed: obs.windSpeed ?? existing.windSpeed,
            windDirection: obs.windDirection ?? existing.windDirection,
            precipitation: obs.precipitation ?? existing.precipitation,
            humidity: obs.humidity ?? existing.humidity,
            snowDepth: obs.snowDepth ?? existing.snowDepth,
            pressure: obs.pressure ?? existing.pressure,
            timestamp: obs.timestamp
          });
        }
      }
    });
  }

  // Convert map to array and create features
  const newFeatures = [];
  let idx = 0;
  for (const [locationKey, obs] of stationDataMap) {
    const feature = stationToFeature({
      ...obs,
      stationId: locationKey || `station-${idx}`,
      name: `Weather Station ${idx + 1}`
    });
    if (feature) {
      newFeatures.push(feature);
    }
    idx++;
  }

  // Update features in state
  state.weatherStationFeatures = newFeatures;
  state.weatherCurrentTimeIndex = index;

  // Update layers
  ['main', 'left', 'right'].forEach(key => {
    const layer = state.weatherStationLayer[key];
    if (layer) {
      // Clear existing features
      layer.getSource()?.clear();
      // Add new features
      layer.getSource()?.addFeatures(newFeatures);
    }
  });

  // Update time display
  updateWeatherTimeDisplay();

  console.log(`[Weather] Set time to index ${index} (${targetTime.toISOString()}) - showing ${newFeatures.length} stations`);
}

/**
 * Update weather time display in UI
 */
function updateWeatherTimeDisplay() {
  // Use unified time bar instead of separate weather display
  import('../ui/headerLayerManager.js').then(({ updateUnifiedTimeDisplay }) => {
    updateUnifiedTimeDisplay();
  });
}

/**
 * Get current weather time
 * @returns {Date|null} Current selected time
 */
export function getCurrentWeatherTime() {
  const timeSteps = getWeatherTimeSteps();
  const index = state.weatherCurrentTimeIndex ?? (timeSteps.length - 1);
  return timeSteps[index] || null;
}

// ===== Weather Animation =====

let weatherAnimationId = null;
let weatherFrameRate = 2; // frames per second

/**
 * Start weather animation
 */
export function startWeatherAnimation() {
  stopWeatherAnimation();

  weatherAnimationId = setInterval(() => {
    const timeSteps = getWeatherTimeSteps();
    const currentIndex = state.weatherCurrentTimeIndex ?? (timeSteps.length - 1);

    if (timeSteps.length === 0) return;

    let nextIndex = currentIndex + 1;
    if (nextIndex >= timeSteps.length) {
      nextIndex = 0; // Loop back to start
    }

    setWeatherTimeByIndex(nextIndex);
  }, 1000 / weatherFrameRate);

  state.weatherAnimating = true;

  // Update play/pause button (unified bar)
  const playBtn = document.getElementById('unified-play-btn');
  const pauseBtn = document.getElementById('unified-pause-btn');
  if (playBtn) playBtn.style.display = 'none';
  if (pauseBtn) pauseBtn.style.display = 'inline-block';

  console.log('[Weather] Animation started');
}

/**
 * Stop weather animation
 */
export function stopWeatherAnimation() {
  if (weatherAnimationId) {
    clearInterval(weatherAnimationId);
    weatherAnimationId = null;
  }
  state.weatherAnimating = false;

  // Update play/pause buttons (unified bar)
  const playBtn = document.getElementById('unified-play-btn');
  const pauseBtn = document.getElementById('unified-pause-btn');
  if (playBtn) playBtn.style.display = 'inline-block';
  if (pauseBtn) pauseBtn.style.display = 'none';

  console.log('[Weather] Animation stopped');
}

/**
 * Set weather animation speed
 * @param {number} fps - Frames per second
 */
export function setWeatherAnimationSpeed(fps) {
  weatherFrameRate = Math.max(0.1, Math.min(10, fps));
  state.weatherAnimationSpeed = weatherFrameRate;

  // Restart animation if running
  if (state.weatherAnimating) {
    startWeatherAnimation();
  }

  console.log(`[Weather] Speed set to ${weatherFrameRate} fps`);
}


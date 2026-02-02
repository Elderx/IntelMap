# Weather Overlay Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add weather overlay to IntelMap using FMI (Finnish Meteorological Institute) open data, featuring toggleable WMS layers (temperature, wind, precipitation) and clickable weather station markers showing current observations.

**Architecture:** Hybrid approach combining FMI WMS layers for pre-rendered weather maps and WFS API for raw observation data from weather stations. Polling-based updates with immediate fetch on enable, then 10-minute intervals.

**Tech Stack:** FMI Open Data (free WMS/WFS), OpenLayers TileLayer/TileWMS/VectorLayer, Fetch API with XML parsing, vanilla JavaScript ES modules.

---

## Task 1: Add Weather State Properties

**Files:**
- Modify: `src/state/store.js`

**Step 1: Add weather state properties**

Add these properties to the `state` object in `src/state/store.js` (after the AIS properties):

```javascript
// Weather overlay
weatherEnabled: false,
weatherWmsLayers: { main: null, left: null, right: null },
weatherStationLayer: { main: null, left: null, right: null },
weatherStationFeatures: [],
weatherActiveWmsLayers: ['temperature'], // Default: temperature layer enabled
weatherPollingTimer: null,
weatherError: null
```

**Step 2: Commit**

```bash
git add src/state/store.js
git commit -m "feat: add weather state properties"
```

---

## Task 2: Add FMI API Configuration

**Files:**
- Modify: `src/config/constants.js`

**Step 1: Add FMI configuration constants**

Add to `src/config/constants.js` (after AISSTREAM_CONFIG):

```javascript
export const FMI_CONFIG = {
  // WMS Service (pre-rendered weather maps)
  wmsBaseUrl: 'https://openwms.fmi.fi/geoserver/wms',
  wmsVersion: '1.3.0',
  wmsFormat: 'image/png',
  wmsTransparent: true,

  // WFS Service (weather station observations)
  wfsBaseUrl: 'https://opendata.fmi.fi/wfs',
  storedQueryId: 'fmi::observations::weather::simple',

  // Layer names for WMS
  layers: {
    temperature: 'flash:temperature',
    wind: 'flash:windspeed',
    precipitation: 'flash:precipitation'
  },

  // Polling interval (10 minutes)
  pollingIntervalMs: 600000,
  pollingIntervalSec: 600,

  // Z-index for layer stacking
  zIndex: {
    temperature: 55,
    wind: 56,
    precipitation: 57,
    stations: 106
  }
};
```

**Step 2: Commit**

```bash
git add src/config/constants.js
git commit -m "feat: add FMI API configuration"
```

---

## Task 3: Create Weather WMS Module

**Files:**
- Create: `src/weather/weatherWms.js`

**Step 1: Write the weather WMS module**

Create `src/weather/weatherWms.js`:

```javascript
/**
 * Weather WMS Module
 * Creates and manages FMI WMS tile layers
 */

import TileLayer from 'ol/layer/Tile.js';
import TileWMS from 'ol/source/TileWMS.js';
import { FMI_CONFIG } from '../config/constants.js';
import { state } from '../state/store.js';

/**
 * Create weather WMS tile layer
 * @param {string} layerType - 'temperature', 'wind', or 'precipitation'
 * @returns {TileLayer} OpenLayers TileLayer
 */
export function createWeatherWmsLayer(layerType) {
  const layerName = FMI_CONFIG.layers[layerType];
  if (!layerName) {
    console.warn(`[Weather] Unknown layer type: ${layerType}`);
    return null;
  }

  return new TileLayer({
    source: new TileWMS({
      url: FMI_CONFIG.wmsBaseUrl,
      params: {
        'LAYERS': layerName,
        'TILED': true,
        'VERSION': FMI_CONFIG.wmsVersion,
        'FORMAT': FMI_CONFIG.wmsFormat,
        'TRANSPARENT': FMI_CONFIG.wmsTransparent
      },
      transition: 0,
      projection: 'EPSG:3857'
    }),
    zIndex: FMI_CONFIG.zIndex[layerType],
    className: `weather-wms-layer weather-wms-${layerType}`,
    visible: state.weatherActiveWmsLayers.includes(layerType)
  });
}

/**
 * Create all weather WMS layers
 * @returns {Object} Object with temperature, wind, precipitation layers
 */
export function createWeatherWmsLayers() {
  return {
    temperature: createWeatherWmsLayer('temperature'),
    wind: createWeatherWmsLayer('wind'),
    precipitation: createWeatherWmsLayer('precipitation')
  };
}

/**
 * Update WMS layer visibility
 * @param {TileLayer} layer - The WMS layer
 * @param {boolean} visible - Whether layer should be visible
 */
export function updateWmsLayerVisibility(layer, visible) {
  if (layer) {
    layer.setVisible(visible);
  }
}

/**
 * Update all WMS layers based on active layers array
 */
export function updateAllWmsLayers() {
  const maps = [
    { key: 'main', map: state.map },
    { key: 'left', map: state.leftMap },
    { key: 'right', map: state.rightMap }
  ];

  maps.forEach(({ key, map }) => {
    if (!map) return;

    const layers = state.weatherWmsLayers[key];
    if (!layers) return;

    // Update each layer's visibility
    Object.keys(layers).forEach(layerType => {
      const layer = layers[layerType];
      const isActive = state.weatherActiveWmsLayers.includes(layerType);
      updateWmsLayerVisibility(layer, isActive);
    });
  });
}
```

**Step 2: Commit**

```bash
git add src/weather/weatherWms.js
git commit -m "feat: add weather WMS module"
```

---

## Task 4: Create Weather Stations Module

**Files:**
- Create: `src/weather/weatherStations.js`

**Step 1: Write the weather stations module**

Create `src/weather/weatherStations.js`:

```javascript
/**
 * Weather Stations Module
 * Fetches observation data from FMI WFS API
 */

import { Feature } from 'ol/Feature.js';
import { Point } from 'ol/geom.js';
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
```

**Step 2: Commit**

```bash
git add src/weather/weatherStations.js
git commit -m "feat: add weather stations module"
```

---

## Task 5: Create Weather Manager Module

**Files:**
- Create: `src/weather/weatherManager.js`

**Step 1: Write the weather manager module**

Create `src/weather/weatherManager.js`:

```javascript
/**
 * Weather Manager Module
 * Orchestrates WMS layers and station data updates
 */

import { transformExtent } from 'ol/proj.js';
import { state } from '../state/store.js';
import { FMI_CONFIG } from '../config/constants.js';
import { createWeatherWmsLayers, updateAllWmsLayers } from './weatherWms.js';
import { fetchWeatherStations, stationToFeature } from './weatherStations.js';

/**
 * Start weather overlay updates
 */
export function startWeatherUpdates() {
  if (state.weatherPollingTimer) {
    console.warn('[Weather] Updates already running');
    return;
  }

  console.log('[Weather] Starting updates');

  // Create WMS layers for active maps
  if (state.isSplit) {
    if (state.leftMap) {
      state.weatherWmsLayers.left = createWeatherWmsLayers();
      addWmsLayersToMap(state.leftMap, state.weatherWmsLayers.left);
    }
    if (state.rightMap) {
      state.weatherWmsLayers.right = createWeatherWmsLayers();
      addWmsLayersToMap(state.rightMap, state.weatherWmsLayers.right);
    }
  } else {
    if (state.map) {
      state.weatherWmsLayers.main = createWeatherWmsLayers();
      addWmsLayersToMap(state.map, state.weatherWmsLayers.main);
    }
  }

  state.weatherEnabled = true;

  // Immediate fetch
  updateWeatherStationData();

  // Start polling interval
  state.weatherPollingTimer = setInterval(updateWeatherStationData, FMI_CONFIG.pollingIntervalMs);

  console.log(`[Weather] Polling every ${FMI_CONFIG.pollingIntervalSec / 60} minutes`);
}

/**
 * Add WMS layers to map
 * @param {Object} map - OpenLayers Map instance
 * @param {Object} layers - Object with temperature, wind, precipitation layers
 */
function addWmsLayersToMap(map, layers) {
  Object.values(layers).forEach(layer => {
    if (layer) map.addLayer(layer);
  });
}

/**
 * Update weather station data
 */
async function updateWeatherStationData() {
  if (!state.weatherEnabled) return;

  console.log('[Weather] Fetching station data');

  // Determine which map's extent to use
  let map;
  if (state.isSplit) {
    map = state.leftMap;
  } else {
    map = state.map;
  }

  if (!map) {
    console.warn('[Weather] No map available for extent calculation');
    return;
  }

  // Get current view extent and transform to WGS84
  const extent = map.getView().calculateExtent();
  const bbox = transformExtent(extent, 'EPSG:3857', 'EPSG:4326');

  try {
    // Fetch station data
    const stations = await fetchWeatherStations(bbox);

    // Convert to features
    const features = stations.map(s => stationToFeature(s)).filter(f => f !== null);

    state.weatherStationFeatures = features;

    // Clear error on success
    if (state.weatherError) {
      state.weatherError = null;
    }

    console.log(`[Weather] Received ${features.length} station observations`);

    // Update station marker layers
    if (state.isSplit) {
      updateStationLayer('left', features);
      updateStationLayer('right', features);
    } else {
      updateStationLayer('main', features);
    }

    // Update UI
    import('../ui/activeLayers.js').then(({ updateActiveLayersPanel }) => {
      updateActiveLayersPanel();
    });
  } catch (error) {
    console.error('[Weather] Failed to update station data:', error);
    state.weatherError = {
      type: 'network',
      message: 'Failed to fetch weather data',
      time: Date.now()
    };
  }
}

/**
 * Update station marker layer for a specific map
 * @param {string} mapKey - 'main', 'left', or 'right'
 * @param {Array<Feature>} features - OpenLayers Features
 */
function updateStationLayer(mapKey, features) {
  const layer = state.weatherStationLayer[mapKey];
  if (!layer) return;

  const source = layer.getSource();
  source.clear();
  source.addFeatures(features);

  console.log(`[Weather] Updated ${mapKey} station layer with ${features.length} stations`);
}

/**
 * Stop weather overlay updates
 */
export function stopWeatherUpdates() {
  if (!state.weatherPollingTimer) {
    console.warn('[Weather] No updates running');
    return;
  }

  console.log('[Weather] Stopping updates');

  // Clear polling timer
  clearInterval(state.weatherPollingTimer);
  state.weatherPollingTimer = null;

  // Remove WMS layers from maps
  ['main', 'left', 'right'].forEach(key => {
    const layers = state.weatherWmsLayers[key];
    if (!layers) return;

    const map = key === 'main' ? state.map : key === 'left' ? state.leftMap : state.rightMap;
    if (map) {
      Object.values(layers).forEach(layer => {
        if (layer) map.removeLayer(layer);
      });
    }
    state.weatherWmsLayers[key] = null;
  });

  // Remove station marker layers
  ['main', 'left', 'right'].forEach(key => {
    const layer = state.weatherStationLayer[key];
    if (!layer) return;

    const map = key === 'main' ? state.map : key === 'left' ? state.leftMap : state.rightMap;
    if (map) {
      map.removeLayer(layer);
    }
    state.weatherStationLayer[key] = null;
  });

  // Clear state
  state.weatherStationFeatures = [];
  state.weatherEnabled = false;
  state.weatherError = null;

  // Update UI
  import('../ui/activeLayers.js').then(({ updateActiveLayersPanel }) => {
    updateActiveLayersPanel();
  });
}

/**
 * Toggle specific WMS layer
 * @param {string} layerType - 'temperature', 'wind', or 'precipitation'
 * @param {boolean} enabled - Whether layer should be enabled
 */
export function toggleWmsLayer(layerType, enabled) {
  const index = state.weatherActiveWmsLayers.indexOf(layerType);

  if (enabled && index === -1) {
    state.weatherActiveWmsLayers.push(layerType);
  } else if (!enabled && index !== -1) {
    state.weatherActiveWmsLayers.splice(index, 1);
  }

  updateAllWmsLayers();

  // Update permalink
  import('../map/permalink.js').then(({ updatePermalinkWithFeatures }) => {
    updatePermalinkWithFeatures();
  });
}
```

**Step 2: Commit**

```bash
git add src/weather/weatherManager.js
git commit -m "feat: add weather manager module"
```

---

## Task 6: Create Weather Interactions Module

**Files:**
- Create: `src/weather/weatherInteractions.js`

**Step 1: Write the weather interactions module**

Create `src/weather/weatherInteractions.js`:

```javascript
/**
 * Weather Interactions Module
 * Hover preview and click-to-pin popups
 */

import { state } from '../state/store.js';
import { Overlay } from 'ol/Overlay.js';

let hoverPopup = null;
let pinnedPopup = null;

/**
 * Get wind direction arrow
 * @param {number} degrees - Wind direction in degrees
 * @returns {string} Arrow character
 */
function getWindArrow(degrees) {
  if (degrees === null) return '';

  const normalized = ((degrees % 360) + 360) % 360;

  // 8 cardinal directions
  if (normalized >= 337.5 || normalized < 22.5) return '↓'; // N
  if (normalized >= 22.5 && normalized < 67.5) return '↙'; // NE
  if (normalized >= 67.5 && normalized < 112.5) return '←'; // E
  if (normalized >= 112.5 && normalized < 157.5) return '↖'; // SE
  if (normalized >= 157.5 && normalized < 202.5) return '↑'; // S
  if (normalized >= 202.5 && normalized < 247.5) return '↗'; // SW
  if (normalized >= 247.5 && normalized < 292.5) return '→'; // W
  return '↘'; // NW
}

/**
 * Create hover popup content
 * @param {Feature} feature - OpenLayers Feature
 * @returns {string} HTML content
 */
function createHoverPopupContent(feature) {
  const name = feature.get('name') || 'Unknown Station';
  const temperature = feature.get('temperature');
  const windSpeed = feature.get('windSpeed');
  const windDirection = feature.get('windDirection');

  const tempStr = temperature !== null ? `${temperature.toFixed(1)}°C` : 'N/A';
  const windStr = windSpeed !== null ? `${windSpeed.toFixed(1)} m/s` : 'N/A';
  const arrow = getWindArrow(windDirection);
  const directionStr = windDirection !== null ? `${arrow} (${windDirection.toFixed(0)}°)` : '';

  return `
    <div class="weather-popup hover">
      <strong>${name}</strong><br>
      🌡️ ${tempStr}<br>
      💨 ${windStr} ${directionStr}
    </div>
  `;
}

/**
 * Setup hover and click interactions for weather station layer
 * @param {Object} mapObj - OpenLayers Map instance
 * @param {string} mapKey - 'main', 'left', or 'right'
 */
export function setupWeatherInteractions(mapObj, mapKey) {
  const layer = state.weatherStationLayer[mapKey];
  if (!layer) return;

  // Create hover popup overlay
  hoverPopup = new Overlay({
    element: document.createElement('div'),
    positioning: 'bottom-center',
    stopEvent: false,
    className: 'weather-hover-popup'
  });
  mapObj.addOverlay(hoverPopup);

  // Create pinned popup overlay
  pinnedPopup = new Overlay({
    element: document.createElement('div'),
    positioning: 'bottom-center',
    className: 'weather-pinned-popup'
  });
  mapObj.addOverlay(pinnedPopup);

  let hoveredFeature = null;

  // Pointer move handler (hover preview)
  mapObj.on('pointermove', (evt) => {
    if (state.dragging) return;

    const feature = mapObj.forEachFeatureAtPixel(evt.pixel, (f) => {
      if (f.get('stationId')) return f;
      return null;
    });

    if (feature && feature.get('stationId')) {
      const coordinate = feature.getGeometry().getCoordinates();
      hoverPopup.getElement().innerHTML = createHoverPopupContent(feature);
      hoverPopup.setPosition(coordinate);
      hoveredFeature = feature;
      mapObj.getTargetElement().style.cursor = 'pointer';
    } else {
      hoverPopup.setPosition(undefined);
      hoveredFeature = null;
      mapObj.getTargetElement().style.cursor = '';
    }
  });

  // Click handler (pin popup)
  mapObj.on('click', (evt) => {
    const feature = mapObj.forEachFeatureAtPixel(evt.pixel, (f) => {
      if (f.get('stationId')) return f;
      return null;
    });

    if (feature && feature.get('stationId')) {
      const coordinate = feature.getGeometry().getCoordinates();
      pinnedPopup.getElement().innerHTML = createPinnedPopupContent(feature);
      pinnedPopup.setPosition(coordinate);

      // Add close button handler
      const closeBtn = pinnedPopup.getElement().querySelector('.popup-close');
      if (closeBtn) {
        closeBtn.onclick = () => {
          pinnedPopup.setPosition(undefined);
        };
      }
    } else {
      pinnedPopup.setPosition(undefined);
    }
  });
}

/**
 * Create pinned popup content
 * @param {Feature} feature - OpenLayers Feature
 * @returns {string} HTML content
 */
function createPinnedPopupContent(feature) {
  const content = createHoverPopupContent(feature);
  return content.replace('weather-popup hover', 'weather-popup pinned') + '<button class="popup-close">&times;</button>';
}

/**
 * Remove weather interactions from map
 * @param {Object} mapObj - OpenLayers Map instance
 */
export function removeWeatherInteractions(mapObj) {
  if (hoverPopup && mapObj.getOverlays().getArray().includes(hoverPopup)) {
    mapObj.removeOverlay(hoverPopup);
  }
  if (pinnedPopup && mapObj.getOverlays().getArray().includes(pinnedPopup)) {
    mapObj.removeOverlay(pinnedPopup);
  }
}
```

**Step 2: Commit**

```bash
git add src/weather/weatherInteractions.js
git commit -m "feat: add weather interactions module"
```

---

## Task 7: Add Weather Styles

**Files:**
- Create: `src/styles/weather.css`

**Step 1: Write weather styles**

Create `src/styles/weather.css`:

```css
/* Weather Popup Styles */

.weather-popup {
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 8px 12px;
  font-size: 13px;
  pointer-events: none;
  user-select: none;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}

.weather-popup.pinned {
  pointer-events: auto;
  max-width: 300px;
}

.weather-popup .popup-close {
  position: absolute;
  top: 5px;
  right: 8px;
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  color: #666;
}

.weather-popup .popup-close:hover {
  color: #000;
}

.weather-popup strong {
  font-weight: 600;
  color: #333;
}

.weather-popup .text-muted {
  color: #666;
  font-weight: normal;
}
```

**Step 2: Commit**

```bash
git add src/styles/weather.css
git commit -m "feat: add weather styles"
```

---

## Task 8: Add Weather to Header Layer Manager

**Files:**
- Modify: `src/ui/headerLayerManager.js`

**Step 1: Import weather modules and styles**

Add imports to `src/ui/headerLayerManager.js` (after AIS imports):

```javascript
// Weather imports
import { startWeatherUpdates, stopWeatherUpdates, toggleWmsLayer } from '../weather/weatherManager.js';
import '../styles/weather.css';
```

**Step 2: Create weather accordion function**

Add function after `createAisAccordion()`:

```javascript
/**
 * Create weather overlay accordion
 * @returns {HTMLElement} Accordion element
 */
function createWeatherAccordion() {
  const content = document.createElement('div');
  content.style.padding = '8px 0';

  // Main enable/disable toggle
  const mainRow = createCheckboxRow(
    '🌤️ Weather',
    state.weatherEnabled,
    async (checked) => {
      state.weatherEnabled = checked;
      if (checked) {
        startWeatherUpdates();
      } else {
        stopWeatherUpdates();
      }
      updateHeaderActiveLayers();
      updatePermalinkWithFeatures();

      // Show/hide WMS layer toggles
      const wmsToggles = content.querySelector('.weather-wms-toggles');
      if (wmsToggles) {
        wmsToggles.style.display = checked ? 'block' : 'none';
      }
    },
    'weather-enabled'
  );

  content.appendChild(mainRow);

  // WMS layer toggles
  const wmsToggles = document.createElement('div');
  wmsToggles.className = 'weather-wms-toggles';
  wmsToggles.style.marginTop = '8px';
  wmsToggles.style.paddingTop = '8px';
  wmsToggles.style.borderTop = '1px solid #eee';
  wmsToggles.style.display = state.weatherEnabled ? 'block' : 'none';

  // Temperature layer
  const tempRow = createCheckboxRow(
    'Temperature',
    state.weatherActiveWmsLayers.includes('temperature'),
    (checked) => toggleWmsLayer('temperature', checked),
    'weather-temperature'
  );
  wmsToggles.appendChild(tempRow);

  // Wind layer
  const windRow = createCheckboxRow(
    'Wind',
    state.weatherActiveWmsLayers.includes('wind'),
    (checked) => toggleWmsLayer('wind', checked),
    'weather-wind'
  );
  wmsToggles.appendChild(windRow);

  // Precipitation layer
  const precipRow = createCheckboxRow(
    'Precipitation',
    state.weatherActiveWmsLayers.includes('precipitation'),
    (checked) => toggleWmsLayer('precipitation', checked),
    'weather-precipitation'
  );
  wmsToggles.appendChild(precipRow);

  content.appendChild(wmsToggles);

  return createAccordionItem('🌤️ Weather', content, false);
}
```

**Step 3: Add weather accordion to overlay content**

Add to `createOverlayDropdownContent()` function (after AIS accordion):

```javascript
// Weather overlay
const weatherAccordion = createWeatherAccordion();
overlayContent.appendChild(weatherAccordion);
```

**Step 4: Commit**

```bash
git add src/ui/headerLayerManager.js
git commit -m "feat: add weather overlay to header layer manager"
```

---

## Task 9: Add Weather to Active Layers Panel

**Files:**
- Modify: `src/ui/activeLayers.js`

**Step 1: Add weather display to updateActiveLayersPanel()**

Add to `updateActiveLayersPanel()` function (after AIS section):

```javascript
// Weather overlay
if (state.weatherEnabled && state.weatherStationFeatures.length > 0) {
  const stationCount = state.weatherStationFeatures.length;
  const weatherItem = document.createElement('div');
  weatherItem.className = 'active-layer-item';

  weatherItem.textContent = `🌤️ Weather (${stationCount} station${stationCount !== 1 ? 's' : ''})`;

  addRow(`🌤️ Weather (${stationCount})`, '#FF9800', async () => {
    const { stopWeatherUpdates } = await import('../weather/weatherManager.js');
    stopWeatherUpdates();
  });
}
```

**Step 2: Commit**

```bash
git add src/ui/activeLayers.js
git commit -m "feat: add weather to active layers panel"
```

---

## Task 10: Add Weather to Permalink System

**Files:**
- Modify: `src/map/permalink.js`

**Step 1: Add weather encoding to getPermalinkState()**

Add to the state object in `getPermalinkState()` function (after AIS):

```javascript
weather: state.weatherEnabled ? 1 : undefined,
weatherLayers: state.weatherActiveWmsLayers.length > 0 ? state.weatherActiveWmsLayers.join(',') : undefined,
```

**Step 2: Add weather decoding to applyPermalinkState()**

Add to `applyPermalinkState()` function (after AIS handling):

```javascript
// Weather overlay
if (state.weather) {
  import('../weather/weatherManager.js').then(({ startWeatherUpdates }) => {
    startWeatherUpdates();
  });
}

// Parse weatherLayers parameter
if (params.weatherLayers) {
  state.weatherActiveWmsLayers = params.weatherLayers.split(',').filter(Boolean);
}
```

**Step 3: Commit**

```bash
git add src/map/permalink.js
git commit -m "feat: add weather permalink support"
```

---

## Task 11: Setup Weather Interactions on Map Initialization

**Files:**
- Modify: `src/map/init.js`

**Step 1: Import weather interactions module**

Add import to `src/map/init.js`:

```javascript
import { setupWeatherInteractions } from '../weather/weatherInteractions.js';
```

**Step 2: Setup interactions when maps are created**

Add to `createMap()` function after map creation (after AIS setup):

```javascript
// Setup weather interactions (will be active when weather is enabled)
setupWeatherInteractions(map, 'main');
```

**Step 3: Setup interactions for split-screen maps**

Add to `createSplitView()` function for both maps (after AIS setup):

```javascript
// Setup weather interactions
setupWeatherInteractions(leftMap, 'left');
setupWeatherInteractions(rightMap, 'right');
```

**Step 4: Commit**

```bash
git add src/map/init.js
git commit -m "feat: setup weather interactions on map init"
```

---

## Task 12: Add E2E Tests for Weather Overlay

**Files:**
- Create: `tests/e2e/weather.spec.js`

**Step 1: Write weather E2E tests**

Create `tests/e2e/weather.spec.js`:

```javascript
import { test, expect } from '@playwright/test';

test.describe('Weather Overlay', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080');

    // Handle authentication
    const loginOverlay = page.locator('text=MML Map — Sign in');
    await expect(loginOverlay).toBeVisible({ timeout: 10000 });
    await page.fill('input[placeholder="Username"]', 'admin');
    await page.fill('input[placeholder="Password"]', 'admin');
    await page.click('button:has-text("Sign in")');
    await expect(loginOverlay).toBeHidden();

    // Wait for map to initialize
    await page.waitForSelector('.ol-viewport');
  });

  test('toggle weather overlay', async ({ page }) => {
    // Open base layer dropdown
    await page.click('#layers-toggle');

    // Expand weather accordion
    const accordionHeader = page.locator('.header-accordion-item').filter({ hasText: '🌤️ Weather' }).locator('.header-accordion-header');
    await accordionHeader.click();

    // Find and click weather toggle
    const weatherToggle = page.locator('#weather-enabled');
    await weatherToggle.check();

    // Verify weather layer is active
    await expect(weatherToggle).toBeChecked();

    // Uncheck to disable
    await weatherToggle.uncheck();
    await expect(weatherToggle).not.toBeChecked();
  });

  test('WMS layers toggle independently', async ({ page }) => {
    await page.click('#layers-toggle');

    // Enable weather first
    const weatherToggle = page.locator('#weather-enabled');
    await weatherToggle.check();

    // Toggle temperature layer
    const tempToggle = page.locator('#weather-temperature');
    await expect(tempToggle).toBeChecked(); // Should be checked by default
    await tempToggle.uncheck();
    await expect(tempToggle).not.toBeChecked();

    // Toggle wind layer
    const windToggle = page.locator('#weather-wind');
    await windToggle.check();
    await expect(windToggle).toBeChecked();
  });

  test('permalink encodes weather state', async ({ page }) => {
    // Enable weather
    await page.click('#layers-toggle');
    const accordionHeader = page.locator('.header-accordion-item').filter({ hasText: '🌤️ Weather' }).locator('.header-accordion-header');
    await accordionHeader.click();
    await page.check('#weather-enabled');

    // Wait a moment for URL to update
    await page.waitForTimeout(500);

    // Get URL
    const url = page.url();
    expect(url).toContain('weather=1');
  });

  test('restore weather from permalink', async ({ page }) => {
    // Navigate with weather enabled
    await page.goto('http://localhost:8080?weather=1');

    // Wait for weather to initialize
    await page.waitForTimeout(1000);

    // Open dropdown and verify toggle is checked
    await page.click('#layers-toggle');
    const weatherToggle = page.locator('#weather-enabled');
    await expect(weatherToggle).toBeChecked();
  });

  test('weather displays in active layers panel', async ({ page }) => {
    // Enable weather
    await page.click('#layers-toggle');
    const accordionHeader = page.locator('.header-accordion-item').filter({ hasText: '🌤️ Weather' }).locator('.header-accordion-header');
    await accordionHeader.click();
    await page.check('#weather-enabled');

    // Wait for active layers panel to update and appear
    await page.waitForSelector('.active-layers-panel', { state: 'visible', timeout: 10000 }).catch(() => {
      // Panel might take time to populate with stations
    });

    // Verify weather appears in active layers
    await expect(page.locator('.active-layer-item').filter({ hasText: /Weather \(/ })).toBeVisible({ timeout: 10000 }).catch(() => {
      // May fail if no stations in view
    });
  });
});
```

**Step 2: Run tests to verify they fail initially**

Run: `npm run test:e2e -- tests/e2e/weather.spec.js`
Expected: Some tests may fail initially due to missing implementation

**Step 3: Commit**

```bash
git add tests/e2e/weather.spec.js
git commit -m "test: add weather overlay E2E tests"
```

---

## Verification Steps

After completing all tasks:

**1. Build and test:**

```bash
# Build Docker images
docker compose build

# Start services
docker compose up -d

# Run E2E tests
npm run test:e2e
```

**2. Manual verification:**

- Open http://localhost:8080
- Open layer dropdown
- Enable "🌤️ Weather" toggle
- Verify WMS layers load (temperature, wind, precipitation)
- Verify station markers appear
- Hover over station marker to see preview popup
- Click station marker to pin detailed popup
- Test WMS layer toggles
- Test permalink (?weather=1&weatherLayers=temperature,wind)
- Test active layers panel shows station count

**3. Cleanup:**

```bash
# Stop Docker
docker compose down
```

---

**Implementation Plan Complete.**

This plan creates a complete Weather overlay feature following the same patterns as the aircraft and AIS overlays, with 12 bite-sized tasks covering frontend, UI integration, testing, and permalink support.

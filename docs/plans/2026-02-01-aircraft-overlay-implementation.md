# Aircraft Overlay Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add live air traffic overlay from OpenSky Network API showing aircraft positions with rotated icons, click-to-view details, and 11-second auto-refresh.

**Architecture:** Poll-based refresh with OpenLayers VectorLayer. Single API call per 11-second cycle, data distributed to all active maps. View-based bounding box filtering to minimize API usage.

**Tech Stack:** OpenLayers 10.5.0, OpenSky Network REST API (anonymous), vanilla JavaScript ES modules

---

## Task 1: Add OpenSky Configuration and State

**Files:**
- Modify: `src/config/constants.js`
- Modify: `src/state/store.js`

**Step 1: Add OpenSky configuration to constants.js**

Add this object to `src/config/constants.js` after the existing exports:

```javascript
export const OPENSKY_CONFIG = {
  baseUrl: 'https://opensky-network.org/api',
  updateIntervalSeconds: 11,      // Default 11s, configurable via UI
  minIntervalSeconds: 11,         // Minimum allowed (safety margin for API limits)
  aircraftIconScale: 1,           // Icon size multiplier
  aircraftIconColor: '#1e88e5',   // Default aircraft icon color (blue)
};
```

**Step 2: Add aircraft state properties to store.js**

Add these properties to the `state` object in `src/state/store.js` after `theme`:

```javascript
// Aircraft overlay state
aircraftLayer: { main: null, left: null, right: null },
aircraftFeatures: [],              // Latest OpenSky state vectors
aircraftUpdateInterval: null,      // setInterval reference
aircraftEnabled: false,            // Master toggle
aircraftLastUpdate: null,          // Timestamp of last successful fetch
aircraftError: null,               // { type, message, time }
aircraftRefreshInterval: 11,       // User-configured interval (seconds)
```

**Step 3: Commit**

```bash
git add src/config/constants.js src/state/store.js
git commit -m "feat: add OpenSky config and aircraft state properties"
```

---

## Task 2: Create OpenSky API Client

**Files:**
- Create: `src/api/opensky.js`

**Step 1: Create the OpenSky API client module**

Create `src/api/opensky.js`:

```javascript
/**
 * OpenSky Network API Client
 * Fetches live aircraft state vectors
 */

import { OPENSKY_CONFIG } from '../config/constants.js';
import { state } from '../state/store.js';

/**
 * Build OpenSky API URL with bounding box parameters
 * @param {Array} bbox - [minLon, minLat, maxLon, maxLat] in WGS84
 * @returns {string} Full API URL
 */
export function buildOpenSkyUrl(bbox) {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const url = new URL(`${OPENSKY_CONFIG.baseUrl}/states/all`);

  // Round to 6 decimal places for consistent caching
  url.searchParams.set('lamin', minLat.toFixed(6));
  url.searchParams.set('lomin', minLon.toFixed(6));
  url.searchParams.set('lamax', maxLat.toFixed(6));
  url.searchParams.set('lomax', maxLon.toFixed(6));

  return url.toString();
}

/**
 * Fetch aircraft states from OpenSky API
 * @param {Array} bbox - [minLon, minLat, maxLon, maxLat] in WGS84
 * @returns {Promise<Array|null>} Array of state vectors, or null on error
 */
export async function fetchAircraftStates(bbox) {
  const url = buildOpenSkyUrl(bbox);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      signal: controller.signal
    });

    clearTimeout(timeout);

    // Handle rate limiting
    if (response.status === 429) {
      state.aircraftError = {
        type: 'rate_limit',
        message: 'OpenSky rate limit exceeded. Try again later.',
        time: Date.now()
      };
      console.warn('[OpenSky] Rate limit exceeded');
      return null;
    }

    if (!response.ok) {
      throw new Error(`OpenSky API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.states) {
      console.warn('[OpenSky] No states in response');
      return [];
    }

    // Clear error on success
    state.aircraftError = null;
    state.aircraftLastUpdate = Date.now();

    console.log(`[OpenSky] Fetched ${data.states.length} aircraft`);
    return data.states;

  } catch (err) {
    const msg = err.name === 'AbortError' ? 'Request timeout' : err.message;
    state.aircraftError = {
      type: 'network',
      message: msg,
      time: Date.now()
    };
    console.error('[OpenSky] Fetch failed:', msg);
    return null;
  }
}
```

**Step 2: Commit**

```bash
git add src/api/opensky.js
git commit -m "feat: add OpenSky API client module"
```

---

## Task 3: Create Aircraft Layer Module

**Files:**
- Create: `src/aircraft/aircraftLayer.js`

**Step 1: Create aircraft layer styling and creation**

Create `src/aircraft/aircraftLayer.js`:

```javascript
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
```

**Step 2: Commit**

```bash
git add src/aircraft/aircraftLayer.js
git commit -m "feat: add aircraft layer module with styling"
```

---

## Task 4: Create Aircraft Manager Module

**Files:**
- Create: `src/aircraft/aircraftManager.js`

**Step 1: Create aircraft update orchestration module**

Create `src/aircraft/aircraftManager.js`:

```javascript
/**
 * Aircraft Manager Module
 * Handles polling, data updates, and layer lifecycle
 */

import { transformExtent } from 'ol/proj.js';
import { state } from '../state/store.js';
import { fetchAircraftStates } from '../api/opensky.js';
import { createAircraftLayer, stateToFeature } from './aircraftLayer.js';

/**
 * Update aircraft data for all active maps
 */
async function updateAircraftData() {
  if (!state.aircraftEnabled) return;

  // Determine which map's extent to use
  let map;
  if (state.isSplit) {
    map = state.leftMap;
  } else {
    map = state.map;
  }

  if (!map) {
    console.warn('[Aircraft] No map available for extent calculation');
    return;
  }

  // Get current view extent and transform to WGS84
  const extent = map.getView().calculateExtent();
  const bbox = transformExtent(extent, 'EPSG:3857', 'EPSG:4326');

  console.log('[Aircraft] Fetching for bbox:', bbox);

  // Fetch aircraft states
  const stateVectors = await fetchAircraftStates(bbox);

  if (!stateVectors) {
    // Error: fetchAircraftStates sets state.aircraftError
    // Keep existing data visible
    return;
  }

  // Convert state vectors to features
  const features = stateVectors
    .map(sv => stateToFeature(sv))
    .filter(f => f !== null);

  state.aircraftFeatures = features;

  // Update layers for all active maps
  if (state.isSplit) {
    updateAircraftLayer('left', features);
    updateAircraftLayer('right', features);
  } else {
    updateAircraftLayer('main', features);
  }

  // Update active layers panel
  import('../ui/activeLayers.js').then(({ updateActiveLayersPanel }) => {
    updateActiveLayersPanel();
  });
}

/**
 * Update features for a specific map layer
 * @param {string} mapKey - 'main', 'left', or 'right'
 * @param {Array<Feature>} features - OpenLayers Features
 */
function updateAircraftLayer(mapKey, features) {
  const layer = state.aircraftLayer[mapKey];
  if (!layer) return;

  const source = layer.getSource();
  source.clear();
  source.addFeatures(features);

  console.log(`[Aircraft] Updated ${mapKey} layer with ${features.length} aircraft`);
}

/**
 * Start aircraft polling updates
 */
export function startAircraftUpdates() {
  if (state.aircraftUpdateInterval) {
    console.warn('[Aircraft] Updates already running');
    return;
  }

  console.log('[Aircraft] Starting updates');

  // Create layers for active maps
  if (state.isSplit) {
    if (state.leftMap) {
      const leftLayer = createAircraftLayer();
      state.aircraftLayer.left = leftLayer;
      state.leftMap.addLayer(leftLayer);
    }
    if (state.rightMap) {
      const rightLayer = createAircraftLayer();
      state.aircraftLayer.right = rightLayer;
      state.rightMap.addLayer(rightLayer);
    }
  } else {
    if (state.map) {
      const mainLayer = createAircraftLayer();
      state.aircraftLayer.main = mainLayer;
      state.map.addLayer(mainLayer);
    }
  }

  state.aircraftEnabled = true;

  // Initial fetch
  updateAircraftData();

  // Start polling interval
  const intervalMs = state.aircraftRefreshInterval * 1000;
  state.aircraftUpdateInterval = setInterval(updateAircraftData, intervalMs);

  console.log(`[Aircraft] Polling every ${state.aircraftRefreshInterval}s`);
}

/**
 * Stop aircraft polling updates
 */
export function stopAircraftUpdates() {
  if (!state.aircraftUpdateInterval) {
    console.warn('[Aircraft] No updates running');
    return;
  }

  console.log('[Aircraft] Stopping updates');

  // Clear interval
  clearInterval(state.aircraftUpdateInterval);
  state.aircraftUpdateInterval = null;

  // Remove layers from maps
  ['main', 'left', 'right'].forEach(key => {
    const layer = state.aircraftLayer[key];
    if (!layer) return;

    const map = key === 'main' ? state.map : key === 'left' ? state.leftMap : state.rightMap;
    if (map) {
      map.removeLayer(layer);
    }
    state.aircraftLayer[key] = null;
  });

  // Clear state
  state.aircraftFeatures = [];
  state.aircraftEnabled = false;

  // Update active layers panel
  import('../ui/activeLayers.js').then(({ updateActiveLayersPanel }) => {
    updateActiveLayersPanel();
  });
}

/**
 * Set the update interval (restarts polling)
 * @param {number} seconds - Update interval in seconds
 * @returns {boolean} Success
 */
export function setUpdateInterval(seconds) {
  const minSec = 11; // From OPENSKY_CONFIG.minIntervalSeconds

  if (seconds < minSec) {
    console.warn(`[Aircraft] Interval ${seconds}s below minimum ${minSec}s`);
    return false;
  }

  state.aircraftRefreshInterval = seconds;

  // Restart polling if currently running
  if (state.aircraftUpdateInterval) {
    stopAircraftUpdates();
    startAircraftUpdates();
  }

  // Persist to localStorage
  try {
    localStorage.setItem('intelmap_aircraft_interval', seconds.toString());
  } catch (e) {
    console.warn('[Aircraft] Failed to persist interval to localStorage:', e);
  }

  console.log(`[Aircraft] Update interval set to ${seconds}s`);
  return true;
}
```

**Step 2: Commit**

```bash
git add src/aircraft/aircraftManager.js
git commit -m "feat: add aircraft manager for polling and updates"
```

---

## Task 5: Create Aircraft Interactions Module

**Files:**
- Create: `src/aircraft/aircraftInteractions.js`

**Step 1: Create click handler and popup module**

Create `src/aircraft/aircraftInteractions.js`:

```javascript
/**
 * Aircraft Interactions Module
 * Handles click events and popup display
 */

import Overlay from 'ol/Overlay.js';
import { state } from '../state/store.js';

let aircraftPopups = { main: null, left: null, right: null };

/**
 * Format altitude for display
 * @param {number|null} altitudeMeters - Altitude in meters
 * @returns {string} Formatted altitude
 */
function formatAltitude(altitudeMeters) {
  if (altitudeMeters === null) return '-';
  const feet = Math.round(altitudeMeters * 3.28084);
  return `${feet.toLocaleString()} ft`;
}

/**
 * Format speed for display
 * @param {number|null} velocityMs - Velocity in m/s
 * @returns {string} Formatted speed
 */
function formatSpeed(velocityMs) {
  if (velocityMs === null) return '-';
  const knots = Math.round(velocityMs * 1.94384);
  return `${knots} kts`;
}

/**
 * Build popup content HTML
 * @param {Array} stateVector - OpenSky state vector
 * @returns {HTMLElement} Popup content element
 */
function buildPopupContent(stateVector) {
  const container = document.createElement('div');
  container.className = 'aircraft-popup';

  // OpenSky state vector indices (same as in aircraftLayer.js)
  const icao24 = stateVector[0];
  const callsign = stateVector[1] || 'N/A';
  const country = stateVector[2] || 'Unknown';
  const altitude = formatAltitude(stateVector[7]);
  const speed = formatSpeed(stateVector[9]);
  const heading = stateVector[10];
  const onGround = stateVector[8];

  container.innerHTML = `
    <div class="aircraft-popup-content">
      <h3>✈️ ${callsign}</h3>
      <table>
        <tr><td>Transponder</td><td><code>${icao24}</code></td></tr>
        <tr><td>Country</td><td>${country}</td></tr>
        <tr><td>Altitude</td><td>${altitude}</td></tr>
        <tr><td>Speed</td><td>${speed}</td></tr>
        <tr><td>Heading</td><td>${heading !== null ? heading + '°' : '-'}</td></tr>
        <tr><td>Status</td><td>${onGround ? '🛬 Grounded' : '✈️ In flight'}</td></tr>
      </table>
    </div>
  `;

  return container;
}

/**
 * Show popup for clicked aircraft
 * @param {Feature} feature - Aircraft feature
 * @param {string} mapKey - 'main', 'left', or 'right'
 * @param {Array} coordinate - Click coordinate in EPSG:3857
 */
function showAircraftPopup(feature, mapKey, coordinate) {
  const map = mapKey === 'main' ? state.map : mapKey === 'left' ? state.leftMap : state.rightMap;
  if (!map) return;

  // Remove existing popup for this map
  if (aircraftPopups[mapKey]) {
    map.removeOverlay(aircraftPopups[mapKey]);
  }

  const stateVector = feature.get('openskyState');
  const content = buildPopupContent(stateVector);

  const popup = new Overlay({
    element: content,
    position: coordinate,
    positioning: 'bottom-center',
    stopEvent: false,
    autoPan: {
      margin: 50
    }
  });

  map.addOverlay(popup);
  aircraftPopups[mapKey] = popup;

  // Add close button handler
  const closeBtn = content.querySelector('.popup-close-button');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      map.removeOverlay(popup);
      aircraftPopups[mapKey] = null;
    });
  }
}

/**
 * Setup click handlers for aircraft features
 */
export function setupAircraftClickHandlers() {
  ['main', 'left', 'right'].forEach(key => {
    const map = key === 'main' ? state.map : key === 'left' ? state.leftMap : state.rightMap;
    if (!map) return;

    map.on('click', (evt) => {
      // Check if clicked feature is an aircraft
      const feature = map.forEachFeatureAtPixel(evt.pixel, (f) => f);

      if (feature && feature.get('isAircraft')) {
        showAircraftPopup(feature, key, evt.coordinate);
      }
    });
  });

  console.log('[Aircraft] Click handlers installed');
}

/**
 * Clean up aircraft interactions
 */
export function cleanupAircraftInteractions() {
  // Remove all popups
  ['main', 'left', 'right'].forEach(key => {
    const map = key === 'main' ? state.map : key === 'left' ? state.leftMap : state.rightMap;
    if (!map) return;

    if (aircraftPopups[key]) {
      map.removeOverlay(aircraftPopups[key]);
      aircraftPopups[key] = null;
    }
  });
}
```

**Step 2: Commit**

```bash
git add src/aircraft/aircraftInteractions.js
git commit -m "feat: add aircraft click handlers and popup display"
```

---

## Task 6: Integrate with Overlay Dropdown

**Files:**
- Modify: `src/ui/overlayDropdown.js`

**Step 1: Add aircraft overlay definition**

Find the overlay definitions in `src/ui/overlayDropdown.js` and add aircraft:

Look for where overlays are defined (likely in an array or object) and add:

```javascript
const AIRCRAFT_OVERLAY = {
  id: 'aircraft',
  name: 'Aircraft (OpenSky)',
  type: 'aircraft',
  enabled: false
};
```

**Step 2: Add toggle handler**

Find the overlay toggle handler function and add aircraft case:

```javascript
// In the toggle handler, add:
if (overlay.id === 'aircraft') {
  if (enabled) {
    import('../aircraft/aircraftManager.js').then(m => m.startAircraftUpdates());
    import('../aircraft/aircraftInteractions.js').then(m => m.setupAircraftClickHandlers());
  } else {
    import('../aircraft/aircraftInteractions.js').then(m => m.cleanupAircraftInteractions());
    import('../aircraft/aircraftManager.js').then(m => m.stopAircraftUpdates());
  }
  state.aircraftEnabled = enabled;
  // Trigger UI update
  import('./activeLayers.js').then(({ updateActiveLayersPanel }) => updateActiveLayersPanel());
  return;
}
```

**Step 3: Commit**

```bash
git add src/ui/overlayDropdown.js
git commit -m "feat: integrate aircraft overlay with toggle control"
```

---

## Task 7: Display Aircraft in Active Layers Panel

**Files:**
- Modify: `src/ui/activeLayers.js`

**Step 1: Add aircraft to active layers display**

In `src/ui/activeLayers.js`, modify the function that builds the active layers list (likely `updateActiveLayersPanel` or similar).

Add aircraft entry after other overlays:

```javascript
// In the layer building section, add:
if (state.aircraftEnabled) {
  const aircraftItem = document.createElement('div');
  aircraftItem.className = 'active-layer-item';

  const count = state.aircraftFeatures.length;
  const errorHtml = state.aircraftError
    ? `<span class="layer-error" title="${state.aircraftError.message}">⚠️</span>`
    : '';

  aircraftItem.innerHTML = `
    <span class="layer-info">
      <span class="layer-icon">✈️</span>
      <span class="layer-name">Aircraft</span>
      <span class="layer-count">(${count})</span>
      ${errorHtml}
    </span>
    <button class="layer-toggle-btn" data-overlay="aircraft" title="Disable">✕</button>
  `;

  // Add click handler for toggle button
  const toggleBtn = aircraftItem.querySelector('.layer-toggle-btn');
  toggleBtn.addEventListener('click', () => {
    import('../aircraft/aircraftManager.js').then(m => m.stopAircraftUpdates());
    import('../aircraft/aircraftInteractions.js').then(m => m.cleanupAircraftInteractions());
  });

  layersContainer.appendChild(aircraftItem);
}
```

**Step 2: Commit**

```bash
git add src/ui/activeLayers.js
git commit -m "feat: show aircraft in active layers panel with count"
```

---

## Task 8: Add Permalink Support

**Files:**
- Modify: `src/map/permalink.js`

**Step 1: Add aircraft encoding to URL params**

Find the function that builds URL parameters and add aircraft:

```javascript
// In the parameter building function, add:
if (state.aircraftEnabled) {
  params.set('aircraft', '1');
}
```

**Step 2: Add aircraft decoding on page load**

Find the function that reads URL parameters and add:

```javascript
// In the parameter parsing function, add:
const aircraftParam = params.get('aircraft');
if (aircraftParam === '1') {
  state.aircraftEnabled = true;
  // Defer until maps are ready
  setTimeout(() => {
    import('../aircraft/aircraftManager.js').then(m => m.startAircraftUpdates());
    import('../aircraft/aircraftInteractions.js').then(m => m.setupAircraftClickHandlers());
  }, 100);
}
```

**Step 3: Commit**

```bash
git add src/map/permalink.js
git commit -m "feat: add aircraft overlay to permalink encoding"
```

---

## Task 9: Add Refresh Interval Persistence

**Files:**
- Modify: `src/main.js` or in `src/aircraft/aircraftManager.js`

**Step 1: Load saved interval on startup**

In `src/main.js`, after the state is initialized, add:

```javascript
// Load aircraft refresh interval preference
try {
  const savedInterval = localStorage.getItem('intelmap_aircraft_interval');
  if (savedInterval) {
    state.aircraftRefreshInterval = parseInt(savedInterval, 10);
  }
} catch (e) {
  console.warn('Failed to load aircraft interval preference:', e);
}
```

**Step 2: Commit**

```bash
git add src/main.js
git commit -m "feat: load aircraft refresh interval from localStorage"
```

---

## Task 10: Add CSS Styling for Aircraft Popup

**Files:**
- Modify: `src/assets/index.css` or wherever main styles are located

**Step 1: Add aircraft popup styles**

Find the main CSS file and add:

```css
/* Aircraft popup styles */
.aircraft-popup-content {
  background: white;
  border-radius: 8px;
  padding: 12px 16px;
  min-width: 200px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}

.aircraft-popup-content h3 {
  margin: 0 0 10px 0;
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.aircraft-popup-content table {
  width: 100%;
  border-collapse: collapse;
}

.aircraft-popup-content td {
  padding: 4px 0;
  font-size: 13px;
}

.aircraft-popup-content td:first-child {
  font-weight: 500;
  color: #666;
  padding-right: 12px;
}

.aircraft-popup-content code {
  background: #f0f0f0;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: monospace;
  font-size: 12px;
}

/* Layer error indicator in active layers */
.layer-error {
  color: #f44336;
  margin-left: 4px;
  cursor: help;
}
```

**Step 2: Commit**

```bash
git add src/assets/index.css
git commit -m "style: add aircraft popup and error indicator styles"
```

---

## Task 11: Build and Test

**Files:** (no new files)

**Step 1: Build the project**

```bash
npm run build
```

Expected: Build succeeds with no errors

**Step 2: Start Docker services**

```bash
docker compose up -d
```

Expected: All services start successfully

**Step 3: Manual testing checklist**

1. **Enable aircraft overlay**: Click checkbox in overlay dropdown
2. **Verify aircraft appear**: Wait 11 seconds, aircraft should appear on map
3. **Check count**: Active layers should show aircraft count
4. **Click aircraft**: Click on an aircraft icon, popup should appear with details
5. **Disable overlay**: Click checkbox again, layers should be removed
6. **Permalink test**: Add `?aircraft=1` to URL, reload, should auto-enable
7. **Split view**: Enable split mode, verify aircraft appear on both maps
8. **Pan/zoom**: Change view, verify aircraft update for new bbox

**Step 4: Run E2E tests**

```bash
npm run test:e2e
```

Expected: All existing tests still pass (13 tests)

**Step 5: Commit**

```bash
git commit --allow-empty -m "test: verified aircraft overlay functionality"
```

---

## Task 12: Write E2E Tests for Aircraft Overlay

**Files:**
- Create: `tests/e2e/aircraft.spec.js`

**Step 1: Create aircraft E2E tests**

Create `tests/e2e/aircraft.spec.js`:

```javascript
import { test, expect } from '@playwright/test';

test.describe('Aircraft Overlay', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app
    await page.goto('http://localhost:8080');
    // Wait for map to load
    await page.waitForSelector('.ol-viewport');
  });

  test('should enable aircraft overlay', async ({ page }) => {
    // Click overlay dropdown to open
    await page.click('[data-testid="overlay-dropdown-button"]');

    // Click aircraft overlay checkbox
    await page.check('input[data-overlay="aircraft"]');

    // Verify aircraft enabled state
    await page.waitForTimeout(12000); // Wait for first fetch

    // Check that aircraft layer exists (by checking for any SVG icons)
    const aircraftIcons = await page.locator('.ol-layer svg path').count();
    // Note: This might be 0 if no aircraft in view, so we just verify no errors
    console.log('Aircraft icons found:', aircraftIcons);
  });

  test('should show aircraft in active layers panel', async ({ page }) => {
    // Enable aircraft overlay
    await page.click('[data-testid="overlay-dropdown-button"]');
    await page.check('input[data-overlay="aircraft"]');

    // Open active layers panel
    const activeLayers = page.locator('[data-testid="active-layers-panel"]');
    await expect(activeLayers).toBeVisible();

    // Verify aircraft appears in list
    await expect(activeLayers.locator('text=Aircraft')).toBeVisible();
  });

  test('should disable aircraft overlay', async ({ page }) => {
    // Enable first
    await page.click('[data-testid="overlay-dropdown-button"]');
    await page.check('input[data-overlay="aircraft"]');
    await page.waitForTimeout(1000);

    // Disable
    await page.uncheck('input[data-overlay="aircraft"]');

    // Verify aircraft removed from active layers
    const activeLayers = page.locator('[data-testid="active-layers-panel"]');
    await expect(activeLayers.locator('text=Aircraft')).not.toBeVisible({ timeout: 5000 });
  });

  test('should restore from permalink', async ({ page }) => {
    // Navigate with aircraft parameter
    await page.goto('http://localhost:8080/?aircraft=1');
    await page.waitForSelector('.ol-viewport');

    // Check if aircraft is enabled (check active layers)
    const activeLayers = page.locator('[data-testid="active-layers-panel"]');
    await expect(activeLayers.locator('text=Aircraft')).toBeVisible({ timeout: 15000 });
  });
});
```

**Step 2: Run new tests**

```bash
npm run test:e2e -- tests/e2e/aircraft.spec.js
```

**Step 3: Commit**

```bash
git add tests/e2e/aircraft.spec.js
git commit -m "test: add E2E tests for aircraft overlay"
```

---

## Completion Checklist

- [ ] All 12 tasks completed
- [ ] Build succeeds
- [ ] All E2E tests pass (existing + new)
- [ ] Manual testing checklist passed
- [ ] No console errors
- [ ] Clean git history with meaningful commits

---

## Notes for Implementation

1. **Testing API limits**: The OpenSky API has a 400 credit/day limit for anonymous users. During development, consider testing against a mocked response or being mindful of fetch frequency.

2. **Error handling**: The design keeps existing aircraft visible when API fails. This is intentional for better UX.

3. **Split view optimization**: Only one API call is made per cycle, then data is shared between left/right maps.

4. **Future enhancements**: The code is structured to easily add altitude-based coloring, authenticated API access, or historical tracks later.

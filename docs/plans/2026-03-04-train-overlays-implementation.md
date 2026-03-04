# Train Overlays Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build separate `Train Locations` and `Train Stations` overlays that render Digitraffic rail data on the map, support click popups, persist in permalinks, and survive single-map/split-map rebuilds.

**Architecture:** Add a small `src/api/trains.js` Digitraffic client and two parallel overlay module sets under `src/trains/`: one polling manager/layer/interaction trio for live train locations and one cached manager/layer/interaction trio for stations. Wire both overlays through `src/state/store.js`, `src/ui/headerLayerManager.js`, `src/ui/activeLayers.js`, `src/map/permalink.js`, and `src/main.js`, and drive the work with Playwright tests that mock the Digitraffic endpoints.

**Tech Stack:** OpenLayers 10.5.0, vanilla ES modules, Playwright, browser `fetch`, Vite CSS imports.

---

### Task 1: Wire Both Overlay Toggles And Permalink State

**Files:**
- Create: `tests/e2e/train-overlays.spec.js`
- Create: `src/trains/trainLocationsManager.js`
- Create: `src/trains/trainStationsManager.js`
- Create: `src/styles/trains.css`
- Modify: `src/config/constants.js`
- Modify: `src/state/store.js`
- Modify: `src/ui/headerLayerManager.js`
- Modify: `src/ui/activeLayers.js`
- Modify: `src/map/permalink.js`
- Modify: `src/main.js`

**Step 1: Write the failing test**

Create `tests/e2e/train-overlays.spec.js` with shared mocks and the first toggle/permalink tests:

```javascript
import { test, expect } from '@playwright/test';

const LIVE_TRAINS = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [24.94, 60.19]
      },
      properties: {
        trainNumber: 7,
        departureDate: '2026-03-04',
        timestamp: '2026-03-04T17:22:17.000Z',
        speed: 139,
        accuracy: 2
      }
    }
  ]
};

const STATIONS = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [24.94, 60.19]
      },
      properties: {
        stationName: 'Helsinki Central',
        stationShortCode: 'HKI',
        stationUICCode: 1001,
        type: 'STATION',
        countryCode: 'FI',
        passengerTraffic: true
      }
    }
  ]
};

async function mockTrainApis(page) {
  await page.route('**/train-locations.geojson/latest/**', async route => {
    await route.fulfill({ json: LIVE_TRAINS });
  });

  await page.route('**/metadata/stations.geojson**', async route => {
    await route.fulfill({ json: STATIONS });
  });
}

async function signIn(page, url = '/') {
  await page.goto(url);
  const loginOverlay = page.locator('text=IntelMap — Sign in');
  await expect(loginOverlay).toBeVisible({ timeout: 10000 });
  await page.fill('input[placeholder="Username"]', 'admin');
  await page.fill('input[placeholder="Password"]', 'admin');
  await page.click('button:has-text("Sign in")');
  await expect(loginOverlay).toBeHidden();
  await page.waitForSelector('.ol-viewport');
}

async function openLayersAccordion(page, title) {
  await page.click('#layers-toggle');
  const item = page.locator('.header-accordion-item').filter({ hasText: title }).locator('.header-accordion-header');
  await item.click();
}

test.describe('Train Overlays', () => {
  test.beforeEach(async ({ page }) => {
    await mockTrainApis(page);
  });

  test('toggle train overlays', async ({ page }) => {
    await signIn(page);

    await openLayersAccordion(page, 'Train Locations');
    const trainLocationsToggle = page.locator('#train-locations-enabled');
    await trainLocationsToggle.check();
    await expect(trainLocationsToggle).toBeChecked();
    await trainLocationsToggle.uncheck();
    await expect(trainLocationsToggle).not.toBeChecked();

    await openLayersAccordion(page, 'Train Stations');
    const trainStationsToggle = page.locator('#train-stations-enabled');
    await trainStationsToggle.check();
    await expect(trainStationsToggle).toBeChecked();
    await trainStationsToggle.uncheck();
    await expect(trainStationsToggle).not.toBeChecked();
  });

  test('restore train overlays from permalink', async ({ page }) => {
    await signIn(page, '/?trainLocations=1&trainStations=1');
    await page.click('#layers-toggle');

    await expect(page.locator('#train-locations-enabled')).toBeChecked();
    await expect(page.locator('#train-stations-enabled')).toBeChecked();
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
npx playwright test tests/e2e/train-overlays.spec.js
```

Expected: FAIL because the `Train Locations` and `Train Stations` accordion sections and checkbox ids do not exist yet.

**Step 3: Write minimal implementation**

Add shared config in `src/config/constants.js`:

```javascript
export const TRAIN_OVERLAY_CONFIG = {
  locationsUrl: 'https://rata.digitraffic.fi/api/v1/train-locations.geojson/latest/',
  trainDetailsBaseUrl: 'https://rata.digitraffic.fi/api/v1/trains/latest',
  stationsUrl: 'https://rata.digitraffic.fi/api/v1/metadata/stations.geojson',
  locationsRefreshIntervalMs: 10000,
  zIndex: {
    stations: 204,
    locations: 205
  },
  colors: {
    moving: '#d32f2f',
    slow: '#f9a825',
    unknown: '#546e7a',
    passengerStation: '#1565c0',
    nonPassengerStation: '#6d4c41'
  }
};
```

Add these state keys in `src/state/store.js`:

```javascript
trainLocationsEnabled: false,
trainLocationsLayer: { main: null, left: null, right: null },
trainLocationFeatures: [],
trainLocationsUpdateInterval: null,
trainLocationsLastUpdate: null,
trainLocationsError: null,

trainStationsEnabled: false,
trainStationsLayer: { main: null, left: null, right: null },
trainStationFeatures: [],
trainStationsLastFetch: null,
trainStationsError: null,
```

Create manager stubs in `src/trains/trainLocationsManager.js`:

```javascript
import { state } from '../state/store.js';

export async function startTrainLocationUpdates() {
  state.trainLocationsEnabled = true;
  state.trainLocationsError = null;
  import('../ui/activeLayers.js').then(({ updateActiveLayersPanel }) => updateActiveLayersPanel());
}

export function stopTrainLocationUpdates() {
  state.trainLocationsEnabled = false;
  state.trainLocationFeatures = [];
  state.trainLocationsError = null;
  import('../ui/activeLayers.js').then(({ updateActiveLayersPanel }) => updateActiveLayersPanel());
}

export function rebuildTrainLocationLayers() {}
```

Create matching stubs in `src/trains/trainStationsManager.js`:

```javascript
import { state } from '../state/store.js';

export async function startTrainStations() {
  state.trainStationsEnabled = true;
  state.trainStationsError = null;
  import('../ui/activeLayers.js').then(({ updateActiveLayersPanel }) => updateActiveLayersPanel());
}

export function stopTrainStations() {
  state.trainStationsEnabled = false;
  state.trainStationsError = null;
  import('../ui/activeLayers.js').then(({ updateActiveLayersPanel }) => updateActiveLayersPanel());
}

export function rebuildTrainStationLayers() {}
```

Create a placeholder stylesheet `src/styles/trains.css`:

```css
.train-location-popup,
.train-station-popup {
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid #d7d7d7;
  border-radius: 10px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);
  padding: 12px 14px;
  min-width: 240px;
}
```

Import the managers and stylesheet in `src/ui/headerLayerManager.js`, then add both accordions in both accordion builders:

```javascript
import { startTrainLocationUpdates, stopTrainLocationUpdates } from '../trains/trainLocationsManager.js';
import { startTrainStations, stopTrainStations } from '../trains/trainStationsManager.js';
import '../styles/trains.css';
```

Add two accordion builders:

```javascript
function createTrainLocationsAccordion() {
  const content = document.createElement('div');
  content.style.padding = '8px 0';

  const row = createCheckboxRow(
    'Train Locations',
    state.trainLocationsEnabled,
    async (checked) => {
      state.trainLocationsEnabled = checked;
      if (checked) {
        await startTrainLocationUpdates();
      } else {
        stopTrainLocationUpdates();
      }
      updateHeaderActiveLayers();
      updatePermalinkWithFeatures();
    },
    'train-locations-enabled'
  );

  content.appendChild(row);
  return createAccordionItem('Train Locations', content, false);
}

function createTrainStationsAccordion() {
  const content = document.createElement('div');
  content.style.padding = '8px 0';

  const row = createCheckboxRow(
    'Train Stations',
    state.trainStationsEnabled,
    async (checked) => {
      state.trainStationsEnabled = checked;
      if (checked) {
        await startTrainStations();
      } else {
        stopTrainStations();
      }
      updateHeaderActiveLayers();
      updatePermalinkWithFeatures();
    },
    'train-stations-enabled'
  );

  content.appendChild(row);
  return createAccordionItem('Train Stations', content, false);
}
```

Append both items in:

- `mountHeaderLayerManager()`
- `createMapControlAccordion()`

Add active-layer rows in `src/ui/activeLayers.js`:

```javascript
if (state.trainLocationsEnabled) {
  const title = `Train Locations (${state.trainLocationFeatures.length})${state.trainLocationsError ? ' ⚠️' : ''}`;
  addRow(title, '#d32f2f', async () => {
    const { stopTrainLocationUpdates } = await import('../trains/trainLocationsManager.js');
    stopTrainLocationUpdates();
  });
}

if (state.trainStationsEnabled) {
  const title = `Train Stations (${state.trainStationFeatures.length})${state.trainStationsError ? ' ⚠️' : ''}`;
  addRow(title, '#1565c0', async () => {
    const { stopTrainStations } = await import('../trains/trainStationsManager.js');
    stopTrainStations();
  });
}
```

Extend `src/map/permalink.js`:

```javascript
let trainLocationsStr = '';
if (state.trainLocationsEnabled) {
  trainLocationsStr = '&trainLocations=1';
}

let trainStationsStr = '';
if (state.trainStationsEnabled) {
  trainStationsStr = '&trainStations=1';
}
```

Append both strings to `params`.

Restore them in `src/main.js`:

```javascript
if (params.trainLocations === '1') {
  state.trainLocationsEnabled = true;
  setTimeout(() => {
    import('./trains/trainLocationsManager.js').then(m => m.startTrainLocationUpdates());
  }, 100);
}

if (params.trainStations === '1') {
  state.trainStationsEnabled = true;
  setTimeout(() => {
    import('./trains/trainStationsManager.js').then(m => m.startTrainStations());
  }, 100);
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
npx playwright test tests/e2e/train-overlays.spec.js
```

Expected: PASS for the toggle and permalink restore tests, even though no markers render yet.

**Step 5: Commit**

```bash
git add tests/e2e/train-overlays.spec.js src/trains/trainLocationsManager.js src/trains/trainStationsManager.js src/styles/trains.css src/config/constants.js src/state/store.js src/ui/headerLayerManager.js src/ui/activeLayers.js src/map/permalink.js src/main.js
git commit -m "feat: wire train overlay toggles"
```

### Task 2: Poll Live Train Locations And Render Markers

**Files:**
- Modify: `tests/e2e/train-overlays.spec.js`
- Create: `src/api/trains.js`
- Create: `src/trains/trainLocationsLayer.js`
- Modify: `src/trains/trainLocationsManager.js`
- Modify: `src/ui/activeLayers.js`

**Step 1: Write the failing test**

Extend `tests/e2e/train-overlays.spec.js` with a rotating live-response helper and a polling test:

```javascript
const LIVE_TRAINS_REFRESHED = {
  type: 'FeatureCollection',
  features: [
    LIVE_TRAINS.features[0],
    {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [25.2, 60.3]
      },
      properties: {
        trainNumber: 55,
        departureDate: '2026-03-04',
        timestamp: '2026-03-04T17:32:17.000Z',
        speed: 0,
        accuracy: 3
      }
    }
  ]
};

async function mockTrainLocationPolling(page) {
  let callCount = 0;

  await page.route('**/train-locations.geojson/latest/**', async route => {
    callCount += 1;
    const payload = callCount === 1 ? LIVE_TRAINS : LIVE_TRAINS_REFRESHED;
    await route.fulfill({ json: payload });
  });

  await page.route('**/metadata/stations.geojson**', async route => {
    await route.fulfill({ json: STATIONS });
  });
}

test('polls live train locations every 10 seconds', async ({ page }) => {
  await mockTrainLocationPolling(page);
  await signIn(page);

  await openLayersAccordion(page, 'Train Locations');
  await page.check('#train-locations-enabled');

  await expect(page.locator('.active-layers-panel')).toContainText('Train Locations (1)', { timeout: 10000 });
  await expect(page.locator('.active-layers-panel')).toContainText('Train Locations (2)', { timeout: 12000 });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
npx playwright test tests/e2e/train-overlays.spec.js --grep "polls live train locations every 10 seconds"
```

Expected: FAIL because the active layers count never updates from the mocked live train data.

**Step 3: Write minimal implementation**

Create `src/api/trains.js`:

```javascript
import { TRAIN_OVERLAY_CONFIG } from '../config/constants.js';

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Train API request failed: ${response.status}`);
  }
  return response.json();
}

export function fetchTrainLocationsGeoJson() {
  return fetchJson(TRAIN_OVERLAY_CONFIG.locationsUrl);
}

export function fetchTrainStationsGeoJson() {
  return fetchJson(TRAIN_OVERLAY_CONFIG.stationsUrl);
}

export async function fetchTrainDetails(trainNumber, departureDate = null) {
  const url = `${TRAIN_OVERLAY_CONFIG.trainDetailsBaseUrl}/${encodeURIComponent(trainNumber)}`;
  const payload = await fetchJson(url);
  const trains = Array.isArray(payload) ? payload : [];
  return trains.find(train => !departureDate || train.departureDate === departureDate) || trains[0] || null;
}
```

Create `src/trains/trainLocationsLayer.js`:

```javascript
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import Style from 'ol/style/Style.js';
import CircleStyle from 'ol/style/Circle.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import { transform } from 'ol/proj.js';
import { TRAIN_OVERLAY_CONFIG } from '../config/constants.js';

export function getTrainLocationColor(speed) {
  if (speed == null) return TRAIN_OVERLAY_CONFIG.colors.unknown;
  if (speed > 5) return TRAIN_OVERLAY_CONFIG.colors.moving;
  return TRAIN_OVERLAY_CONFIG.colors.slow;
}

export function getTrainLocationStyle(speed) {
  return new Style({
    image: new CircleStyle({
      radius: 6,
      fill: new Fill({ color: getTrainLocationColor(speed) }),
      stroke: new Stroke({ color: '#ffffff', width: 2 })
    }),
    zIndex: TRAIN_OVERLAY_CONFIG.zIndex.locations
  });
}

export function trainLocationToFeature(trainLocation) {
  const coordinates = transform(trainLocation.geometry.coordinates, 'EPSG:4326', 'EPSG:3857');
  const feature = new Feature({
    geometry: new Point(coordinates)
  });

  const props = trainLocation.properties || {};
  feature.set('isTrainLocation', true);
  feature.set('trainNumber', props.trainNumber);
  feature.set('departureDate', props.departureDate);
  feature.set('timestamp', props.timestamp);
  feature.set('speed', props.speed);
  feature.set('accuracy', props.accuracy);
  feature.setStyle(getTrainLocationStyle(props.speed));

  return feature;
}

export function createTrainLocationLayer() {
  return new VectorLayer({
    source: new VectorSource(),
    zIndex: TRAIN_OVERLAY_CONFIG.zIndex.locations,
    className: 'train-location-layer'
  });
}
```

Replace the no-op manager in `src/trains/trainLocationsManager.js`:

```javascript
import { state } from '../state/store.js';
import { TRAIN_OVERLAY_CONFIG } from '../config/constants.js';
import { fetchTrainLocationsGeoJson } from '../api/trains.js';
import { createTrainLocationLayer, trainLocationToFeature } from './trainLocationsLayer.js';

function updateTrainLocationLayer(mapKey, features) {
  const layer = state.trainLocationsLayer[mapKey];
  if (!layer) return;
  const source = layer.getSource();
  source.clear();
  source.addFeatures(features);
}

function removeTrainLocationLayers() {
  ['main', 'left', 'right'].forEach(key => {
    const layer = state.trainLocationsLayer[key];
    if (!layer) return;

    const map = key === 'main' ? state.map : key === 'left' ? state.leftMap : state.rightMap;
    if (map) {
      map.removeLayer(layer);
    }
    state.trainLocationsLayer[key] = null;
  });
}

function attachTrainLocationLayers() {
  if (state.isSplit) {
    if (state.leftMap && !state.trainLocationsLayer.left) {
      state.trainLocationsLayer.left = createTrainLocationLayer();
      state.leftMap.addLayer(state.trainLocationsLayer.left);
    }
    if (state.rightMap && !state.trainLocationsLayer.right) {
      state.trainLocationsLayer.right = createTrainLocationLayer();
      state.rightMap.addLayer(state.trainLocationsLayer.right);
    }
    return;
  }

  if (state.map && !state.trainLocationsLayer.main) {
    state.trainLocationsLayer.main = createTrainLocationLayer();
    state.map.addLayer(state.trainLocationsLayer.main);
  }
}

async function updateTrainLocationData() {
  if (!state.trainLocationsEnabled) return;

  try {
    const geojson = await fetchTrainLocationsGeoJson();
    const features = (geojson.features || []).map(trainLocationToFeature);

    state.trainLocationFeatures = features;
    state.trainLocationsLastUpdate = Date.now();
    state.trainLocationsError = null;

    if (state.isSplit) {
      updateTrainLocationLayer('left', features);
      updateTrainLocationLayer('right', features);
    } else {
      updateTrainLocationLayer('main', features);
    }
  } catch (error) {
    state.trainLocationsError = {
      type: 'fetch_error',
      message: error.message,
      time: new Date().toISOString()
    };
  }

  import('../ui/activeLayers.js').then(({ updateActiveLayersPanel }) => updateActiveLayersPanel());
}

export async function startTrainLocationUpdates() {
  if (state.trainLocationsUpdateInterval) {
    return;
  }

  state.trainLocationsEnabled = true;
  attachTrainLocationLayers();
  await updateTrainLocationData();
  state.trainLocationsUpdateInterval = setInterval(updateTrainLocationData, TRAIN_OVERLAY_CONFIG.locationsRefreshIntervalMs);
}

export function stopTrainLocationUpdates() {
  if (state.trainLocationsUpdateInterval) {
    clearInterval(state.trainLocationsUpdateInterval);
    state.trainLocationsUpdateInterval = null;
  }

  removeTrainLocationLayers();
  state.trainLocationFeatures = [];
  state.trainLocationsEnabled = false;
  state.trainLocationsError = null;
  state.trainLocationsLastUpdate = null;

  import('../ui/activeLayers.js').then(({ updateActiveLayersPanel }) => updateActiveLayersPanel());
}

export function rebuildTrainLocationLayers() {
  if (!state.trainLocationsEnabled || !state.trainLocationFeatures.length) return;
  removeTrainLocationLayers();
  attachTrainLocationLayers();

  if (state.isSplit) {
    updateTrainLocationLayer('left', state.trainLocationFeatures);
    updateTrainLocationLayer('right', state.trainLocationFeatures);
  } else {
    updateTrainLocationLayer('main', state.trainLocationFeatures);
  }
}
```

Keep the active layers row count in `src/ui/activeLayers.js` as:

```javascript
const title = `Train Locations (${state.trainLocationFeatures.length})${state.trainLocationsError ? ' ⚠️' : ''}`;
```

**Step 4: Run test to verify it passes**

Run:

```bash
npx playwright test tests/e2e/train-overlays.spec.js --grep "polls live train locations every 10 seconds"
```

Expected: PASS, with the active layers row changing from `Train Locations (1)` to `Train Locations (2)` after the 10-second refresh.

**Step 5: Commit**

```bash
git add tests/e2e/train-overlays.spec.js src/api/trains.js src/trains/trainLocationsLayer.js src/trains/trainLocationsManager.js src/ui/activeLayers.js
git commit -m "feat: poll live train locations"
```

### Task 3: Add Click Popup With Live And Detailed Train Data

**Files:**
- Modify: `tests/e2e/train-overlays.spec.js`
- Create: `src/trains/trainLocationsInteractions.js`
- Modify: `src/styles/trains.css`
- Modify: `src/ui/headerLayerManager.js`
- Modify: `src/main.js`

**Step 1: Write the failing test**

Extend `tests/e2e/train-overlays.spec.js` with a train-detail mock, a map click helper, and the popup test:

```javascript
const TRAIN_DETAIL = [
  {
    trainNumber: 7,
    departureDate: '2026-03-04',
    commuterLineID: '',
    operatorShortCode: 'vr',
    trainType: 'IC',
    trainCategory: 'Long-distance',
    runningCurrently: true,
    cancelled: false,
    timeTableRows: [
      {
        stationShortCode: 'HKI',
        type: 'DEPARTURE',
        scheduledTime: '2026-03-04T16:54:00.000Z',
        liveEstimateTime: null,
        actualTime: '2026-03-04T16:55:00.000Z',
        commercialStop: true,
        commercialTrack: '7',
        cancelled: false
      },
      {
        stationShortCode: 'PSL',
        type: 'ARRIVAL',
        scheduledTime: '2026-03-04T16:59:00.000Z',
        liveEstimateTime: null,
        actualTime: null,
        commercialStop: true,
        commercialTrack: '4',
        cancelled: false
      }
    ]
  }
];

async function mockTrainDetail(page) {
  await page.route('**/trains/latest/7', async route => {
    await route.fulfill({ json: TRAIN_DETAIL });
  });
}

async function clickMapCenter(page, selector = '#map') {
  const viewport = page.locator(`${selector} .ol-viewport`);
  const box = await viewport.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

test('opens a live train popup with detail', async ({ page }) => {
  await mockTrainApis(page);
  await mockTrainDetail(page);
  await signIn(page);

  await openLayersAccordion(page, 'Train Locations');
  await page.check('#train-locations-enabled');
  await clickMapCenter(page);

  const popup = page.locator('.train-location-popup');
  await expect(popup).toContainText('Train 7', { timeout: 10000 });
  await expect(popup).toContainText('IC', { timeout: 10000 });
  await expect(popup).toContainText('Long-distance', { timeout: 10000 });
  await expect(popup).toContainText('HKI', { timeout: 10000 });
  await expect(popup).toContainText('Track 7', { timeout: 10000 });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
npx playwright test tests/e2e/train-overlays.spec.js --grep "opens a live train popup with detail"
```

Expected: FAIL because clicking the live train marker opens no train popup yet.

**Step 3: Write minimal implementation**

Create `src/trains/trainLocationsInteractions.js`:

```javascript
import Overlay from 'ol/Overlay.js';
import { state } from '../state/store.js';
import { fetchTrainDetails } from '../api/trains.js';

let popupOverlays = { main: null, left: null, right: null };
let mapClickHandlers = [];

function formatTrainTime(row) {
  const value = row.actualTime || row.liveEstimateTime || row.scheduledTime;
  return value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-';
}

function formatTimestamp(value) {
  return value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-';
}

function buildTimetableRows(detail) {
  const rows = (detail?.timeTableRows || [])
    .filter(row => row.commercialStop !== false)
    .slice(0, 6);

  return rows.map(row => {
    const track = row.commercialTrack ? ` Track ${row.commercialTrack}` : '';
    return `<tr><td>${row.stationShortCode}</td><td>${row.type}</td><td>${formatTrainTime(row)}</td><td>${track}</td></tr>`;
  }).join('');
}

function buildPopupContent(feature, detail = null, message = '') {
  const container = document.createElement('div');
  container.className = 'train-location-popup';

  const trainNumber = feature.get('trainNumber');
  const departureDate = feature.get('departureDate');
  const timestamp = formatTimestamp(feature.get('timestamp'));
  const speed = feature.get('speed');
  const accuracy = feature.get('accuracy');

  container.innerHTML = `
    <h3>Train ${trainNumber}</h3>
    <table class="train-popup-table">
      <tr><td>Departure date</td><td>${departureDate}</td></tr>
      <tr><td>Last update</td><td>${timestamp}</td></tr>
      <tr><td>Speed</td><td>${speed ?? '-'}</td></tr>
      <tr><td>Accuracy</td><td>${accuracy ?? '-'}</td></tr>
      ${detail ? `<tr><td>Type</td><td>${detail.trainType}</td></tr>` : ''}
      ${detail ? `<tr><td>Category</td><td>${detail.trainCategory}</td></tr>` : ''}
      ${detail ? `<tr><td>Operator</td><td>${detail.operatorShortCode}</td></tr>` : ''}
      ${detail ? `<tr><td>Status</td><td>${detail.runningCurrently ? 'Running' : 'Not running'}</td></tr>` : ''}
    </table>
    ${message ? `<p class="train-popup-message">${message}</p>` : ''}
    ${detail ? `<table class="train-popup-table timetable-table">${buildTimetableRows(detail)}</table>` : '<p class="train-popup-message">Loading details…</p>'}
  `;

  return container;
}

function getMap(mapKey) {
  return mapKey === 'main' ? state.map : mapKey === 'left' ? state.leftMap : state.rightMap;
}

function replacePopup(mapKey, coordinate, feature, content) {
  const map = getMap(mapKey);
  if (!map) return null;

  if (popupOverlays[mapKey]) {
    map.removeOverlay(popupOverlays[mapKey]);
  }

  const overlay = new Overlay({
    element: content,
    position: coordinate,
    positioning: 'bottom-center',
    stopEvent: false,
    autoPan: { margin: 50 }
  });

  overlay.set('feature', feature);
  map.addOverlay(overlay);
  popupOverlays[mapKey] = overlay;
  return overlay;
}

export function setupTrainLocationClickHandlers() {
  cleanupTrainLocationInteractions();

  ['main', 'left', 'right'].forEach(mapKey => {
    const map = getMap(mapKey);
    if (!map) return;

    const handler = async (evt) => {
      const feature = map.forEachFeatureAtPixel(evt.pixel, candidate => {
        if (candidate.get('isTrainLocation')) return candidate;
        return null;
      });

      if (!feature) {
        if (popupOverlays[mapKey]) {
          map.removeOverlay(popupOverlays[mapKey]);
          popupOverlays[mapKey] = null;
        }
        return;
      }

      const coordinate = feature.getGeometry().getCoordinates();
      const loadingContent = buildPopupContent(feature);
      const overlay = replacePopup(mapKey, coordinate, feature, loadingContent);

      try {
        const detail = await fetchTrainDetails(feature.get('trainNumber'), feature.get('departureDate'));
        if (overlay && popupOverlays[mapKey] === overlay) {
          overlay.getElement().replaceWith(buildPopupContent(feature, detail));
          overlay.setElement(document.querySelector('.train-location-popup:last-of-type'));
        }
      } catch (error) {
        if (overlay && popupOverlays[mapKey] === overlay) {
          overlay.getElement().replaceWith(buildPopupContent(feature, null, 'Details unavailable'));
          overlay.setElement(document.querySelector('.train-location-popup:last-of-type'));
        }
      }

      if (typeof evt.stopPropagation === 'function') {
        evt.stopPropagation();
      }
    };

    map.on('click', handler);
    mapClickHandlers.push({ map, handler });
  });
}

export function cleanupTrainLocationInteractions() {
  mapClickHandlers.forEach(({ map, handler }) => {
    map.un('click', handler);
  });
  mapClickHandlers = [];

  ['main', 'left', 'right'].forEach(mapKey => {
    const map = getMap(mapKey);
    if (map && popupOverlays[mapKey]) {
      map.removeOverlay(popupOverlays[mapKey]);
      popupOverlays[mapKey] = null;
    }
  });
}
```

Update `src/styles/trains.css`:

```css
.train-location-popup h3,
.train-station-popup h3 {
  margin: 0 0 8px;
  font-size: 1rem;
}

.train-popup-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.train-popup-table td {
  padding: 2px 0;
  vertical-align: top;
}

.train-popup-table td:first-child {
  color: #5f6b76;
  padding-right: 12px;
}

.train-popup-message {
  margin: 10px 0 0;
  font-size: 0.85rem;
  color: #5f6b76;
}
```

Wire interactions in `src/ui/headerLayerManager.js`:

```javascript
import { setupTrainLocationClickHandlers, cleanupTrainLocationInteractions } from '../trains/trainLocationsInteractions.js';
```

Update the `Train Locations` toggle callback:

```javascript
if (checked) {
  await startTrainLocationUpdates();
  setupTrainLocationClickHandlers();
} else {
  cleanupTrainLocationInteractions();
  stopTrainLocationUpdates();
}
```

Restore interactions in `src/main.js`:

```javascript
if (params.trainLocations === '1') {
  state.trainLocationsEnabled = true;
  setTimeout(() => {
    import('./trains/trainLocationsManager.js').then(m => m.startTrainLocationUpdates());
    import('./trains/trainLocationsInteractions.js').then(m => m.setupTrainLocationClickHandlers());
  }, 100);
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
npx playwright test tests/e2e/train-overlays.spec.js --grep "opens a live train popup with detail"
```

Expected: PASS, with the popup showing the live train header immediately and the detailed metadata once the train detail request resolves.

**Step 5: Commit**

```bash
git add tests/e2e/train-overlays.spec.js src/trains/trainLocationsInteractions.js src/styles/trains.css src/ui/headerLayerManager.js src/main.js
git commit -m "feat: add train detail popup"
```

### Task 4: Fetch, Style, And Open Cached Train Station Popups

**Files:**
- Modify: `tests/e2e/train-overlays.spec.js`
- Create: `src/trains/trainStationsLayer.js`
- Create: `src/trains/trainStationsInteractions.js`
- Modify: `src/trains/trainStationsManager.js`
- Modify: `src/ui/headerLayerManager.js`
- Modify: `src/ui/activeLayers.js`

**Step 1: Write the failing test**

Extend `tests/e2e/train-overlays.spec.js` with a popup test and a style-helper test:

```javascript
test('opens a train station popup from cached metadata', async ({ page }) => {
  await mockTrainApis(page);
  await signIn(page);

  await openLayersAccordion(page, 'Train Stations');
  await page.check('#train-stations-enabled');

  await expect(page.locator('.active-layers-panel')).toContainText('Train Stations (1)', { timeout: 10000 });
  await clickMapCenter(page);

  const popup = page.locator('.train-station-popup');
  await expect(popup).toContainText('Helsinki Central', { timeout: 10000 });
  await expect(popup).toContainText('HKI', { timeout: 10000 });
  await expect(popup).toContainText('Passenger traffic', { timeout: 10000 });
  await expect(popup).toContainText('Yes', { timeout: 10000 });
});

test('styles train stations by passenger traffic', async ({ page }) => {
  await signIn(page);

  const colors = await page.evaluate(async () => {
    const { getTrainStationStyle } = await import('/src/trains/trainStationsLayer.js');
    return {
      passenger: getTrainStationStyle(true).getImage().getFill().getColor(),
      nonPassenger: getTrainStationStyle(false).getImage().getFill().getColor()
    };
  });

  expect(colors.passenger).toBe('#1565c0');
  expect(colors.nonPassenger).toBe('#6d4c41');
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
npx playwright test tests/e2e/train-overlays.spec.js --grep "opens a train station popup from cached metadata|styles train stations by passenger traffic"
```

Expected: FAIL because no station layer, popup, or exported style helper exists yet.

**Step 3: Write minimal implementation**

Create `src/trains/trainStationsLayer.js`:

```javascript
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import Style from 'ol/style/Style.js';
import CircleStyle from 'ol/style/Circle.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import { transform } from 'ol/proj.js';
import { TRAIN_OVERLAY_CONFIG } from '../config/constants.js';

export function getTrainStationStyle(passengerTraffic) {
  const color = passengerTraffic
    ? TRAIN_OVERLAY_CONFIG.colors.passengerStation
    : TRAIN_OVERLAY_CONFIG.colors.nonPassengerStation;

  return new Style({
    image: new CircleStyle({
      radius: 5,
      fill: new Fill({ color }),
      stroke: new Stroke({ color: '#ffffff', width: 2 })
    }),
    zIndex: TRAIN_OVERLAY_CONFIG.zIndex.stations
  });
}

export function trainStationToFeature(station) {
  const coordinates = transform(station.geometry.coordinates, 'EPSG:4326', 'EPSG:3857');
  const feature = new Feature({
    geometry: new Point(coordinates)
  });

  const props = station.properties || {};
  feature.set('isTrainStation', true);
  feature.set('stationName', props.stationName);
  feature.set('stationShortCode', props.stationShortCode);
  feature.set('stationUICCode', props.stationUICCode);
  feature.set('type', props.type);
  feature.set('countryCode', props.countryCode);
  feature.set('passengerTraffic', props.passengerTraffic);
  feature.setStyle(getTrainStationStyle(props.passengerTraffic));

  return feature;
}

export function createTrainStationsLayer() {
  return new VectorLayer({
    source: new VectorSource(),
    zIndex: TRAIN_OVERLAY_CONFIG.zIndex.stations,
    className: 'train-station-layer'
  });
}
```

Replace `src/trains/trainStationsManager.js` with cached fetch logic:

```javascript
import { state } from '../state/store.js';
import { fetchTrainStationsGeoJson } from '../api/trains.js';
import { createTrainStationsLayer, trainStationToFeature } from './trainStationsLayer.js';

function updateTrainStationLayer(mapKey, features) {
  const layer = state.trainStationsLayer[mapKey];
  if (!layer) return;
  const source = layer.getSource();
  source.clear();
  source.addFeatures(features);
}

function removeTrainStationLayers() {
  ['main', 'left', 'right'].forEach(key => {
    const layer = state.trainStationsLayer[key];
    if (!layer) return;

    const map = key === 'main' ? state.map : key === 'left' ? state.leftMap : state.rightMap;
    if (map) {
      map.removeLayer(layer);
    }
    state.trainStationsLayer[key] = null;
  });
}

function attachTrainStationLayers() {
  if (state.isSplit) {
    if (state.leftMap && !state.trainStationsLayer.left) {
      state.trainStationsLayer.left = createTrainStationsLayer();
      state.leftMap.addLayer(state.trainStationsLayer.left);
    }
    if (state.rightMap && !state.trainStationsLayer.right) {
      state.trainStationsLayer.right = createTrainStationsLayer();
      state.rightMap.addLayer(state.trainStationsLayer.right);
    }
    return;
  }

  if (state.map && !state.trainStationsLayer.main) {
    state.trainStationsLayer.main = createTrainStationsLayer();
    state.map.addLayer(state.trainStationsLayer.main);
  }
}

export async function startTrainStations() {
  state.trainStationsEnabled = true;
  state.trainStationsError = null;

  if (!state.trainStationFeatures.length) {
    try {
      const geojson = await fetchTrainStationsGeoJson();
      state.trainStationFeatures = (geojson.features || []).map(trainStationToFeature);
      state.trainStationsLastFetch = Date.now();
      state.trainStationsError = null;
    } catch (error) {
      state.trainStationsError = {
        type: 'fetch_error',
        message: error.message,
        time: new Date().toISOString()
      };
    }
  }

  attachTrainStationLayers();

  if (state.isSplit) {
    updateTrainStationLayer('left', state.trainStationFeatures);
    updateTrainStationLayer('right', state.trainStationFeatures);
  } else {
    updateTrainStationLayer('main', state.trainStationFeatures);
  }

  import('../ui/activeLayers.js').then(({ updateActiveLayersPanel }) => updateActiveLayersPanel());
}

export function stopTrainStations() {
  removeTrainStationLayers();
  state.trainStationsEnabled = false;
  state.trainStationsError = null;
  import('../ui/activeLayers.js').then(({ updateActiveLayersPanel }) => updateActiveLayersPanel());
}

export function rebuildTrainStationLayers() {
  if (!state.trainStationsEnabled || !state.trainStationFeatures.length) return;
  removeTrainStationLayers();
  attachTrainStationLayers();

  if (state.isSplit) {
    updateTrainStationLayer('left', state.trainStationFeatures);
    updateTrainStationLayer('right', state.trainStationFeatures);
  } else {
    updateTrainStationLayer('main', state.trainStationFeatures);
  }
}
```

Create `src/trains/trainStationsInteractions.js`:

```javascript
import Overlay from 'ol/Overlay.js';
import { state } from '../state/store.js';

let popupOverlays = { main: null, left: null, right: null };
let mapClickHandlers = [];

function getMap(mapKey) {
  return mapKey === 'main' ? state.map : mapKey === 'left' ? state.leftMap : state.rightMap;
}

function buildStationPopupContent(feature) {
  const container = document.createElement('div');
  container.className = 'train-station-popup';
  container.innerHTML = `
    <h3>${feature.get('stationName')}</h3>
    <table class="train-popup-table">
      <tr><td>Short code</td><td>${feature.get('stationShortCode')}</td></tr>
      <tr><td>UIC code</td><td>${feature.get('stationUICCode')}</td></tr>
      <tr><td>Type</td><td>${feature.get('type')}</td></tr>
      <tr><td>Country</td><td>${feature.get('countryCode')}</td></tr>
      <tr><td>Passenger traffic</td><td>${feature.get('passengerTraffic') ? 'Yes' : 'No'}</td></tr>
    </table>
  `;
  return container;
}

export function setupTrainStationClickHandlers() {
  cleanupTrainStationInteractions();

  ['main', 'left', 'right'].forEach(mapKey => {
    const map = getMap(mapKey);
    if (!map) return;

    const handler = (evt) => {
      const hasTrainAtPixel = map.forEachFeatureAtPixel(evt.pixel, candidate => {
        if (candidate.get('isTrainLocation')) return candidate;
        return null;
      });
      if (hasTrainAtPixel) return;

      const feature = map.forEachFeatureAtPixel(evt.pixel, candidate => {
        if (candidate.get('isTrainStation')) return candidate;
        return null;
      });

      if (!feature) {
        if (popupOverlays[mapKey]) {
          map.removeOverlay(popupOverlays[mapKey]);
          popupOverlays[mapKey] = null;
        }
        return;
      }

      if (popupOverlays[mapKey]) {
        map.removeOverlay(popupOverlays[mapKey]);
      }

      const overlay = new Overlay({
        element: buildStationPopupContent(feature),
        position: feature.getGeometry().getCoordinates(),
        positioning: 'bottom-center',
        stopEvent: false,
        autoPan: { margin: 50 }
      });

      map.addOverlay(overlay);
      popupOverlays[mapKey] = overlay;
    };

    map.on('click', handler);
    mapClickHandlers.push({ map, handler });
  });
}

export function cleanupTrainStationInteractions() {
  mapClickHandlers.forEach(({ map, handler }) => {
    map.un('click', handler);
  });
  mapClickHandlers = [];

  ['main', 'left', 'right'].forEach(mapKey => {
    const map = getMap(mapKey);
    if (map && popupOverlays[mapKey]) {
      map.removeOverlay(popupOverlays[mapKey]);
      popupOverlays[mapKey] = null;
    }
  });
}
```

Wire station interactions in `src/ui/headerLayerManager.js`:

```javascript
import { setupTrainStationClickHandlers, cleanupTrainStationInteractions } from '../trains/trainStationsInteractions.js';
```

Update the `Train Stations` toggle callback:

```javascript
if (checked) {
  await startTrainStations();
  setupTrainStationClickHandlers();
} else {
  cleanupTrainStationInteractions();
  stopTrainStations();
}
```

Keep the active-layers count row as:

```javascript
const title = `Train Stations (${state.trainStationFeatures.length})${state.trainStationsError ? ' ⚠️' : ''}`;
```

**Step 4: Run test to verify it passes**

Run:

```bash
npx playwright test tests/e2e/train-overlays.spec.js --grep "opens a train station popup from cached metadata|styles train stations by passenger traffic"
```

Expected: PASS, with the popup rendering cached metadata and the style helper returning the configured passenger/non-passenger colors.

**Step 5: Commit**

```bash
git add tests/e2e/train-overlays.spec.js src/trains/trainStationsLayer.js src/trains/trainStationsInteractions.js src/trains/trainStationsManager.js src/ui/headerLayerManager.js src/ui/activeLayers.js
git commit -m "feat: render train stations"
```

### Task 5: Rebuild Both Overlays Correctly In Split View

**Files:**
- Modify: `tests/e2e/train-overlays.spec.js`
- Modify: `src/main.js`
- Modify: `src/trains/trainLocationsManager.js`
- Modify: `src/trains/trainLocationsInteractions.js`
- Modify: `src/trains/trainStationsManager.js`
- Modify: `src/trains/trainStationsInteractions.js`

**Step 1: Write the failing test**

Extend `tests/e2e/train-overlays.spec.js` with two split-view regressions:

```javascript
test('rebuilds train locations in split view', async ({ page }) => {
  await mockTrainApis(page);
  await mockTrainDetail(page);
  await signIn(page);

  await openLayersAccordion(page, 'Train Locations');
  await page.check('#train-locations-enabled');
  await page.click('#split-toggle');

  await expect(page.locator('#map-left .ol-viewport')).toBeVisible({ timeout: 10000 });
  await clickMapCenter(page, '#map-left');

  await expect(page.locator('.train-location-popup')).toContainText('Train 7', { timeout: 10000 });
});

test('rebuilds train stations in split view', async ({ page }) => {
  await mockTrainApis(page);
  await signIn(page);

  await openLayersAccordion(page, 'Train Stations');
  await page.check('#train-stations-enabled');
  await page.click('#split-toggle');

  await expect(page.locator('#map-right .ol-viewport')).toBeVisible({ timeout: 10000 });
  await clickMapCenter(page, '#map-right');

  await expect(page.locator('.train-station-popup')).toContainText('Helsinki Central', { timeout: 10000 });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
npx playwright test tests/e2e/train-overlays.spec.js --grep "rebuilds train locations in split view|rebuilds train stations in split view"
```

Expected: FAIL because the overlays are not rebuilt and click handlers are not rebound after switching to split mode.

**Step 3: Write minimal implementation**

In `src/main.js`, hook both overlays into split activation and deactivation:

```javascript
import('./trains/trainLocationsManager.js').then(({ rebuildTrainLocationLayers }) => {
  rebuildTrainLocationLayers();
});
import('./trains/trainStationsManager.js').then(({ rebuildTrainStationLayers }) => {
  rebuildTrainStationLayers();
});
import('./trains/trainLocationsInteractions.js').then(({ setupTrainLocationClickHandlers }) => {
  if (state.trainLocationsEnabled) setupTrainLocationClickHandlers();
});
import('./trains/trainStationsInteractions.js').then(({ setupTrainStationClickHandlers }) => {
  if (state.trainStationsEnabled) setupTrainStationClickHandlers();
});
```

Add those blocks in both:

- `activateSplitScreen()`
- `deactivateSplitScreen()`

Make the manager rebuild functions tolerant of empty layers but enabled state:

```javascript
export function rebuildTrainLocationLayers() {
  if (!state.trainLocationsEnabled) return;
  removeTrainLocationLayers();
  attachTrainLocationLayers();
  if (state.trainLocationFeatures.length) {
    if (state.isSplit) {
      updateTrainLocationLayer('left', state.trainLocationFeatures);
      updateTrainLocationLayer('right', state.trainLocationFeatures);
    } else {
      updateTrainLocationLayer('main', state.trainLocationFeatures);
    }
  }
}
```

Do the same for `rebuildTrainStationLayers()`.

Keep the interaction modules idempotent by starting each setup function with cleanup:

```javascript
export function setupTrainLocationClickHandlers() {
  cleanupTrainLocationInteractions();
  // re-register listeners for currently active maps
}

export function setupTrainStationClickHandlers() {
  cleanupTrainStationInteractions();
  // re-register listeners for currently active maps
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
npx playwright test tests/e2e/train-overlays.spec.js --grep "rebuilds train locations in split view|rebuilds train stations in split view"
```

Expected: PASS, with live train and station popups working on split-map instances after toggling split mode.

**Step 5: Commit**

```bash
git add tests/e2e/train-overlays.spec.js src/main.js src/trains/trainLocationsManager.js src/trains/trainLocationsInteractions.js src/trains/trainStationsManager.js src/trains/trainStationsInteractions.js
git commit -m "fix: rebuild train overlays in split view"
```

### Task 6: Run Verification And Lock The Branch State

**Files:**
- Modify: `tests/e2e/train-overlays.spec.js`

**Step 1: Run the complete train overlay suite**

Run:

```bash
npx playwright test tests/e2e/train-overlays.spec.js
```

Expected:

- all train overlay tests PASS
- no unexpected console or routing errors

**Step 2: Run nearby regression coverage**

Run:

```bash
npx playwright test tests/e2e/map.spec.js tests/e2e/weather.spec.js tests/e2e/ais.spec.js
```

Expected:

- existing map, weather, and AIS smoke coverage PASS

**Step 3: Run a production build**

Run:

```bash
npm run build
```

Expected: Vite build completes successfully with the new train modules included.

**Step 4: Commit**

```bash
git add tests/e2e/train-overlays.spec.js
git commit -m "test: verify train overlay regressions"
```

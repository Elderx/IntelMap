# Traffic Cameras Overlay Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a client-only traffic camera overlay that renders one marker per camera, opens an anchored popup with the freshest image on click, and supports permalink restore plus split-screen rebuilds.

**Architecture:** Add a new `trafficCameras` frontend module set that mirrors the existing overlay pattern: shared state in `src/state/store.js`, UI toggle wiring in `src/ui/headerLayerManager.js`, lifecycle management in `src/trafficCameras/trafficCameraManager.js`, feature styling in `src/trafficCameras/trafficCameraLayer.js`, and click popup handling in `src/trafficCameras/trafficCameraInteractions.js`. Use Playwright with mocked ArcGIS responses to drive implementation in small red-green-refactor cycles.

**Tech Stack:** OpenLayers 10.5.0, vanilla ES modules, Playwright, browser `fetch`, CSS modules imported through Vite.

---

### Task 1: Wire The Overlay Toggle And Permalink State

**Files:**
- Create: `tests/e2e/traffic-cameras.spec.js`
- Create: `src/trafficCameras/trafficCameraManager.js`
- Modify: `src/config/constants.js`
- Modify: `src/state/store.js`
- Modify: `src/ui/headerLayerManager.js`
- Modify: `src/ui/activeLayers.js`
- Modify: `src/map/permalink.js`
- Modify: `src/main.js`

**Step 1: Write the failing test**

Create `tests/e2e/traffic-cameras.spec.js` with an API mock helper and the first two behavioral tests:

```javascript
import { test, expect } from '@playwright/test';

const CAMERA_LOCATIONS = {
  features: [
    {
      attributes: {
        CameraId: 'C01622',
        Name_EN: 'Road 51 Inkoo',
        Name_FI: 'Tie 51 Inkoo',
        Municipality: 'Inkoo',
        RoadAddress: '51;14;422',
        CameraActive: 1,
        CollectionStatus: 'GATHERING'
      },
      geometry: {
        x: 2776308.100384243,
        y: 8442161.324849691
      }
    }
  ]
};

const CAMERA_PRESETS = {
  features: [
    {
      attributes: {
        CameraId: 'C01622',
        PresetId: 'C0162201',
        DirectionName: 'Westbound',
        ImageUrl: 'https://weathercam.digitraffic.fi/C0162201.jpg',
        PicLastModified: 1772625400000,
        PresetActive: 1,
        InCollection: 1,
        CameraResolution: '1280x720'
      }
    }
  ]
};

async function mockTrafficCameraApis(page) {
  await page.route('**/ArcGIS/rest/services/WeatherCams/FeatureServer/0/query**', async route => {
    await route.fulfill({ json: CAMERA_LOCATIONS });
  });

  await page.route('**/ArcGIS/rest/services/WeatherCams/FeatureServer/1/query**', async route => {
    await route.fulfill({ json: CAMERA_PRESETS });
  });
}

async function signIn(page) {
  await page.goto('/');
  const loginOverlay = page.locator('text=IntelMap — Sign in');
  await expect(loginOverlay).toBeVisible({ timeout: 10000 });
  await page.fill('input[placeholder="Username"]', 'admin');
  await page.fill('input[placeholder="Password"]', 'admin');
  await page.click('button:has-text("Sign in")');
  await expect(loginOverlay).toBeHidden();
  await page.waitForSelector('.ol-viewport');
}

test.describe('Traffic Cameras Overlay', () => {
  test.beforeEach(async ({ page }) => {
    await mockTrafficCameraApis(page);
  });

  test('toggle traffic camera overlay', async ({ page }) => {
    await signIn(page);
    await page.click('#layers-toggle');

    const accordionHeader = page.locator('.header-accordion-item').filter({ hasText: 'Traffic Cameras' }).locator('.header-accordion-header');
    await accordionHeader.click();

    const toggle = page.locator('#traffic-cameras-enabled');
    await toggle.check();
    await expect(toggle).toBeChecked();

    await toggle.uncheck();
    await expect(toggle).not.toBeChecked();
  });

  test('restore traffic camera overlay from permalink', async ({ page }) => {
    await page.goto('/?trafficCameras=1');
    const loginOverlay = page.locator('text=IntelMap — Sign in');
    await expect(loginOverlay).toBeVisible({ timeout: 10000 });
    await page.fill('input[placeholder="Username"]', 'admin');
    await page.fill('input[placeholder="Password"]', 'admin');
    await page.click('button:has-text("Sign in")');
    await expect(loginOverlay).toBeHidden();
    await page.waitForSelector('.ol-viewport');

    await page.click('#layers-toggle');
    await expect(page.locator('#traffic-cameras-enabled')).toBeChecked();
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
npx playwright test tests/e2e/traffic-cameras.spec.js
```

Expected: FAIL because the `Traffic Cameras` accordion and `#traffic-cameras-enabled` checkbox do not exist yet.

**Step 3: Write minimal implementation**

Add config, shared state, no-op manager exports, UI toggle wiring, active-layer entry, permalink encoding, and permalink restore.

Use this config block in `src/config/constants.js`:

```javascript
export const TRAFFIC_CAMERA_CONFIG = {
  locationsUrl: 'https://services1.arcgis.com/rhs5fjYxdOG1Et61/ArcGIS/rest/services/WeatherCams/FeatureServer/0/query?f=json&spatialRel=esriSpatialRelIntersects&returnGeometry=true&outFields=CameraId%2C%20Municipality%2C%20Region%2C%20RegionCode%2C%20Name_FI%2C%20Name_SV%2C%20Name_EN%2C%20RoadAddress%2C%20CameraActive%2C%20NearestWeatherStationId%2C%20Region_SV%2C%20Region_EN%2C%20RoadStationId%2C%20CollectionStatus%2C%20State&where=CollectionStatus%20NOT%20IN%20(%27REMOVED_PERMANENTLY%27)',
  presetsUrl: 'https://services1.arcgis.com/rhs5fjYxdOG1Et61/ArcGIS/rest/services/WeatherCams/FeatureServer/1/query?f=json&outFields=CameraId%2C%20PresetId%2C%20DirectionName%2C%20ImageUrl%2C%20PicLastModified%2C%20PresetActive%2C%20InCollection%2C%20CameraResolution&where=1%3D1',
  cameraPageBaseUrl: 'https://liikennetilanne.fintraffic.fi/kelikamerat/',
  zIndex: 107
};
```

Add these state keys in `src/state/store.js`:

```javascript
trafficCameraEnabled: false,
trafficCameraLayer: { main: null, left: null, right: null },
trafficCameraFeatures: [],
trafficCameraError: null,
trafficCameraLastFetch: null,
trafficCameraPresetIndex: {}
```

Create a minimal manager in `src/trafficCameras/trafficCameraManager.js`:

```javascript
import { state } from '../state/store.js';

export async function startTrafficCameraUpdates() {
  state.trafficCameraEnabled = true;
  state.trafficCameraError = null;
  import('../ui/activeLayers.js').then(({ updateActiveLayersPanel }) => {
    updateActiveLayersPanel();
  });
}

export function stopTrafficCameraUpdates() {
  state.trafficCameraEnabled = false;
  state.trafficCameraFeatures = [];
  state.trafficCameraError = null;
  import('../ui/activeLayers.js').then(({ updateActiveLayersPanel }) => {
    updateActiveLayersPanel();
  });
}

export function rebuildTrafficCameraLayers() {}
```

Add a new accordion in `src/ui/headerLayerManager.js` next to the other overlay sections:

```javascript
import { startTrafficCameraUpdates, stopTrafficCameraUpdates } from '../trafficCameras/trafficCameraManager.js';
import '../styles/traffic-cameras.css';

function createTrafficCamerasAccordion() {
  const content = document.createElement('div');
  content.style.padding = '8px 0';

  const row = createCheckboxRow(
    'Traffic Cameras',
    state.trafficCameraEnabled,
    async (checked) => {
      state.trafficCameraEnabled = checked;
      if (checked) {
        await startTrafficCameraUpdates();
      } else {
        stopTrafficCameraUpdates();
      }
      updateHeaderActiveLayers();
      updatePermalinkWithFeatures();
    },
    'traffic-cameras-enabled'
  );

  content.appendChild(row);
  return createAccordionItem('Traffic Cameras', content, false);
}
```

Add an active-layers entry in `src/ui/activeLayers.js`:

```javascript
if (state.trafficCameraEnabled) {
  const title = `Traffic Cameras${state.trafficCameraError ? ' ⚠️' : ''}`;
  addRow(title, '#c0392b', async () => {
    const { stopTrafficCameraUpdates } = await import('../trafficCameras/trafficCameraManager.js');
    stopTrafficCameraUpdates();
  });
}
```

Extend `src/map/permalink.js` with:

```javascript
let trafficCamerasStr = '';
if (state.trafficCameraEnabled) {
  trafficCamerasStr = '&trafficCameras=1';
}
```

and append it to the `params` string.

Restore in `src/main.js`:

```javascript
if (params.trafficCameras === '1') {
  state.trafficCameraEnabled = true;
  setTimeout(() => {
    import('./trafficCameras/trafficCameraManager.js').then(m => m.startTrafficCameraUpdates());
  }, 100);
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
npx playwright test tests/e2e/traffic-cameras.spec.js
```

Expected: PASS for the toggle and permalink restore tests, even though no markers render yet.

**Step 5: Commit**

```bash
git add tests/e2e/traffic-cameras.spec.js src/trafficCameras/trafficCameraManager.js src/config/constants.js src/state/store.js src/ui/headerLayerManager.js src/ui/activeLayers.js src/map/permalink.js src/main.js
git commit -m "feat: wire traffic camera overlay toggle"
```

### Task 2: Preload Camera Data And Render Markers

**Files:**
- Modify: `tests/e2e/traffic-cameras.spec.js`
- Create: `src/trafficCameras/trafficCameraLayer.js`
- Modify: `src/trafficCameras/trafficCameraManager.js`
- Modify: `src/ui/activeLayers.js`

**Step 1: Write the failing test**

Extend `tests/e2e/traffic-cameras.spec.js` with a count assertion after enabling:

```javascript
test('preloads traffic camera markers', async ({ page }) => {
  await signIn(page);
  await page.click('#layers-toggle');

  const accordionHeader = page.locator('.header-accordion-item').filter({ hasText: 'Traffic Cameras' }).locator('.header-accordion-header');
  await accordionHeader.click();

  await page.check('#traffic-cameras-enabled');
  await expect(page.locator('.active-layers-panel')).toContainText('Traffic Cameras (1)', { timeout: 10000 });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
npx playwright test tests/e2e/traffic-cameras.spec.js --grep "preloads traffic camera markers"
```

Expected: FAIL because the active layers panel still shows `Traffic Cameras` without a loaded count.

**Step 3: Write minimal implementation**

Create `src/trafficCameras/trafficCameraLayer.js`:

```javascript
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import Style from 'ol/style/Style.js';
import Icon from 'ol/style/Icon.js';
import { TRAFFIC_CAMERA_CONFIG } from '../config/constants.js';

function getTrafficCameraStyle() {
  return new Style({
    image: new Icon({
      src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="24" height="24">
          <circle cx="16" cy="16" r="12" fill="#c0392b" stroke="white" stroke-width="2"/>
          <path d="M10 13h8l4-3v12l-4-3h-8z" fill="white"/>
        </svg>
      `),
      anchor: [0.5, 0.5]
    }),
    zIndex: TRAFFIC_CAMERA_CONFIG.zIndex
  });
}

export function cameraToFeature(camera, freshestPreset) {
  const feature = new Feature({
    geometry: new Point([camera.geometry.x, camera.geometry.y]),
    isTrafficCamera: true,
    cameraId: camera.attributes.CameraId,
    name: camera.attributes.Name_EN || camera.attributes.Name_FI || camera.attributes.CameraId,
    municipality: camera.attributes.Municipality || '',
    roadAddress: camera.attributes.RoadAddress || '',
    imageUrl: freshestPreset?.ImageUrl || null,
    directionName: freshestPreset?.DirectionName || '',
    picLastModified: freshestPreset?.PicLastModified || null,
    cameraResolution: freshestPreset?.CameraResolution || null,
    cameraPageUrl: `https://liikennetilanne.fintraffic.fi/kelikamerat/?cameraId=${camera.attributes.CameraId}`
  });

  feature.setStyle(getTrafficCameraStyle());
  return feature;
}

export function createTrafficCameraLayer() {
  return new VectorLayer({
    source: new VectorSource(),
    zIndex: TRAFFIC_CAMERA_CONFIG.zIndex,
    className: 'traffic-camera-layer'
  });
}
```

Replace the no-op manager logic in `src/trafficCameras/trafficCameraManager.js` with preload logic:

```javascript
import { state } from '../state/store.js';
import { TRAFFIC_CAMERA_CONFIG } from '../config/constants.js';
import { createTrafficCameraLayer, cameraToFeature } from './trafficCameraLayer.js';

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Traffic camera request failed: ${response.status}`);
  }
  return response.json();
}

function buildFreshestPresetIndex(presetFeatures) {
  return presetFeatures.reduce((acc, feature) => {
    const preset = feature.attributes;
    if (preset.PresetActive !== 1 || preset.InCollection !== 1) {
      return acc;
    }
    const current = acc[preset.CameraId];
    if (!current || preset.PicLastModified > current.PicLastModified) {
      acc[preset.CameraId] = preset;
    }
    return acc;
  }, {});
}

function updateTrafficCameraLayer(mapKey, features) {
  const layer = state.trafficCameraLayer[mapKey];
  if (!layer) return;
  const source = layer.getSource();
  source.clear();
  source.addFeatures(features);
}

function attachLayers() {
  if (state.isSplit) {
    if (state.leftMap && !state.trafficCameraLayer.left) {
      state.trafficCameraLayer.left = createTrafficCameraLayer();
      state.leftMap.addLayer(state.trafficCameraLayer.left);
    }
    if (state.rightMap && !state.trafficCameraLayer.right) {
      state.trafficCameraLayer.right = createTrafficCameraLayer();
      state.rightMap.addLayer(state.trafficCameraLayer.right);
    }
  } else if (state.map && !state.trafficCameraLayer.main) {
    state.trafficCameraLayer.main = createTrafficCameraLayer();
    state.map.addLayer(state.trafficCameraLayer.main);
  }
}

export async function startTrafficCameraUpdates() {
  if (state.trafficCameraFeatures.length) {
    attachLayers();
    updateTrafficCameraLayer(state.isSplit ? 'left' : 'main', state.trafficCameraFeatures);
    if (state.isSplit) updateTrafficCameraLayer('right', state.trafficCameraFeatures);
    return;
  }

  state.trafficCameraEnabled = true;
  state.trafficCameraError = null;
  attachLayers();

  const [locations, presets] = await Promise.all([
    fetchJson(TRAFFIC_CAMERA_CONFIG.locationsUrl),
    fetchJson(TRAFFIC_CAMERA_CONFIG.presetsUrl)
  ]);

  state.trafficCameraPresetIndex = buildFreshestPresetIndex(presets.features || []);
  state.trafficCameraFeatures = (locations.features || []).map(camera => {
    return cameraToFeature(camera, state.trafficCameraPresetIndex[camera.attributes.CameraId]);
  });
  state.trafficCameraLastFetch = Date.now();

  if (state.isSplit) {
    updateTrafficCameraLayer('left', state.trafficCameraFeatures);
    updateTrafficCameraLayer('right', state.trafficCameraFeatures);
  } else {
    updateTrafficCameraLayer('main', state.trafficCameraFeatures);
  }

  import('../ui/activeLayers.js').then(({ updateActiveLayersPanel }) => updateActiveLayersPanel());
}
```

Update `src/ui/activeLayers.js` so the row includes the loaded count:

```javascript
if (state.trafficCameraEnabled) {
  const count = state.trafficCameraFeatures.length;
  const title = `Traffic Cameras (${count})${state.trafficCameraError ? ' ⚠️' : ''}`;
  addRow(title, '#c0392b', async () => {
    const { stopTrafficCameraUpdates } = await import('../trafficCameras/trafficCameraManager.js');
    stopTrafficCameraUpdates();
  });
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
npx playwright test tests/e2e/traffic-cameras.spec.js --grep "preloads traffic camera markers"
```

Expected: PASS, with the active layers panel showing `Traffic Cameras (1)`.

**Step 5: Commit**

```bash
git add tests/e2e/traffic-cameras.spec.js src/trafficCameras/trafficCameraLayer.js src/trafficCameras/trafficCameraManager.js src/ui/activeLayers.js
git commit -m "feat: preload traffic camera markers"
```

### Task 3: Add Anchored Popup With Freshest Image And Camera Page Link

**Files:**
- Modify: `tests/e2e/traffic-cameras.spec.js`
- Create: `src/trafficCameras/trafficCameraInteractions.js`
- Create: `src/styles/traffic-cameras.css`
- Modify: `src/ui/headerLayerManager.js`
- Modify: `src/main.js`

**Step 1: Write the failing test**

Update the preset mock so one camera has two presets, then add a popup test:

```javascript
const CAMERA_PRESETS = {
  features: [
    {
      attributes: {
        CameraId: 'C01622',
        PresetId: 'C0162201',
        DirectionName: 'Older direction',
        ImageUrl: 'https://weathercam.digitraffic.fi/C0162201.jpg',
        PicLastModified: 1772625400000,
        PresetActive: 1,
        InCollection: 1,
        CameraResolution: '1280x720'
      }
    },
    {
      attributes: {
        CameraId: 'C01622',
        PresetId: 'C0162202',
        DirectionName: 'Freshest direction',
        ImageUrl: 'https://weathercam.digitraffic.fi/C0162202.jpg',
        PicLastModified: 1772625900000,
        PresetActive: 1,
        InCollection: 1,
        CameraResolution: '1280x720'
      }
    }
  ]
};

test('opens popup with freshest traffic camera image', async ({ page }) => {
  await signIn(page);
  await page.click('#layers-toggle');
  const accordionHeader = page.locator('.header-accordion-item').filter({ hasText: 'Traffic Cameras' }).locator('.header-accordion-header');
  await accordionHeader.click();
  await page.check('#traffic-cameras-enabled');

  const map = page.locator('#map');
  await map.click({ position: { x: 300, y: 300 } });

  const popup = page.locator('.traffic-camera-popup');
  await expect(popup).toBeVisible({ timeout: 10000 });
  await expect(popup).toContainText('Freshest direction');
  await expect(popup.locator('img')).toHaveAttribute('src', /C0162202\.jpg/);
  await expect(popup.locator('a')).toHaveAttribute('href', /cameraId=C01622/);
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
npx playwright test tests/e2e/traffic-cameras.spec.js --grep "opens popup with freshest traffic camera image"
```

Expected: FAIL because clicking the map does not open any traffic camera popup yet.

**Step 3: Write minimal implementation**

Create `src/trafficCameras/trafficCameraInteractions.js`:

```javascript
import Overlay from 'ol/Overlay.js';
import { unByKey } from 'ol/Observable.js';
import { state } from '../state/store.js';

const popupOverlays = { main: null, left: null, right: null };
const clickKeys = { main: null, left: null, right: null };

function formatTimestamp(value) {
  if (!value) return 'Unknown';
  return new Date(value).toLocaleString();
}

function buildPopupContent(feature) {
  const container = document.createElement('div');
  container.className = 'traffic-camera-popup';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'popup-close';
  closeBtn.type = 'button';
  closeBtn.textContent = '×';

  const title = document.createElement('h3');
  title.textContent = feature.get('name');

  const meta = document.createElement('div');
  meta.className = 'traffic-camera-meta';
  meta.innerHTML = `
    <div><strong>Camera ID:</strong> ${feature.get('cameraId')}</div>
    <div><strong>Direction:</strong> ${feature.get('directionName') || 'N/A'}</div>
    <div><strong>Updated:</strong> ${formatTimestamp(feature.get('picLastModified'))}</div>
  `;

  const imageRegion = document.createElement('div');
  imageRegion.className = 'traffic-camera-image-region';

  const img = document.createElement('img');
  img.src = feature.get('imageUrl');
  img.alt = `${feature.get('name')} latest image`;
  img.className = 'traffic-camera-image';
  imageRegion.appendChild(img);

  const link = document.createElement('a');
  link.href = feature.get('cameraPageUrl');
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Open camera page';
  link.className = 'traffic-camera-link';

  container.append(closeBtn, title, meta, imageRegion, link);
  return { container, closeBtn };
}

function getMapForKey(mapKey) {
  return mapKey === 'main' ? state.map : mapKey === 'left' ? state.leftMap : state.rightMap;
}

function showPopup(feature, mapKey, coordinate) {
  const map = getMapForKey(mapKey);
  if (!map) return;

  if (popupOverlays[mapKey]) {
    map.removeOverlay(popupOverlays[mapKey]);
  }

  const { container, closeBtn } = buildPopupContent(feature);
  const overlay = new Overlay({
    element: container,
    position: coordinate,
    positioning: 'bottom-center',
    stopEvent: true,
    autoPan: { margin: 24 }
  });

  map.addOverlay(overlay);
  popupOverlays[mapKey] = overlay;

  closeBtn.addEventListener('click', () => {
    map.removeOverlay(overlay);
    popupOverlays[mapKey] = null;
  });
}

export function setupTrafficCameraClickHandlers() {
  ['main', 'left', 'right'].forEach(mapKey => {
    const map = getMapForKey(mapKey);
    if (!map) return;

    if (clickKeys[mapKey]) {
      unByKey(clickKeys[mapKey]);
    }

    clickKeys[mapKey] = map.on('click', (evt) => {
      const feature = map.forEachFeatureAtPixel(evt.pixel, candidate => {
        return candidate.get('isTrafficCamera') ? candidate : null;
      });

      if (feature) {
        showPopup(feature, mapKey, feature.getGeometry().getCoordinates());
      } else if (popupOverlays[mapKey]) {
        map.removeOverlay(popupOverlays[mapKey]);
        popupOverlays[mapKey] = null;
      }
    });
  });
}

export function cleanupTrafficCameraInteractions() {
  ['main', 'left', 'right'].forEach(mapKey => {
    const map = getMapForKey(mapKey);
    if (clickKeys[mapKey]) {
      unByKey(clickKeys[mapKey]);
      clickKeys[mapKey] = null;
    }
    if (map && popupOverlays[mapKey]) {
      map.removeOverlay(popupOverlays[mapKey]);
      popupOverlays[mapKey] = null;
    }
  });
}
```

Create `src/styles/traffic-cameras.css`:

```css
.traffic-camera-popup {
  position: relative;
  background: rgba(255, 255, 255, 0.98);
  border: 1px solid #ccc;
  border-radius: 6px;
  padding: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
  max-width: min(90vw, 1320px);
  max-height: min(80vh, 900px);
  overflow: auto;
}

.traffic-camera-popup h3 {
  margin: 0 0 8px 0;
  font-size: 14px;
}

.traffic-camera-image-region {
  overflow: auto;
  max-height: 65vh;
  margin: 8px 0;
}

.traffic-camera-image {
  display: block;
  max-width: none;
  width: auto;
  height: auto;
}

.traffic-camera-link {
  display: inline-block;
  margin-top: 8px;
}

.traffic-camera-popup .popup-close {
  position: absolute;
  top: 6px;
  right: 8px;
  background: none;
  border: 0;
  cursor: pointer;
  font-size: 18px;
}
```

Wire the interaction lifecycle from `src/ui/headerLayerManager.js`:

```javascript
if (checked) {
  await startTrafficCameraUpdates();
  const { setupTrafficCameraClickHandlers } = await import('../trafficCameras/trafficCameraInteractions.js');
  setupTrafficCameraClickHandlers();
} else {
  const { cleanupTrafficCameraInteractions } = await import('../trafficCameras/trafficCameraInteractions.js');
  cleanupTrafficCameraInteractions();
  stopTrafficCameraUpdates();
}
```

Restore click handlers in `src/main.js` along with permalink startup:

```javascript
if (params.trafficCameras === '1') {
  state.trafficCameraEnabled = true;
  setTimeout(() => {
    import('./trafficCameras/trafficCameraManager.js').then(m => m.startTrafficCameraUpdates());
    import('./trafficCameras/trafficCameraInteractions.js').then(m => m.setupTrafficCameraClickHandlers());
  }, 100);
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
npx playwright test tests/e2e/traffic-cameras.spec.js --grep "opens popup with freshest traffic camera image"
```

Expected: PASS, and the popup uses `C0162202.jpg` rather than the older preset image.

**Step 5: Commit**

```bash
git add tests/e2e/traffic-cameras.spec.js src/trafficCameras/trafficCameraInteractions.js src/styles/traffic-cameras.css src/ui/headerLayerManager.js src/main.js
git commit -m "feat: add traffic camera popup interactions"
```

### Task 4: Handle Missing Images And Split-Screen Rebuilds

**Files:**
- Modify: `tests/e2e/traffic-cameras.spec.js`
- Modify: `src/trafficCameras/trafficCameraInteractions.js`
- Modify: `src/trafficCameras/trafficCameraManager.js`
- Modify: `src/main.js`

**Step 1: Write the failing test**

Add two more tests to `tests/e2e/traffic-cameras.spec.js`:

```javascript
test('shows fallback text when no preset image exists', async ({ page }) => {
  await page.route('**/ArcGIS/rest/services/WeatherCams/FeatureServer/1/query**', async route => {
    await route.fulfill({ json: { features: [] } });
  });

  await signIn(page);
  await page.click('#layers-toggle');
  const accordionHeader = page.locator('.header-accordion-item').filter({ hasText: 'Traffic Cameras' }).locator('.header-accordion-header');
  await accordionHeader.click();
  await page.check('#traffic-cameras-enabled');

  await page.locator('#map').click({ position: { x: 300, y: 300 } });
  await expect(page.locator('.traffic-camera-popup')).toContainText('Latest image unavailable');
});

test('keeps traffic cameras working after switching to split view', async ({ page }) => {
  await signIn(page);
  await page.click('#layers-toggle');
  const accordionHeader = page.locator('.header-accordion-item').filter({ hasText: 'Traffic Cameras' }).locator('.header-accordion-header');
  await accordionHeader.click();
  await page.check('#traffic-cameras-enabled');

  await page.click('#split-toggle');
  await expect(page.locator('#map-left')).toBeVisible();
  await page.locator('#map-left').click({ position: { x: 300, y: 300 } });
  await expect(page.locator('.traffic-camera-popup')).toBeVisible({ timeout: 10000 });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
npx playwright test tests/e2e/traffic-cameras.spec.js --grep "fallback text|split view"
```

Expected:
- FAIL because missing-preset cameras do not render fallback text yet
- FAIL because switching to split view drops the camera layers and click handlers

**Step 3: Write minimal implementation**

Update `src/trafficCameras/trafficCameraInteractions.js` so popup rendering handles missing images:

```javascript
function buildPopupContent(feature) {
  const container = document.createElement('div');
  container.className = 'traffic-camera-popup';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'popup-close';
  closeBtn.type = 'button';
  closeBtn.textContent = '×';

  const title = document.createElement('h3');
  title.textContent = feature.get('name');

  const meta = document.createElement('div');
  meta.className = 'traffic-camera-meta';
  meta.innerHTML = `
    <div><strong>Camera ID:</strong> ${feature.get('cameraId')}</div>
    <div><strong>Direction:</strong> ${feature.get('directionName') || 'N/A'}</div>
    <div><strong>Updated:</strong> ${formatTimestamp(feature.get('picLastModified'))}</div>
  `;

  const imageRegion = document.createElement('div');
  imageRegion.className = 'traffic-camera-image-region';

  if (feature.get('imageUrl')) {
    const img = document.createElement('img');
    img.src = feature.get('imageUrl');
    img.alt = `${feature.get('name')} latest image`;
    img.className = 'traffic-camera-image';
    img.addEventListener('error', () => {
      imageRegion.textContent = 'Image failed to load';
    });
    imageRegion.appendChild(img);
  } else {
    imageRegion.textContent = 'Latest image unavailable';
  }

  const link = document.createElement('a');
  link.href = feature.get('cameraPageUrl');
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Open camera page';
  link.className = 'traffic-camera-link';

  container.append(closeBtn, title, meta, imageRegion, link);
  return { container, closeBtn };
}
```

Add real stop and rebuild behavior in `src/trafficCameras/trafficCameraManager.js`:

```javascript
function removeLayer(mapKey) {
  const layer = state.trafficCameraLayer[mapKey];
  if (!layer) return;
  const map = mapKey === 'main' ? state.map : mapKey === 'left' ? state.leftMap : state.rightMap;
  if (map) map.removeLayer(layer);
  state.trafficCameraLayer[mapKey] = null;
}

export function stopTrafficCameraUpdates() {
  ['main', 'left', 'right'].forEach(removeLayer);
  state.trafficCameraEnabled = false;
  state.trafficCameraFeatures = [];
  state.trafficCameraError = null;
  state.trafficCameraLastFetch = null;
  state.trafficCameraPresetIndex = {};
  import('../ui/activeLayers.js').then(({ updateActiveLayersPanel }) => updateActiveLayersPanel());
}

export function rebuildTrafficCameraLayers() {
  if (!state.trafficCameraEnabled || !state.trafficCameraFeatures.length) {
    return;
  }

  ['main', 'left', 'right'].forEach(removeLayer);
  attachLayers();

  if (state.isSplit) {
    updateTrafficCameraLayer('left', state.trafficCameraFeatures);
    updateTrafficCameraLayer('right', state.trafficCameraFeatures);
  } else {
    updateTrafficCameraLayer('main', state.trafficCameraFeatures);
  }
}
```

Hook split-screen rebuilds in `src/main.js` after the weather and GPX rebuilds:

```javascript
import('./trafficCameras/trafficCameraManager.js').then(({ rebuildTrafficCameraLayers }) => {
  rebuildTrafficCameraLayers();
});
import('./trafficCameras/trafficCameraInteractions.js').then(({ setupTrafficCameraClickHandlers }) => {
  setupTrafficCameraClickHandlers();
});
```

Add the same pair to both `activateSplitScreen()` and `deactivateSplitScreen()`.

**Step 4: Run test to verify it passes**

Run:

```bash
npx playwright test tests/e2e/traffic-cameras.spec.js --grep "fallback text|split view"
```

Expected: PASS for both the missing-preset fallback and split-screen rebuild tests.

**Step 5: Commit**

```bash
git add tests/e2e/traffic-cameras.spec.js src/trafficCameras/trafficCameraInteractions.js src/trafficCameras/trafficCameraManager.js src/main.js
git commit -m "fix: keep traffic cameras working in split view"
```

### Task 5: Final Verification And Regression Check

**Files:**
- Modify: `src/trafficCameras/trafficCameraManager.js`
- Modify: `src/trafficCameras/trafficCameraInteractions.js`
- Modify: `tests/e2e/traffic-cameras.spec.js`

**Step 1: Write the final failing test for image load failure**

Add one last regression test:

```javascript
test('shows a readable message when the camera image request fails', async ({ page }) => {
  await page.route('**/weathercam.digitraffic.fi/*.jpg', async route => {
    await route.abort();
  });

  await signIn(page);
  await page.click('#layers-toggle');
  const accordionHeader = page.locator('.header-accordion-item').filter({ hasText: 'Traffic Cameras' }).locator('.header-accordion-header');
  await accordionHeader.click();
  await page.check('#traffic-cameras-enabled');

  await page.locator('#map').click({ position: { x: 300, y: 300 } });
  await expect(page.locator('.traffic-camera-popup')).toContainText('Image failed to load');
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
npx playwright test tests/e2e/traffic-cameras.spec.js --grep "image request fails"
```

Expected: FAIL until the popup image error path is confirmed and stable.

**Step 3: Write minimal implementation**

If Task 4's image error path is not yet sufficient, make it explicit:

```javascript
img.addEventListener('error', () => {
  imageRegion.innerHTML = '';
  const fallback = document.createElement('div');
  fallback.className = 'traffic-camera-image-fallback';
  fallback.textContent = 'Image failed to load';
  imageRegion.appendChild(fallback);
});
```

Optional CSS in `src/styles/traffic-cameras.css`:

```css
.traffic-camera-image-fallback {
  padding: 12px;
  background: #f6f6f6;
  border: 1px solid #ddd;
  border-radius: 4px;
  color: #555;
}
```

**Step 4: Run all verification commands**

Run:

```bash
npx playwright test tests/e2e/traffic-cameras.spec.js
npx playwright test tests/e2e/map.spec.js tests/e2e/weather.spec.js tests/e2e/ais.spec.js
npm run build
```

Expected:

- All traffic camera overlay tests PASS
- Existing map, weather, and AIS smoke tests PASS
- `npm run build` completes successfully

**Step 5: Commit**

```bash
git add src/trafficCameras/trafficCameraManager.js src/trafficCameras/trafficCameraInteractions.js src/styles/traffic-cameras.css tests/e2e/traffic-cameras.spec.js
git commit -m "test: verify traffic camera overlay flows"
```

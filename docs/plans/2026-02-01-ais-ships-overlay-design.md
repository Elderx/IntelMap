# AIS Ships Overlay Design

> **Goal:** Add live vessel tracking overlay using AISStream.io WebSocket API with color-coded icons by vessel type, hover preview popups, click-to-pin detailed information, and PostGIS storage for future historical playback.

**Architecture:** Poll-based WebSocket connections at 30-second intervals, vessel positions stored to PostGIS for historical queries, OpenLayers VectorLayer with rotated SVG icons, split-screen optimization with single API call.

**Tech Stack:** AISStream.io WebSocket API, OpenLayers 10.5.0, PostgreSQL + PostGIS, vanilla JavaScript ES modules.

---

## Section 1: Overview & Architecture

**Feature Summary:**

The AIS Ships overlay displays live vessel positions from the AISStream.io WebSocket API. Vessels are rendered as color-coded icons based on ship type (passenger, cargo, tanker, fishing, etc.). Users can hover over icons for a quick preview or click to pin a detailed popup showing all available AIS data (MMSI, name, cargo type, destination, speed, course, dimensions).

**Data Flow:**

```
AISStream.io WebSocket (wss://stream.aisstream.io/v0/stream)
    ↓ (subscribe to bbox)
PositionReport messages (MMSI, lat/lon, speed, course, type)
    ↓
store to PostGIS vessel_positions table
    ↓
convert to OpenLayers Features with styling
    ↓
add to VectorLayer for each active map
    ↓
user interaction (hover preview, click-to-pin)
```

**Polling Strategy:**

Unlike true real-time tracking, we use 30-second polling intervals to match API limits and reduce computational load. Each poll:
1. Opens WebSocket connection
2. Subscribes to current view bounding box
3. Accumulates vessel positions for 5 seconds
4. Closes connection
5. Updates layers with new data

**Split-Screen Optimization:**

When in split-screen mode, we make a single API call using the left map's extent and display results on both maps, avoiding duplicate WebSocket subscriptions.

---

## Section 2: WebSocket Integration & Data Flow

**AISStream.io API:**

```javascript
const AISSTREAM_CONFIG = {
  wsUrl: 'wss://stream.aisstream.io/v0/stream',
  reconnectDelay: 5000,    // 5 seconds
  maxReconnectAttempts: 10
};
```

**Connection Management:**

```javascript
export function connectToAISStream(bbox, onMessage) {
  const ws = new WebSocket(AISSTREAM_CONFIG.wsUrl);

  ws.onopen = () => {
    console.log('[AISStream] Connected');

    // Subscribe to bounding box
    const subscribeMsg = {
      type: 'Subscription',
      bbox: bbox, // [minLon, minLat, maxLon, maxLat]
      filters: [
        { key: 'MessageType', value: 'PositionReport' }
      ]
    };
    ws.send(JSON.stringify(subscribeMsg));
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'PositionReport') {
      onMessage(data);
    }
  };

  ws.onerror = (err) => {
    console.error('[AISStream] WebSocket error:', err);
  };

  ws.onclose = () => {
    console.log('[AISStream] Connection closed');
  };

  return ws;
}
```

**Data Accumulation Pattern:**

```javascript
// In aisManager.js
let accumulatedVessels = new Map();

function startAccumulation() {
  accumulatedVessels.clear();

  const onMessage = (vesselData) => {
    const mmsi = vesselData.mmsi;
    accumulatedVessels.set(mmsi, vesselData);
  };

  const ws = connectToAISStream(bbox, onMessage);

  // After 5 seconds, close connection and process
  setTimeout(() => {
    ws.close();
    const vessels = Array.from(accumulatedVessels.values());
    processVessels(vessels);
  }, 5000);
}
```

---

## Section 3: Layer Creation & Polling

**Layer Factory:**

```javascript
// src/ais/aisLayer.js

export function createAisLayer() {
  return new VectorLayer({
    source: new VectorSource(),
    style: aisStyleFunction,
    zIndex: 105, // Above aircraft (100), below user features (190+)
    className: 'ais-layer'
  });
}
```

**Vessel-to-Feature Conversion:**

```javascript
export function vesselToFeature(vesselData) {
  const {
    mmsi, latitude, longitude, speed, course,
    shipType, name, destination
  } = vesselData;

  if (!latitude || !longitude) return null;

  const coord = fromLonLat([longitude, latitude], 'EPSG:3857');

  const feature = new Feature({
    geometry: new Point(coord),
    mmsi,
    name,
    shipType,
    speed,
    course,
    destination
  });

  return feature;
}
```

**Styling Function:**

```javascript
function aisStyleFunction(feature) {
  const shipType = feature.get('shipType') || 'unknown';
  const course = feature.get('course') || 0;

  return new Style({
    image: new Icon({
      src: getShipIconPath(shipType), // Returns SVG based on type
      rotation: course * Math.PI / 180, // Convert degrees to radians
      anchor: [0.5, 0.5],
      scale: 1
    })
  });
}
```

**Polling Manager:**

```javascript
// src/ais/aisManager.js

export function startAisUpdates() {
  if (state.aisUpdateInterval) return;

  // Create layers for active maps
  if (state.isSplit) {
    if (state.leftMap) {
      state.aisLayer.left = createAisLayer();
      state.leftMap.addLayer(state.aisLayer.left);
    }
    if (state.rightMap) {
      state.aisLayer.right = createAisLayer();
      state.rightMap.addLayer(state.aisLayer.right);
    }
  } else {
    if (state.map) {
      state.aisLayer.main = createAisLayer();
      state.map.addLayer(state.aisLayer.main);
    }
  }

  state.aisEnabled = true;

  // Initial fetch
  updateAisData();

  // Start polling interval (30 seconds)
  const intervalMs = state.aisRefreshInterval * 1000;
  state.aisUpdateInterval = setInterval(updateAisData, intervalMs);
}

async function updateAisData() {
  // Use left map extent in split mode
  const map = state.isSplit ? state.leftMap : state.map;
  if (!map) return;

  // Get current view extent and transform to WGS84
  const extent = map.getView().calculateExtent();
  const bbox = transformExtent(extent, 'EPSG:3857', 'EPSG:4326');

  // Connect to WebSocket and accumulate vessels
  const vessels = await fetchAisVessels(bbox);

  if (!vessels) return; // Error state

  // Convert to features
  const features = vessels
    .map(v => vesselToFeature(v))
    .filter(f => f !== null);

  state.aisFeatures = features;

  // Update layers for all active maps
  if (state.isSplit) {
    updateAisLayer('left', features);
    updateAisLayer('right', features);
  } else {
    updateAisLayer('main', features);
  }

  // Update active layers panel
  import('../ui/activeLayers.js').then(({ updateActiveLayersPanel }) => {
    updateActiveLayersPanel();
  });
}
```

---

## Section 4: Vessel Icons & Popup Data

**Color-Coded Icons by Ship Type:**

```javascript
function getShipIconPath(shipType) {
  // Return SVG icon path based on AIS ship type
  const iconMap = {
    'Passenger': '/icons/ship-passenger.svg',
    'Cargo': '/icons/ship-cargo.svg',
    'Tanker': '/icons/ship-tanker.svg',
    'Fishing': '/icons/ship-fishing.svg',
    'Tug': '/icons/ship-tug.svg',
    'default': '/icons/ship-default.svg'
  };

  return iconMap[shipType] || iconMap['default'];
}
```

**SVG Icon Examples:**

```svg
<!-- icons/ship-passenger.svg - Blue -->
<svg width="24" height="24" viewBox="0 0 24 24">
  <path d="M12 2L2 20h20L12 2zm0 4l6 12H6l6-12z" fill="#2196F3"/>
</svg>

<!-- icons/ship-cargo.svg - Green -->
<svg width="24" height="24" viewBox="0 0 24 24">
  <path d="M12 2L2 20h20L12 2z" fill="#4CAF50"/>
</svg>

<!-- icons/ship-tanker.svg - Red -->
<svg width="24" height="24" viewBox="0 0 24 24">
  <path d="M12 2L2 20h20L12 2z" fill="#F44336"/>
</svg>

<!-- icons/ship-fishing.svg - Orange -->
<svg width="24" height="24" viewBox="0 0 24 24">
  <path d="M12 2L2 20h20L12 2z" fill="#FF9800"/>
</svg>
```

**Hover Preview Popup:**

Always displayed fields (when available):
- MMSI
- Name
- Cargo type
- Destination
- Speed (knots)

```javascript
function createHoverPopup(feature) {
  const mmsi = feature.get('mmsi');
  const name = feature.get('name') || 'Unknown';
  const shipType = feature.get('shipType') || 'Unknown';
  const destination = feature.get('destination') || 'N/A';
  const speed = feature.get('speed') || 0;

  return `
    <div class="vessel-popup hover">
      <strong>${name}</strong> (${shipType})<br>
      MMSI: ${mmsi}<br>
      Destination: ${destination}<br>
      Speed: ${speed.toFixed(1)} knots
    </div>
  `;
}
```

**Click-to-Pin Popup (Full Details):**

All available AIS data displayed:
- MMSI, IMO, Call Sign
- Name, Ship Type
- Position (lat/lon)
- Speed, Course, Heading
- Destination, ETA
- Dimensions (length, width)
- Draft, Cargo type

```javascript
function createPinnedPopup(feature) {
  const mmsi = feature.get('mmsi');
  const name = feature.get('name') || 'Unknown';
  const shipType = feature.get('shipType') || 'Unknown';
  const destination = feature.get('destination') || 'N/A';
  const speed = feature.get('speed') || 0;
  const course = feature.get('course') || 0;
  const imo = feature.get('imo') || 'N/A';
  const callSign = feature.get('callSign') || 'N/A';
  const dimension = feature.get('dimension') || {};
  const length = dimension.length || 'N/A';
  const width = dimension.width || 'N/A';
  const draft = feature.get('draft') || 'N/A';
  const cargo = feature.get('cargo') || 'N/A';

  return `
    <div class="vessel-popup pinned">
      <button class="popup-close">&times;</button>
      <h3>${name}</h3>
      <table class="popup-table">
        <tr><td>MMSI:</td><td>${mmsi}</td></tr>
        <tr><td>IMO:</td><td>${imo}</td></tr>
        <tr><td>Call Sign:</td><td>${callSign}</td></tr>
        <tr><td>Type:</td><td>${shipType}</td></tr>
        <tr><td>Destination:</td><td>${destination}</td></tr>
        <tr><td>Speed:</td><td>${speed.toFixed(1)} knots</td></tr>
        <tr><td>Course:</td><td>${course.toFixed(0)}°</td></tr>
        <tr><td>Length:</td><td>${length}m</td></tr>
        <tr><td>Width:</td><td>${width}m</td></tr>
        <tr><td>Draft:</td><td>${draft}m</td></tr>
        <tr><td>Cargo:</td><td>${cargo}</td></tr>
      </table>
    </div>
  `;
}
```

---

## Section 5: Historical Data Architecture

**Storage Strategy:**

All vessel positions received from AISStream.io are stored to PostgreSQL for future historical playback. The design uses PostGIS for:
- Efficient spatial queries (find vessels in area at specific time)
- Time-series indexing (fast retrieval by timestamp)
- JSONB storage for flexible raw data

**Playback Architecture (Future):**

```
Time Slider UI (not implementing now)
    ↓ (select time range)
Backend API: GET /api/ais/history?from=X&to=Y&bbox=...
    ↓
Query PostGIS: SELECT * FROM vessel_positions WHERE timestamp BETWEEN X AND Y AND ST_Intersects(geom, bbox)
    ↓
Return vessel positions as GeoJSON
    ↓
Render on map with trail lines
```

**Data Retention Policy:**

- Default: 30 days
- User-configurable via settings
- Automatic cleanup via cron job or scheduled task
- Cleanup query: `DELETE FROM vessel_positions WHERE timestamp < NOW() - INTERVAL '30 days'`

---

## Section 6: PostGIS Schema for Vessel History

**Database Schema:**

```sql
CREATE TABLE vessel_positions (
  id BIGSERIAL PRIMARY KEY,
  mmsi VARCHAR(9) NOT NULL,
  timestamp BIGINT NOT NULL,
  geom GEOMETRY(POINT, 4326) NOT NULL,  -- WGS84
  speed REAL,
  course REAL,
  navigation_status VARCHAR(50),
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_vessel_positions_mmsi_time
  ON vessel_positions (mmsi, timestamp DESC);

CREATE INDEX idx_vessel_positions_time
  ON vessel_positions (timestamp DESC);

CREATE INDEX idx_vessel_positions_geom
  ON vessel_positions USING GIST (geom);
```

**Backend Storage Operation:**

```javascript
// server/routes/ais.js

import { pool } from './db.js';

export async function saveVesselPosition(vesselData) {
  const {
    mmsi, latitude, longitude, speed, course,
    navigationStatus, ...rest
  } = vesselData;

  const timestamp = Date.now();

  const query = `
    INSERT INTO vessel_positions
      (mmsi, timestamp, geom, speed, course, navigation_status, raw_data)
    VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326), $5, $6, $7, $8)
  `;

  const values = [
    mmsi, timestamp, longitude, latitude,
    speed, course, navigationStatus,
    JSON.stringify(vesselData)
  ];

  await pool.query(query, values);
}
```

**Historical Query API (Future):**

```javascript
// Future implementation
export async function getVesselHistory(from, to, bbox) {
  const query = `
    SELECT
      mmsi,
      timestamp,
      ST_AsGeoJSON(geom) as geometry,
      speed,
      course,
      raw_data
    FROM vessel_positions
    WHERE timestamp BETWEEN $1 AND $2
      AND ST_Intersects(
        geom,
        ST_SetSRID(ST_MakeBox2D(
          ST_Point($3, $4),
          ST_Point($5, $6)
        ), 4326)
      )
    ORDER BY timestamp DESC
  `;

  const [minLon, minLat, maxLon, maxLat] = bbox;
  const values = [from, to, minLon, minLat, maxLon, maxLat];

  const result = await pool.query(query, values);
  return result.rows;
}
```

---

## Section 7: API Integration & Error Handling

**Rate Limit Handling:**

```javascript
state.aisError = {
  type: 'rate_limit',
  message: 'AISStream rate limit exceeded. Retry in 60 seconds.',
  time: Date.now(),
  retryAfter: Date.now() + 60000
};

// In polling loop, check cooldown before reconnecting
if (state.aisError && state.aisError.retryAfter > Date.now()) {
  const remaining = Math.ceil((state.aisError.retryAfter - Date.now()) / 1000);
  console.log(`[AIS] Rate limit cooldown. Retry in ${remaining}s`);
  return; // Skip this update cycle
}
```

**Network Error Handling:**

```javascript
ws.onerror = (err) => {
  console.error('[AISStream] WebSocket error:', err);
  state.aisError = {
    type: 'network',
    message: 'WebSocket connection failed',
    time: Date.now()
  };
  // Show visual warning in UI
  import('../ui/aisErrorBanner.js').then(({ showAisError }) => {
    showAisError('AIS connection failed. Retrying...');
  });
};
```

**Data Validation:**

```javascript
function validateVesselData(vessel) {
  // MMSI must be 9 digits
  if (!/^\d{9}$/.test(vessel.mmsi)) return false;

  // Latitude must be between -90 and 90
  if (vessel.latitude < -90 || vessel.latitude > 90) return false;

  // Longitude must be between -180 and 180
  if (vessel.longitude < -180 || vessel.longitude > 180) return false;

  // Speed must be reasonable (< 50 knots)
  if (vessel.speed > 50) return false;

  return true;
}

// Filter invalid vessels
const validVessels = vessels.filter(validateVesselData);
```

---

## Section 8: UI Integration

**Header Accordion Control:**

```javascript
// src/ui/headerLayerManager.js

function createAisAccordion() {
  const accordion = createAccordionItem('Ships (AIS)', 'ais-toggle', state.aisEnabled);

  const content = document.createElement('div');
  content.className = 'accordion-content';

  // Refresh interval control
  const intervalControl = createIntervalControl(
    'Refresh Interval',
    state.aisRefreshInterval,
    30, // min 30 seconds
    300, // max 5 minutes
    setAisUpdateInterval
  );

  // Historical playback controls (placeholder for future)
  const historySection = document.createElement('div');
  historySection.className = 'history-section';
  historySection.innerHTML = `
    <p class="text-muted">Historical playback coming soon</p>
  `;

  content.appendChild(intervalControl);
  content.appendChild(historySection);

  accordion.appendChild(content);
  return accordion;
}
```

**Toggle Switch Handler:**

```javascript
document.getElementById('ais-toggle').addEventListener('change', (e) => {
  if (e.target.checked) {
    startAisUpdates();
  } else {
    stopAisUpdates();
  }
});
```

**Error Banner:**

```javascript
// src/ui/aisErrorBanner.js

export function showAisError(message) {
  const banner = document.createElement('div');
  banner.className = 'error-banner ais-error';
  banner.textContent = message;
  document.body.appendChild(banner);

  setTimeout(() => banner.remove(), 5000);
}
```

**Active Layers Panel:**

```javascript
// src/ui/activeLayers.js

if (state.aisEnabled && state.aisFeatures.length > 0) {
  const aisItem = document.createElement('div');
  aisItem.className = 'active-layer-item';
  aisItem.textContent = `Ships (AIS): ${state.aisFeatures.length} vessels`;
  activeLayersList.appendChild(aisItem);
}
```

---

## Section 9: Testing Strategy

**E2E Test Structure:**

```javascript
// tests/e2e/ais.spec.js

import { test, expect } from '@playwright/test';

test.describe('AIS Ships Overlay', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080');
  });

  test('toggle AIS overlay', async ({ page }) => {
    await page.click('#layer-dropdown-btn');
    const aisToggle = page.locator('#ais-toggle');
    await aisToggle.check();
    await expect(aisToggle).toBeChecked();
  });

  test('display vessel markers', async ({ page }) => {
    await page.goto('http://localhost:8080?ais=1');
    await page.waitForTimeout(35000); // 30s polling + margin

    const vesselIcons = await page.locator('.ol-layer.ais-layer canvas').count();
    expect(vesselIcons).toBeGreaterThan(0);
  });

  test('vessel popup on hover', async ({ page }) => {
    await page.goto('http://localhost:8080?ais=1');
    await page.waitForTimeout(35000);

    const vesselIcon = page.locator('.vessel-icon').first();
    await vesselIcon.hover();

    const popup = page.locator('.vessel-popup.hover');
    await expect(popup).toBeVisible();
    await expect(popup).toContainText('MMSI');
  });

  test('vessel popup on click', async ({ page }) => {
    await page.goto('http://localhost:8080?ais=1');
    await page.waitForTimeout(35000);

    const vesselIcon = page.locator('.vessel-icon').first();
    await vesselIcon.click();

    const popup = page.locator('.vessel-popup.pinned');
    await expect(popup).toBeVisible();
    await expect(popup).toContainText('MMSI');
    await expect(popup).toContainText('Name');
    await expect(popup).toContainText('Cargo');
  });

  test('adjust refresh interval', async ({ page }) => {
    await page.goto('http://localhost:8080?ais=1');

    await page.click('.ais-accordion-header');
    await page.fill('#ais-interval-input', '60');
    await page.click('#ais-interval-apply');

    const intervalValue = await page.inputValue('#ais-interval-input');
    expect(intervalValue).toBe('60');
  });

  test('error handling on WebSocket failure', async ({ page }) => {
    await page.context().route('**/aisstream.io/**', route => route.abort());
    await page.goto('http://localhost:8080?ais=1');

    const errorBanner = page.locator('.ais-error');
    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).toContainText('connection failed');
  });
});
```

**Test Coverage Goals:**

- Toggle on/off functionality
- Vessel icon rendering with correct colors by type
- Hover preview popup
- Click-to-pin popup
- Refresh interval adjustment
- Error states (rate limit, network failure)
- Split-screen mode (single API call optimization)
- Permalink encoding (?ais=1)

---

## Section 10: File Structure Summary

**New Files to Create:**

```
src/
  api/
    aisstream.js          # WebSocket API client
  ais/
    aisLayer.js           # Layer creation, styling, vessel-to-feature
    aisManager.js         # Polling orchestration (30s intervals)
    aisInteractions.js    # Hover preview, click-to-pin popups
  styles/
    ais.css               # Vessel icon SVGs, popup styles

server/
  routes/
    ais.js                # Backend API for historical data queries
  models/
    vessel.js             # Vessel position database operations

tests/
  e2e/
    ais.spec.js           # E2E tests

docs/
  plans/
    2026-02-01-ais-ships-overlay-design.md
```

**Modified Files:**

```
src/
  config/
    constants.js          # Add AISSTREAM_CONFIG
  state/
    store.js              # Add AIS state properties
  main.js                 # Load AIS interval, decode permalink
  map/
    permalink.js          # Encode ?ais=1 in URL
  ui/
    headerLayerManager.js # Add AIS accordion
    activeLayers.js       # Display AIS status + vessel count
  styles/
    common.css            # Shared popup styles

server/
  index.js                # Add vessel_positions table, AIS routes
```

---

## Section 11: Implementation Considerations & Future Enhancements

**Design Decisions for Future Historical Playback:**

1. **PostGIS storage** - All vessel positions are saved every poll
2. **Time-range queries** - Backend API will support timestamp filtering
3. **Playback UI** - Future time slider control to query historical positions
4. **Trail rendering** - Future line features showing vessel paths

**Future Enhancement: Time Slider Control:**

```javascript
// Future: src/ui/timeSlider.js (not implementing now)
export function createTimeSlider() {
  // Slider to select historical time range
  // Queries backend: GET /api/ais/history?from=X&to=Y
  // Displays vessel positions from selected time period
}
```

**Future Enhancement: Vessel Trails:**

```javascript
// Future: Render trails for historical vessel movement
const trailFeature = new LineString(trailPositions);
const trailStyle = new Style({
  stroke: new Stroke({ color: vesselColor, width: 2 })
});
```

**Performance Considerations:**

- PostGIS indexes on timestamp and geometry for fast queries
- Automatic cleanup of old data (>30 days) via cron job
- WebSocket reconnection only on polling intervals (not aggressive)
- Bounding box filtering reduces data volume

**Data Limitations:**

- AIS coverage varies by region (coastal areas better than open ocean)
- Some vessels don't broadcast position (military, certain cargo types)
- AISStream.io is free but may have rate limits or service interruptions

---

**Design Complete.**

This design covers the complete AIS Ships overlay feature with live vessel tracking, color-coded icons, interactive popups, PostGIS storage for future historical playback, comprehensive error handling, and full UI integration.

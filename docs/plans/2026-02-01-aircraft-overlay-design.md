# Aircraft Overlay Design

**Date**: 2026-02-01
**Status**: Draft
**Author**: Claude (with user collaboration)

## Overview

The aircraft overlay will display live air traffic from the OpenSky Network API on the IntelMap interface. This enables users to visualize aircraft positions, headings, and metadata as a dynamic map overlay.

### Key Requirements

| Requirement | Description |
|-------------|-------------|
| **Data source** | OpenSky Network REST API (`/states/all` endpoint) |
| **Authentication** | Anonymous only (400 credits/day, 10-second refresh interval) |
| **Visual** | Rotated aircraft icons showing heading direction |
| **Interaction** | Click to show popup with details (callsign, altitude, speed, origin) |
| **Filtering** | View-based (bounding box query to fetch only visible aircraft) |
| **Refresh** | Automatic 11-second polling (configurable, min 11s) |
| **Error handling** | Show visual warning on API failures, keep existing data visible |

### Approach

**Poll-based refresh with OpenLayers VectorLayer** (Selected)

- Use an OpenLayers `VectorLayer` with `VectorSource` to store aircraft features
- Poll OpenSky API every 11 seconds using `setInterval`
- On each fetch, clear and replace all features in the source
- Use current map view extent for bounding box filtering
- Rotated aircraft icons using OpenLayers `Style` with rotation property

*Note: 11-second interval includes safety margin for network jitter to avoid accidental rate limit hits.*

---

## Architecture & Components

### New Files

#### `src/api/opensky.js`
OpenSky API client module.

```javascript
export function buildOpenSkyUrl(bbox)
// Constructs the /states/all URL with lamin/lomin/lamax/lomax parameters

export async function fetchAircraftStates(bbox)
// Fetches from OpenSky API
// Returns: array of state vectors or null on error
// Handles rate limit responses (429) gracefully
```

#### `src/aircraft/aircraftLayer.js`
Aircraft layer creation and styling.

```javascript
export function createAircraftLayer()
// Creates and returns an OpenLayers VectorLayer for aircraft

export function getAircraftStyle(state, heading)
// Returns a Style with rotated aircraft icon

export function stateToFeature(stateVector)
// Converts OpenSky state array to OpenLayers Feature
```

#### `src/aircraft/aircraftManager.js`
Aircraft update orchestration.

```javascript
export function startAircraftUpdates()
// Begins the polling interval, creates layers for active maps

export function stopAircraftUpdates()
// Clears interval and removes all aircraft layers

export function setUpdateInterval(seconds)
// Changes refresh interval at runtime (validates min 11s)
// Restarts polling timer with new interval

function updateAircraftData()
// Fetches new data and updates all map layers
// Called every 11 seconds by interval
```

#### `src/aircraft/aircraftInteractions.js`
Click handlers and popup display.

```javascript
export function setupAircraftClickHandlers()
// Registers click listeners on all map instances

function showAircraftPopup(feature, mapKey, coordinate)
// Creates and displays popup with aircraft details
```

### Modified Files

#### `src/state/store.js`
Add new state properties:

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

#### `src/config/constants.js`
Add aircraft configuration:

```javascript
export const OPENSKY_CONFIG = {
  baseUrl: 'https://opensky-network.org/api',
  updateIntervalSeconds: 11,      // Default 11s, configurable via UI
  minIntervalSeconds: 11,         // Minimum allowed (safety margin for API limits)
  aircraftIconScale: 1,           // Icon size multiplier
  aircraftIconColor: '#1e88e5',   // Default aircraft icon color
};
```

#### `src/ui/overlayDropdown.js`
Add aircraft to overlay panel:
- Checkbox toggle: "✈️ Aircraft (OpenSky)"
- Settings gear icon for refresh interval configuration

#### `src/ui/activeLayers.js`
Display aircraft in active layers panel:
- Show "✈️ Aircraft (count)" when enabled
- Error indicator when `state.aircraftError` exists

#### `src/map/permalink.js`
Encode/decode aircraft state:
- Add `aircraft=1` parameter to URL when enabled
- Auto-enable on page load if present in URL

---

## Data Flow & Lifecycle

### Initial Load (when aircraft overlay enabled)

1. User enables aircraft overlay via checkbox/toggle
2. `aircraftManager.startAircraftUpdates()` is called
3. Creates VectorLayer for each active map (main or left/right)
4. Fetches initial aircraft data from OpenSky API using current map view bbox
5. Converts state vectors to Features with styled aircraft icons
6. Adds layers to maps, stores references in `state.aircraftLayer`
7. Starts 11-second polling interval

### Polling Cycle (every 11 seconds)

```
updateAircraftData()
  │
  ├─ Determine which map's extent to use
  │   └─ Split mode: use left map extent
  │   └─ Single mode: use main map extent
  │
  ├─ Transform extent from EPSG:3857 to EPSG:4326 (bbox)
  │
  ├─ fetchAircraftStates(bbox) → Single API call
  │   │
  │   ├─ On success:
  │   │   └─ Convert state vectors to Features
  │   │   └─ Clear layer sources, add new features
  │   │   └─ Update state.aircraftLastUpdate
  │   │   └─ Clear state.aircraftError
  │   │
  │   └─ On error:
  │       └─ Set state.aircraftError
  │       └─ Show visual warning indicator
  │       └─ Keep existing data visible (don't clear)
  │
  └─ Distribute features to active map(s)
      └─ Split mode: update left AND right layers with SAME data
      └─ Single mode: update main layer
```

**Important**: In split view mode, only ONE API call is made per cycle, then the same features are applied to both left and right maps. This prevents duplicate API calls and respects rate limits.

### Disable/Cleanup

1. User disables aircraft overlay
2. `aircraftManager.stopAircraftUpdates()`:
   - Clears polling interval
   - Removes aircraft layers from all maps
   - Clears `state.aircraftFeatures`
3. Resets error state

---

## Visual Styling

### Aircraft Icon

Single-color airplane icon, rotated to show heading:

```javascript
// SVG path for airplane silhouette
const AIRCRAFT_ICON_PATH = 'M 0 -10 L 8 8 L 0 4 L -8 8 Z';

function getAircraftStyle(state, heading) {
  return new Style({
    image: new Icon({
      src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="-12 -12 24 24" width="24" height="24">
          <path d="${AIRCRAFT_ICON_PATH}"
                fill="${OPENSKY_CONFIG.aircraftIconColor}"
                stroke="white" stroke-width="1.5"/>
        </svg>
      `),
      rotation: heading ? (heading * Math.PI / 180) : 0, // Convert to radians
      anchor: [0.5, 0.5],
      scale: OPENSKY_CONFIG.aircraftIconScale
    })
  });
}
```

**Future enhancement**: Altitude-based color gradient (pre-defined colors mapped to altitude brackets).

---

## Popup Interactions

### Click Handler

When a user clicks an aircraft, show a popup with flight details.

### Popup Data

| OpenSky Field | Display Label | Fallback |
|---------------|--------------|----------|
| `callsign` | Callsign | "N/A" |
| `origin_country` | Country | "Unknown" |
| `icao24` | Transponder | (always present) |
| `baro_altitude` | Altitude | Convert to feet, "-" if null |
| `velocity` | Speed | Convert to knots, "-" if null |
| `true_track` | Heading | degrees, "-" if null |
| `on_ground` | Status | "Grounded" / "In flight" |

### Implementation Pattern

Following existing patterns from `src/map/osmInteractions.js`:
- Use OpenLayers `Overlay` for popup display
- Auto-pan to keep popup in view
- Close button for dismissal
- Styled consistently with OSM popups

---

## Error Handling & Visual Feedback

### Error Scenarios

1. **Rate limit hit (429)** - OpenSky API returns 429 when credits exhausted
2. **Network error** - Failed fetch, timeout, or server unavailable
3. **Empty response** - API returns success but no aircraft in view
4. **Malformed data** - Unexpected response structure

### Error Display

**Approach**: Show visual warning but keep existing aircraft visible.

**State representation**:
```javascript
state.aircraftError = {
  type: 'rate_limit' | 'network' | 'other',
  message: string,
  time: timestamp
}
```

**UI Warning Indicator**:
- Small icon/badge in the aircraft overlay toggle or active layers panel
- Color-coded: Yellow (recoverable), Red (rate limit)
- Shows message on hover
- Auto-dismisses after 30 seconds if next fetch succeeds

### Empty Response Handling

If `states` array is empty (no aircraft in view):
- This is NOT an error
- Clear the layers
- Optionally show subtle "no aircraft in view" message that fades quickly

---

## UI Integration & Controls

### Aircraft Overlay Toggle

Located in the overlay dropdown panel (`src/ui/overlayDropdown.js`):

```
┌─────────────────────────────────────┐
│ ☑ Digiroad: Road Lines              │
│ ☐ Digiroad: Buildings               │
│ ✈️ Aircraft (OpenSky)         [⚙]  │  ← NEW
│ ☑ OpenSeaMap                        │
└─────────────────────────────────────┘
```

- **Checkbox**: Enable/disable overlay
- **Settings gear (⚙)**: Opens refresh interval configuration modal

### Refresh Interval Settings Modal

Small modal/dialog for configuring refresh rate:

```
┌───────────────────────────┐
│  Aircraft Settings        │
│                           │
│  Refresh Interval:        │
│  [======|=====] 15 sec    │
│                           │
│  Min: 11s | Max: 60s      │
│                           │
│  [Apply]     [Cancel]     │
└───────────────────────────┘
```

- Slider from 11-60 seconds (enforced minimum)
- Display current value
- "Apply" button to save
- Persist to `localStorage` under key `intelmap_aircraft_interval`

### Active Layers Panel

In `src/ui/activeLayers.js`:

```
Active Layers:
├── ✈️ Aircraft (47)         ← Shows count
├── Digiroad: Road Lines
└── OpenSeaMap
```

- Show "✈️ Aircraft" when enabled
- Display aircraft count in parentheses
- Show warning icon if `state.aircraftError` exists
- Click to toggle

---

## Permalink & State Persistence

### URL Encoding

Add `aircraft` parameter to permalink when enabled:

```
https://intelmap.example.com/?lat=60.17&lon=24.94&z=9&aircraft=1
```

### Decoding

On page load, check URL params for `aircraft=1` and auto-enable the overlay.

### What's NOT Encoded

To avoid URL bloat, the following are NOT in the URL:
- Actual aircraft positions (fetched fresh each time)
- User's refresh interval preference (stored in localStorage)
- Error state (transient)

### Layer Groups

Aircraft can be included in saved layer groups:

```javascript
const group = {
  id: 1,
  name: 'My Aviation View',
  config: {
    activeOverlays: ['digiroad_road_lines'],
    aircraftEnabled: true  // ← Include aircraft
  }
};
```

---

## File Structure Summary

```
src/
├── api/
│   └── opensky.js                 # NEW: OpenSky API client
├── aircraft/
│   ├── aircraftLayer.js           # NEW: Layer creation, styling
│   ├── aircraftManager.js         # NEW: Polling, updates
│   └── aircraftInteractions.js    # NEW: Click handlers, popups
├── config/
│   └── constants.js               # MODIFIED: Add OPENSKY_CONFIG
├── state/
│   └── store.js                   # MODIFIED: Add aircraft state props
├── ui/
│   ├── overlayDropdown.js         # MODIFIED: Add aircraft toggle
│   └── activeLayers.js            # MODIFIED: Show aircraft in panel
└── map/
    └── permalink.js               # MODIFIED: Encode/decode aircraft state
```

---

## OpenSky API Reference

### Endpoint Used

```
GET https://opensky-network.org/api/states/all
```

### Request Parameters (View-based Filtering)

| Parameter | Type | Description |
|-----------|------|-------------|
| `lamin` | float | Lower bound for latitude (decimal degrees) |
| `lomin` | float | Lower bound for longitude (decimal degrees) |
| `lamax` | float | Upper bound for latitude (decimal degrees) |
| `lomax` | float | Upper bound for longitude (decimal degrees) |

### Response Structure

```javascript
{
  "time": 1458564121,           // Unix timestamp
  "states": [
    // Each state is an array (indexed fields):
    [
      0: "abc9f3",              // icao24 (string) - Transponder address
      1: "UAL123",              // callsign (string) - Can be null
      2: "United States",       // origin_country (string)
      3: 1458564120,            // time_position (int) - Unix time, can be null
      4: 1458564121,            // last_contact (int) - Unix time
      5: -122.4,               // longitude (float) - Can be null
      6: 37.7,                 // latitude (float) - Can be null
      7: 10668,                // baro_altitude (float) - meters, can be null
      8: false,                // on_ground (boolean)
      9: 250,                  // velocity (float) - m/s, can be null
      10: 180,                 // true_track (float) - degrees, can be null
      11: 12.5,                // vertical_rate (float) - m/s, can be null
      12: null,                // sensors (int[]) - null for anon
      13: 10972,               // geo_altitude (float) - meters, can be null
      14: "4512",              // squawk (string) - can be null
      15: false,               // spi (boolean) - special purpose indicator
      16: 0,                   // position_source (int) - 0=ADS-B, 1=ASTERIX, etc
      17: 1                    // category (int) - aircraft category
    ],
    // ... more aircraft
  ]
}
```

### Rate Limits (Anonymous)

- **400 credits per day**
- **1-4 credits per request** (depending on area size)
- View-based filtering (~500x500km) = 1 credit per request
- ~100 requests/day achievable for regional views
- Returns 429 status when exhausted

---

## Testing Considerations

### E2E Tests (Playwright)

1. **Basic functionality**: Enable aircraft overlay, verify aircraft appear after fetch
2. **Popup interaction**: Click aircraft, verify popup shows with correct data
3. **Toggle on/off**: Enable and disable, verify layers are added/removed
4. **Settings modal**: Open settings, change refresh interval, verify it persists
5. **Error handling**: Mock API failure, verify warning indicator appears
6. **Split view**: Enable in split mode, verify same aircraft on both maps
7. **Permalink**: Load URL with `aircraft=1`, verify auto-enables
8. **View filtering**: Pan to ocean area, verify aircraft disappear from view

### Manual Testing Checklist

- [ ] Verify 11-second interval works without rate limit issues
- [ ] Test zooming/panning updates bbox correctly
- [ ] Verify aircraft icons rotate to correct heading
- [ ] Check empty response (no aircraft in ocean view)
- [ ] Test settings modal persistence across page reloads
- [ ] Verify rate limit warning displays correctly
- [ ] Check split view shows identical aircraft on both maps

---

## Future Enhancements

1. **Altitude-based coloring**: Map aircraft icons to color gradient based on altitude
2. **Historical tracks**: Use `/flights` and `/tracks` endpoints to show flight paths
3. **Search by callsign**: Allow searching for specific aircraft
4. **Authenticated API**: Optional OpenSky credentials for higher rate limits
5. **Aircraft trails**: Show recent path for each aircraft
6. **Filter by altitude**: Min/max altitude filter UI

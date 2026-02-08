# UAS Airspace Zones Feature - Design Document

**Date:** 2025-02-08
**Author:** Claude Code
**Status:** Design Approved

## Overview

The UAS Airspace Zones feature adds a new "Airspace" section to the Layers dropdown that displays Finnish drone flying zones from the flyk.com API. The zones are rendered as colored polygons on the map with click interactions showing detailed zone information.

**Key decisions:**
- Data is fetched live from `https://flyk.com/api/uas.geojson` at runtime
- Zones use aviation-standard colors: Red (PROHIBITED), Orange (REQ_AUTHORISATION), Green (NO_RESTRICTION)
- Full popup details include name, restriction, altitude, schedule, reason, identifier, and authority link
- Z-index 70 places zones above most overlays but below drawn features

## Deployment Restriction

**CRITICAL:** This feature MUST NOT be deployed to production (intelmap.elderx.fi).

- All implementation work is done in the `dev` branch only
- Feature is deployed and tested ONLY on staging-intelmap.elderx.fi
- NO commits to `main` branch for this feature
- Production deployment is FORBIDDEN until explicitly authorized

**Git workflow:**
1. Work in `dev` branch
2. Push to `dev` → deploys to staging-intelmap.elderx.fi
3. Test on staging
4. Do NOT merge to `main` (unless explicitly approved later)

---

## File Structure

```
src/
  airspace/
    uasLayers.js       # UAS layer creation and management
    uasInteractions.js # Click handlers and popup display
    uasManager.js      # API fetching and state management
  ui/
    airspaceDropdown.js # Airspace accordion in Layers panel
  state/
    store.js           # Add uasEnabled, uasLayers, uasFeatures
```

---

## Data Source

**API URL:** `https://flyk.com/api/uas.geojson`

**Data Summary:**
- Total features: 701 UAS zones
- Restriction types: `NO_RESTRICTION`, `PROHIBITED`, `REQ_AUTHORISATION`
- Reason types: `AIR_TRAFFIC`, `SENSITIVE`

**Feature Properties:**
| Property | Description |
|----------|-------------|
| `identifier` | Zone ID (e.g., "EFAAUAS") |
| `name` | Zone name (Finnish) |
| `restriction` | Restriction level |
| `reason` | Array of reasons |
| `active` | Boolean status |
| `lowerMeters` / `upperMeters` | Altitude limits |
| `lower` / `upper` | Altitude codes (SFC, UNL) |
| `zoneAuthority` | Authority info with siteUrl |
| `geometry` | Polygon coordinates |

---

## State Management

**Additions to `src/state/store.js`:**

```javascript
// UAS/Airspace state
uasEnabled: false,              // Master toggle
uasFeatures: [],                // Fetched GeoJSON features
uasLayer: { main: null, left: null, right: null },  // Vector layers
uasError: null,                 // { type, message, time }
uasLastFetch: null,             // Timestamp of last successful fetch
```

**Behavior:**
- `uasEnabled` controls layer visibility
- `uasFeatures` stores the full GeoJSON feature collection
- `uasLayer` tracks VectorLayer instances per map
- No automatic polling - data fetched once when enabled
- `uasError` captures fetch failures for UI display

---

## Layer Creation & Styling

**Module:** `src/airspace/uasLayers.js`

**Color mapping:**
```javascript
const RESTRICTION_COLORS = {
  'PROHIBITED': '#e74c3c',      // Red
  'REQ_AUTHORISATION': '#f39c12', // Orange
  'NO_RESTRICTION': '#2ecc71'    // Green
};
```

**Style function:**
- Fill: Semi-transparent (30% opacity) using restriction color
- Stroke: Solid border, 2px width, same color as fill
- No hover style change (hover only shows pointer cursor)

**Layer properties:**
- `VectorLayer` with `VectorSource` from GeoJSON features
- Z-index: 70 (above OSM/WMS, below drawn features)
- Source loads directly from API URL:
  ```javascript
  new VectorSource({
    url: 'https://flyk.com/api/uas.geojson',
    format: new GeoJSON()
  })
  ```

**Functions:**
- `createUASLayer()` - Creates and returns a styled VectorLayer
- `addUASToMap(mapKey)` - Adds UAS layer to specific map (main/left/right)
- `removeUASFromMaps()` - Removes UAS layers from all maps
- `updateUASLayers()` - Rebuilds layers when enabled state changes

---

## Click Interactions & Popup Display

**Module:** `src/airspace/uasInteractions.js`

**Click handler registration:**
- `setupUASClickHandlers()` - Attaches `singleclick` listeners to all active maps
- Uses OpenLayers `forEachFeatureAtPixel()` to detect UAS zone clicks
- Cleanup via `cleanupUASInteractions()` to remove listeners

**Popup content (full details):**
```javascript
function createUASPopupContent(feature) {
  const props = feature.getProperties();
  return `
    <div style="font-weight:bold; margin-bottom:8px; font-size:1.1em;">
      ${props.name}
    </div>
    <div><strong>Restriction:</strong> ${formatRestriction(props.restriction)}</div>
    <div><strong>Identifier:</strong> ${props.identifier}</div>
    <div><strong>Altitude:</strong> ${props.lowerMeters}m - ${props.upperMeters}m</div>
    <div><strong>Reason:</strong> ${props.reason.join(', ')}</div>
    <div><strong>Authority:</strong>
      <a href="${props.zoneAuthority[0].siteUrl}" target="_blank">
        ${props.zoneAuthority[0].name}
      </a>
    </div>
    <div><strong>Status:</strong> ${props.active ? 'Active' : 'Inactive'}</div>
  `;
}
```

**Popup behavior:**
- Uses existing `showOverlayInfoPopup()` from `src/ui/overlayInfo.js`
- Popup positioned near click with smart boundary detection
- Close button (×) in top-right corner
- Only one popup shown at a time (replaces previous)

---

## UI Integration

**Module:** `src/ui/airspaceDropdown.js`

**Location in Layers panel:**
- Added as a new accordion section below existing overlays
- Uses same `createOverlayDropdown()` pattern from `overlayDropdown.js`
- Labeled "Airspace" to group future airspace-related layers

**Integration in `src/ui/overlayDropdown.js`:**

Modify `createAllOverlayDropdowns()` to include:

```javascript
// UAS Airspace dropdown
const uasSelected = state.uasEnabled ? ['uas'] : [];
const uasList = [{ name: 'uas', title: 'UAS Zones', type: 'geojson' }];
const uas = createOverlayDropdown(mapKey, uasSelected, function (newSelected) {
  const enabled = newSelected.includes('uas');
  state.uasEnabled = enabled;
  if (enabled) {
    import('../airspace/uasManager.js')
      .then(m => m.fetchAndEnableUAS())
      .then(() => import('../airspace/uasInteractions.js'))
      .then(m => m.setupUASClickHandlers());
  } else {
    import('../airspace/uasInteractions.js')
      .then(m => m.cleanupUASInteractions())
      .then(() => import('../airspace/uasLayers.js'))
      .then(m => m.removeUASFromMaps());
  }
  import('./activeLayers.js').then(({ updateActiveLayersPanel }) => updateActiveLayersPanel());
}, uasList, 'Airspace', { isAccordion: true });
```

Updated return value: `[digiroad, generic, osm, aircraft, gpx, uas]`

---

## Error Handling & Edge Cases

**Error scenarios:**

1. **API fetch failure:**
   - Network errors, timeouts, or invalid JSON
   - Sets `state.uasError = { type: 'fetch', message, time }`
   - Shows error message in active layers panel
   - Gracefully disables UAS layer

2. **Empty or malformed GeoJSON:**
   - Validates `FeatureCollection` structure
   - Filters out features without geometry
   - Logs warnings to console for debugging

3. **Feature without required properties:**
   - Uses fallback values: "Unknown" for name, "—" for altitude
   - Checks for null/undefined before accessing nested properties
   - Skips features with `active: false`

4. **Click on non-UAS features:**
   - `forEachFeatureAtPixel()` returns null - no popup shown
   - Other click handlers remain unaffected

5. **Split-screen mode:**
   - UAS layer added to both left and right maps when `state.isSplit === true`
   - Click handlers attached to all three maps (main, left, right)
   - Popup works identically on all map views

6. **Toggle during active fetch:**
   - Flag prevents concurrent fetches
   - Disable toggle shows loading state during fetch

---

## Permalink & State Persistence

**URL state encoding in `src/map/permalink.js`:**

**Added to URL parameters:**
- `uas=1` when UAS zones are enabled
- Omitted when disabled (default)

**Permalink restoration:**
- When parsing URL on load, `uas=1` sets `state.uasEnabled = true`
- Triggers automatic fetch and layer creation via `uasManager.js`
- Integrates with existing `updatePermalinkWithFeatures()` function

**NOT persisted to URL:**
- Individual zone visibility (all shown/hidden together)
- Popup state (transient UI element)
- Last fetch timestamp

**Database persistence:** None required - UAS is a public API overlay, not user-created content.

---

## Implementation Steps

1. **State & Constants** (`src/state/store.js`)
   - Add UAS state properties
   - Define restriction color constants

2. **Core Layer Module** (`src/airspace/uasLayers.js`)
   - Create `createUASLayer()` with styled VectorLayer
   - Implement `addUASToMap()`, `removeUASFromMaps()`, `updateUASLayers()`

3. **Manager Module** (`src/airspace/uasManager.js`)
   - Implement `fetchAndEnableUAS()` to fetch from API
   - Handle errors and update state
   - Call `uasLayers.js` functions to render

4. **Interactions Module** (`src/airspace/uasInteractions.js`)
   - Implement `setupUASClickHandlers()` for map clicks
   - Create `createUASPopupContent()` for popup HTML
   - Implement `cleanupUASInteractions()`

5. **UI Integration** (`src/ui/overlayDropdown.js`)
   - Add UAS dropdown to `createAllOverlayDropdowns()`
   - Handle toggle on/off with proper module imports

6. **Permalink** (`src/map/permalink.js`)
   - Add `uas` parameter to URL encoding/decoding
   - Restore state on page load

7. **Active Layers Panel** (existing)
   - UAS automatically appears in active layers when enabled

---

## Testing Checklist

- [ ] UAS layer appears in Layers dropdown under "Airspace"
- [ ] Toggle on fetches data from API and displays zones
- [ ] Toggle off removes zones from all maps
- [ ] Zones display correct colors per restriction type
- [ ] Click on zone shows popup with full details
- [ ] Popup close button works
- [ ] Split-screen mode shows zones on both maps
- [ ] Permalink `uas=1` enables zones on page load
- [ ] API failure shows error message
- [ ] Zones render above WMS/OSM layers (z-index 70)
- [ ] Zones render below drawn features

# Weather Overlay Design

**Date:** 2026-02-02
**Status:** Design Complete
**Implementation Plan:** Pending

## Goal

Add a weather overlay to IntelMap using FMI (Finnish Meteorological Institute) open data, featuring toggleable weather map layers (temperature, wind, precipitation) and clickable weather station markers showing current observations.

## Architecture

Hybrid approach combining:
- **WMS layers** for pre-rendered weather maps (temperature, wind speed, precipitation)
- **WFS API** for raw observation data from weather stations

Both layer types independently toggleable. Polling-based updates with immediate fetch on enable, then 10-minute intervals.

## Tech Stack

- **Data Source:** FMI Open Data (free, no API key required)
- **WMS:** OpenLayers TileLayer with TileWMS source
- **Station Markers:** OpenLayers VectorLayer with custom SVG icons
- **API:** Fetch API for FMI WFS (XML response parsing)
- **Polling:** JavaScript setInterval (10 minutes)

## Components

### Frontend Modules

#### `src/weather/weatherWms.js`
- Creates and manages FMI WMS tile layers
- Exports: `createWeatherWmsLayers()`, `updateWmsLayers()`

#### `src/weather/weatherStations.js`
- Fetches observation data from FMI WFS API
- Parses XML response to extract station data
- Converts stations to OpenLayers Features
- Exports: `fetchWeatherStations(bbox)`, `stationToFeature(station)`, `getStationIconPath(observationType)`

#### `src/weather/weatherManager.js`
- Orchestrates WMS layers and station data updates
- Manages polling lifecycle (start/stop)
- Handles rate limiting and errors
- Exports: `startWeatherUpdates()`, `stopWeatherUpdates()`, `updateWeatherStationData()`

#### `src/weather/weatherInteractions.js`
- Hover preview popups (compact station data)
- Click-to-pin popup behavior
- Wind direction arrow rendering
- Exports: `setupWeatherInteractions(mapObj, mapKey)`

#### `src/styles/weather.css`
- Popup styling (hover and pinned)
- Wind arrow rotation classes
- Weather icon styling

### State Management

Add to `src/state/store.js`:

```javascript
weatherEnabled: false,
weatherWmsLayers: { main: null, left: null, right: null },
weatherStationLayer: { main: null, left: null, right: null },
weatherStationFeatures: [],
weatherActiveWmsLayers: ['temperature'], // Array of active layer types
weatherPollingTimer: null,
weatherError: null
```

### UI Integration

#### Header Layer Manager (`src/ui/headerLayerManager.js`)

**Weather Accordion Structure:**
- Main toggle: "🌤️ Weather" checkbox
- WMS layer toggles (shown when weather enabled):
  - Temperature (default enabled)
  - Wind
  - Precipitation

**Checkbox IDs:**
- `#weather-enabled` - Main toggle
- `#weather-temperature` - Temperature WMS layer
- `#weather-wind` - Wind WMS layer
- `#weather-precipitation` - Precipitation WMS layer

#### Active Layers Panel
- Shows: "🌤️ Weather (X stations)" when enabled
- Station count updates on each data fetch
- Remove button clears all weather layers

#### Permalink System (`src/map/permalink.js`)

**Encode:**
- `weather` - 1 if enabled, 0 if disabled
- `weatherLayers` - Comma-separated list of active WMS layer types

**Example:** `&weather=1&weatherLayers=temperature,wind`

**Decode on Load:**
- Set `state.weatherEnabled` from `weather` param
- Set `state.weatherActiveWmsLayers` from `weatherLayers` param
- Auto-start updates if enabled

## Data Flow

### Enable Flow
1. User clicks "🌤️ Weather" checkbox
2. `state.weatherEnabled = true`
3. Call `startWeatherUpdates()`:
   - Immediate `updateWeatherStationData()` call
   - Add WMS layers to all active maps
   - Start 10-minute polling interval
4. Show "🌤️ Weather (X stations)" in active layers panel

### Disable Flow
1. User unchecks "🌤️ Weather" checkbox
2. `state.weatherEnabled = false`
3. Call `stopWeatherUpdates()`:
   - Clear polling interval
   - Remove WMS layers from all maps
   - Remove station markers from all maps
4. Remove from active layers panel

### Polling Behavior
- **On enable:** Immediate API call (no waiting)
- **While enabled:** Recurring polls every 10 minutes
- **On disable:** Stop polling
- **On re-enable:** Immediate new poll, then resume 10-minute interval

### Data Fetching
1. Calculate bbox from map view (left map in split-screen)
2. Call FMI WFS API with bbox filter
3. Parse XML response to extract station observations
4. Convert to OpenLayers Features
5. Update station marker layers on all maps
6. Update station count in active layers panel

## FMI API Configuration

**No API Key Required**

### WMS Service
- **Base URL:** `http://openwms.fmi.fi/geoserver/wms`
- **Version:** 1.3.0
- **Format:** image/png
- **Transparent:** true

**Layer Names:**
- Temperature: `flash:temperature`
- Wind Speed: `flash:windspeed`
- Precipitation: `flash:precipitation`

### WFS Service
- **Base URL:** `http://opendata.fmi.fi/wfs`
- **Stored Query:** `fmi::observations::weather::simple`
- **Response Format:** XML

**Request Parameters:**
- `request=getFeature`
- `storedquery_id=fmi::observations::weather::simple`
- `crs=EPSG:4326`
- `bbox=minLon,minLat,maxLon,maxLat`

## Station Data Structure

```javascript
{
  stationId: '101104',
  name: 'Helsinki Kaisaniemi',
  location: [24.94, 60.18], // lon, lat
  temperature: 2.5, // Celsius
  windSpeed: 3.2, // m/s
  windDirection: 180, // degrees
  precipitation: 0, // mm
  timestamp: '2026-02-02T12:00:00Z'
}
```

## User Interactions

### Hover Preview Popup

**Content:**
```
Helsinki Kaisaniemi
🌡️ 2.5°C
💨 3.2 m/s ↘ (180°)
🌧️ 0 mm
```

**Behavior:**
- Appears on mouse hover over station marker
- Auto-dismisses on mouse out (when not pinned)
- Position: bottom-center relative to marker
- `stopEvent: false` allows map interaction

### Click-to-Pin Popup

**Same content as hover, but:**
- Stays open until:
  - User clicks another weather station
  - User clicks outside popup (on map)
- Close button (×) for explicit dismissal

### Wind Direction Display

- **On hover popup:** Arrow icon (↗ ↘ ↙ etc.) + cardinal direction + degrees
- **On WMS layer:** FMI wind layer includes directional arrows automatically
- Arrow rotation matches wind direction (180° = pointing south)

## Visual Design

### Station Marker Icons

- **Base icon:** Thermometer emoji (🌡️) in colored circle
- **Colors:**
  - Blue circle: temperature-focused display
  - Temperature value overlaid on icon
  - Wind direction arrow when wind speed > 5 m/s
- **Size:** Appropriate for map readability (24px icon)

### Z-Index Hierarchy

- Weather WMS layers: 55 (above base tiles at 0, below WMS overlays at 50)
- Weather station markers: 106 (above aircraft at 100, below user features at 190+)

### WMS Layer Stacking

When multiple weather layers enabled:
- Temperature (bottom, z-index: 55)
- Wind (middle, z-index: 56)
- Precipitation (top, z-index: 57)

## Error Handling

### API Errors

```javascript
state.weatherError = {
  type: 'rate_limit' | 'network',
  message: 'Human-readable description',
  retryAfter: timestamp
}
```

**Rate Limit (unlikely with FMI):**
- Wait until `retryAfter` time before next poll
- Show notification: "Rate limit exceeded. Retry in X minutes."

**Network Error:**
- Retry after 5 minutes
- Show notification: "Failed to fetch weather data"

### WMS Layer Errors

- Invalid layer name → Log warning, skip layer
- Network timeout → OpenLayers auto-retries tiles
- Service unavailable → Graceful degradation, other layers still work

### Edge Cases

1. **No stations in view:**
   - Log "No weather stations in current view"
   - Keep polling
   - Don't show error (normal for some areas)

2. **API returns empty data:**
   - Log warning
   - Retry on next interval

3. **User pans map quickly:**
   - Debounce station fetch (wait 500ms after pan stops)
   - Prevent excessive API calls

4. **Split-screen mode:**
   - Single API call using left map bbox
   - Share data between both maps

5. **FMI service downtime:**
   - Show error notification
   - Stop polling
   - User manually re-enables to retry

## Testing Strategy

### E2E Tests (`tests/e2e/weather.spec.js`)

1. **Weather displays in active layers panel**
   - Enable weather overlay
   - Verify "🌤️ Weather (X stations)" appears

2. **Weather WMS layers toggle independently**
   - Enable weather
   - Toggle temperature/wind/precipitation layers
   - Verify each works independently

3. **Weather station markers appear on map**
   - Enable weather
   - Wait for station data fetch
   - Verify markers visible

4. **Weather station hover popup works**
   - Hover over station marker
   - Verify popup shows data
   - Verify wind arrow visible

5. **Weather station click-to-pin popup works**
   - Click station marker
   - Verify popup stays open
   - Click map to close

6. **Weather polls immediately on enable**
   - Enable weather
   - Verify immediate fetch (not 10-min wait)

7. **Weather stops polling on disable**
   - Enable weather
   - Disable weather
   - Verify no further API calls

### Manual Testing Checklist

- [ ] WMS layers load correctly (temperature, wind, precipitation)
- [ ] Station markers display with proper styling
- [ ] Wind arrows rotate correctly based on direction
- [ ] Hover popups show all data fields
- [ ] Click-to-pin works correctly
- [ ] Permalink encoding/decoding works
- [ ] Active layers panel updates station count
- [ ] Polling starts immediately on enable
- [ ] Polling stops on disable
- [ ] Split-screen mode works correctly
- [ ] Error notifications display appropriately

## Success Criteria

- ✅ Weather overlay toggleable in header layer manager
- ✅ WMS layers (temperature, wind, precipitation) independently toggleable
- ✅ Station markers display on map when enabled
- ✅ Hover preview popups show station data with wind arrows
- ✅ Click-to-pin popup behavior works
- ✅ Immediate data fetch on enable (no waiting)
- ✅ 10-minute polling interval while enabled
- ✅ Active layers panel shows station count
- ✅ Permalink encoding/decoding works
- ✅ All E2E tests passing
- ✅ No console errors
- ✅ Works in single and split-screen modes

## Implementation Notes

**Follows established patterns from:**
- Aircraft overlay (polling, interactions, UI integration)
- AIS overlay (immediate fetch, error handling, state management)

**Key differences from aircraft/AIS:**
- Slower polling interval (10 min vs 11 sec for aircraft, 30 sec for AIS)
- WMS layers + station markers (not just dynamic points)
- No API key required (FMI open data)
- Simpler error handling (no rate limiting concerns)

**YAGNI applied:**
- Current observations only (no forecasts)
- No historical data storage (unlike AIS/Aircraft)
- No backend API (all client-side FMI requests)
- No database schema (weather is transient display only)

## Next Steps

1. ✅ Design complete
2. ⏳ Create implementation plan with detailed tasks
3. ⏳ Set up isolated git worktree
4. ⏳ Implement following TDD approach
5. ⏳ E2E testing against Docker
6. ⏳ Review and merge

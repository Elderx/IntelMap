# Train Overlays Design

**Date:** 2026-03-04
**Status:** Design Complete
**Implementation Plan:** Pending

## Goal

Add two separate rail overlays to IntelMap:

- `Train Locations` for live train positions across Finland
- `Train Stations` for station metadata and passenger-traffic styling

The live trains overlay refreshes every 10 seconds, and both overlays support click popups with overlay-specific detail.

## Architecture

Client-only, split overlay design:

- Fetch all Finland live train locations from Digitraffic every 10 seconds when `Train Locations` is enabled
- Fetch train detail on demand when the user clicks an individual train
- Fetch station GeoJSON once when `Train Stations` is enabled and cache it in memory
- Render trains and stations as separate OpenLayers vector layers with separate toggles, state, popups, and permalink flags
- Rebuild both overlays using the existing single-map and split-screen lifecycle already used by aircraft, AIS, weather, GPX, and UAS modules

This keeps the feature aligned with the existing overlay pattern while avoiding unnecessary backend work.

## Tech Stack

- OpenLayers 10.5.0 vector layers, vector sources, and overlays
- Browser `fetch` API against Digitraffic REST and GeoJSON endpoints
- Vanilla JavaScript ES modules
- Playwright for end-to-end coverage with mocked API responses

## Data Sources

### Live train locations

- Endpoint: `https://rata.digitraffic.fi/api/v1/train-locations.geojson/latest/`
- Refresh interval: every 10 seconds while enabled
- Coverage: all live train locations in Finland
- Geometry: GeoJSON `Point` coordinates in WGS84
- Verified response fields on 2026-03-04:
  - `trainNumber`
  - `departureDate`
  - `timestamp`
  - `speed`
  - `accuracy`

### Train detail

- Endpoint pattern: `https://rata.digitraffic.fi/api/v1/trains/latest/<trainNumber>`
- Fetch mode: on click only
- Verified response fields on 2026-03-04 include:
  - `trainNumber`
  - `departureDate`
  - `commuterLineID`
  - `operatorShortCode`
  - `trainType`
  - `trainCategory`
  - `runningCurrently`
  - `cancelled`
  - `timeTableRows`

### Train stations

- Endpoint: `https://rata.digitraffic.fi/api/v1/metadata/stations.geojson`
- Fetch mode: once on enable
- Geometry: GeoJSON `Point` coordinates in WGS84
- Verified response fields on 2026-03-04:
  - `stationName`
  - `stationShortCode`
  - `stationUICCode`
  - `type`
  - `countryCode`
  - `passengerTraffic`

## Components

### `src/api/trains.js`

Digitraffic client module.

Exports:

- `fetchTrainLocationsGeoJson()`
- `fetchTrainDetails(trainNumber)`
- `fetchTrainStationsGeoJson()`

Responsibilities:

- make browser fetch requests to Digitraffic endpoints
- validate response status
- parse JSON payloads
- normalize thrown errors so managers can surface warning state consistently

### `src/trains/trainLocationsManager.js`

Owns live train overlay lifecycle.

Responsibilities:

- start and stop 10-second polling
- fetch live train location GeoJSON
- convert live train data into OpenLayers features
- create and remove vector layers for `main`, `left`, and `right`
- rebuild layers when switching between single-map and split-screen mode
- keep last successful data visible when a polling request fails

Exports:

- `startTrainLocationUpdates()`
- `stopTrainLocationUpdates()`
- `rebuildTrainLocationLayers()`

### `src/trains/trainLocationsLayer.js`

Converts live train GeoJSON into OpenLayers features and styles them.

Responsibilities:

- map Digitraffic GeoJSON features to OpenLayers `Feature` instances
- transform WGS84 coordinates into map projection
- style trains from live properties only
- attach popup seed data to each feature

### `src/trains/trainLocationsInteractions.js`

Owns train click behavior and popup lifecycle.

Responsibilities:

- detect train feature clicks on each active map
- open a pinned popup immediately with basic live data
- fetch detailed train data for the clicked train number
- update popup content after detail fetch completes
- close and clean up popups when overlay is disabled or user clicks away

### `src/trains/trainStationsManager.js`

Owns station overlay lifecycle.

Responsibilities:

- fetch station GeoJSON once on enable
- cache station feature data in global state
- create and remove vector layers for `main`, `left`, and `right`
- rebuild layers when switching between single-map and split-screen mode

Exports:

- `startTrainStations()`
- `stopTrainStations()`
- `rebuildTrainStationLayers()`

### `src/trains/trainStationsLayer.js`

Converts station GeoJSON into OpenLayers features and styles them.

Responsibilities:

- map station GeoJSON features to OpenLayers `Feature` instances
- transform WGS84 coordinates into map projection
- color-code markers from `passengerTraffic`
- attach station metadata for popup rendering

### `src/trains/trainStationsInteractions.js`

Owns station click behavior and popup lifecycle.

Responsibilities:

- detect station feature clicks on each active map
- open a pinned popup from cached station properties
- close and clean up popups when overlay is disabled or user clicks away

### `src/styles/trains.css`

Shared popup styles for:

- train popup cards
- station popup cards
- metadata rows
- loading and error states

## State Management

Add to `src/state/store.js`:

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
trainStationsError: null
```

No shared `rail` umbrella state is needed in v1 because the user requested two separate overlays.

## Data Mapping

### Live train feature identity

Each train feature stores:

- `trainNumber`
- `departureDate`
- `timestamp`
- `speed`
- `accuracy`

Derived properties for UI:

- `statusColor`
- `isMoving`
- `displayTitle`

### Train detail mapping

Train popup detail fetches are keyed by `trainNumber`.

The detail endpoint does not need a bounding box and is only called after a click. The popup merges:

- live location properties from the clicked feature
- train-level metadata from `/trains/latest/<trainNumber>`
- a compact timetable summary derived from the first relevant `timeTableRows`

Recommended timetable summary for v1:

- show up to six commercial rows
- display `stationShortCode`
- display row `type`
- prefer `actualTime`, then `liveEstimateTime`, then `scheduledTime`
- include `commercialTrack` when present

### Station feature identity

Each station feature stores:

- `stationName`
- `stationShortCode`
- `stationUICCode`
- `type`
- `countryCode`
- `passengerTraffic`

### Display styling

Train marker colors:

- moving train: `#d32f2f`
- stopped or slow train: `#f9a825`
- unknown speed: `#546e7a`

Station marker colors:

- `passengerTraffic === true`: `#1565c0`
- `passengerTraffic === false`: `#6d4c41`

Station symbols remain slightly smaller than train markers so live trains stay visually dominant.

## UI Integration

### Header layer manager

Add two new accordion items in `src/ui/headerLayerManager.js`:

- `Train Locations`
  - checkbox id: `train-locations-enabled`
- `Train Stations`
  - checkbox id: `train-stations-enabled`

Behavior:

- enabling the overlay starts the corresponding manager
- disabling the overlay stops the corresponding manager and cleans up popup interactions
- state changes update the active layers panel and permalink

### Active layers panel

Add separate entries in `src/ui/activeLayers.js`:

- `Train Locations (<count>)`
- `Train Stations (<count>)`

If a manager has an error state, append a warning marker similarly to aircraft, AIS, and UAS overlays.

### Permalink

Add separate URL params in `src/map/permalink.js`:

- `trainLocations=1`
- `trainStations=1`

Both overlays restore automatically from the query string on initial load.

## Popup Design

### Train popup

Clicking a train icon opens a pinned OpenLayers popup anchored to that feature.

Initial popup content uses the live location feature:

- train title
- `trainNumber`
- `departureDate`
- live `timestamp`
- live `speed`
- `accuracy`

After the detail request resolves, enrich the popup with:

- `trainType`
- `trainCategory`
- `operatorShortCode`
- `commuterLineID` when present
- `runningCurrently`
- `cancelled`
- compact timetable summary

If detail loading fails, keep the popup open and show `Details unavailable` while preserving the live fields.

### Station popup

Clicking a station icon opens a pinned OpenLayers popup anchored to that feature.

Popup content comes directly from cached station metadata:

- `stationName`
- `stationShortCode`
- `stationUICCode`
- `type`
- `countryCode`
- passenger traffic availability

### Click priority

If a train and station overlap under the same click coordinate:

1. check train features first
2. fall back to station features second

This keeps the live overlay easier to use.

## Data Flow

### Train locations enable flow

1. User enables `Train Locations`
2. Create vector layers for active map targets
3. Fetch live train location GeoJSON for all Finland
4. Convert GeoJSON features to OpenLayers features
5. Store the latest features in shared state
6. Render features on all active maps
7. Start 10-second polling
8. Update active layers panel and permalink

### Train locations polling flow

1. Fetch live train location GeoJSON
2. On success:
   - replace stored features
   - update all active train layers
   - set `trainLocationsLastUpdate`
   - clear `trainLocationsError`
3. On failure:
   - keep existing features visible
   - set `trainLocationsError`
   - leave polling active for the next retry

### Train stations enable flow

1. User enables `Train Stations`
2. If cached station features are absent, fetch station GeoJSON once
3. Convert GeoJSON features to OpenLayers features
4. Store features in shared state
5. Create vector layers for active map targets
6. Render features on all active maps
7. Update active layers panel and permalink

### Disable flow

For each overlay independently:

1. remove vector layers from all active maps
2. remove popup overlays and click handlers
3. stop timers when applicable
4. clear transient error state
5. update active layers panel and permalink

## Split-Screen Behavior

- The same shared train features render on both split maps
- The same shared station features render on both split maps
- Each map keeps its own popup overlay instance for trains and stations
- Split-screen rebuilds should mirror the existing weather, GPX, aircraft, AIS, and UAS rebuild patterns

## Error Handling

### Live train polling failure

If a train location refresh fails:

- keep the last successful train features visible
- set `trainLocationsError`
- show warning state in the active layers panel

### Train detail failure

If the train detail request fails after a click:

- keep the popup open
- show the basic live fields
- append `Details unavailable`

### Station metadata failure

If station metadata fetch fails:

- render no station features
- set `trainStationsError`
- show warning state in the active layers panel

## Testing

Add Playwright coverage with mocked Digitraffic responses for:

1. enable and disable `Train Locations`
2. enable and disable `Train Stations`
3. restore each overlay from permalink
4. click a train and show fetched detail popup
5. click a station and show cached metadata popup
6. verify overlays survive split-view rebuilds

Recommended helper-level tests if lightweight module coverage is already practical:

- train live GeoJSON to feature mapping
- station GeoJSON to feature mapping
- train timetable summary formatting

## Out of Scope

- directional train icons based on heading
- view-bounded train fetches
- train history playback
- user-configurable train refresh interval
- server-side proxying or caching

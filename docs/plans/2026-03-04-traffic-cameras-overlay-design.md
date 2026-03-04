# Traffic Cameras Overlay Design

**Date:** 2026-03-04
**Status:** Design Complete
**Implementation Plan:** Pending

## Goal

Add a traffic camera overlay to IntelMap using the Fintraffic ArcGIS WeatherCams API. The overlay shows one icon per camera, opens an anchored popup with the freshest available image when clicked, and provides a direct link to the camera page on Fintraffic.

## Architecture

Client-only preload approach:

- Fetch camera locations once when the overlay is enabled
- Fetch camera preset metadata once when the overlay is enabled
- Build an in-memory freshest-preset index by `CameraId`
- Render one OpenLayers vector feature per camera on each active map
- Resolve click popups locally from preloaded feature properties

This avoids backend work and keeps click interactions fast because the freshest preset metadata is already available in memory.

## Tech Stack

- OpenLayers 10.5.0 vector layers and overlays
- Browser `fetch` API for ArcGIS REST queries
- Vanilla JavaScript ES modules
- Playwright for end-to-end coverage with mocked API responses

## Data Sources

### Camera locations

- Endpoint: `https://services1.arcgis.com/rhs5fjYxdOG1Et61/ArcGIS/rest/services/WeatherCams/FeatureServer/0/query`
- Returns 804 point features as of 2026-03-04
- Geometry projection: `EPSG:3857`
- Relevant fields:
  - `CameraId`
  - `Name_FI`
  - `Name_EN`
  - `Municipality`
  - `RoadAddress`
  - `CameraActive`
  - `CollectionStatus`

### Camera presets

- Endpoint: `https://services1.arcgis.com/rhs5fjYxdOG1Et61/ArcGIS/rest/services/WeatherCams/FeatureServer/1/query`
- Returns 2236 preset records as of 2026-03-04
- One camera may have multiple presets
- Relevant fields:
  - `CameraId`
  - `PresetId`
  - `DirectionName`
  - `ImageUrl`
  - `PicLastModified`
  - `PresetActive`
  - `InCollection`
  - `CameraResolution`

## Components

### `src/trafficCameras/trafficCameraManager.js`

Owns overlay lifecycle:

- preload locations and presets
- build freshest-preset index by `CameraId`
- create and remove vector layers for `main`, `left`, and `right`
- rebuild layers when switching between single-map and split-screen mode

Exports:

- `startTrafficCameraUpdates()`
- `stopTrafficCameraUpdates()`
- `rebuildTrafficCameraLayers()`

### `src/trafficCameras/trafficCameraLayer.js`

Converts API records into OpenLayers features and styles them.

Responsibilities:

- create one feature per camera
- attach popup metadata to each feature
- provide a camera icon style
- keep map coordinates in `EPSG:3857` without reprojection

### `src/trafficCameras/trafficCameraInteractions.js`

Owns click behavior and popup lifecycle.

Responsibilities:

- click-only interaction in v1
- one pinned popup per active map
- replace popup when a new camera is clicked
- close popup when the user clicks elsewhere

### `src/styles/traffic-cameras.css`

Styles for:

- camera popup container
- scrollable image region
- metadata rows
- external link button

## State Management

Add to `src/state/store.js`:

```javascript
trafficCameraEnabled: false,
trafficCameraLayer: { main: null, left: null, right: null },
trafficCameraFeatures: [],
trafficCameraError: null,
trafficCameraLastFetch: null,
trafficCameraPresetIndex: {}
```

## Data Mapping

### Feature identity

Each camera feature stores:

- `cameraId`
- `name`
- `municipality`
- `roadAddress`
- `cameraActive`
- `collectionStatus`
- `cameraPageUrl`

### Freshest preset selection

When multiple preset records exist for a camera:

1. ignore presets where `PresetActive !== 1`
2. ignore presets where `InCollection !== 1`
3. choose the record with the newest `PicLastModified`

Feature popup data stores:

- `imageUrl`
- `directionName`
- `picLastModified`
- `cameraResolution`

If no usable preset exists, the feature still renders and the popup shows metadata plus an unavailable-image message.

### Display name fallback

Prefer:

1. `Name_EN`
2. `Name_FI`
3. `CameraId`

## UI Integration

### Header layer manager

Add a new accordion item in `src/ui/headerLayerManager.js`:

- section label: `Traffic Cameras`
- checkbox id: `traffic-cameras-enabled`

Behavior:

- enabling starts preload, layer creation, and click interaction setup
- disabling removes layers, clears data, and closes popups
- state changes update the active layers panel and permalink

### Active layers panel

Add an entry while enabled:

- `Traffic Cameras (<count>)`

If preload fails, append a warning marker similar to existing overlays.

### Permalink

Add to `src/map/permalink.js`:

- encode `trafficCameras=1` when enabled
- restore overlay automatically from the query string on initial load

## Popup Design

Clicking a camera icon opens a pinned OpenLayers popup anchored to that feature.

Popup content:

- camera title
- `CameraId`
- optional road address and municipality
- freshest preset direction name
- formatted image timestamp
- full-resolution image from `ImageUrl`
- `Open camera page` link to `https://liikennetilanne.fintraffic.fi/kelikamerat/?cameraId=<CameraId>`

### Full-resolution requirement

The popup must not intentionally downscale the image. It uses the original image URL and allows the image to render at intrinsic dimensions.

To keep the map usable on smaller viewports:

- the popup body becomes scrollable when content exceeds viewport space
- the popup container is constrained, not the image itself

## Data Flow

### Enable flow

1. User enables `Traffic Cameras`
2. Fetch camera locations
3. Fetch camera presets
4. Build freshest-preset index
5. Convert cameras to features
6. Add vector layers to all active maps
7. Update active layers panel and permalink

### Disable flow

1. User disables `Traffic Cameras`
2. Remove vector layers from all active maps
3. Remove popup overlays
4. Clear feature and error state
5. Update active layers panel and permalink

### Split-screen behavior

- Preload happens once
- The same feature collection is rendered on both maps
- Each map keeps its own popup overlay instance

## Error Handling

### Preload failure

If either API request fails:

- record `trafficCameraError`
- render no features
- keep the overlay toggle state visible to the user
- show warning state in active layers panel

### Missing preset

If a camera has no freshest active preset:

- still allow clicking the icon
- show camera metadata and external page link
- show `Latest image unavailable`

### Image load failure

If the popup image fails to load:

- replace image region with a readable fallback message
- keep camera metadata and external page link available

### Re-enable behavior

Disabling and re-enabling should trigger a fresh preload instead of relying on stale state.

## Testing

Add Playwright coverage using mocked ArcGIS responses instead of live third-party data.

### Required scenarios

1. Enable and disable the traffic camera overlay
2. Restore `trafficCameras=1` from permalink
3. Render at least one mocked camera feature
4. Click a feature and verify popup content, image, and external link
5. Verify freshest preset selection uses the newest `PicLastModified`
6. Verify missing-preset handling shows fallback text without crashing

## Notes

- V1 is click-only. No hover preview is included.
- The feature follows existing overlay patterns used by weather, AIS, and aircraft modules.

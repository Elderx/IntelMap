# GPX Overlay Feature - Design Document

**Date:** 2026-02-02
**Author:** Claude
**Status:** Design Phase

## Overview

Add GPX (GPS Exchange Format) file overlay support to IntelMap, enabling users to visualize GPS tracks, elevation profiles, speed graphs, and statistics with interactive hover correlation between map and charts.

## Requirements

### User Stories

1. **Load GPX Files:** User can upload GPX files to display on the map
2. **Track Visualization:** GPX tracks render on the map with color-coding based on elevation or speed
3. **Profile Charts:** Display elevation, speed, and distance over time in interactive charts
4. **Statistics:** Show track statistics: distance, duration, elevation gain/loss, start/end times
5. **Hover Correlation:** When hovering over track on map, corresponding position highlights in charts (and vice versa)
6. **Split-Screen Support:** GPX overlay works in both single and split-screen modes

### Functional Requirements

- **FR1:** Support GPX file format with tracks, waypoints, and routes
- **FR2:** Parse GPX metadata (name, time, elevation, speed)
- **FR3:** Render tracks as LineString features on OpenLayers map
- **FR4:** Color-code tracks by elevation or speed using gradient styling
- **FR5:** Calculate statistics: total distance, duration, elevation gain/loss, min/max elevation
- **FR6:** Display interactive elevation profile chart
- **FR7:** Display interactive speed chart (if speed data available)
- **FR8:** Display distance-over-time chart
- **FR9:** Synchronize hover between map track and chart positions
- **FR10:** Support multiple GPX files loaded simultaneously
- **FR11:** Persist GPX file selection in URL permalink

### Non-Functional Requirements

- **NFR1:** Performance: Handle GPX files with up to 10,000 track points
- **NFR2:** Responsiveness: Charts and map interactions maintain 60fps
- **NFR3:** Browser compatibility: Support modern browsers (Chrome, Firefox, Safari, Edge)
- **NFR4:** Code quality: Follow existing codebase patterns and conventions

## Architecture Design

### Module Structure

```
src/gpx/
├── gpxManager.js       - Core state management, file loading, layer lifecycle
├── gpxParser.js        - GPX parsing using OpenLayers ol/format/GPX
├── gpxStats.js         - Statistics calculations (distance, elevation, duration)
├── gpxRenderer.js      - OpenLayers track rendering and styling
├── gpxCharts.js        - Chart.js integration for elevation/speed profiles
├── gpxInteractions.js  - Hover correlation between map and charts
└── gpxWms.js           - WMS overlay support (future, if needed)
```

### Component Interactions

```
User Interface
    ↓
GPX Manager (orchestrator)
    ├──→ GPX Parser (ol/format/GPX)
    ├──→ GPX Stats (gpx-basic-stats)
    ├──→ GPX Renderer (OpenLayers VectorLayer)
    ├──→ GPX Charts (Chart.js)
    └──→ GPX Interactions (event handlers)
```

### State Management

Add to `src/state/store.js`:

```javascript
// GPX overlay state
gpxEnabled: false,                  // Master toggle
gpxFiles: [],                       // Array of loaded GPX file metadata
gpxFeatures: [],                    // Array of parsed OpenLayers features
gpxLayer: { main: null, left: null, right: null },  // Vector layers
gpxCharts: null,                    // Chart.js instances
gpxCurrentFile: null,               // Currently selected GPX file
gpxColorMode: 'elevation',          // 'elevation' | 'speed' | 'solid'
gpxShowElevationChart: true,        // Show elevation profile
gpxShowSpeedChart: false,           // Show speed chart
gpxShowDistanceChart: false,        // Show distance chart
gpxError: null,                     // Error state
```

## Data Flow

### GPX File Loading Flow

1. User uploads GPX file via file input
2. `gpxManager.loadGpxFile()` reads file
3. `gpxParser.parseGpx()` parses with `ol/format/GPX`
4. Extract track points with elevation, time, position
5. `gpxStats.calculateStats()` computes statistics
6. `gpxRenderer.renderTrack()` adds to map layer
7. `gpxCharts.createCharts()` generates profile charts
8. Update UI with statistics and enable interactions

### Hover Correlation Flow

**Map → Chart:**
1. User hovers over track feature on map
2. `pointermove` event fires on map
3. `gpxInteractions.handleMapHover()` calculates nearest track point
4. Find point index in track data
5. Update chart tooltip/cursor position

**Chart → Map:**
1. User hovers over chart data point
2. Chart.js `hover` event fires
3. Get data point index
4. Retrieve coordinate from track data
5. Update map overlay marker position

## Technical Decisions

### TD1: GPX Parsing - Use OpenLayers Native Parser

**Decision:** Use `ol/format/GPX` instead of external libraries

**Rationale:**
- Built into OpenLayers, no additional dependency
- Handles standard GPX format correctly
- Returns OpenLayers Features directly
- Maintains consistency with existing codebase

**Alternatives Considered:**
- @tmcw/togeojson: Additional dependency, conversion overhead
- gpx-js: Less mature, extra features not needed

### TD2: Statistics Calculation - Use gpx-basic-stats Library

**Decision:** Use `gpx-basic-stats` npm package

**Rationale:**
- Specialized for GPX statistics
- Handles elevation gain/loss correctly (not just min/max)
- Calculates distance along track (not straight-line)
- Computes duration from timestamps

**Alternatives Considered:**
- Custom implementation: Would need to handle edge cases (smoothing, threshold)
- gpx-calc-elevation-gain: Too focused, doesn't handle distance/duration

### TD3: Charting - Use Chart.js

**Decision:** Use Chart.js for profile charts

**Rationale:**
- Lightweight (~60KB gzipped)
- Good performance for line charts
- Excellent documentation and examples for elevation profiles
- Easy tooltip/cursor integration for hover correlation
- MIT license

**Alternatives Considered:**
- Plotly.js: Too heavy (3MB+), overkill for simple line charts
- D3.js: Too low-level, would need more custom code
- ApexCharts: Good option, but less documentation for this use case

### TD4: Track Color-Coding - Use Custom OpenLayers Styling

**Decision:** Implement custom gradient styling using `ol/style.Style` with per-segment coloring

**Rationale:**
- ol-ext FlowLine has compatibility issues with OpenLayers 10.x
- Custom implementation gives full control over color mapping
- Can use elevation/speed values directly from GPX data
- Native OpenLayers API, no external dependency

**Implementation Approach:**
- Split track into segments (one per track point)
- Apply color based on normalized elevation/speed value
- Use color scale (blue→green→yellow→red for elevation)
- Render as MultiLineString or multiple LineString features

### TD5: UI/UX - Floating Panel with Collapsible Charts

**Decision:** Create floating panel similar to aircraft/weather controls

**Rationale:**
- Consistent with existing overlay patterns
- Collapsible to avoid obscuring map
- Can show statistics and toggle chart visibility
- Works in both single and split-screen modes

## API Design

### GPX Manager Module

```javascript
// File loading
async function loadGpxFile(file: File): Promise<void>
function removeGpxFile(fileId: string): void
function clearAllGpxFiles(): void

// State management
function setGpxEnabled(enabled: boolean): void
function setCurrentGpxFile(fileId: string): void
function setColorMode(mode: 'elevation' | 'speed' | 'solid'): void

// Chart visibility
function setElevationChartVisible(visible: boolean): void
function setSpeedChartVisible(visible: boolean): void
function setDistanceChartVisible(visible: boolean): void
```

### GPX Stats Module

```javascript
interface GpxStatistics {
  distance: number;              // meters
  duration: number;              // seconds
  elevationGain: number;         // meters
  elevationLoss: number;         // meters
  elevationMin: number;          // meters
  elevationMax: number;          // meters
  startTime: Date | null;
  endTime: Date | null;
  pointCount: number;
}

function calculateStats(features: Feature[]): GpxStatistics
```

### GPX Charts Module

```javascript
interface ChartData {
  labels: string[];              // Time or distance labels
  elevationDataset: number[];
  speedDataset: number[] | null;
  distanceDataset: number[];
}

function createCharts(container: HTMLElement, data: ChartData): void
function updateCharts(data: ChartData): void
function highlightPoint(index: number): void
function destroyCharts(): void
```

### GPX Interactions Module

```javascript
function setupMapHoverHandlers(): void
function setupChartHoverHandlers(chart: Chart): void
function handleMapHover(event: MapBrowserEvent<PointerType>): void
function handleChartHover(event: ChartEvent): void
function setMapMarkerAtIndex(index: number): void
function setChartCursorAtIndex(index: number): void
```

## Data Structures

### GPX File Metadata

```javascript
interface GpxFile {
  id: string;                    // Unique ID
  name: string;                  // Filename or track name
  file: File;                    // Original File object
  features: Feature[];           // Parsed OpenLayers features
  stats: GpxStatistics;          // Calculated statistics
  trackData: TrackPoint[];       // Raw track point data for charts
  loadedAt: Date;                // Load timestamp
}
```

### Track Point Data

```javascript
interface TrackPoint {
  index: number;                 // Position in track
  coordinates: number[];         // [lon, lat] projected to EPSG:3857
  lon: number;                   // Longitude WGS84
  lat: number;                   // Latitude WGS84
  elevation: number | null;      // Elevation in meters
  time: Date | null;             // Timestamp
  speed: number | null;          // Speed in m/s (calculated)
  distance: number;              // Cumulative distance from start (meters)
}
```

## Error Handling

### E1: Invalid GPX File

**Scenario:** User uploads file that's not valid GPX format

**Handling:**
- Catch parsing error in `gpxParser.parseGpx()`
- Display user-friendly error message in UI
- Log detailed error to console
- Don't add file to loaded files list

### E2: Missing Elevation Data

**Scenario:** GPX file has no elevation information

**Handling:**
- Detect missing elevation during parsing
- Set all elevation values to null
- Disable elevation chart
- Disable elevation color-coding mode
- Show warning in statistics panel

### E3: Very Large GPX File

**Scenario:** GPX file with >10,000 track points

**Handling:**
- Implement point simplification during parsing
- Use Douglas-Peucker algorithm to reduce points while preserving shape
- Show warning to user about simplification
- Allow user to load unsimplified version if they want

## Security Considerations

### S1: File Upload Validation

- Validate file extension is `.gpx`
- Validate file size (max 10MB)
- Validate GPX XML structure before parsing
- Sanitize any GPX metadata before displaying

### S2: Permalink Safety

- Don't embed full GPX file data in URL (too large)
- Only store reference to filename/ID
- GPX files must be re-loaded on page refresh
- Consider server-side storage for shared permalinks (future)

## Testing Strategy

### Unit Tests

- GPX parsing with various GPX file formats
- Statistics calculations (distance, elevation gain/loss)
- Color scale generation for elevation/speed
- Point index calculation for hover correlation

### Integration Tests

- Load GPX file and verify track appears on map
- Verify charts render with correct data
- Test hover correlation between map and charts
- Test split-screen mode synchronization
- Test permalink encoding/decoding

### E2E Tests (Playwright)

1. Upload GPX file and verify track loads
2. Verify statistics display correctly
3. Verify elevation chart displays
4. Test hover correlation on map
5. Test hover correlation on chart
6. Test color mode switching
7. Test multiple GPX files loaded
8. Test split-screen mode

## Performance Considerations

### P1: Large GPX Files

- Implement point simplification for >10,000 points
- Use vector tiles for very large tracks (future)
- Lazy load chart data (only visible portion)

### P2: Chart Rendering

- Limit chart data points (downsample if necessary)
- Use Chart.js streaming for real-time data (future)
- Debounce hover events to reduce chart updates

### P3: Map Rendering

- Use WebGL rendering for tracks (future optimization)
- Implement level-of-detail simplification
- Cache rendered track segments

## Future Enhancements

### FE1: GPX File Management

- Save favorite GPX files to user account
- Share GPX overlays via permalink
- Organize GPX files into folders

### FE2: Advanced Analysis

- Compare multiple GPX tracks
- Show track segments with steep gradients
- Calculate pace/heart rate zones (if data available)

### FE3: Editing Capabilities

- Edit track points on map
- Merge/split GPX tracks
- Export modified GPX files

### FE4: 3D Visualization

- 3D terrain view with track overlay
- Elevation profile synchronized with 3D view
- Fly-through animation along track

## Dependencies

### New npm Packages

```json
{
  "dependencies": {
    "chart.js": "^4.x.x",
    "gpx-basic-stats": "^1.x.x"
  }
}
```

### Existing Dependencies

- `ol: 10.5.0` - OpenLayers mapping library
- `ol/format/GPX` - Built-in GPX parser

## Documentation

### User Documentation

- How to load GPX files
- Understanding track statistics
- Using hover correlation
- Customizing chart display

### Developer Documentation

- Module architecture
- Data flow diagrams
- Adding new chart types
- Customizing color scales

## Open Questions

1. **Q1:** Should GPX files be persisted to server or only local?
   - **Recommendation:** Start with local-only, add server persistence in future enhancement

2. **Q2:** How to handle GPX files with multiple tracks?
   - **Recommendation:** Load all tracks, allow user to toggle visibility individually

3. **Q3:** Should we support route (<rte>) and waypoint (<wpt>) features?
   - **Recommendation:** Support tracks first, add routes/waypoints in phase 2

4. **Q4:** Maximum file size limit?
   - **Recommendation:** 10MB limit, show warning for files >5000 points

## Sign-Off

**Design Review:** Pending
**Implementation Approval:** Pending
**Start Date:** TBD
**Target Completion:** TBD

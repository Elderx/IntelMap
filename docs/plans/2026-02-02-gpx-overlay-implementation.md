# GPX Overlay Feature - Implementation Plan

**Design Document:** [2026-02-02-gpx-overlay-design.md](./2026-02-02-gpx-overlay-design.md)
**Date:** 2026-02-02
**Status:** Ready for Implementation

## Prerequisites

- Branch: `feature/gpx-overlay`
- Worktree: `/home/elderx/IntelMap/.worktrees/gpx`
- Dependencies installed: `chart.js`, `gpx-basic-stats`

## Implementation Tasks

### Phase 1: Foundation (State, Parser, Stats)

#### Task 1.1: Add GPX State to Store
**File:** `src/state/store.js`

**Steps:**
1. Add GPX state properties to the state object:
   ```javascript
   // GPX overlay state
   gpxEnabled: false,
   gpxFiles: [],                       // Array of loaded GPX file metadata
   gpxFeatures: [],                    // Array of parsed OpenLayers features
   gpxLayer: { main: null, left: null, right: null },
   gpxCharts: null,                    // Chart.js instances
   gpxCurrentFile: null,               // Currently selected GPX file
   gpxColorMode: 'elevation',          // 'elevation' | 'speed' | 'solid'
   gpxShowElevationChart: true,
   gpxShowSpeedChart: false,
   gpxShowDistanceChart: false,
   gpxError: null,
   ```

**Verification:** Run `npm run dev` and check no errors in console

---

#### Task 1.2: Create GPX Parser Module
**File:** `src/gpx/gpxParser.js`

**Steps:**
1. Import `ol/format/GPX`
2. Create `parseGpxFile(file)` function:
   - Read file as text using `FileReader`
   - Parse with `new GPX().readFeatures(text)`
   - Extract features with geometry
   - Extract track point data (coordinates, elevation, time)
   - Return array of features and raw track data

3. Create `extractTrackData(features)` helper:
   - Iterate through features
   - For each LineString geometry, extract coordinates
   - Extract elevation from properties (if available)
   - Extract time from properties (if available)
   - Calculate cumulative distance
   - Calculate speed between points (if time data available)

**Data Structure:**
```javascript
{
  features: Feature[],           // OpenLayers features
  trackPoints: {                 // Raw data for charts
    index: number,
    coordinates: number[],       // Projected [x, y]
    lon: number,
    lat: number,
    elevation: number | null,
    time: Date | null,
    speed: number | null,
    distance: number            // Cumulative from start
  }[]
}
```

**Verification:** Create test GPX file with known data, verify parsing returns expected structure

---

#### Task 1.3: Create GPX Stats Module
**File:** `src/gpx/gpxStats.js`

**Steps:**
1. Import `gpx-basic-stats` library
2. Create `calculateStats(trackPoints, features)` function:
   - Use `gpx-basic-stats` to calculate:
     - Total distance
     - Elevation gain
     - Elevation loss
     - Min/max elevation
   - Calculate duration from time data (first to last point)
   - Extract start/end time from track points

3. Create statistics object:
```javascript
{
  distance: number,              // meters
  duration: number,              // seconds
  elevationGain: number,         // meters
  elevationLoss: number,         // meters
  elevationMin: number,          // meters
  elevationMax: number,          // meters
  startTime: Date | null,
  endTime: Date | null,
  pointCount: number,
  hasElevationData: boolean,
  hasTimeData: boolean
}
```

**Verification:** Test with GPX file containing elevation data, verify calculations match expected values

---

### Phase 2: Track Rendering

#### Task 2.1: Create GPX Renderer Module
**File:** `src/gpx/gpxRenderer.js`

**Steps:**
1. Import OpenLayers style classes
2. Create `ensureGpxLayers()` function:
   - Create vector layers for main, left, right maps if they don't exist
   - Add layers to respective maps
   - Store in `state.gpxLayer`

3. Create `renderGpxTrack(features, colorMode)` function:
   - Clear existing features from layer
   - For each feature, apply style based on color mode
   - Add features to all map layers (main, left, right)
   - Fit map view to track extent

4. Create `applyColorModeStyle(feature, colorMode, trackData)` function:
   - If colorMode === 'solid': Apply single color (blue)
   - If colorMode === 'elevation': Apply gradient based on elevation
     - Split track into segments
     - Color each segment based on normalized elevation value
     - Use color scale: blue (low) → green → yellow → red (high)
   - If colorMode === 'speed': Apply gradient based on speed
     - Similar to elevation but use speed values

5. Create `getElevationColor(elevation, min, max)` helper:
   - Normalize elevation to 0-1 range
   - Map to color gradient
   - Return RGB color string

6. Create `getSpeedColor(speed, min, max)` helper:
   - Normalize speed to 0-1 range
   - Map to color gradient
   - Return RGB color string

**Segment Coloring Approach:**
- Create multiple LineString features, one per segment
- Each segment connects adjacent track points
- Apply color to each segment individually
- Add all segments as separate features

**Verification:** Load test GPX file, verify track appears on map with correct colors

---

#### Task 2.2: Implement Segment-Based Coloring
**File:** `src/gpx/gpxRenderer.js` (continuation)

**Steps:**
1. Create `createSegmentFeatures(trackData, colorMode)` function:
   - Iterate through track points
   - For each pair of adjacent points, create LineString segment
   - Calculate color for segment based on mode
   - Return array of segment features

2. Handle edge cases:
   - Single point: Show as Point feature with circle style
   - Two points: Single segment
   - Multiple points: Multiple segments

3. Optimize performance:
   - Combine segments with same color into MultiLineString
   - Limit segment creation to reasonable number (< 1000)

**Verification:** Test with GPX file having varying elevation, verify color gradient looks correct

---

### Phase 3: UI Components

#### Task 3.1: Create GPX Control Panel UI
**File:** `index.html`

**Steps:**
1. Add GPX control section to header overlay panel (similar to aircraft/weather controls)
2. Add file input for GPX upload:
   ```html
   <div id="gpx-panel" class="overlay-panel hidden">
     <h3>GPX Tracks</h3>
     <input type="file" id="gpx-file-input" accept=".gpx" multiple>
     <div id="gpx-file-list"></div>
     <div id="gpx-stats"></div>
     <div id="gpx-charts-container"></div>
     <div id="gpx-controls">
       <label>
         <input type="checkbox" id="gpx-show-elevation" checked>
         Elevation Chart
       </label>
       <label>
         <input type="checkbox" id="gpx-show-speed">
         Speed Chart
       </label>
       <label>
         <input type="radio" name="gpx-color-mode" value="elevation" checked>
         Color by Elevation
       </label>
       <label>
         <input type="radio" name="gpx-color-mode" value="speed">
         Color by Speed
       </label>
       <label>
         <input type="radio" name="gpx-color-mode" value="solid">
         Solid Color
       </label>
     </div>
   </div>
   ```

3. Add GPX toggle button to header overlay dropdown
4. Style panel to match existing overlay panels

**Verification:** Open app in browser, verify GPX panel appears and styling matches other panels

---

#### Task 3.2: Create GPX UI Manager
**File:** `src/ui/gpxControl.js`

**Steps:**
1. Create `initGpxControl()` function:
   - Get references to UI elements
   - Wire up event listeners:
     - File input change → `gpxManager.handleFileUpload()`
     - Show/hide checkboxes → `gpxManager.setChartVisibility()`
     - Color mode radio buttons → `gpxManager.setColorMode()`
     - Remove file buttons → `gpxManager.removeGpxFile()`

2. Create `updateFileList()` function:
   - Render list of loaded GPX files
   - Show file name and statistics
   - Add remove button for each file
   - Highlight current selected file

3. Create `updateStats(stats)` function:
   - Display statistics in stats panel
   - Format values nicely (km for distance, min/sec for duration, m for elevation)
   - Show warning if elevation/time data missing

4. Create `showError(message)` function:
   - Display error message in panel
   - Auto-hide after 5 seconds
   - Log to console

**Verification:** Test UI interactions, verify events trigger correct functions

---

### Phase 4: Charting

#### Task 4.1: Create GPX Charts Module
**File:** `src/gpx/gpxCharts.js`

**Steps:**
1. Import Chart.js
2. Create `createCharts(container, trackData, stats)` function:
   - Clear any existing charts
   - Create elevation chart (if data available)
   - Create speed chart (if data available)
   - Create distance chart (if data available)
   - Store chart instances in `state.gpxCharts`

3. Create `createElevationChart(container, trackData)` helper:
   - Extract elevation values from track data
   - Use distance (x-axis) vs elevation (y-axis)
   - Configure chart with proper scales
   - Enable hover interaction
   - Style: Line chart with fill, blue color

4. Create `createSpeedChart(container, trackData)` helper:
   - Extract speed values from track data
   - Use time (x-axis) vs speed (y-axis)
   - Configure chart with proper scales
   - Style: Line chart with fill, green color

5. Create `createDistanceChart(container, trackData)` helper:
   - Extract distance values from track data
   - Use time (x-axis) vs distance (y-axis)
   - Configure chart with proper scales
   - Style: Line chart, purple color

6. Create `updateChartsVisibility()` function:
   - Show/hide charts based on state
   - Update chart layout
   - Resize visible charts

7. Create `destroyCharts()` function:
   - Destroy all chart instances
   - Clear state

**Chart Configuration:**
```javascript
{
  type: 'line',
  data: { ... },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      tooltip: {
        enabled: true,
        callbacks: {
          label: formatTooltip
        }
      }
    },
    scales: {
      x: { title: { display: true, text: 'Distance (km)' } },
      y: { title: { display: true, text: 'Elevation (m)' } }
    }
  }
}
```

**Verification:** Load GPX file with elevation data, verify charts render correctly

---

#### Task 4.2: Implement Chart Hover Handlers
**File:** `src/gpx/gpxCharts.js` (continuation)

**Steps:**
1. Add `onHover` callback to chart configuration
2. Create `handleChartHover(event, elements, chart)` function:
   - Get hovered data point index
   - Call `gpxInteractions.setMapMarkerAtIndex(index)`
3. Export function to get chart instances for interaction setup

**Verification:** Hover over chart, verify marker appears on map at correct location

---

### Phase 5: Interactions (Hover Correlation)

#### Task 5.1: Create GPX Interactions Module
**File:** `src/gpx/gpxInteractions.js`

**Steps:**
1. Create `setupMapHoverHandlers()` function:
   - Add `pointermove` event listener to all maps
   - Debounce event (100ms)
   - Call `handleMapHover()` on event

2. Create `handleMapHover(event)` function:
   - Get map coordinate at cursor
   - Find nearest track point to cursor
   - Find index of nearest point
   - Call `setChartCursorAtIndex(index)`
   - Show hover tooltip on map

3. Create `findNearestTrackPoint(coordinate, trackData)` function:
   - Calculate distance from cursor to each track point
   - Return index of closest point within threshold (50px)
   - Return null if no point within threshold

4. Create `setChartCursorAtIndex(index)` function:
   - Get chart instance from state
   - Update chart's active elements
   - Trigger chart tooltip at index
   - Update chart highlight

5. Create `setMapMarkerAtIndex(index)` function:
   - Get track point coordinates at index
   - Create or update overlay marker
   - Position marker at coordinates
   - Show tooltip with point data

6. Create overlay marker:
   - Use `ol/Overlay` for marker
   - Style as circle with border
   - Add tooltip element

**Verification:** Hover over track on map, verify chart cursor moves to corresponding position

---

#### Task 5.2: Setup Chart Hover Handlers
**File:** `src/gpx/gpxInteractions.js` (continuation)

**Steps:**
1. Create `setupChartHoverHandlers(chart)` function:
   - Add `hover` event listener to chart
   - Call `handleChartHover()` on event

2. Create `handleChartHover(event, elements, chart)` function:
   - Get hovered data point index from elements
   - Call `setMapMarkerAtIndex(index)`
   - Show tooltip on map

**Verification:** Hover over chart, verify marker appears on map at correct location

---

### Phase 6: Integration

#### Task 6.1: Create GPX Manager Module
**File:** `src/gpx/gpxManager.js`

**Steps:**
1. Import all GPX modules
2. Create `startGpxUpdates()` function (no-op, stateless)
3. Create `stopGpxUpdates()` function (cleanup)
4. Create `loadGpxFile(file)` async function:
   - Generate unique ID for file
   - Parse GPX file using `gpxParser`
   - Calculate stats using `gpxStats`
   - Store file metadata in `state.gpxFiles`
   - Set as current file
   - Render track using `gpxRenderer`
   - Create charts using `gpxCharts`
   - Update UI using `gpxControl`
   - Update permalink

5. Create `removeGpxFile(fileId)` function:
   - Remove from `state.gpxFiles`
   - If was current file, clear current
   - Re-render remaining tracks
   - Update UI

6. Create `setCurrentGpxFile(fileId)` function:
   - Update `state.gpxCurrentFile`
   - Re-render track for selected file
   - Update charts for selected file
   - Update UI stats

7. Create `setColorMode(mode)` function:
   - Update `state.gpxColorMode`
   - Re-render tracks with new color mode
   - Update UI

8. Create `setChartVisibility(type, visible)` function:
   - Update visibility state
   - Call `gpxCharts.updateChartsVisibility()`
   - Update UI

9. Create `clearAllGpxFiles()` function:
   - Clear `state.gpxFiles`
   - Clear `state.gpxCurrentFile`
   - Clear layers
   - Destroy charts
   - Update UI

**Verification:** Test all manager functions, verify state updates correctly

---

#### Task 6.2: Update Main.js for GPX Integration
**File:** `src/main.js`

**Steps:**
1. Import GPX modules:
   ```javascript
   import { initGpxControl } from './ui/gpxControl.js';
   import { startGpxUpdates, rebuildGpxLayers } from './gpx/gpxManager.js';
   ```

2. Initialize GPX control after header initialization:
   ```javascript
   initGpxControl();
   ```

3. Add GPX layer rebuilding to split-screen activation:
   - In `activateSplitScreen()`, add:
     ```javascript
     import('./gpx/gpxManager.js').then(({ rebuildGpxLayers }) => {
       rebuildGpxLayers();
     });
     ```

4. Add GPX layer rebuilding to split-screen deactivation:
   - In `deactivateSplitScreen()`, add:
     ```javascript
     import('./gpx/gpxManager.js').then(({ rebuildGpxLayers }) => {
       rebuildGpxLayers();
     });
     ```

5. Add GPX state restoration from permalink:
   - In `restoreFeaturesFromURL()`, check for `gpx` parameter
   - If present, enable GPX and load files (if we add file persistence)

**Verification:** Test split-screen mode, verify GPX tracks appear on both maps

---

#### Task 6.3: Update Permalink for GPX State
**File:** `src/map/permalink.js`

**Steps:**
1. In `updatePermalinkWithFeatures()`, add GPX state:
   ```javascript
   let gpxStr = '';
   if (state.gpxEnabled && state.gpxCurrentFile) {
     gpxStr = `&gpx=${state.gpxCurrentFile.id}`;
     // Add color mode
     if (state.gpxColorMode !== 'elevation') {
       gpxStr += `&gpxColor=${state.gpxColorMode}`;
     }
     // Add chart visibility
     if (state.gpxShowElevationChart) gpxStr += '&gpxElev=1';
     if (state.gpxShowSpeedChart) gpxStr += '&gpxSpeed=1';
     if (state.gpxShowDistanceChart) gpxStr += '&gpxDist=1';
   }
   ```

2. Add to params string

3. In `restoreFeaturesFromURL()` in `main.js`, parse GPX parameters:
   - Check for `gpx` parameter
   - If present, set `state.gpxEnabled = true`
   - Parse color mode and chart visibility
   - Note: Can't restore file from URL (would need server persistence)

**Verification:** Enable GPX overlay, verify URL updates with GPX parameters

---

### Phase 7: Polish & Testing

#### Task 7.1: Add Error Handling
**Files:** All GPX modules

**Steps:**
1. Wrap file operations in try-catch
2. Handle invalid GPX files gracefully
3. Show user-friendly error messages
4. Add validation for file size and format
5. Handle missing elevation/time data
6. Add loading indicators during parsing

**Verification:** Test with invalid GPX files, verify proper error messages

---

#### Task 7.2: Optimize Performance
**Files:** `src/gpx/gpxRenderer.js`, `src/gpx/gpxCharts.js`

**Steps:**
1. Implement point simplification for large files (>5000 points)
2. Limit chart data points (downsample if necessary)
3. Debounce hover events
4. Use requestAnimationFrame for smooth updates
5. Cache calculated values

**Verification:** Test with large GPX file (>10000 points), verify performance acceptable

---

#### Task 7.3: Add E2E Tests
**File:** `tests/e2e/gpx.spec.ts`

**Steps:**
1. Create test file
2. Add test cases:
   - Upload GPX file and verify track loads
   - Verify statistics display correctly
   - Verify elevation chart displays
   - Test hover correlation on map
   - Test hover correlation on chart
   - Test color mode switching
   - Test multiple GPX files
   - Test split-screen mode
   - Test permalink encoding/decoding

3. Use test GPX file in `tests/fixtures/`

**Verification:** Run `npm run test:e2e`, ensure all tests pass

---

#### Task 7.4: Update Header Layer Manager
**File:** `src/ui/headerLayerManager.js`

**Steps:**
1. Add GPX overlay to active layers list
2. Show GPX indicator when enabled
3. Allow toggling GPX from layers menu

**Verification:** Enable GPX, verify indicator appears in header

---

#### Task 7.5: Add Loading States
**Files:** `src/ui/gpxControl.js`, `src/gpx/gpxManager.js`

**Steps:**
1. Show loading spinner while parsing GPX file
2. Show loading indicator while rendering charts
3. Disable controls during loading
4. Show progress for large files

**Verification:** Load large GPX file, verify loading indicators appear

---

## Development Workflow

### Order of Implementation

1. **Phase 1** (Foundation): Tasks 1.1, 1.2, 1.3
2. **Phase 2** (Rendering): Tasks 2.1, 2.2
3. **Phase 3** (UI): Tasks 3.1, 3.2
4. **Phase 4** (Charts): Tasks 4.1, 4.2
5. **Phase 5** (Interactions): Tasks 5.1, 5.2
6. **Phase 6** (Integration): Tasks 6.1, 6.2, 6.3
7. **Phase 7** (Polish): Tasks 7.1, 7.2, 7.3, 7.4, 7.5

### Testing Strategy

After each phase:
1. Run `npm run dev` and verify no console errors
2. Test the features implemented in that phase
3. Create small test GPX files for validation

After completion:
1. Run `docker compose build`
2. Run `docker compose up -d`
3. Run `npm run test:e2e`
4. Verify all tests pass

### Commit Strategy

Create commits after each phase:
- `feat(gpx): add state and parser foundation`
- `feat(gpx): implement track rendering with color modes`
- `feat(gpx): add GPX control panel UI`
- `feat(gpx): implement elevation/speed charts`
- `feat(gpx): add hover correlation between map and charts`
- `feat(gpx): integrate GPX overlay with main app`
- `feat(gpx): add error handling and polish`
- `test(gpx): add E2E tests`

## Success Criteria

- [ ] Can upload GPX files via file input
- [ ] Tracks render on map with correct geometry
- [ ] Tracks color-coded by elevation (gradient)
- [ ] Tracks color-coded by speed (gradient)
- [ ] Statistics display correctly (distance, elevation, time)
- [ ] Elevation profile chart displays
- [ ] Speed chart displays (when data available)
- [ ] Hovering over track shows position on chart
- [ ] Hovering over chart shows marker on map
- [ ] Works in split-screen mode
- [ ] Permalink encodes GPX state
- [ ] Error handling for invalid files
- [ ] All E2E tests pass

## Rollback Plan

If issues arise:
1. Each phase can be independently reverted
2. Git worktree allows easy branch switching
3. No database changes required (feature is client-side only)

## Notes

- Use existing patterns from aircraft/weather overlay implementations
- Follow code style conventions in existing codebase
- Test with real GPX files from various sources (Strava, Garmin, etc.)
- Consider mobile responsiveness for UI panels
- Ensure accessibility (keyboard navigation, screen readers)

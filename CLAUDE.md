# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
- `npm run dev` - Start Vite dev server (serves at http://localhost:5173)
- `npm run build` - Build for production (includes OSM manifest generation)
- `node scripts/generate-osm-manifest.mjs` - Regenerate OSM GeoJSON manifest

### Docker
- `docker compose build` - Build all Docker images
- `docker compose up --build` - Build and start all services (db, server, cache-proxy, web)
- `docker compose up -d` - Start all services in detached mode
- `docker compose logs -f` - View logs
- `docker compose down` - Stop and remove all containers

### Testing
- `npm run test:e2e` - Run Playwright end-to-end tests (runs from host, targets Docker ports)
- `npm run coverage` - Generate test coverage report (HTML + terminal)

**IMPORTANT:** E2E tests are ALWAYS run from the host machine, NOT inside Docker containers. The web container uses Caddy and doesn't have npm/node installed. Tests target the Docker-exposed ports (web: http://localhost:8080, server: http://localhost:3000).

## Mandatory Testing Workflow

**CRITICAL: All tests must pass before any changes are considered complete.**

### Before Committing Changes

1. **Build Docker Compose first:**
   ```bash
   docker compose build
   ```
   If the build fails, fix the issues before proceeding.

2. **If build succeeds, start Docker services:**
   ```bash
   docker compose up -d
   ```
   This starts all services (db, server, cache-proxy, web) in the background.

3. **Run tests from the host machine:**
   ```bash
   npm run test:e2e
   ```
   Tests run from your host machine and target the Docker-exposed ports:
   - Web: http://localhost:8080
   - Server API: http://localhost:3000

4. **All tests must pass.** If any test fails:
   - Investigate and fix the failure
   - Re-run the full test suite to verify the fix
   - Do not commit changes until all tests pass

### Why This Workflow?

- The production build environment in Docker may differ from local dev environment
- Tests verify that changes work correctly in production mode
- Catching issues early prevents broken code from being deployed
- Tests run from the host machine targeting Docker containers, ensuring realistic testing against production-like environment

### ALWAYS Use Docker for Testing

**IMPORTANT: Always test against Docker Compose, not local node/npm commands.**

The production environment runs in Docker containers with:
- **Web container**: Uses production build (Caddy), no npm/node available
- **Server container**: Node.js with production dependencies only
- **Database container**: PostgreSQL with PostGIS

**IMPORTANT:** E2E tests MUST be run from the host machine, NOT from inside Docker containers.
- The web container doesn't have npm/node installed (it's a pure Caddy web server)
- Tests run on the host and target the Docker-exposed ports
- This ensures tests run against the actual production build

Local `npm run dev` uses Vite dev server which behaves differently than production.
Always verify changes work correctly by:
1. Building Docker images: `docker compose build`
2. Starting services: `docker compose up -d`
3. Running tests from host: `npm run test:e2e` (targets http://localhost:8080 web and http://localhost:3000 server API)

If you need to test API endpoints directly, use curl or similar tools against the Docker-exposed ports:
```bash
# Test API endpoint
curl -X POST http://localhost:3000/api/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin"}' -c /tmp/cookies.txt
curl -b /tmp/cookies.txt http://localhost:3000/api/markers
```

### Backend (in server/ directory)
- `npm start` - Start Express server

## High-Level Architecture

IntelMap is a full-stack OpenLayers mapping application with split-screen view, drawing tools, and dynamic data overlays. The app uses a simple state management approach without complex frameworks.

### Frontend Stack
- **Vite** - Build tool and dev server
- **OpenLayers 10.5.0** - Mapping library
- **JavaScript ES Modules** - No bundler framework, direct module imports

### Backend Stack
- **Express.js** - REST API server
- **PostgreSQL + PostGIS** - Spatial database
- **Passport.js** - Authentication (Local Strategy)

### Application Flow
1. `src/main.js` bootstraps the app after authentication
2. `src/state/store.js` holds centralized mutable state
3. Maps are created in single or split-screen mode
4. Drawing tools, overlays, and user features are loaded
5. Interactions wired up (hover, click, drag)

## Key Modules

### State Management (`src/state/store.js`)
Centralized mutable object containing:
- Map instances (`map`, `leftMap`, `rightMap`, `isSplit`)
- Drawing state (`drawingMode`, `lineCoords`, `polygonCoords`, `circleCoords`, `measureCoords`)
- User features (`userMarkers`, `userPolygons`, `userCircles`)
- Overlay layers (`overlayLayerObjects`, `digiroadOverlayLayers`, etc.)
- OSM data (`osmSelectedIds`, `osmAssignedColors`, `activeOsmFeatures`)

State is accessed directly: `import { state } from '../state/store.js'`

### Drawing System (`src/draw/`)
- **tools.js** - Button handlers for Marker, Line, Polygon, Circle (Radius), and Measure tools
- **helpers.js** - Layer creation utilities including `createCircleLayer()`
- **showables.js** - Feature display across all map views
- **markers.js** - Marker display helpers

**Drawing Tool Pattern:**
1. User clicks tool button in UI → `drawingMode` set in state
2. Overlay click handlers disabled
3. OpenLayers `Draw` interaction added to map(s)
4. On `drawend`: save to state, open metadata form (for user features), persist to server/URL
5. Clean up interaction, re-enable overlay clicks

For **Circle (Radius)** tool specifically:
- First click sets center point
- Mouse move shows circle preview with dotted radius line and distance label
- Second click places the circle and opens color/opacity form

### User Features (`src/user/`)
- **userLayers.js** - Manages persistent markers, polygons, circles (CRUD operations)
- **userInteractions.js** - Hover popups and click-to-edit functionality

User features have:
- `dbId` - Database primary key
- `userType` - 'marker', 'polygon', or 'circle'
- `title`, `description`, `color`
- `opacity` (circles only)
- `ownerUsername`, `sharedUserIds`

### Map System (`src/map/`)
- **init.js** - Map creation and configuration
- **layers.js** - Layer factory supporting WMTS, XYZ, Mapbox styles, Esri
- **overlays.js** - Overlay management (WMS, OSM GeoJSON)
- **permalink.js** - URL state serialization (NOT including user features - those load from DB)
- **sync.js** - Split-screen view synchronization

### API (`src/api/client.js`)
REST API wrapper functions:
- `fetchMarkers()`, `fetchPolygons()`, `fetchCircles()`
- `createMarker()`, `createPolygon()`, `createCircle()`
- `updateMarker()`, `updatePolygon()`, `updateCircle()`
- `deleteMarker()`, `deletePolygon()`, `deleteCircle()`
- `fetchUsers()` - For feature sharing

### Database Schema (`server/index.js`)
PostgreSQL with PostGIS extension:
- `users` - Authentication
- `markers` - Point geometries with JSONB properties
- `polygons` - Polygon geometries with JSONB properties
- `circles` - Point center + radius_meters with JSONB properties
- `marker_shares`, `polygon_shares`, `circle_shares` - Feature sharing
- `layer_groups` - Saved layer configurations
- `osm_tile_cache` - Tile caching metadata

All user-owned features have `owner_user_id` FK to users table.

## Split-Screen View

The app supports single and split-screen modes:
- **Single mode**: One map (`state.map`)
- **Split mode**: Two maps (`state.leftMap`, `state.rightMap`)

Many operations use the pattern:
```javascript
['main', 'left', 'right'].forEach(key => {
  const mapObj = key === 'main' ? state.map
    : key === 'left' ? state.leftMap : state.rightMap;
  if (!mapObj) return;
  // Operate on mapObj...
});
```

## Permalink System

URL state in `src/map/permalink.js`:
- Encodes: `lat`, `lon`, `z`, `layer` or `leftLayer`/`rightLayer`, `split`, `line`, `measure`, `overlays`, `osm`, `groups`
- Does NOT encode user markers/polygons/circles (loaded from database)
- Does NOT encode preview circles (temporary drawing state)

## Important Code Patterns

### Layer Management
Always track layers in state for cleanup:
```javascript
state.someLayerObjects[key].push(layer);
mapObj.addLayer(layer);

// On cleanup:
state.someLayerObjects[key].forEach(l => mapObj.removeLayer(l));
state.someLayerObjects[key] = [];
```

### Z-Index Hierarchy
- Base tiles: 0
- WMS overlays: 50
- OSM GeoJSON: 60
- Dynamic OSM (Overpass): 150
- Drawn lines/circles: 102
- Drawn polygons: 103
- Measure lines: 104
- User circles: 195
- User polygons: 190
- User markers: 200

### Circle Rendering
Circles use OpenLayers `ol/geom/Circle` with:
- Center point (projected coordinates)
- Radius in meters (projected units)
- Additional features: dotted radius line (`LineString`) + text label (`Text` style)

## Adding New Features

### New Drawing Tool
1. Add button in `index.html` under `#draw-dropdown` (header dropdown panel)
2. Add handler in `src/draw/tools.js` with `closeAllDropdowns()` call
3. Add state properties to `src/state/store.js`
4. Add display function to `src/draw/showables.js`
5. Add to `clearDrawnFeatures()` and `copyDrawnFeatures()`

### New User Feature Type (with database)
1. Add database table in `server/index.js` `initDb()`
2. Add CRUD endpoints in `server/index.js`
3. Add client API functions in `src/api/client.js`
4. Add layer management in `src/user/userLayers.js`:
   - `ensureLayersForMap()` - create vector layer
   - `drawFeatureOnMapKey()` - render feature
   - `addUserFeatureToMaps()` - add to all maps
   - `updateUserFeatureById()`, `removeUserFeatureById()` - CRUD
   - Update `rebuildUserLayersAllMaps()` - include rebuild
5. Add hover/click support in `src/user/userInteractions.js`
6. Add form handling in `src/ui/userFeatureForm.js` if needed
7. Load on startup in `src/main.js` `loadUserFeaturesFromServer()`

## Testing

Tests are in `tests/e2e/` using Playwright.
- Config: `playwright.config.js`
- Global setup: `tests/global-setup.ts` (creates `.nyc_output` directory for coverage)
- Tests target Docker-exposed ports: web on `http://localhost:8080`, server on `http://localhost:3000`
- Coverage report: `npm run coverage` (generates HTML report)

**IMPORTANT:** Tests are run from the host machine, NOT inside Docker containers. The web container uses Caddy and doesn't have npm/node available.

**See "Mandatory Testing Workflow" section above for required testing steps before committing.**

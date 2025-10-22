# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

Project: MML Map (OpenLayers WMTS/WMS) — Vite-based web app for Finnish base maps (WMTS), WMS overlays (Digiroad), OSM GeoJSON overlays, split view, drawing/measurement, and optional Google Places search.

Commands
- Install deps
  ```bash path=null start=null
  npm ci
  ```
- Start dev server (generates OSM manifest via predev)
  ```bash path=null start=null
  npm run dev
  # Open http://localhost:5173
  ```
- Manually regenerate OSM manifest (scans public/osm/*.geojson -> public/osm/manifest.json)
  ```bash path=null start=null
  node scripts/generate-osm-manifest.mjs
  ```
- Production build (manifest is generated automatically)
  ```bash path=null start=null
  npm run build
  ```
- Serve production build locally
  ```bash path=null start=null
  npx serve dist
  ```
- Docker (development)
  ```bash path=null start=null
  docker build --target dev -t mml-map:dev .
  docker run --rm -p 5173:5173 mml-map:dev
  # Open http://localhost:5173
  ```
- Docker (production, Caddy static server)
  ```bash path=null start=null
  # Option A: serve under /mml-map/ (matches vite base for NODE_ENV=production)
  docker build -t mml-map:prod .
  docker run --rm -p 8080:8080 mml-map:prod
  # Open http://localhost:8080/mml-map/

  # Option B: serve at root "/" by building with base "/"
  docker build -t mml-map:prod --build-arg NODE_ENV=development .
  docker run --rm -e NODE_ENV=production -p 8080:8080 mml-map:prod
  # Open http://localhost:8080
  ```
- GitHub Pages deploy: on push to main, GitHub Actions builds and publishes ./dist (see .github/workflows/deploy.yml)
- Linting: none configured in this repo
- Tests: none configured in this repo

Important project specifics
- Vite base path: vite.config.js sets base to "/mml-map/" when NODE_ENV=production and "/" otherwise. Ensure your static server path matches the built base or use the build-arg approach above.
- API keys/tokens in repo: Google Places API key is referenced in index.html; Mapbox access token and MML API key are in src/config/constants.js. Update these values for your environment as needed.
- OSM GeoJSON overlays: place files in public/osm/; a manifest is generated on dev/build to populate the UI and load layers.

High-level architecture
- Entry and bootstrapping
  - index.html provides containers for a single map and a split view, includes a search input, and loads /src/main.js.
  - src/main.js orchestrates startup: reads URL params, loads WMTS capabilities, creates the base map, wires split-screen toggle, overlay selectors, drawing/measure tools, Google Places search, overlay info click handlers, OSM UI (popup/legend), and permalink syncing.
- Configuration and data sources
  - src/config/constants.js centralizes external endpoints and layer definitions:
    - WMTS from Maanmittauslaitos (MML) with api-key appended per tile.
    - WMS (Digiroad) for overlays and its GetCapabilities endpoint.
    - Hardcoded base layers: WMTS, OSM, Mapbox vector styles (via ol-mapbox-style), Esri World Imagery, Carto Dark.
  - scripts/generate-osm-manifest.mjs scans public/osm/*.geojson and writes manifest.json used to populate the “OSM Data” selector.
- Global app state
  - src/state/store.js holds a single mutable state object used across modules (maps, drawing features, overlay selections, OSM items/colors, split view, listeners, etc.).
- Base maps and split view
  - src/map/init.js: fetches and parses WMTS capabilities; createBaseMap sets up the initial map; createSplitMaps instantiates left/right maps; parseInitialFromParams seeds initial center/zoom/layers/split from URL.
  - src/map/layers.js: createTileLayerFromList resolves a layer by id and returns the correct OpenLayers layer (WMTS with api-key, OSM, Mapbox vector style via applyStyle, Esri XYZ, Carto XYZ).
  - src/map/sync.js: unidirectional view syncing to keep split maps aligned.
  - src/ui/layerSelector.js: minimal DOM dropdown to switch base layer per map.
- Overlays (WMS + OSM GeoJSON)
  - src/overlays/fetchCapabilities.js: loads Digiroad WMS GetCapabilities to populate selectable overlays; also loads OSM manifest if present.
  - src/map/overlays.js: rebuilds overlays on selection changes; creates WMS Tile layers and OSM Vector layers for main/left/right maps; assigns stable colors per OSM dataset and updates z-indexing.
  - src/ui/overlayDropdown.js: stacked absolute-positioned dropdowns (Digiroad, generic WMS, and OSM Data) with summary labels; updates state, overlays, URL, and OSM legend.
  - src/map/overlayInfoClick.js + src/ui/overlayInfo.js: on map single-click, issues WMS GetFeatureInfo to selected layers and shows aggregated HTML in a styled popup.
  - src/ui/osmPopup.js + src/map/osmInteractions.js + src/ui/osmLegend.js: OSM feature hover/click popups and legend rendering with assigned colors.
- Drawing, measurement, and markers
  - src/draw/tools.js wires Draw interactions for: marker placement, 2-point line, polygon, and freehand measurement line; disables overlay info clicks while drawing; re-enables afterward.
  - src/draw/helpers.js creates vector layers/overlays and formats measurement lengths; src/draw/showables.js reflects state into visible features across main/split maps and handles copying/clearing; src/draw/markers.js shows click/search markers and keeps URL permalink in sync.
- Permalink and URL state
  - src/map/permalink.js serializes center/zoom/base layer, split layers, selected overlays, OSM selections, and drawn features into query params; updates on moveend and feature changes. init.js reads these back at startup.
- Search
  - src/search/googlePlaces.js wires Google Places Autocomplete; on selection, recenters maps and drops a search marker.

Repository notes for Warp
- Build toolchain: Vite; dependencies include ol and ol-mapbox-style; no TypeScript or testing stack present.
- CI/CD: GitHub Actions builds on push to main and publishes dist to GitHub Pages.
- Public assets: public/osm/ contains example GeoJSON datasets; dist/ is generated at build time.

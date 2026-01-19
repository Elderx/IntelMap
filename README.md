# IntelMap
<img width="276" height="266" alt="screenshot-2026-01-19_02-42-56" src="https://github.com/user-attachments/assets/54514eff-bbca-4e3c-9c64-5480094c8e2f" />



A modern, modular OpenLayers application for viewing different WMTS/WMS tile/vector based maps. Supports split-screen view, drawing tools, and dynamic data overlays.

## Features
- **Dual View**: Independent layer and time selection for split-screen comparisons.
- **Search**: Integrated **Nominatim** search for finding places and addresses globally.
- **Persistence**: User features (markers, polygons) are stored in a **PostGIS**-enabled database.
- **Performance**: High-speed **Nginx tile caching** proxy reduces latency and handles CORS for various tile providers.
- **Tools**: Interactive drawing (marker/line/polygon) and measurement support.
- **OSM Data**: Dynamic GeoJSON overlays from OpenStreetMap.

## Getting Started (Docker Compose)

The simplest way to run the entire stack (Database, Backend, Cache Proxy, and Frontend) is using Docker Compose.

### 1. Installation
Ensure you have Docker and Docker Compose installed.

```bash
docker compose build
```

### 2. Run the App
Start all services in the background:

```bash
docker compose up -d
```

Access the application at: **[http://localhost:8080](http://localhost:8080)**

To view logs:
```bash
docker compose logs -f
```

### 3. Run Tests
The project uses Playwright for end-to-end testing.

**Run tests locally:**
```bash
npm install
npm run test:e2e
```

**Run tests in Docker:**
```bash
docker compose exec web npm run test:e2e
```


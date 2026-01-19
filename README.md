# MML Map (OpenLayers WMTS/WMS)

A modern, modular OpenLayers application for viewing Finnish Maanmittauslaitos (MML) and NASA GIBS maps. Supports split-screen view, drawing tools, and dynamic data overlays.

## Features
- **Dual View**: Independent layer and time selection for split-screen comparisons.
- **NASA GIBS**: Historical and near-real-time satellite imagery with data availability checks.
- **Drawing Tools**: Marker, line, polygon, and measurement support.
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


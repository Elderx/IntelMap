# Server for mml-map

This service exposes a simple REST API backed by Postgres + PostGIS.

Endpoints
- GET /api/health
- GET /api/markers → GeoJSON FeatureCollection
- POST /api/markers { lon, lat, title?, description?, color? }
- GET /api/polygons → GeoJSON FeatureCollection
- POST /api/polygons { coordinates: [[lon,lat], ...], title?, description?, color? }

Environment
- DATABASE_URL (e.g., postgres://postgres:postgres@db:5432/mmlmap)
- PORT (default 3000)

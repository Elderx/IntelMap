# IntelMap

<div align="center">

![IntelMap](https://github.com/Elderx/IntelMap/raw/main/docs/images/intelmap-banner.png)

**A modern, full-stack mapping application with OpenLayers, PostgreSQL/PostGIS, and GitOps-based staging deployments.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://img.shields.io/badge/License-MIT-blue.svg)
[![Node](https://img.shields.io/badge/node-%3E%3C%20logo.svg)](https://img.shields.io/badge/node-%3E%3C%20logo.svg)

</div>

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Local Development](#local-development)
- [Production Deployment](#production-deployment)
- [Staging Environment](#staging-environment)
- [Configuration](#configuration)
- [Testing](#testing)
- [Contributing](#contributing)
- [License](#license)

## Overview

IntelMap is an advanced web-based mapping application built with:
- **OpenLayers** for interactive maps
- **Express.js** backend with Passport.js authentication
- **PostgreSQL/PostGIS** for spatial data storage
- **Docker Compose** for containerized deployment
- **GitHub Actions** for automated staging deployments
- **Caddy** as a reverse proxy for multi-domain routing

## Features

### Core Mapping
- **Dual View Mode**: Independent layer and time selection for split-screen map comparisons
- **Multiple Base Layers**: WMTS (Maanmittauslaitos), OSM, Mapbox, Esri, CartoDB, and more
- **Vector Tiles**: Mapbox GL styles for modern, performant rendering
- **WMS Overlays**: Digiroad, FMI Weather Radar, OpenSeaMap, and more

### Data & Overlays
- **AIS Vessel Tracking**: Real-time ship positions from AISStream WebSocket
- **Aircraft Traffic**: OpenSky Network API integration
- **OSM Dynamic Features**: Overpass API integration for custom GeoJSON overlays
- **Weather Data**: Historical FMI radar playback with time slider
- **GPX Import**: Upload and visualize GPX tracks

### User Features
- **Drawing Tools**: Markers, Lines, Polygons, Circles (with radius measurement)
- **Measurement Tools**: Distance and area calculations
- **User Authentication**: Login with username/password, persistent sessions
- **Feature Sharing**: Share your drawings with other users
- **Persistent Storage**: All features saved to PostgreSQL database

### Performance
- **Tile Caching**: Nginx-based caching proxy reduces latency
- **CORS Handling**: Properly configured for all tile providers
- **Optimized Assets**: Built with Vite for fast load times

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Cloudflare │     │   EC2 (AWS)   │     │  GitHub (Git)   │
│   (CDN/SSL)  │────→│  Ubuntu       │     │                 │
└─────────────┘     └──────┬───────┘     └────────┬─────────┘
                           │                     │
                    ┌────▼─────────────────────▼────┐
                    │  Host Caddy (port 80)          │
                    │  Routes by domain name          │
                    └────┬─────────────────────────────┘
                         │
           ┌─────────────┴──────────────┐
           │                              │
    ┌──────▼──────┐              ┌─────▼──────────┐
    │ Production │              │    Staging     │
    │ Containers │              │    Containers  │
    ├─────────────┤              ├────────────────┤
    │ intelmap-web:8080         │ intelmap-staging-web:8081
    │ intelmap-server:3000       │ intelmap-staging-server:3001
    │ intelmap-cache:8888       │ intelmap-staging-cache:8889
    │ intelmap-db:5432          │ intelmap-staging-db
    └─────────────┘              └────────────────┘
```

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Node.js 20+ (for local development)

### Clone the Repository

```bash
git clone https://github.com/Elderx/IntelMap.git
cd IntelMap
```

### Run with Docker Compose

```bash
# Build and start all services
docker compose up -d
```

The application will be available at **http://localhost:8080**

**Default credentials:**
- Username: `admin`
- Password: `admin`

## Local Development

### Development Server

```bash
# Install dependencies
npm install

# Start Vite dev server (with hot reload)
npm run dev
```

Access at **http://localhost:5173**

### Run Tests

```bash
# Install test dependencies
npm install

# Run end-to-end tests
npm run test:e2e
```

### Build for Production

```bash
npm run build
```

## Production Deployment

IntelMap is deployed on AWS with automatic staging deployments.

### Access URLs

- **Production:** https://intelmap.elderx.fi
- **Staging:** https://staging-intelmap.elderx.fi

### Deployment Workflow

**Production Deployment** (manual, on `main` branch):
```bash
cd /home/ubuntu/IntelMap
git pull origin main
sudo docker compose up -d --force-recreate
```

**Staging Deployment** (automatic, on `dev` branch):
1. Push to `dev` branch
2. GitHub Actions automatically deploys to staging
3. CI/CD runs: `./deploy-all.sh`

### Infrastructure

- **Platform:** AWS EC2 (Ubuntu)
- **CDN/SSL:** Cloudflare
- **Reverse Proxy:** Caddy (routes by domain)
- **Database:** PostgreSQL 16 with PostGIS extension
- **Container Orchestration:** Docker Compose

## Staging Environment

### GitOps Workflow

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Developer │     │   GitHub     │     │   AWS EC2       │
│             │────▶│   Action     │────▶│   (Staging)      │
│  Push to dev │     │  Trigger     │     │                 │
└─────────────┘     └──────────────┘     └─────────────────┘
                           │
                    ┌────▼─────────────────────▼────┐
                    │  deploy-all.sh              │
                    │  - Pulls code               │
                    │  - Starts staging            │
                    │  - Updates Caddy             │
                    └──────────────────────────────┘
```

### Staging Configuration

- **Database:** `mmlmap_staging` (separate from production)
- **Users:** `admin:r3zqpj2psdp98fuwf` (configurable)
- **Standalone Compose File:** `docker-compose.staging-standalone.yml`
- **Project Name:** `intelmap-staging`

### Automatic Deployments

Every push to the `dev` branch triggers:
1. GitHub Actions workflow
2. SSH to EC2 instance
3. Execute `deploy-all.sh`
4. Deploy staging with zero-downtime

## Configuration

### Environment Variables

#### Server Environment
- `DATABASE_URL`: PostgreSQL connection string
- `PORT`: Server port (default: 3000)
- `SESSION_SECRET`: Session encryption secret
- `USERS`: User credentials (format: `"user1:pass1,user2:pass2"`)
- `ADMIN_PASSWORD`: Legacy (deprecated, use `USERS` instead)

#### Build-time Variables
- `VITE_TILE_CACHE_URL`: Tile cache proxy URL (empty for production)

### Docker Compose Ports

| Service | Production Port | Staging Port |
|---------|-----------------|---------------|
| Web | 8080 | 8081 |
| Server | 3000 | 3001 |
| Cache Proxy | 8888 | 8889 |
| Database | 5432 | (internal) |

### User Management

Users are managed via environment variables in `docker-compose.yml`:

```yaml
environment:
  USERS: "admin:securePassword,user2:anotherPass,viewer:readOnly"
```

**Important:** The `USERS` environment variable:
- **Creates users** if they don't exist
- **Updates passwords** if changed
- **Deploys with `docker compose up`**

## Testing

### Prerequisites

```bash
npm install
npx playwright install --with-deps
```

### Run Tests

```bash
# Run all E2E tests
npm run test:e2e

# Generate coverage report
npm run coverage
```

### Test Files

Located in `tests/e2e/`:
- `map.spec.js` - Core map functionality
- `crud.spec.js` - Feature CRUD operations
- `features.spec.js` - Dynamic overlays
- `aircraft.spec.js` - Aircraft tracking
- `ais.spec.js` - Ship tracking
- `gpx.spec.js` - GPX import
- `weather.spec.js` - Weather radar

## Project Structure

```
IntelMap/
├── src/                    # Frontend source code
│   ├── config/             # Configuration constants
│   ├── map/                # Map initialization & layers
│   ├── draw/               # Drawing tools
│   ├── user/                # User features (markers, polygons)
│   ├── ui/                  # UI components (login, forms)
│   ├── api/                 # API client functions
│   └── state/               # Application state
├── server/                 # Backend Express.js server
│   └── routes/             # API endpoints & AIS data
├── cache-proxy/            # Nginx tile caching proxy
├── docs/                   # Documentation
├── tests/                  # E2E Playwright tests
├── docker-compose.yml      # Production compose file
├── docker-compose.staging-standalone.yml  # Staging compose file
└── deploy-all.sh          # Deployment automation script
```

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Troubleshooting

### Port Already in Use

If you see `port is already allocated` errors:
```bash
# Check what's using the port
sudo lsof -i :80
sudo lsof -i :8080
sudo lsof -i :8081

# Stop conflicting services
sudo systemctl stop caddy
sudo docker compose down
```

### Database Connection Issues

```bash
# Check database health
sudo docker compose exec db psql -U postgres -c "SELECT 1"
```

### View Logs

```bash
# Production logs
sudo docker compose logs -f

# Staging logs
sudo docker compose -f docker-compose.staging-standalone.yml -p intelmap-staging logs -f

# Host Caddy logs
sudo journalctl -u caddy -f
```

### Reset Application State

```bash
# Stop all containers
sudo docker compose down
sudo docker compose -f docker-compose.staging-standalone.yml -p intelmap-staging down

# Remove all volumes (WARNING: deletes data!)
sudo docker compose down -v
```

### Update Application

```bash
# Update to latest code
git pull origin main

# Rebuild and restart
sudo docker compose up -d --build
```

## Development Workflow

### Recommended Workflow

1. **Make changes** in your local development environment
2. **Test locally** with `npm run test:e2e`
3. **Commit changes** to a feature branch
4. **Push to GitHub** and create Pull Request
5. **Merge to `main`** for production deployment

### Feature Development

For complex features involving multiple steps or refactoring:
1. Use the `brainstorming` skill for planning
2. Create detailed implementation plan
3. Implement with test-driven development
4. Get code review before merging

## Documentation

Additional documentation is available in the `docs/` folder:
- `DEPLOYMENT.md` - Complete deployment guide
- `ARCHITECTURE.md` - Detailed system architecture
- `docs/plans/` - Feature design documents

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- **OpenLayers** - Interactive mapping library
- **OpenStreetMap** - Map data and contributors
- **Finnish Meteorological Institute** - Weather data
- **Maanmittauslaitos** - Finnish Land Survey map tiles
- **Cloudflare** - CDN and DNS services
- **Vite** - Next-generation frontend tooling

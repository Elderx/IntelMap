# Staging GitOps Deployment Design

## Overview

Automated staging deployment using GitHub Actions to deploy to `staging-intelmap.elderx.fi` on push to the `dev` branch. Staging runs alongside production on the same EC2 instance with isolated Docker containers, database, and volumes.

## Architecture

### Environment Isolation

**Production (main branch):**
- Domain: `intelmap.elderx.fi`
- Port: 80
- Project name: `intelmap` (default)
- Database: `mmlmap`
- Containers: `intelmap-web-1`, `intelmap-server-1`, `intelmap-db-1`, `intelmap-cache-proxy-1`
- Volumes: `intelmap_db-data`, `intelmap_tile-cache`

**Staging (dev branch):**
- Domain: `staging-intelmap.elderx.fi`
- Port: 8081
- Project name: `intelmap-staging`
- Database: `mmlmap_staging`
- Containers: `intelmap-staging-web-1`, `intelmap-staging-server-1`, `intelmap-staging-db-1`, `intelmap-staging-cache-proxy-1`
- Volumes: `intelmap-staging_db-staging-data`, `intelmap-staging_tile-cache-staging`

### Deployment Flow

```
Push to dev branch
  ↓
GitHub Actions triggered
  ↓
SSH to EC2 (56.228.43.157)
  ↓
git checkout dev, git pull
  ↓
docker compose -f docker-compose.yml -f docker-compose.staging.yml -p intelmap-staging up --build -d
  ↓
Create mmlmap_staging database if needed
  ↓
Staging live at staging-intelmap.elderx.fi
```

## Components

### 1. GitHub Actions Workflow

**File:** `.github/workflows/deploy-staging.yml`

- **Trigger:** Push to `dev` branch, manual workflow dispatch
- **Action:** `appleboy/ssh-action@v1.0.0`
- **Required Secrets:** `SSH_PRIVATE_KEY`, `SSH_HOST`, `SSH_USER`, `SSH_PORT`

**Deployment Script:**
```bash
cd /home/ubuntu/IntelMap
git fetch origin
git checkout dev
git pull origin dev
sudo docker compose -f docker-compose.yml -f docker-compose.staging.yml -p intelmap-staging up --build -d
sudo docker compose -f docker-compose.yml -f docker-compose.staging.yml -p intelmap-staging exec -T db psql -U postgres -c "SELECT 'CREATE DATABASE mmlmap_staging' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'mmlmap_staging')\\gexec"
```

### 2. Staging Docker Compose Override

**File:** `docker-compose.staging.yml`

**Key differences from production:**
- Project name: `intelmap-staging`
- Port: 8081 (instead of 80)
- Database: `mmlmap_staging`
- Separate volumes: `db-staging-data`, `tile-cache-staging`
- Users: `admin:r3zqpj2psdp98fuwf`
- Environment: `staging`

### 3. Caddy Multi-Domain Routing

**Updated:** `Caddyfile`

**Production rules:** `intelmap.elderx.fi:80`
- Proxy `/tiles/*`, `/wms/*`, `/osm-api/*` to `cache-proxy:8888`
- Proxy `/api/*` to `server:3000`
- Serve static files from `/srv`

**Staging rules:** `staging-intelmap.elderx.fi:80`
- Proxy `/tiles/*`, `/wms/*`, `/osm-api/*` to `intelmap-staging-cache-proxy-1:8888`
- Proxy `/api/*` to `intelmap-staging-server-1:3000`
- Serve static files from `/srv`

## DNS Configuration

### Cloudflare DNS Records

| Type | Name | Content | Proxy Status |
|------|------|---------|--------------|
| A | `intelmap.elderx.fi` | `56.228.43.157` | 🟠 Proxied |
| A | `staging-intelmap` | `56.228.43.157` | 🟠 Proxied |

Both domains proxied through Cloudflare (HTTPS), forwarding to EC2 over HTTP (port 80). Caddy routes based on `Host` header.

## Implementation Steps

1. Create `dev` branch: `git checkout -b dev && git push -u origin dev`
2. Create `.github/workflows/deploy-staging.yml`
3. Create `docker-compose.staging.yml`
4. Update `Caddyfile` with staging subdomain routing
5. Commit and push to `dev` branch
6. Update production Caddy on EC2: `git pull origin main && sudo docker compose up --build -d`

## Testing Checklist

- [ ] Push to `dev` branch triggers workflow
- [ ] GitHub Actions shows green checkmark
- [ ] `staging-intelmap.elderx.fi` loads correctly
- [ ] Login works with `admin:r3zqpj2psdp98fuwf`
- [ ] `intelmap.elderx.fi` (production) still works
- [ ] Staging and production use different databases (verify with test data)

## Future Enhancements

- Add production deployment workflow for `main` branch
- Add health checks before switching traffic
- Add rollback mechanism
- Add database migration support
- Add blue-green deployment support

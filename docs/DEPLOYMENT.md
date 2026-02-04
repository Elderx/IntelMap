# IntelMap Deployment Guide

## Architecture Overview

**Production (main branch):**
- Domain: `https://intelmap.elderx.fi`
- Host Caddy on port 80 (routes all traffic)
- Production containers (project: `intelmap`):
  - web: port 8080
  - server: port 3000
  - cache-proxy: port 8888
  - db: port 5432

**Staging (dev branch):**
- Domain: `https://staging-intelmap.elderx.fi`
- Host Caddy routes to staging containers
- Staging containers (project: `intelmap-staging`):
  - web: port 8081
  - server: port 3001
  - cache-proxy: port 8889
  - db: port 5432 (internal only, separate database)

## Port Summary

| Service | Production | Staging |
|---------|-----------|---------|
| Web (via Caddy) | 80 → 8080 | 80 → 8081 |
| Server API | 3000 | 3001 |
| Cache Proxy | 8888 | 8889 |
| Database | 5432 | (internal) |

## Initial Setup on EC2

### 1. Install Host Caddy

```bash
# Add Caddy repository
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list

# Install Caddy
sudo apt update
sudo apt install caddy
```

### 2. Initial Deployment

Run the deployment script:

```bash
cd /home/ubuntu/IntelMap
chmod +x deploy-all.sh
./deploy-all.sh
```

This script will:
1. Stop all containers
2. Pull latest code
3. Deploy production and staging
4. Update host Caddy configuration

## Ongoing Maintenance

### Deploy Production Changes

When you push to `main` branch:

```bash
cd /home/ubuntu/IntelMap
git pull origin main
sudo docker compose up -d --force-recreate
sudo systemctl reload caddy
```

### Deploy Staging Changes

Staging deploys automatically when you push to `dev` branch via GitHub Actions.

Or manually:

```bash
cd /home/ubuntu/IntelMap
git checkout dev
git pull origin dev
sudo docker compose -f docker-compose.yml -f docker-compose.staging.yml -p intelmap-staging up -d --force-recreate
```

### Redeploy Everything

If you need to redeploy both environments from scratch:

```bash
cd /home/ubuntu/IntelMap
./deploy-all.sh
```

## Troubleshooting

### Check Container Status

```bash
# Production
sudo docker compose ps

# Staging
sudo docker compose -f docker-compose.yml -f docker-compose.staging.yml -p intelmap-staging ps
```

### View Logs

```bash
# Production
sudo docker compose logs -f

# Staging
sudo docker compose -f docker-compose.yml -f docker-compose.staging.yml -p intelmap-staging logs -f

# Host Caddy
sudo journalctl -u caddy -f
```

### Restart Services

```bash
# Restart production only
sudo docker compose restart

# Restart staging only
sudo docker compose -f docker-compose.yml -f docker-compose.staging.yml -p intelmap-staging restart

# Restart host Caddy
sudo systemctl restart caddy
```

## Access URLs

- **Production:** https://intelmap.elderx.fi
- **Staging:** https://staging-intelmap.elderx.fi

## Database Access

```bash
# Production database
sudo docker compose exec db psql -U postgres mmlmap

# Staging database
sudo docker compose -f docker-compose.yml -f docker-compose.staging.yml -p intelmap-staging exec db psql -U postgres mmlmap_staging
```

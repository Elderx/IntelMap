#!/bin/bash
# Complete deployment script for IntelMap production and staging
# This script handles the full deployment process including:
# - Stopping all containers
# - Pulling latest code
# - Deploying production and staging
# - Updating host Caddy

set -e

echo "=== IntelMap Deployment Script ==="
echo ""

cd /home/ubuntu/IntelMap

# Step 1: Stop all containers
echo "Step 1: Stopping all containers..."
sudo docker compose -f docker-compose.staging-standalone.yml -p intelmap-staging down 2>/dev/null || true
sudo docker compose down
echo "✓ All containers stopped"
echo ""

# Step 2: Pull latest code
echo "Step 2: Pulling latest code..."
git fetch origin
git checkout main
git pull origin main
echo "✓ Code updated"
echo ""

# Step 3: Start production
echo "Step 3: Starting production environment..."
sudo docker compose up -d
echo "✓ Production started"
echo ""

# Step 4: Wait for production to be healthy
echo "Step 4: Waiting for production to be healthy..."
sleep 5
sudo docker compose ps
echo "✓ Production status check complete"
echo ""

# Step 5: Start staging
echo "Step 5: Starting staging environment..."
git checkout dev
git pull origin dev
sudo docker compose -f docker-compose.staging-standalone.yml -p intelmap-staging up -d --force-recreate
echo "✓ Staging started"
echo ""

# Step 6: Update host Caddy
echo "Step 6: Updating host Caddy configuration..."
git checkout main
sudo cp /home/ubuntu/IntelMap/Caddyfile /etc/caddy/Caddyfile
sudo systemctl restart caddy
echo "✓ Host Caddy updated and restarted"
echo ""

# Step 7: Show final status
echo "Step 7: Final status..."
echo ""
echo "=== Production Containers ==="
sudo docker compose ps
echo ""
echo "=== Staging Containers ==="
sudo docker compose -f docker-compose.staging-standalone.yml -p intelmap-staging ps
echo ""
echo "=== Host Caddy Status ==="
sudo systemctl status caddy --no-pager -l
echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Production: https://intelmap.elderx.fi"
echo "Staging:    https://staging-intelmap.elderx.fi"

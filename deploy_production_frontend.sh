#!/bin/bash
# Deploy frontend in production mode for testing
# This script rebuilds and restarts only the frontend service in production mode

set -e

echo "=================================================="
echo "Deploying Frontend in Production Mode"
echo "=================================================="

# Change to the project directory
cd "$(dirname "$0")"

echo ""
echo "Step 1: Stopping current frontend container..."
docker compose stop frontend

echo ""
echo "Step 2: Removing old frontend container and image..."
docker compose rm -f frontend
docker rmi impact-database-frontend:latest 2>/dev/null || true

echo ""
echo "Step 3: Building production frontend image..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml build --no-cache frontend

echo ""
echo "Step 4: Starting frontend in production mode..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d frontend

echo ""
echo "Step 5: Waiting for frontend to be ready..."
sleep 10

echo ""
echo "Step 6: Checking frontend health..."
docker compose ps frontend
docker compose logs frontend --tail 20

echo ""
echo "=================================================="
echo "Production Frontend Deployment Complete!"
echo "=================================================="
echo ""
echo "Access the application at:"
echo "  https://opmthredds.gem.spc.int/impact-database/"
echo ""
echo "To view logs:"
echo "  docker compose logs -f frontend"
echo ""
echo "To rollback to development:"
echo "  docker compose -f docker-compose.yml up -d frontend"
echo ""

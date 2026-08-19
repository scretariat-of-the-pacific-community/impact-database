#!/bin/bash
# Docker Compose startup script with database initialization
# This ensures the database is properly set up before starting services

set -e

echo "=========================================="
echo "DOCKER COMPOSE STARTUP"
echo "=========================================="
echo ""

# Start only the database first
echo "[1/3] Starting database service..."
docker-compose up -d postgis_db

# Wait for database to be ready
echo "[2/3] Waiting for database to initialize..."
sleep 5

# Run database setup
echo "[3/3] Running database setup and migrations..."
docker-compose exec -T postgis_db bash -c "
    # Install Python and required packages if not present
    if ! command -v python3 &> /dev/null; then
        apt-get update -qq && apt-get install -y -qq python3 python3-psycopg2 > /dev/null 2>&1
    fi
    
    # Run initialization from mounted scripts
    if [ -f /data/impact-database/scripts/init_database.py ]; then
        python3 /data/impact-database/scripts/init_database.py
    else
        echo 'Init script not found in container'
    fi
"

# Run migrations from the API container
echo ""
echo "Running Alembic migrations..."
docker-compose run --rm api bash -c "cd /app && alembic upgrade head"

echo ""
echo "=========================================="
echo "✓ DATABASE INITIALIZATION COMPLETE"
echo "=========================================="
echo ""

# Start all services
echo "Starting all services..."
docker-compose up -d

echo ""
echo "All services are starting..."
echo "- Frontend: http://localhost:3000"
echo "- Backend API: http://localhost:8000"
echo "- MinIO Console: http://localhost:9001"
echo ""
echo "Check logs with: docker-compose logs -f"

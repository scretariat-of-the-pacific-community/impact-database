#!/bin/bash
# Database container entrypoint
# Runs initialization before starting PostgreSQL

set -e

echo "=========================================="
echo "PostgreSQL Container Initialization"
echo "=========================================="

# Start PostgreSQL in the background for initialization
echo "Starting PostgreSQL..."
docker-entrypoint.sh postgres &
PG_PID=$!

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
until pg_isready -U "${POSTGRES_USER:-postgres}" > /dev/null 2>&1; do
    sleep 1
done

echo "PostgreSQL is ready!"

# Run Python initialization if script exists
if [ -f /scripts/init_database.py ]; then
    echo "Running database initialization..."
    python3 /scripts/init_database.py || echo "Initialization script failed (may be normal on first run)"
fi

# Wait for PostgreSQL to finish (keeps container running)
wait $PG_PID

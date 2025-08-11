#!/bin/bash

echo "Stopping Impact Database Docker services..."
echo "==========================================="

# Change to the project directory
cd "$(dirname "$0")"

# Stop all services
docker compose down

echo "All services stopped successfully!"
echo ""
echo "To start services again, run: ./docker-start.sh"

#!/bin/bash

echo "Starting Impact Database Docker services..."
echo "==========================================="

# Change to the project directory
cd "$(dirname "$0")"

# Check if development flag is set
if [ "$1" = "--dev" ] || [ "$1" = "-d" ]; then
    echo "🚀 Starting in DEVELOPMENT mode with optimized settings..."
    # Build and start all services with development overrides
    docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d
elif [ "$1" = "--prod" ] || [ "$1" = "-p" ]; then
    echo "🚀 Starting in PRODUCTION mode..."
    # Build and start all services with production overrides
    docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
else
    echo "🚀 Starting in STANDARD mode..."
    # Build and start all services
    docker compose up --build -d
fi

# Wait for services to be healthy
echo "Waiting for services to start..."
sleep 10

# Check service status
echo ""
echo "Service Status:"
echo "==============="
docker compose ps

echo ""
echo "Services are available at:"
echo "=========================="
echo "🌐 Frontend:           http://localhost:3000"
echo "⚡ Backend API:        http://localhost:8000"
echo "📊 API Documentation: http://localhost:8000/docs"
echo "🌸 Flower (Celery):   http://localhost:5555"
echo "🗄️  MinIO Console:     http://localhost:9001"
echo "🐘 PostgreSQL:        localhost:5432"
echo "🔴 Redis:             localhost:6379"

echo ""
echo "Health Checks:"
echo "=============="
echo -n "Backend API: "
if curl -s -f http://localhost:8000/health > /dev/null; then
    echo "✅ Healthy"
else
    echo "❌ Not responding"
fi

echo -n "Frontend: "
if curl -s -I http://localhost:3000 | grep -q "200\|301\|302"; then
    echo "✅ Healthy"
else
    echo "❌ Not responding"
fi

echo ""
if [ "$1" = "--dev" ] || [ "$1" = "-d" ]; then
    echo "💡 Development mode active:"
    echo "   - PWA disabled for faster development"
    echo "   - Hot reloading enabled"
    echo "   - Debug mode enabled"
    echo "   - Analytics disabled"
    echo ""
elif [ "$1" = "--prod" ] || [ "$1" = "-p" ]; then
    echo "🏭 Production mode active:"
    echo "   - PWA enabled for offline support"
    echo "   - Optimized build"
    echo "   - Analytics enabled"
    echo "   - Debug mode disabled"
    echo ""
fi
echo "To stop all services, run: ./docker-stop.sh"
echo "To view logs, run: docker compose logs [service-name]"
echo ""
echo "Available modes:"
echo "  --dev/-d    : Development mode (hot reload, debug enabled)"
echo "  --prod/-p   : Production mode (optimized build)"
echo "  (no flags)  : Standard mode"

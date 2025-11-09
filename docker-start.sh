#!/bin/bash

set -euo pipefail

usage() {
    cat <<'EOF'
Usage: ./docker-start.sh [--dev|--prod]

  --dev,  -d   Start the stack with docker-compose.dev.yml overrides (dev ports 3001/8001/5433/6380).
  --prod, -p   Start the stack with docker-compose.prod.yml overrides (prod ports 3000/8000/5432/6379).
EOF
}

if [ $# -eq 0 ]; then
    echo "❌ No mode supplied."
    usage
    exit 1
fi

MODE=$1
COMPOSE_FILES="-f docker-compose.yml"
FRONTEND_PORT=""
BACKEND_PORT=""
POSTGRES_PORT=""
REDIS_PORT=""

case "$MODE" in
    --dev|-d)
        echo "🚀 Starting Impact Database in DEVELOPMENT mode..."
        COMPOSE_FILES="$COMPOSE_FILES -f docker-compose.dev.yml"
        FRONTEND_PORT=3001
        BACKEND_PORT=8001
        POSTGRES_PORT=5433
        REDIS_PORT=6380
        ;;
    --prod|-p)
        echo "🚀 Starting Impact Database in PRODUCTION mode..."
        COMPOSE_FILES="$COMPOSE_FILES -f docker-compose.prod.yml"
        FRONTEND_PORT=3000
        BACKEND_PORT=8000
        POSTGRES_PORT=5432
        REDIS_PORT=6379
        ;;
    *)
        echo "❌ Unknown option: $MODE"
        usage
        exit 1
        ;;
esac

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

docker compose $COMPOSE_FILES up -d

echo "Waiting for services to start..."
sleep 10

echo ""
echo "Service Status:"
echo "==============="
docker compose ps

echo ""
echo "Services are available at:"
echo "=========================="
echo "🌐 Frontend:           http://localhost:${FRONTEND_PORT}"
echo "⚡ Backend API:        http://localhost:${BACKEND_PORT}"
echo "📊 API Documentation: http://localhost:${BACKEND_PORT}/docs"
echo "🌸 Flower (Celery):   http://localhost:5555"
echo "🗄️  MinIO Console:     http://localhost:9001"
echo "🐘 PostgreSQL:        localhost:${POSTGRES_PORT}"
echo "🔴 Redis:             localhost:${REDIS_PORT}"

echo ""
echo "Health Checks:"
echo "=============="
echo -n "Backend API (${BACKEND_PORT}): "
if curl -s -f "http://localhost:${BACKEND_PORT}/health" > /dev/null 2>&1; then
    echo "✅ Healthy"
else
    echo "❌ Not responding (may still be starting...)"
fi

echo -n "Frontend (${FRONTEND_PORT}): "
if curl -s -I "http://localhost:${FRONTEND_PORT}" | grep -q "200\|301\|302"; then
    echo "✅ Healthy"
else
    echo "❌ Not responding"
fi

echo ""
if [ "$MODE" = "--dev" ] || [ "$MODE" = "-d" ]; then
    echo "💡 Development mode hints:"
    echo "   - Frontend hot reload (npm run dev:host)"
    echo "   - Backend auto-reload via Uvicorn"
elif [ "$MODE" = "--prod" ] || [ "$MODE" = "-p" ]; then
    echo "🏭 Production mode hints:"
    echo "   - Canonical service ports"
    echo "   - Ready for optimized builds (future step)"
fi
echo ""
echo "To stop all services, run: ./docker-stop.sh"
echo "To view logs, run: docker compose logs [service-name]"

#!/bin/bash
# Production deployment health check script

set -e

echo "🔍 Running health checks..."

# Check if services are running
if ! docker compose -f docker-compose.yml -f docker-compose.prod.yml ps | grep -q "Up"; then
    echo "❌ Services are not running"
    exit 1
fi

# Check API health
echo "Checking API health..."
if ! curl -f -s http://localhost:8000/health > /dev/null; then
    echo "❌ API health check failed"
    exit 1
fi
echo "✅ API is healthy"

# Check Frontend
echo "Checking Frontend..."
if ! curl -f -s http://localhost:3000 > /dev/null; then
    echo "❌ Frontend health check failed"
    exit 1
fi
echo "✅ Frontend is healthy"

# Check PostgreSQL
echo "Checking PostgreSQL..."
if ! docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T postgis_db pg_isready -U postgres > /dev/null; then
    echo "❌ PostgreSQL health check failed"
    exit 1
fi
echo "✅ PostgreSQL is healthy"

# Check Redis
echo "Checking Redis..."
if ! docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T redis redis-cli ping > /dev/null; then
    echo "❌ Redis health check failed"
    exit 1
fi
echo "✅ Redis is healthy"

# Check MinIO
echo "Checking MinIO..."
if ! curl -f -s http://localhost:9020/minio/health/live > /dev/null; then
    echo "❌ MinIO health check failed"
    exit 1
fi
echo "✅ MinIO is healthy"

echo ""
echo "🎉 All health checks passed!"
echo ""
echo "Service URLs:"
echo "  Frontend: http://localhost:3000"
echo "  API: http://localhost:8000"
echo "  API Docs: http://localhost:8000/docs"
echo "  MinIO Console: http://localhost:9021"
echo "  Flower (Celery): http://localhost:5555"

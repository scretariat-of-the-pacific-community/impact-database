#!/bin/bash
echo "=== Testing Impact Database Application ==="

# Start services
echo "Starting services..."
docker compose up -d --build

# Wait for services
echo "Waiting for services to be ready..."
sleep 15

# Test 1: Check container status
echo "1. Checking container status..."
docker compose ps

# Test 2: Health check
echo "2. Testing health endpoint..."
health_response=$(curl -s http://localhost:8000/health 2>/dev/null)
if [[ $health_response == *"ok"* ]]; then
    echo "✓ Health check passed: $health_response"
else
    echo "✗ Health check failed: $health_response"
fi

# Test 3: Root endpoint
echo "3. Testing root endpoint..."
root_response=$(curl -s http://localhost:8000/ 2>/dev/null)
if [[ $root_response == *"Welcome"* ]]; then
    echo "✓ Root endpoint passed"
else
    echo "✗ Root endpoint failed: $root_response"
fi

# Test 4: Database connection
echo "4. Testing database connection..."
db_test=$(docker exec -it postgis_db psql -U impactuser -d impactdb -c "SELECT 1;" 2>/dev/null)
if [[ $? -eq 0 ]]; then
    echo "✓ Database connection successful"
else
    echo "✗ Database connection failed"
fi

# Test 5: Redis connection
echo "5. Testing Redis connection..."
redis_test=$(docker exec -it redis redis-cli ping 2>/dev/null)
if [[ $redis_test == *"PONG"* ]]; then
    echo "✓ Redis connection successful"
else
    echo "✗ Redis connection failed"
fi

# Test 6: MinIO health
echo "6. Testing MinIO health..."
minio_test=$(curl -s http://localhost:9000/minio/health/live 2>/dev/null)
if [[ $? -eq 0 ]]; then
    echo "✓ MinIO is accessible"
else
    echo "✗ MinIO is not accessible"
fi

echo "=== Test completed! ==="
echo "Open these URLs to verify manually:"
echo "- API Docs: http://localhost:8000/docs"
echo "- MinIO Console: http://localhost:9001 (admin/password123)"
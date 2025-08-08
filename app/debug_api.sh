#!/bin/bash
echo "=== API Debugging ==="

echo "1. Testing basic connectivity..."
health_response=$(curl -s -w "\nHTTP_CODE:%{http_code}\n" http://localhost:8000/health 2>/dev/null)
echo "Health response: '$health_response'"

echo
echo "2. Testing root endpoint..."
root_response=$(curl -s -w "\nHTTP_CODE:%{http_code}\n" http://localhost:8000/ 2>/dev/null)
echo "Root response: '$root_response'"

echo
echo "3. Checking container status..."
docker compose ps

echo
echo "4. Checking available endpoints..."
openapi_response=$(curl -s http://localhost:8000/openapi.json 2>/dev/null)
if [[ -n "$openapi_response" ]]; then
    echo "Available paths:"
    echo "$openapi_response" | grep -o '"\/[^"]*"' | sort | uniq
else
    echo "OpenAPI not available"
fi

echo
echo "5. Testing simple upload with verbose output..."
echo "Testing: curl -v -X POST \"http://localhost:8000/api/images/\""
response=$(curl -s -w "\nHTTP_CODE:%{http_code}\nTOTAL_TIME:%{time_total}\n" \
  -X POST "http://localhost:8000/api/images/" \
  -F "file=@hazard_test_images/flood_1.jpg" \
  -F "hazard_type=flood" \
  -F "location=Test" 2>&1)
echo "Upload response: '$response'"

echo
echo "6. Checking FastAPI logs..."
docker logs fastapi_app --tail 15

echo
echo "7. Testing different endpoint paths..."
# Try the old endpoint that was working
old_response=$(curl -s -w "\nHTTP_CODE:%{http_code}\n" \
  -X POST "http://localhost:8000/api/images/" \
  -F "file=@hazard_test_images/flood_1.jpg" \
  -F "hazard_type=flood" \
  -F "location=Test" 2>&1)
echo "Old endpoint response: '$old_response'"

echo
echo "=== Debug completed ==="
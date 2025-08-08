#!/bin/bash
echo "=== Testing Manual Coordinate Input ==="

# Test 1: Upload image with manual coordinates
echo "1. Testing upload with manual coordinates..."
response=$(curl -s -X POST "http://localhost:8000/api/images/" \
    -F "file=@../hazard_test_images/flood_1.jpg" \
    -F "hazard_type=flood" \
    -F "location=Houston, Texas, USA" \
    -F "latitude=29.7604" \
    -F "longitude=-95.3698" \
    -F "timestamp=2023-08-25 14:30:00")

echo "Response: $response"
echo

# Test 2: Upload image without coordinates (EXIF only)
echo "2. Testing upload without manual coordinates (EXIF extraction)..."
response=$(curl -s -X POST "http://localhost:8000/api/images/" \
    -F "file=@../hazard_test_images/drought_1.jpg" \
    -F "hazard_type=drought" \
    -F "location=California, USA")

echo "Response: $response"
echo

# Test 3: Test coordinate validation (invalid latitude)
echo "3. Testing coordinate validation (invalid latitude)..."
response=$(curl -s -X POST "http://localhost:8000/api/images/" \
    -F "file=@../hazard_test_images/tsunami_1.jpg" \
    -F "hazard_type=tsunami" \
    -F "location=Invalid Location" \
    -F "latitude=95.0" \
    -F "longitude=180.0")

echo "Response: $response"
echo

# Test 4: List images with coordinates
echo "4. Testing image listing with coordinate filter..."
echo "Images with coordinates:"
curl -s "http://localhost:8000/images/?has_coordinates=true" | head -n 20

echo
echo "Images without coordinates:"
curl -s "http://localhost:8000/images/?has_coordinates=false" | head -n 20

echo
echo "=== Database Check ==="
echo "Images with coordinates:"
docker exec -it postgis_db psql -U impactuser -d impactdb -c "SELECT filename, hazard_type, location, latitude, longitude FROM image_metadata WHERE latitude IS NOT NULL AND longitude IS NOT NULL;"

echo
echo "Images without coordinates:"
docker exec -it postgis_db psql -U impactuser -d impactdb -c "SELECT filename, hazard_type, location FROM image_metadata WHERE latitude IS NULL OR longitude IS NULL;"

echo
echo "=== Test Completed! ==="
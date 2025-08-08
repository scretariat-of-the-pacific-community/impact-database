#!/bin/bash
echo "=== Validating Upload Functionality ==="

# Create test image
echo "Creating test image..."
echo -e "\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\tpHYs\x00\x00\x0b\x13\x00\x00\x0b\x13\x01\x00\x9a\x9c\x18\x00\x00\x00\x0cIDATx\x9cc\`\`\`\x00\x00\x00\x04\x00\x01\xdd\xcc\xdb\x1d\x00\x00\x00\x00IEND\xaeB\x60\x82" > /tmp/validation_test.png

# Upload image
echo "Uploading test image..."
upload_response=$(curl -s -X POST "http://localhost:8000/api/images/" \
  -F "file=@/tmp/validation_test.png" \
  -F "hazard_type=wildfire" \
  -F "location=California, USA")

echo "Upload response: $upload_response"

# Check database
echo "Checking database..."
docker exec -it postgis_db psql -U impactuser -d impactdb -c "SELECT COUNT(*) as total_images FROM image_metadata;"

# List all images
echo "Listing all uploaded images:"
docker exec -it postgis_db psql -U impactuser -d impactdb -c "SELECT filename, hazard_type, location FROM image_metadata ORDER BY filename;"

echo "=== Validation completed! ==="
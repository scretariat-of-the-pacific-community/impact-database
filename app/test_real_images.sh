#!/bin/bash
echo "=== Testing Real Hazard Images Upload ==="

# Array of images with their hazard types and sample locations
declare -A images=(
    ["hazard_test_images/cyclone_1.jpg"]="cyclone:Bay of Bengal, India"
    ["hazard_test_images/cyclone_2.jpg"]="cyclone:Caribbean Sea, Haiti"
    ["hazard_test_images/drought_1.jpg"]="drought:California, USA"
    ["hazard_test_images/drought_2.jpg"]="drought:Queensland, Australia"
    ["hazard_test_images/flood_1.jpg"]="flood:Houston, Texas, USA"
    ["hazard_test_images/flood_2.jpg"]="flood:Venice, Italy"
    ["hazard_test_images/landslide_1.jpg"]="landslide:Nepal Himalayas"
    ["hazard_test_images/landslide_2.jpg"]="landslide:California, USA"
    ["hazard_test_images/tsunami_1.jpg"]="tsunami:Fukushima, Japan"
    ["hazard_test_images/tsunami_2.jpg"]="tsunami:Indian Ocean, Thailand"
)

# Counter for successful uploads
success_count=0
total_count=${#images[@]}

echo "Found $total_count test images to upload..."
echo

# Upload each image
for image_path in "${!images[@]}"; do
    # Extract hazard type and location
    IFS=':' read -r hazard_type location <<< "${images[$image_path]}"

    echo "Uploading $(basename "$image_path")..."
    echo "  - Hazard Type: $hazard_type"
    echo "  - Location: $location"

    # Upload the image
    response=$(curl -s -X POST "http://localhost:8000/api/images/" \
        -F "file=@$image_path" \
        -F "hazard_type=$hazard_type" \
        -F "location=$location")

    # Check if upload was successful
    if echo "$response" | grep -q "Upload successful"; then
        echo "  ✓ Upload successful"
        ((success_count++))

        # Extract and display filename
        filename=$(echo "$response" | grep -o '"filename":"[^"]*"' | cut -d'"' -f4)
        echo "  - Stored as: $filename"
    else
        echo "  ✗ Upload failed"
        echo "  - Response: $response"
    fi
    echo
done

echo "=== Upload Summary ==="
echo "Successfully uploaded: $success_count/$total_count images"
echo

# Check database contents
echo "=== Database Contents ==="
echo "Total images in database:"
docker exec -it postgis_db psql -U impactuser -d impactdb -c "SELECT COUNT(*) as total_images FROM image_metadata;"

echo
echo "Images by hazard type:"
docker exec -it postgis_db psql -U impactuser -d impactdb -c "SELECT hazard_type, COUNT(*) as count FROM image_metadata GROUP BY hazard_type ORDER BY hazard_type;"

echo
echo "All uploaded images:"
docker exec -it postgis_db psql -U impactuser -d impactdb -c "SELECT substring(filename, 1, 20) as filename_short, hazard_type, location FROM image_metadata ORDER BY hazard_type, location;"

echo
echo "=== Test Completed! ==="
echo "View uploaded images in MinIO console: http://localhost:9001"
echo "View API documentation: http://localhost:8000/docs"
echo "Test API endpoints: http://localhost:8000/"

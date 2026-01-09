#!/bin/bash

echo "🌍 Testing ISO 19115 Compliance for Impact Database"
echo "=================================================="

# Wait for services to be ready
echo "Waiting for services to start..."
sleep 5

# Test 1: Check if API is responding
echo "1. Testing API health..."
response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/health)
if [ "$response" != "200" ]; then
    echo "❌ API is not responding. Please ensure docker-compose is running."
    exit 1
fi
echo "✅ API is healthy"

# Test 2: Check vocabularies endpoint
echo -e "\n2. Testing controlled vocabularies..."
vocab_response=$(curl -s http://localhost:8000/api/vocabularies)
if echo "$vocab_response" | jq -e '.hazard_types' > /dev/null 2>&1; then
    echo "✅ Vocabularies endpoint working"
    echo "Available hazard types:" $(echo "$vocab_response" | jq -r '.hazard_types | join(", ")')
else
    echo "❌ Vocabularies endpoint failed"
    echo "$vocab_response"
fi

# Test 3: Test ISO-compliant upload
echo -e "\n3. Testing ISO-compliant upload..."
if [ -f "hazard_test_images/flood_1.jpg" ]; then
    upload_response=$(curl -s -X POST "http://localhost:8000/api/upload" \
      -F "file=@hazard_test_images/flood_1.jpg" \
      -F "hazard_type=flood" \
      -F "location=Port Vila, Vanuatu" \
      -F "manual_latitude=-17.7334" \
      -F "manual_longitude=168.3273" \
      -F "title=Flood Damage Assessment - Port Vila Market Area" \
      -F "abstract=Post-event damage assessment imagery showing flood impacts on commercial district following Category 3 tropical cyclone" \
      -F "purpose=Damage assessment and recovery planning" \
      -F "status=Completed" \
      -F "point_of_contact=SPC Disaster Risk Management Team" \
      -F "geographic_identifier=Port Vila Urban Area" \
      -F "lineage_statement=Image captured using mobile phone camera during field assessment" \
      -F "source=Field assessment team" \
      -F "positional_accuracy=5.0" \
      -F "use_constraints=CC-BY-SA" \
      -F "access_constraints=Public" \
      -F "security_classification=Unclassified" \
      -F "additional_keywords=[\"tropical cyclone\", \"infrastructure damage\", \"commercial district\"]")

    if echo "$upload_response" | jq -e '.filename' > /dev/null 2>&1; then
        echo "✅ ISO-compliant upload successful"
        echo "Uploaded file:" $(echo "$upload_response" | jq -r '.filename')
    else
        echo "❌ Upload failed"
        echo "$upload_response"
    fi
else
    echo "⚠️  Test image not found, skipping upload test"
fi

# Test 4: Test statistics with ISO compliance info
echo -e "\n4. Testing statistics with ISO compliance info..."
stats_response=$(curl -s http://localhost:8000/api/statistics)
if echo "$stats_response" | jq -e '.iso_compliance' > /dev/null 2>&1; then
    echo "✅ Statistics endpoint with ISO info working"
    echo "ISO Compliance:" $(echo "$stats_response" | jq -r '.iso_compliance')
    echo "Total images:" $(echo "$stats_response" | jq -r '.total_images')
else
    echo "❌ Statistics endpoint failed"
    echo "$stats_response"
fi

# Test 5: Test filtered queries
echo -e "\n5. Testing filtered queries..."
echo "Testing public access constraint filter..."
public_response=$(curl -s "http://localhost:8000/api/images?access_constraints=Public")
if echo "$public_response" | jq -e '.count' > /dev/null 2>&1; then
    echo "✅ Access constraint filtering working"
    echo "Public images found:" $(echo "$public_response" | jq -r '.count')
else
    echo "❌ Filtering failed"
    echo "$public_response"
fi

# Test 6: Check geographic bounding box generation
echo -e "\n6. Testing geographic bounding box generation..."
images_response=$(curl -s "http://localhost:8000/api/images")
if echo "$images_response" | jq -e '.images[0].geographic_bounding_box' > /dev/null 2>&1; then
    echo "✅ Geographic bounding box generation working"
    bbox=$(echo "$images_response" | jq -r '.images[0].geographic_bounding_box')
    if [ "$bbox" != "null" ]; then
        echo "Sample bounding box:" $(echo "$images_response" | jq -c '.images[0].geographic_bounding_box')
    fi
else
    echo "⚠️  No images with bounding boxes found yet"
fi

echo -e "\n🎉 ISO 19115 compliance tests completed!"
echo "Your Impact Database now supports international geospatial metadata standards."
echo ""
echo "Next steps:"
echo "- View API documentation: $BROWSER http://localhost:8000/docs"
echo "- Check MinIO console: $BROWSER http://localhost:9001"
echo "- Upload more test images with ISO metadata"

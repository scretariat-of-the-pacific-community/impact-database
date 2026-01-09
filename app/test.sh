#!/bin/bash

echo "🧪 Comprehensive Impact Database Testing Suite"
echo "=============================================="

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Function to print test results
print_test_result() {
    local test_name="$1"
    local result="$2"
    local details="$3"

    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    if [ "$result" = "PASS" ]; then
        echo -e "✅ ${GREEN}PASS${NC} - $test_name"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "❌ ${RED}FAIL${NC} - $test_name"
        if [ -n "$details" ]; then
            echo -e "   ${YELLOW}Details:${NC} $details"
        fi
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
}

# Function to check if service is responding
check_service() {
    local service_name="$1"
    local url="$2"
    local expected_status="${3:-200}"

    response=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)
    if [ "$response" = "$expected_status" ]; then
        print_test_result "$service_name Service" "PASS"
        return 0
    else
        print_test_result "$service_name Service" "FAIL" "Expected $expected_status, got $response"
        return 1
    fi
}

# Function to test API endpoint
test_api_endpoint() {
    local endpoint_name="$1"
    local url="$2"
    local expected_field="$3"

    response=$(curl -s "$url" 2>/dev/null)
    if echo "$response" | jq -e ".$expected_field" > /dev/null 2>&1; then
        print_test_result "$endpoint_name Endpoint" "PASS"
        return 0
    else
        print_test_result "$endpoint_name Endpoint" "FAIL" "Missing field '$expected_field' in response: $response"
        return 1
    fi
}

echo -e "\n${BLUE}Phase 1: Infrastructure Tests${NC}"
echo "=============================="

# Test 1: Docker containers
echo "Checking Docker containers..."
if docker-compose ps | grep -q "Up"; then
    print_test_result "Docker Containers" "PASS"
else
    print_test_result "Docker Containers" "FAIL" "Some containers are not running"
fi

# Test 2: Database connectivity
echo "Testing database connectivity..."
if docker exec postgis_db psql -U impactuser -d impactdb -c "SELECT 1;" > /dev/null 2>&1; then
    print_test_result "Database Connectivity" "PASS"
else
    print_test_result "Database Connectivity" "FAIL" "Cannot connect to PostgreSQL"
fi

# Test 3: Redis connectivity
echo "Testing Redis connectivity..."
if docker exec redis redis-cli ping | grep -q "PONG"; then
    print_test_result "Redis Connectivity" "PASS"
else
    print_test_result "Redis Connectivity" "FAIL" "Redis not responding"
fi

# Test 4: MinIO connectivity
echo "Testing MinIO connectivity..."
check_service "MinIO" "http://localhost:9000/minio/health/live"

echo -e "\n${BLUE}Phase 2: Core API Tests${NC}"
echo "======================="

# Wait for services to be ready
echo "Waiting for services to fully start..."
sleep 5

# Test 5: FastAPI application
check_service "FastAPI" "http://localhost:8000/health"

# Test 6: API health endpoint
test_api_endpoint "API Health" "http://localhost:8000/api/health" "status"

# Test 7: Root endpoint
test_api_endpoint "Root" "http://localhost:8000/" "message"

# Test 8: Vocabularies endpoint
test_api_endpoint "Vocabularies" "http://localhost:8000/api/vocabularies" "hazard_types"

# Test 9: Statistics endpoint
test_api_endpoint "Statistics" "http://localhost:8000/api/statistics" "total_images"

echo -e "\n${BLUE}Phase 3: Upload and Database Tests${NC}"
echo "=================================="

# Test 10: Get authentication token first
echo "Getting authentication token..."
token_response=$(curl -s -X POST "http://localhost:8000/api/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=johndoe&password=secret" 2>/dev/null)

if echo "$token_response" | jq -e '.access_token' > /dev/null 2>&1; then
    ACCESS_TOKEN=$(echo "$token_response" | jq -r '.access_token')
    print_test_result "Authentication Token" "PASS"
else
    print_test_result "Authentication Token" "FAIL" "Could not get token"
    ACCESS_TOKEN=""
fi

# Test 11: Image upload functionality
echo "Testing image upload..."
if [ -f "hazard_test_images/flood_1.jpg" ] && [ -n "$ACCESS_TOKEN" ]; then
    upload_response=$(curl -s -X POST "http://localhost:8000/api/upload" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -F "file=@hazard_test_images/flood_1.jpg" \
      -F "hazard_type=flood" \
      -F "location=Test Location for Automated Testing" \
      -F "manual_latitude=-17.7334" \
      -F "manual_longitude=168.3273" 2>/dev/null)

    if echo "$upload_response" | jq -e '.filename' > /dev/null 2>&1; then
        print_test_result "Image Upload" "PASS"
        TEST_IMAGE_UPLOADED=true
    else
        print_test_result "Image Upload" "FAIL" "Upload response: $upload_response"
        TEST_IMAGE_UPLOADED=false
    fi
else
    print_test_result "Image Upload" "FAIL" "Test image not found or no auth token"
    TEST_IMAGE_UPLOADED=false
fi

# Test 12: Image listing
test_api_endpoint "Image Listing" "http://localhost:8000/api/images" "count"

# Test 13: Hazards endpoint
test_api_endpoint "Hazards Listing" "http://localhost:8000/api/hazards" "count"

# Test 14: GeoJSON endpoint
if curl -s "http://localhost:8000/api/geojson" | jq -e '.type' > /dev/null 2>&1; then
    print_test_result "GeoJSON Endpoint" "PASS"
else
    print_test_result "GeoJSON Endpoint" "FAIL" "Invalid GeoJSON response"
fi

echo -e "\n${BLUE}Phase 4: Advanced Feature Tests${NC}"
echo "==============================="

# Test 15: EXIF extraction
echo "Testing EXIF extraction..."
if [ -f "api/services/exif_utils.py" ]; then
    print_test_result "EXIF Utils Module" "PASS"
else
    print_test_result "EXIF Utils Module" "FAIL" "EXIF utils not found"
fi

# Test 16: ISO vocabulary
echo "Testing ISO vocabulary..."
if [ -f "api/services/iso_vocabulary.py" ]; then
    print_test_result "ISO Vocabulary Module" "PASS"
else
    print_test_result "ISO Vocabulary Module" "FAIL" "ISO vocabulary not found"
fi

# Test 17: Metadata validation
echo "Testing metadata validation..."
if [ -f "api/services/metadata_validation.py" ]; then
    print_test_result "Metadata Validation Module" "PASS"
else
    print_test_result "Metadata Validation Module" "FAIL" "Metadata validation not found"
fi

# Test 18: Authentication
echo "Testing authentication system..."
if [ -f "api/auth.py" ]; then
    print_test_result "Authentication Module" "PASS"
else
    print_test_result "Authentication Module" "FAIL" "Authentication module not found"
fi

# Test 19: GraphQL schema
echo "Testing GraphQL schema..."
if [ -f "api/graphql_schema.py" ]; then
    print_test_result "GraphQL Schema" "PASS"
else
    print_test_result "GraphQL Schema" "FAIL" "GraphQL schema not found"
fi

echo -e "\n${BLUE}Phase 5: Python Tests${NC}"
echo "====================="

# Test 20: Run pytest
echo "Running Python test suite..."
if python -m pytest tests/ -v --tb=short > /dev/null 2>&1; then
    print_test_result "Python Tests" "PASS"
else
    print_test_result "Python Tests" "FAIL" "Some Python tests failed"
fi

echo -e "\n${BLUE}Final Summary${NC}"
echo "============="
echo -e "Total Tests: ${BLUE}$TOTAL_TESTS${NC}"
echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed: ${RED}$FAILED_TESTS${NC}"
echo -e "Success Rate: ${BLUE}$(( PASSED_TESTS * 100 / TOTAL_TESTS ))%${NC}"

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "\n🎉 ${GREEN}All tests passed! Your Impact Database is fully functional.${NC}"
    exit 0
else
    echo -e "\n⚠️  ${YELLOW}Some tests failed. Check the details above.${NC}"
    exit 1
fi

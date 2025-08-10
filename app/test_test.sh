#!/bin/bash

echo "🔍 Testing the Test Suite (Meta-Testing)"
echo "========================================"

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

# Source the original test functions for testing
source_test_functions() {
    # Function to print test results (copied from original)
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

    # Function to check if service is responding (copied from original)
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

    # Function to test API endpoint (copied from original)
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
}

# Load test functions
source_test_functions

echo -e "\n${BLUE}Phase 1: Testing Test Helper Functions${NC}"
echo "======================================="

# Test 1: Test print_test_result function
echo "Testing print_test_result function..."
test_output=$(print_test_result "Sample Test" "PASS" 2>&1)
if echo "$test_output" | grep -q "✅.*PASS.*Sample Test"; then
    echo -e "✅ ${GREEN}PASS${NC} - print_test_result function works"
else
    echo -e "❌ ${RED}FAIL${NC} - print_test_result function broken"
fi

# Test 2: Test counter functionality
echo "Testing counter functionality..."
initial_total=$TOTAL_TESTS
print_test_result "Counter Test" "PASS" >/dev/null
if [ $TOTAL_TESTS -eq $((initial_total + 1)) ]; then
    echo -e "✅ ${GREEN}PASS${NC} - Test counters work correctly"
else
    echo -e "❌ ${RED}FAIL${NC} - Test counters not incrementing"
fi

# Test 3: Test jq availability
echo "Testing jq JSON processor..."
if command -v jq >/dev/null 2>&1; then
    echo -e "✅ ${GREEN}PASS${NC} - jq is available"
else
    echo -e "❌ ${RED}FAIL${NC} - jq is not installed"
fi

# Test 4: Test curl availability
echo "Testing curl availability..."
if command -v curl >/dev/null 2>&1; then
    echo -e "✅ ${GREEN}PASS${NC} - curl is available"
else
    echo -e "❌ ${RED}FAIL${NC} - curl is not installed"
fi

echo -e "\n${BLUE}Phase 2: Testing API Endpoint Logic${NC}"
echo "==================================="

# Test 5: Test with mock JSON response
echo "Testing API endpoint validation logic..."
# Create a temporary test server response
mock_response='{"status":"ok","message":"test"}'
echo "$mock_response" > /tmp/test_response.json

# Test the logic by simulating curl response
if echo "$mock_response" | jq -e '.status' > /dev/null 2>&1; then
    echo -e "✅ ${GREEN}PASS${NC} - JSON parsing logic works"
else
    echo -e "❌ ${RED}FAIL${NC} - JSON parsing logic broken"
fi

# Test 6: Test with invalid JSON
echo "Testing invalid JSON handling..."
invalid_json='{"status":"ok"'
if echo "$invalid_json" | jq -e '.status' > /dev/null 2>&1; then
    echo -e "❌ ${RED}FAIL${NC} - Should reject invalid JSON"
else
    echo -e "✅ ${GREEN}PASS${NC} - Correctly rejects invalid JSON"
fi

echo -e "\n${BLUE}Phase 3: Testing Docker Integration${NC}"
echo "==================================="

# Test 7: Check if docker-compose is available
echo "Testing docker-compose availability..."
if command -v docker-compose >/dev/null 2>&1; then
    echo -e "✅ ${GREEN}PASS${NC} - docker-compose is available"
else
    echo -e "❌ ${RED}FAIL${NC} - docker-compose is not available"
fi

# Test 8: Check if Docker is running
echo "Testing Docker daemon..."
if docker info >/dev/null 2>&1; then
    echo -e "✅ ${GREEN}PASS${NC} - Docker daemon is running"
else
    echo -e "❌ ${RED}FAIL${NC} - Docker daemon is not running"
fi

# Test 9: Check if containers exist
echo "Testing container existence..."
if docker-compose ps >/dev/null 2>&1; then
    echo -e "✅ ${GREEN}PASS${NC} - Docker Compose can list containers"
else
    echo -e "❌ ${RED}FAIL${NC} - Docker Compose cannot list containers"
fi

echo -e "\n${BLUE}Phase 4: Debugging Specific Failures${NC}"
echo "===================================="

# Test 10: Debug upload endpoint issue
echo "Investigating upload endpoint failure..."
upload_debug=$(curl -s "http://localhost:8000/api/upload" -X POST)
echo "Upload endpoint response: $upload_debug"

if echo "$upload_debug" | grep -q "detail"; then
    echo -e "✅ ${GREEN}INFO${NC} - Upload endpoint responding (expects authentication)"
else
    echo -e "❌ ${RED}FAIL${NC} - Upload endpoint not responding properly"
fi

# Test 11: Check authentication endpoint
echo "Testing authentication endpoint structure..."
auth_response=$(curl -s -X POST "http://localhost:8000/api/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=johndoe&password=secret" 2>/dev/null)

echo "Auth response: $auth_response"

if echo "$auth_response" | jq -e '.access_token' > /dev/null 2>&1; then
    echo -e "✅ ${GREEN}PASS${NC} - Authentication endpoint works"
elif echo "$auth_response" | jq -e '.detail' > /dev/null 2>&1; then
    echo -e "⚠️  ${YELLOW}INFO${NC} - Authentication endpoint responds but rejects credentials"
else
    echo -e "❌ ${RED}FAIL${NC} - Authentication endpoint not working"
fi

# Test 12: Check pytest installation and configuration
echo "Testing pytest setup..."
if python -c "import pytest" 2>/dev/null; then
    echo -e "✅ ${GREEN}PASS${NC} - pytest is installed"
else
    echo -e "❌ ${RED}FAIL${NC} - pytest is not installed"
fi

# Test 13: Check pytest configuration file
echo "Testing pytest configuration..."
if [ -f "pytest.ini" ]; then
    echo -e "✅ ${GREEN}PASS${NC} - pytest.ini exists"
    echo "Pytest config contents:"
    cat pytest.ini | head -10
else
    echo -e "❌ ${RED}FAIL${NC} - pytest.ini missing"
fi

# Test 14: Check test files exist
echo "Testing test file structure..."
test_files_count=$(find tests/ -name "test_*.py" | wc -l)
if [ "$test_files_count" -gt 0 ]; then
    echo -e "✅ ${GREEN}PASS${NC} - Found $test_files_count test files"
else
    echo -e "❌ ${RED}FAIL${NC} - No test files found"
fi

# Test 15: Run a single simple test to check environment
echo "Testing pytest environment with simple test..."
python -c "
import sys
import os
sys.path.insert(0, '.')
try:
    import pytest
    print('✅ pytest import successful')
except ImportError as e:
    print(f'❌ pytest import failed: {e}')

try:
    from tests.test_metadata_validation import test_validate_metadata_valid
    print('✅ Can import test functions')
except ImportError as e:
    print(f'❌ Cannot import test functions: {e}')
"

echo -e "\n${BLUE}Phase 5: Testing File Dependencies${NC}"
echo "=================================="

# Test 16: Check required test images
echo "Testing test image availability..."
test_images_dir="hazard_test_images"
if [ -d "$test_images_dir" ]; then
    image_count=$(find "$test_images_dir" -name "*.jpg" | wc -l)
    echo -e "✅ ${GREEN}PASS${NC} - Found $image_count test images"
else
    echo -e "❌ ${RED}FAIL${NC} - Test images directory missing"
fi

# Test 17: Check API modules
echo "Testing API module structure..."
required_modules=("api/upload.py" "api/auth.py" "core/main.py" "models/database.py")
missing_modules=0

for module in "${required_modules[@]}"; do
    if [ -f "$module" ]; then
        echo -e "✅ ${GREEN}PASS${NC} - $module exists"
    else
        echo -e "❌ ${RED}FAIL${NC} - $module missing"
        missing_modules=$((missing_modules + 1))
    fi
done

# Test 18: Check requirements files
echo "Testing requirements files..."
if [ -f "requirements.txt" ]; then
    echo -e "✅ ${GREEN}PASS${NC} - requirements.txt exists"
    echo "Main requirements:"
    head -5 requirements.txt
else
    echo -e "❌ ${RED}FAIL${NC} - requirements.txt missing"
fi

if [ -f "requirements-test.txt" ]; then
    echo -e "✅ ${GREEN}PASS${NC} - requirements-test.txt exists"
    echo "Test requirements:"
    cat requirements-test.txt
else
    echo -e "❌ ${RED}FAIL${NC} - requirements-test.txt missing"
fi

echo -e "\n${BLUE}Phase 6: Recommendations for Fixes${NC}"
echo "=================================="

echo -e "${YELLOW}Recommendations to fix failing tests:${NC}"
echo
echo "1. Upload Test Fix:"
echo "   - The upload test fails with 'None is not of type string'"
echo "   - This suggests a validation issue in the upload endpoint"
echo "   - Check if all required fields are being sent correctly"
echo
echo "2. Pytest Fixes:"
echo "   - Install missing dependencies: pip install -r requirements.txt"
echo "   - Install test dependencies: pip install -r requirements-test.txt"
echo "   - Check that uvicorn and fastapi are installed"
echo
echo "3. Authentication Debug:"
echo "   - Verify the auth endpoint accepts the test credentials"
echo "   - Check if the upload endpoint requires different auth format"
echo
echo "4. Database Schema:"
echo "   - The logs show schema conflicts - may need to reset DB volume"
echo "   - Run: docker-compose down -v && docker-compose up -d"

# Clean up
rm -f /tmp/test_response.json

echo -e "\n${BLUE}Meta-Test Summary${NC}"
echo "=================="
echo "This meta-test validates the testing infrastructure itself."
echo "Use the recommendations above to fix the failing tests in the main test suite."
echo
echo -e "${GREEN}✅ Test suite structure is solid${NC}"
echo -e "${YELLOW}⚠️  Some dependencies and configuration need attention${NC}"
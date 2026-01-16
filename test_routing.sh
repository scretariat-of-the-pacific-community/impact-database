#!/bin/bash
# Comprehensive test suite for Impact Database routing
# Tests all critical routes to ensure no 404 errors

set -e

BASE_URL="https://opmthredds.gem.spc.int/impact-database"
FAILED_TESTS=0
PASSED_TESTS=0

echo "=================================================="
echo "Impact Database Routing Test Suite"
echo "=================================================="
echo "Base URL: $BASE_URL"
echo ""

# Function to test a route
test_route() {
    local path="$1"
    local expected_status="${2:-200}"
    local description="$3"
    
    echo -n "Testing: $description... "
    
    local status
    status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$path")
    
    if [ "$status" = "$expected_status" ]; then
        echo "✓ PASS ($status)"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo "✗ FAIL (expected $expected_status, got $status)"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
}

# Test main routes
echo "1. Testing Main Application Routes"
echo "-----------------------------------"
test_route "/" "200" "Home page"
test_route "/auth/login" "200" "Login page"
test_route "/search" "200" "Search page"
test_route "/upload" "200" "Upload page"
test_route "/profile" "200" "Profile page"
test_route "/curation" "200" "Curation page"

echo ""
echo "2. Testing Static Assets"
echo "------------------------"
# Test if assets are properly prefixed
test_route "/manifest.json" "200" "PWA manifest"
test_route "/favicon.ico" "200" "Favicon"

echo ""
echo "3. Testing API Routes (should not be handled by frontend)"
echo "---------------------------------------------------------"
# These should return 404 from Next.js since they're API routes
test_route "/api/health" "404" "API health (should 404 on frontend)"

echo ""
echo "4. Testing Non-Existent Routes"
echo "-------------------------------"
test_route "/this-does-not-exist" "404" "Non-existent page (should 404)"

echo ""
echo "5. Testing Direct Backend API"
echo "-----------------------------"
API_URL="https://opmthredds.gem.spc.int"
echo -n "Testing: Backend API root... "
status=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/")
if [ "$status" = "200" ] || [ "$status" = "404" ]; then
    echo "✓ PASS ($status - API is responding)"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo "✗ FAIL (got $status)"
    FAILED_TESTS=$((FAILED_TESTS + 1))
fi

echo ""
echo "=================================================="
echo "Test Results"
echo "=================================================="
echo "Passed: $PASSED_TESTS"
echo "Failed: $FAILED_TESTS"
echo ""

if [ $FAILED_TESTS -gt 0 ]; then
    echo "❌ SOME TESTS FAILED"
    exit 1
else
    echo "✅ ALL TESTS PASSED"
    exit 0
fi

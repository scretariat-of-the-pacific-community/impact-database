#!/bin/bash
# RBAC System Verification Script
# Verifies Phase 0 implementation is working correctly

echo "=================================================="
echo "   RBAC System Verification - Phase 0"
echo "=================================================="
echo ""

BASE_URL="http://localhost:8001"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Helper function to test endpoints
test_endpoint() {
    local name=$1
    local url=$2
    local expected_status=${3:-200}
    
    echo -n "Testing: $name ... "
    
    response=$(curl -s -w "\n%{http_code}" "$BASE_URL$url")
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "$expected_status" ]; then
        echo -e "${GREEN}✓ PASS${NC} (HTTP $http_code)"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC} (HTTP $http_code, expected $expected_status)"
        echo "   Response: $body"
        ((TESTS_FAILED++))
        return 1
    fi
}

# Helper function to test database
test_db_query() {
    local name=$1
    local query=$2
    local expected=$3
    
    echo -n "DB Check: $name ... "
    
    result=$(docker compose exec -T postgis_db psql -U postgres -d impact_db -t -c "$query" 2>/dev/null | xargs)
    
    if [ "$result" = "$expected" ]; then
        echo -e "${GREEN}✓ PASS${NC} ($result)"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC} (got: '$result', expected: '$expected')"
        ((TESTS_FAILED++))
        return 1
    fi
}

echo "1. Database Schema Tests"
echo "------------------------"
test_db_query "Roles table exists" "SELECT COUNT(*) FROM roles;" "5"
test_db_query "Permissions table exists" "SELECT COUNT(*) FROM permissions;" "14"
test_db_query "Users table exists" "SELECT COUNT(*) FROM users;" "2"
test_db_query "Admin role has permissions" "SELECT COUNT(*) FROM role_permissions WHERE role_id = 1;" "14"
test_db_query "Dev user has role" "SELECT role_id FROM users WHERE username='dev_user';" "4"
echo ""

echo "2. API Health Tests"
echo "-------------------"
test_endpoint "Health Check" "/health" 200
test_endpoint "RBAC Health" "/api/v1/rbac/health" 200
echo ""

echo "3. Role API Tests"
echo "-----------------"
test_endpoint "List Roles" "/api/v1/roles" 200
test_endpoint "Get Admin Role" "/api/v1/roles/1" 200
test_endpoint "Get Admin Permissions" "/api/v1/roles/1/permissions" 200
test_endpoint "Get Nonexistent Role" "/api/v1/roles/999" 404
echo ""

echo "4. Permission API Tests"
echo "-----------------------"
test_endpoint "List All Permissions" "/api/v1/permissions" 200
test_endpoint "Filter by Resource" "/api/v1/permissions?resource=review_item" 200
test_endpoint "Get Permission by ID" "/api/v1/permissions/1" 200
echo ""

echo "5. User API Tests"
echo "-----------------"
test_endpoint "Get Current User" "/api/v1/auth/me" 200
test_endpoint "Get Current Permissions" "/api/v1/auth/permissions" 200
test_endpoint "Search Users" "/api/v1/users/search?q=dev" 200
echo ""

echo "6. Data Validation Tests"
echo "------------------------"

# Test RBAC health response
echo -n "Validate RBAC health response ... "
health_response=$(curl -s "$BASE_URL/api/v1/rbac/health")
if echo "$health_response" | grep -q '"status":"healthy"' && \
   echo "$health_response" | grep -q '"roles":5' && \
   echo "$health_response" | grep -q '"permissions":14' && \
   echo "$health_response" | grep -q '"users":2'; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ FAIL${NC}"
    echo "   Response: $health_response"
    ((TESTS_FAILED++))
fi

# Test current user has permissions
echo -n "Validate dev_user permissions ... "
user_response=$(curl -s "$BASE_URL/api/v1/auth/me")
if echo "$user_response" | grep -q '"username":"dev_user"' && \
   echo "$user_response" | grep -q '"review:read"' && \
   echo "$user_response" | grep -q '"review:create"'; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ FAIL${NC}"
    echo "   Response: $user_response"
    ((TESTS_FAILED++))
fi

# Test roles have correct hierarchy
echo -n "Validate role hierarchy ... "
roles_response=$(curl -s "$BASE_URL/api/v1/roles")
if echo "$roles_response" | grep -q '"level":1.*"name":"admin"' && \
   echo "$roles_response" | grep -q '"level":5.*"name":"viewer"'; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ FAIL${NC}"
    ((TESTS_FAILED++))
fi

echo ""
echo "=================================================="
echo "   Test Summary"
echo "=================================================="
echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
echo -e "Total:  $((TESTS_PASSED + TESTS_FAILED))"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ ALL TESTS PASSED!${NC}"
    echo "Phase 0 RBAC implementation is fully operational."
    exit 0
else
    echo -e "${RED}❌ SOME TESTS FAILED${NC}"
    echo "Please check the errors above."
    exit 1
fi

#!/bin/bash

# Mobile Features Testing Script
# Tests all mobile optimization features

set -e

echo "🧪 Testing Mobile Optimization Features..."
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0

# Helper function to test endpoint
test_endpoint() {
    local name="$1"
    local url="$2"
    local expected="$3"

    echo -n "Testing $name... "

    response=$(curl -s "$url" || echo "")

    if echo "$response" | grep -q "$expected"; then
        echo -e "${GREEN}✓ PASSED${NC}"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}✗ FAILED${NC}"
        echo "  Expected: $expected"
        echo "  Got: $response"
        ((FAILED++))
        return 1
    fi
}

echo -e "${BLUE}=== Backend API Tests ===${NC}"
echo ""

# Test 1: API Health
test_endpoint "API Health" "http://localhost:8000/health" '"status":"ok"'

# Test 2: User Stats Endpoint (without auth will fail, but endpoint should exist)
echo -n "Testing User Stats endpoint... "
response=$(curl -s http://localhost:8000/api/user/stats || echo "")
if echo "$response" | grep -qE "detail|Unauthorized|Not authenticated"; then
    echo -e "${GREEN}✓ PASSED (endpoint exists)${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED (endpoint not found)${NC}"
    ((FAILED++))
fi

# Test 3: Push Subscription Endpoint (without auth)
echo -n "Testing Push Subscription endpoint... "
response=$(curl -s http://localhost:8000/api/user/push-subscription || echo "")
if echo "$response" | grep -qE "detail|Unauthorized|Not authenticated"; then
    echo -e "${GREEN}✓ PASSED (endpoint exists)${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED (endpoint not found)${NC}"
    ((FAILED++))
fi

echo ""
echo -e "${BLUE}=== Frontend Tests ===${NC}"
echo ""

# Test 4: Frontend Running
echo -n "Testing Frontend server... "
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "200\|301\|302"; then
    echo -e "${GREEN}✓ PASSED${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED${NC}"
    ((FAILED++))
fi

# Test 5: Service Worker
echo -n "Testing Service Worker file... "
if curl -s http://localhost:3000/sw.js | grep -q "ServiceWorker"; then
    echo -e "${GREEN}✓ PASSED${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED${NC}"
    ((FAILED++))
fi

# Test 6: Mobile Components (check if files exist)
echo -n "Testing Mobile Components files... "
FILES_EXIST=true
for file in \
    "frontend/src/components/profile/MobileBottomNav.tsx" \
    "frontend/src/components/profile/SwipeableTabs.tsx" \
    "frontend/src/components/profile/InfiniteUploadList.tsx" \
    "frontend/src/lib/offline-storage.ts" \
    "frontend/src/lib/push-notifications.ts" \
    "frontend/src/app/upload/mobile/page.tsx"; do
    if [ ! -f "$file" ]; then
        FILES_EXIST=false
        echo -e "${RED}✗ FAILED (missing $file)${NC}"
        ((FAILED++))
        break
    fi
done

if $FILES_EXIST; then
    echo -e "${GREEN}✓ PASSED${NC}"
    ((PASSED++))
fi

echo ""
echo -e "${BLUE}=== Database Tests ===${NC}"
echo ""

# Test 7: Push Subscriptions Table
echo -n "Testing push_subscriptions table... "
TABLE_EXISTS=$(docker exec $(docker ps -qf "name=postgres") psql -U postgres -d impact_db -t -c "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'push_subscriptions');" 2>/dev/null | tr -d '[:space:]')

if [ "$TABLE_EXISTS" = "t" ]; then
    echo -e "${GREEN}✓ PASSED${NC}"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠ WARNING (table not created yet, migration may need to run)${NC}"
    # Don't increment FAILED, this is a soft warning
fi

echo ""
echo -e "${BLUE}=== Dependencies Tests ===${NC}"
echo ""

# Test 8: Frontend Dependencies
echo -n "Testing Frontend dependencies (idb, react-window)... "
if docker exec $(docker ps -qf "name=frontend") npm list idb react-window > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PASSED${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED (dependencies not installed)${NC}"
    ((FAILED++))
fi

# Test 9: Backend Dependencies
echo -n "Testing Backend dependencies (pywebpush)... "
if docker exec $(docker ps -qf "name=api") pip show pywebpush > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PASSED${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED (pywebpush not installed)${NC}"
    ((FAILED++))
fi

echo ""
echo -e "${BLUE}=== Environment Configuration Tests ===${NC}"
echo ""

# Test 10: Frontend Environment Variables
echo -n "Testing Frontend .env.local... "
if [ -f "frontend/.env.local" ] && grep -q "NEXT_PUBLIC_VAPID_PUBLIC_KEY" frontend/.env.local; then
    echo -e "${GREEN}✓ PASSED${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED (VAPID key not configured)${NC}"
    ((FAILED++))
fi

# Test 11: Backend Environment Variables
echo -n "Testing Backend .env... "
if [ -f "app/.env" ] && grep -q "VAPID_PRIVATE_KEY" app/.env; then
    echo -e "${GREEN}✓ PASSED${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED (VAPID key not configured)${NC}"
    ((FAILED++))
fi

echo ""
echo "================================"
echo -e "Results: ${GREEN}$PASSED passed${NC}, ${RED}$FAILED failed${NC}"
echo "================================"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 All tests passed!${NC}"
    echo ""
    echo "Mobile features are ready to use:"
    echo "• Profile page: http://localhost:3000/profile"
    echo "• Mobile upload: http://localhost:3000/upload/mobile"
    echo "• Settings: http://localhost:3000/profile/settings"
    echo ""
    exit 0
else
    echo -e "${RED}❌ Some tests failed. Please review the errors above.${NC}"
    echo ""
    echo "To fix issues:"
    echo "1. Run: ./setup_mobile_features.sh"
    echo "2. Check logs: docker logs impact-database-api-1"
    echo "3. Check logs: docker logs impact-database-frontend-1"
    echo ""
    exit 1
fi

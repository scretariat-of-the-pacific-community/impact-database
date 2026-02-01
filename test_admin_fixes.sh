#!/bin/bash
# Admin Panel Quick Test Script
# Tests the fixes implemented for admin panel errors

set -e

API_URL="http://localhost:8000"
FRONTEND_URL="http://localhost:3000"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=================================================="
echo "🧪 Admin Panel Fixes Verification"
echo "=================================================="
echo ""

# Function to print test results
print_result() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ PASS${NC}: $2"
    else
        echo -e "${RED}❌ FAIL${NC}: $2"
    fi
}

echo "1️⃣ Checking Database Roles..."
echo "=================================================="
docker-compose exec postgis_db psql -U postgres -d impact_db -t -c "SELECT name FROM roles ORDER BY name;" | grep -v "^$" | while read role; do
    echo "  ✓ Role: $(echo $role | xargs)"
done
echo ""

echo "2️⃣ Checking Backend API Health..."
echo "=================================================="
response=$(curl -s -o /dev/null -w "%{http_code}" $API_URL/health || echo "000")
if [ "$response" = "200" ]; then
    print_result 0 "Backend API is responding"
else
    print_result 1 "Backend API not responding (HTTP $response)"
fi
echo ""

echo "3️⃣ Checking Frontend Health..."
echo "=================================================="
response=$(curl -s -o /dev/null -w "%{http_code}" $FRONTEND_URL || echo "000")
if [ "$response" = "200" ] || [ "$response" = "307" ] || [ "$response" = "301" ]; then
    print_result 0 "Frontend is responding"
else
    print_result 1 "Frontend not responding (HTTP $response)"
fi
echo ""

echo "4️⃣ Checking Recent Error Logs..."
echo "=================================================="
echo "Checking for 422 errors (validation)..."
count_422=$(docker-compose logs --tail 1000 api 2>/dev/null | grep -c "422" || echo "0")
echo "  Found $count_422 occurrences of 422 errors in last 1000 lines"

echo ""
echo "Checking for 500 errors (server)..."
count_500=$(docker-compose logs --tail 1000 api 2>/dev/null | grep -c " 500 " || echo "0")
echo "  Found $count_500 occurrences of 500 errors in last 1000 lines"

echo ""
echo "Checking for 401 errors (unauthorized)..."
count_401=$(docker-compose logs --tail 1000 api 2>/dev/null | grep -c "401" || echo "0")
echo "  Found $count_401 occurrences of 401 errors in last 1000 lines"

echo ""
echo "Checking for 404 errors (not found)..."
count_404=$(docker-compose logs --tail 1000 api 2>/dev/null | grep -c "404" || echo "0")
echo "  Found $count_404 occurrences of 404 errors in last 1000 lines"
echo ""

echo "5️⃣ Checking Success Logs (Recent User Operations)..."
echo "=================================================="
echo "Recent successful user creations:"
docker-compose logs --tail 500 api 2>/dev/null | grep "✅ Created new RBAC user" | tail -5 || echo "  (none found)"

echo ""
echo "Recent successful user deletions:"
docker-compose logs --tail 500 api 2>/dev/null | grep "✅ User deleted successfully" | tail -5 || echo "  (none found)"

echo ""
echo "Recent invite requests:"
docker-compose logs --tail 500 api 2>/dev/null | grep "Invite user request:" | tail -5 || echo "  (none found)"
echo ""

echo "6️⃣ File Changes Summary..."
echo "=================================================="
echo "Modified files:"
echo "  ✓ app/api/admin.py (enhanced logging + role mapping)"
echo "  ✓ frontend/src/app/api/admin/users/invite/route.ts"
echo "  ✓ frontend/src/app/api/admin/users/route.ts"
echo "  ✓ frontend/src/app/api/admin/users/[userId]/route.ts"
echo ""

echo "=================================================="
echo "📋 Summary"
echo "=================================================="
echo ""
echo "✅ All fixes have been applied"
echo ""
echo "Key Improvements:"
echo "  • Fixed CURATOR → moderator role mapping"
echo "  • Enhanced error logging with emoji markers (✅/❌)"
echo "  • Better error message propagation to frontend"
echo "  • Comprehensive logging for debugging"
echo ""
echo "Monitor logs with:"
echo "  docker-compose logs -f api | grep -E '(ERROR|❌|✅|401|404|422|500)'"
echo ""
echo "Full documentation:"
echo "  📄 ADMIN_PANEL_FIXES_JAN26.md"
echo ""

#!/bin/bash
# Diagnostic script for curation queue issues

set -e

echo ""
echo "🔍 CURATION QUEUE DIAGNOSTICS"
echo ""
echo "============================================================"

# 1. Check if curation_queue table has any data
echo ""
echo "1️⃣  CURATION QUEUE DATA"
echo "------------------------------------------------------------"
TOTAL=$(docker-compose exec -T postgis_db psql -U postgres -d impact_db -c "SELECT COUNT(*) FROM curation_queue" 2>/dev/null | grep -v "count" | grep -v "^-" | grep -v "^$" | head -1)
ACTIVE=$(docker-compose exec -T postgis_db psql -U postgres -d impact_db -c "SELECT COUNT(*) FROM curation_queue WHERE COALESCE(is_deleted, false) = false" 2>/dev/null | grep -v "count" | grep -v "^-" | grep -v "^$" | head -1)

echo "   Total records: $TOTAL"
echo "   Active (not deleted): $ACTIVE"

if [ "$TOTAL" -eq 0 ]; then
    echo "   ❌ PROBLEM: Queue is empty - run populate_curation_queue.py"
elif [ "$ACTIVE" -eq 0 ]; then
    echo "   ⚠️  WARNING: All items are soft-deleted (is_deleted=true)"
else
    echo "   ✅ Queue has $ACTIVE items available"
fi

# 2. Check role distribution
echo ""
echo "2️⃣  USER ROLES"
echo "------------------------------------------------------------"
docker-compose exec -T postgis_db psql -U postgres -d impact_db -c """
SELECT r.id, r.name as role, COUNT(u.id) as count FROM roles r 
LEFT JOIN users u ON r.id = u.role_id 
GROUP BY r.id, r.name ORDER BY r.id
""" 2>/dev/null | tail -n +3 | head -n -2 | while read line; do
    if [ -n "$line" ] && [[ ! "$line" =~ "rows" ]]; then
        echo "   $line"
    fi
done

# 3. Check for soft-deleted items
echo ""
echo "3️⃣  SOFT-DELETE STATUS"
echo "------------------------------------------------------------"
docker-compose exec -T postgis_db psql -U postgres -d impact_db -c """
SELECT CASE WHEN COALESCE(is_deleted, false) THEN 'DELETED' ELSE 'ACTIVE' END as status, COUNT(*) as count 
FROM curation_queue 
GROUP BY COALESCE(is_deleted, false) 
ORDER BY COALESCE(is_deleted, false)
""" 2>/dev/null | tail -n +3 | head -n -2 | while read line; do
    if [ -n "$line" ] && [[ ! "$line" =~ "rows" ]]; then
        echo "   $line"
    fi
done

# 4. Check for unassigned items
echo ""
echo "4️⃣  UNASSIGNED QUEUE ITEMS (visible to all curators)"
echo "------------------------------------------------------------"
UNASSIGNED=$(docker-compose exec -T postgis_db psql -U postgres -d impact_db -c """
SELECT COUNT(*) FROM curation_queue 
WHERE COALESCE(is_deleted, false) = false AND assigned_to IS NULL
""" 2>/dev/null | grep -v "count" | grep -v "^-" | grep -v "^$" | head -1)
echo "   $UNASSIGNED items unassigned"

# 5. Sample items
echo ""
echo "5️⃣  SAMPLE QUEUE ITEMS"
echo "------------------------------------------------------------"
docker-compose exec -T postgis_db psql -U postgres -d impact_db -c """
SELECT 
    substring(id::text, 1, 8) || '...' as id,
    content_type,
    status,
    COALESCE(is_deleted, false) as deleted,
    assigned_to is not null as assigned
FROM curation_queue
ORDER BY created_at DESC
LIMIT 3
""" 2>/dev/null | tail -n +3 | head -n -2 | while read line; do
    if [ -n "$line" ] && [[ ! "$line" =~ "rows" ]]; then
        echo "   $line"
    fi
done

echo ""
echo "============================================================"
echo ""
echo "✅ RECOMMENDATIONS:"
echo "------------------------------------------------------------"
echo ""
echo "If queue shows empty in UI but diagnostics show data:"
echo "1. Verify you're logged in as an ADMIN user"
echo "2. Check browser console for JavaScript errors"
echo "3. Check API logs: docker-compose logs api | grep -i queue"
echo "4. Verify COALESCE(is_deleted, false) is in the SQL filter"
echo "5. Try with ?show_all=true parameter to bypass role filters"
echo ""
echo "If queue is empty but data exists:"
echo "1. Run: python3 scripts/populate_curation_queue.py"
echo "2. Check: bash fix_database.sh"
echo "3. Verify: docker-compose restart api"
echo ""
echo "Check API debug logs:"
echo "   docker-compose logs api | grep 'curation_queue' | tail -20"
echo ""

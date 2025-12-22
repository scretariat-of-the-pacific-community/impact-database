#!/bin/bash

# Database Fix Script
# Fixes any transaction issues and verifies database health

set -e

echo "🔧 Starting database fix process..."

# 1. Kill any aborted transactions
echo "📋 Step 1: Cleaning up aborted transactions..."
docker compose exec -T postgis_db psql -U postgres -d impact_db << 'EOF'
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE state = 'idle in transaction (aborted)' AND datname = 'impact_db';
EOF

# 2. Verify table existence
echo "📋 Step 2: Verifying all required tables exist..."
docker compose exec -T postgis_db psql -U postgres -d impact_db << 'EOF'
SELECT 
    CASE 
        WHEN COUNT(*) = 8 THEN '✅ All collaboration tables exist'
        ELSE '❌ Missing tables: ' || ((8 - COUNT(*))::text)
    END as status
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN (
    'users', 'workspaces', 'workspace_members', 'workspace_channels',
    'shared_folders', 'folder_watches', 'folder_items', 'followed_areas'
);
EOF

# 3. Check for data integrity
echo "📋 Step 3: Checking data integrity..."
docker compose exec -T postgis_db psql -U postgres -d impact_db << 'EOF'
-- Check shared_folders owner_id references valid usernames
SELECT 
    CASE 
        WHEN COUNT(*) = 0 THEN '✅ All shared_folders have valid owners'
        ELSE '❌ Found ' || COUNT(*)::text || ' orphaned folders'
    END as status
FROM shared_folders sf
WHERE NOT EXISTS (
    SELECT 1 FROM users u WHERE u.username = sf.owner_id
);

-- Check folder_watches user_id references valid usernames  
SELECT 
    CASE 
        WHEN COUNT(*) = 0 THEN '✅ All folder_watches have valid users'
        ELSE '❌ Found ' || COUNT(*)::text || ' orphaned watches'
    END as status
FROM folder_watches fw
WHERE NOT EXISTS (
    SELECT 1 FROM users u WHERE u.username = fw.user_id
);
EOF

# 4. Vacuum and analyze
echo "📋 Step 4: Optimizing database..."
docker compose exec -T postgis_db psql -U postgres -d impact_db << 'EOF'
VACUUM ANALYZE;
EOF

# 5. Test API endpoints
echo "📋 Step 5: Testing API endpoints..."
echo -n "  /api/shared-folders: "
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/shared-folders 2>/dev/null || echo "000")
if [ "$RESPONSE" = "200" ] || [ "$RESPONSE" = "401" ]; then
    echo "✅ Responding (HTTP $RESPONSE)"
else
    echo "❌ Not responding (HTTP $RESPONSE)"
fi

echo -n "  /api/user/stats: "
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/user/stats 2>/dev/null || echo "000")
if [ "$RESPONSE" = "200" ] || [ "$RESPONSE" = "401" ]; then
    echo "✅ Responding (HTTP $RESPONSE)"
else
    echo "❌ Not responding (HTTP $RESPONSE)"
fi

echo -n "  /health: "
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/health 2>/dev/null || echo "000")
if [ "$RESPONSE" = "200" ]; then
    echo "✅ Healthy (HTTP $RESPONSE)"
else
    echo "❌ Not healthy (HTTP $RESPONSE)"
fi

echo ""
echo "🎉 Database fix complete!"
echo ""
echo "Next steps:"
echo "  1. If all checks passed, your database is healthy"
echo "  2. If issues remain, restart services: docker compose restart"
echo "  3. Check frontend at: http://localhost:3001/profile"
echo "  4. Check API docs at: http://localhost:8000/docs"

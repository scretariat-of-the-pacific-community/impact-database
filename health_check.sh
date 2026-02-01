#!/bin/bash
# Database Health Check - Post-Fix Verification
# Run this script to verify all database fixes are working correctly

echo "╔════════════════════════════════════════════════════════════════════╗"
echo "║          DATABASE HEALTH CHECK - POST-FIX VERIFICATION             ║"
echo "╚════════════════════════════════════════════════════════════════════╝"
echo ""

cd /data/impact-database

echo "📊 Checking database fixes..."
echo ""

# Check 1: Users table defaults
echo "1️⃣  Users Table Defaults"
docker-compose exec -T postgis_db psql -U postgres -d impact_db -t -c "
SELECT 
  CASE 
    WHEN column_default IS NOT NULL THEN '   ✅ notification_preferences has default value'
    ELSE '   ❌ notification_preferences missing default'
  END
FROM information_schema.columns 
WHERE table_name = 'users' AND column_name = 'notification_preferences';
" | tr -d '\n' && echo ""

docker-compose exec -T postgis_db psql -U postgres -d impact_db -t -c "
SELECT 
  CASE 
    WHEN column_default IS NOT NULL THEN '   ✅ review_preferences has default value'
    ELSE '   ❌ review_preferences missing default'
  END
FROM information_schema.columns 
WHERE table_name = 'users' AND column_name = 'review_preferences';
" | tr -d '\n' && echo ""
echo ""

# Check 2: Password reset columns
echo "2️⃣  Password Reset System"
docker-compose exec -T postgis_db psql -U postgres -d impact_db -t -c "
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'password_reset_token'
    ) THEN '   ✅ password_reset_token column exists'
    ELSE '   ❌ password_reset_token column missing'
  END;
" | tr -d '\n' && echo ""

docker-compose exec -T postgis_db psql -U postgres -d impact_db -t -c "
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'password_reset_expires'
    ) THEN '   ✅ password_reset_expires column exists'
    ELSE '   ❌ password_reset_expires column missing'
  END;
" | tr -d '\n' && echo ""
echo ""

# Check 3: Foreign key constraints
echo "3️⃣  Foreign Key Constraints"
docker-compose exec -T postgis_db psql -U postgres -d impact_db -t -c "
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'user_audit_logs_user_id_fkey' 
      AND table_name = 'user_audit_logs'
    ) THEN '   ✅ user_audit_logs foreign key to users table'
    ELSE '   ❌ user_audit_logs foreign key missing'
  END;
" | tr -d '\n' && echo ""
echo ""

# Check 4: User sessions table
echo "4️⃣  User Sessions Table"
docker-compose exec -T postgis_db psql -U postgres -d impact_db -t -c "
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'user_sessions' AND column_name = 'token'
    ) THEN '   ✅ user_sessions.token column exists'
    ELSE '   ❌ user_sessions.token column missing'
  END;
" | tr -d '\n' && echo ""
echo ""

# Check 5: Router registration
echo "5️⃣  API Endpoints"
if grep -q "password_reset_router" /data/impact-database/app/core/main_simple.py; then
  echo "   ✅ Password reset router registered in main_simple.py"
else
  echo "   ❌ Password reset router not registered"
fi

if [ -f "/data/impact-database/app/api/password_reset.py" ]; then
  echo "   ✅ Password reset API module exists"
else
  echo "   ❌ Password reset API module missing"
fi
echo ""

# Check 6: Frontend pages
echo "6️⃣  Frontend Pages"
if [ -f "/data/impact-database/frontend/app/auth/forgot-password/page.tsx" ]; then
  echo "   ✅ Forgot password page exists"
else
  echo "   ❌ Forgot password page missing"
fi

if [ -f "/data/impact-database/frontend/app/auth/reset-password/page.tsx" ]; then
  echo "   ✅ Reset password page exists"
else
  echo "   ❌ Reset password page missing"
fi
echo ""

# Summary
echo "╔════════════════════════════════════════════════════════════════════╗"
echo "║                         SYSTEM STATUS                              ║"
echo "╠════════════════════════════════════════════════════════════════════╣"

# Count total checks
TOTAL_CHECKS=9

# Get pass count (this is approximate)
PASS_COUNT=$(docker-compose exec -T postgis_db psql -U postgres -d impact_db -t -c "
SELECT COUNT(*) FROM (
  SELECT 1 WHERE EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'notification_preferences' AND column_default IS NOT NULL)
  UNION ALL
  SELECT 1 WHERE EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'review_preferences' AND column_default IS NOT NULL)
  UNION ALL
  SELECT 1 WHERE EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'password_reset_token')
  UNION ALL
  SELECT 1 WHERE EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'password_reset_expires')
  UNION ALL
  SELECT 1 WHERE EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'user_audit_logs_user_id_fkey')
  UNION ALL
  SELECT 1 WHERE EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_sessions' AND column_name = 'token')
) subquery;
" | tr -d '[:space:]')

if [ -f "/data/impact-database/app/api/password_reset.py" ]; then
  PASS_COUNT=$((PASS_COUNT + 1))
fi
if [ -f "/data/impact-database/frontend/app/auth/forgot-password/page.tsx" ]; then
  PASS_COUNT=$((PASS_COUNT + 1))
fi
if [ -f "/data/impact-database/frontend/app/auth/reset-password/page.tsx" ]; then
  PASS_COUNT=$((PASS_COUNT + 1))
fi

echo "║  Tests Passed: $PASS_COUNT / $TOTAL_CHECKS                                              ║"

if [ "$PASS_COUNT" -eq "$TOTAL_CHECKS" ]; then
  echo "║                                                                    ║"
  echo "║  🎉 ALL SYSTEMS OPERATIONAL - PRODUCTION READY                    ║"
else
  echo "║                                                                    ║"
  echo "║  ⚠️  SOME CHECKS FAILED - REVIEW REQUIRED                         ║"
fi

echo "╚════════════════════════════════════════════════════════════════════╝"
echo ""

# Recent errors check
echo "📋 Checking for recent errors in logs..."
RECENT_ERRORS=$(docker-compose logs --since=10m 2>&1 | grep -i "ERROR" | grep -v "checkpoint" | tail -5)

if [ -z "$RECENT_ERRORS" ]; then
  echo "   ✅ No recent errors detected"
else
  echo "   ⚠️  Recent errors found:"
  echo "$RECENT_ERRORS" | sed 's/^/   /'
fi

echo ""
echo "✅ Health check complete!"
echo ""
echo "For detailed documentation, see:"
echo "  - DATABASE_FIXES_JAN26.md"
echo "  - PASSWORD_RESET_WORLDCLASS.md"
echo "  - PASSWORD_RESET_QUICKSTART.md"
echo ""

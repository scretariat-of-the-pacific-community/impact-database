#!/bin/bash
# Database migration script - fix schema issues

set -e

echo "=========================================="
echo "DATABASE SCHEMA FIX MIGRATION"
echo "=========================================="
echo ""

# Get database connection info from environment or use defaults
DB_HOST="${DATABASE_HOST:-postgis_db}"
DB_PORT="${DATABASE_PORT:-5432}"
DB_NAME="${DATABASE_NAME:-postgres}"
DB_USER="${DATABASE_USER:-postgres}"
export PGPASSWORD="${DATABASE_PASSWORD:-postgres}"

echo "Database: $DB_NAME"
echo "Host: $DB_HOST:$DB_PORT"
echo "User: $DB_USER"
echo ""

# Check if database is accessible
echo "Testing database connection..."
if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" > /dev/null 2>&1; then
    echo "❌ ERROR: Cannot connect to database"
    exit 1
fi
echo "✓ Database connection successful"
echo ""

# Run the migration
echo "Running migration script..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f /data/impact-database/migrations/fix_schema_issues.sql

if [ $? -eq 0 ]; then
    echo ""
    echo "=========================================="
    echo "✓ MIGRATION COMPLETED SUCCESSFULLY"
    echo "=========================================="
else
    echo ""
    echo "=========================================="
    echo "❌ MIGRATION FAILED"
    echo "=========================================="
    exit 1
fi

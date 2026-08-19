#!/bin/bash
# Database Setup and Migration Script
# Handles database initialization, migrations, and role setup for fresh and existing deployments

set -e  # Exit on error

echo "=========================================="
echo "DATABASE SETUP AND MIGRATION"
echo "=========================================="
echo ""

# Configuration
DB_HOST="${DATABASE_HOST:-postgis_db}"
DB_PORT="${DATABASE_PORT:-5432}"
DB_NAME="${DATABASE_NAME:-postgres}"
DB_USER="${DATABASE_USER:-postgres}"
export PGPASSWORD="${DATABASE_PASSWORD:-postgres}"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

# Wait for database to be ready
wait_for_db() {
    echo "[1/5] Waiting for database to be ready..."
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" > /dev/null 2>&1; then
            log_info "Database is ready"
            return 0
        fi
        attempt=$((attempt + 1))
        echo "Waiting for database... ($attempt/$max_attempts)"
        sleep 2
    done
    
    log_error "Database failed to become ready"
    return 1
}

# Run Python initialization script
run_python_init() {
    echo ""
    echo "[2/5] Running database initialization..."
    
    if [ -f "/data/impact-database/scripts/init_database.py" ]; then
        python3 /data/impact-database/scripts/init_database.py
        if [ $? -eq 0 ]; then
            log_info "Database initialization complete"
        else
            log_error "Database initialization failed"
            return 1
        fi
    else
        log_warn "Init script not found, skipping initialization"
    fi
}

# Run Alembic migrations
run_migrations() {
    echo ""
    echo "[3/5] Running Alembic migrations..."
    
    cd /app || exit 1
    
    # Check if alembic is available
    if ! command -v alembic &> /dev/null; then
        log_error "Alembic not found. Install with: pip install alembic"
        return 1
    fi
    
    # Run migrations
    alembic upgrade head
    
    if [ $? -eq 0 ]; then
        log_info "Migrations completed successfully"
    else
        log_error "Migrations failed"
        return 1
    fi
}

# Populate initial data (if needed)
populate_initial_data() {
    echo ""
    echo "[4/5] Checking for initial data population..."
    
    # Check if we need to populate data
    local row_count=$(psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM image_metadata" 2>/dev/null || echo "0")
    row_count=$(echo "$row_count" | tr -d '[:space:]')
    
    if [ "$row_count" = "0" ]; then
        log_warn "No data found. You may want to run populate_sample_data.py"
    else
        log_info "Database contains $row_count image records"
    fi
}

# Verify schema health
verify_schema() {
    echo ""
    echo "[5/5] Verifying schema health..."
    
    local checks_passed=0
    local checks_failed=0
    
    # Check critical tables
    local tables=("image_metadata" "video_metadata" "curation_queue" "curation_comments" "curation_actions" "alembic_version")
    
    for table in "${tables[@]}"; do
        if psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT 1 FROM $table LIMIT 1" > /dev/null 2>&1; then
            log_info "Table '$table' is accessible"
            checks_passed=$((checks_passed + 1))
        else
            log_error "Table '$table' is not accessible or doesn't exist"
            checks_failed=$((checks_failed + 1))
        fi
    done
    
    # Check critical columns
    declare -A columns=(
        ["video_metadata"]="poster_url thumbnail_url"
        ["curation_queue"]="content_type content_id"
    )
    
    for table in "${!columns[@]}"; do
        for column in ${columns[$table]}; do
            if psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -t -c "\
                SELECT 1 FROM information_schema.columns \
                WHERE table_name='$table' AND column_name='$column'" | grep -q 1; then
                log_info "Column '$table.$column' exists"
                checks_passed=$((checks_passed + 1))
            else
                log_error "Column '$table.$column' is missing"
                checks_failed=$((checks_failed + 1))
            fi
        done
    done
    
    echo ""
    echo "Verification: $checks_passed passed, $checks_failed failed"
    
    if [ $checks_failed -gt 0 ]; then
        return 1
    fi
    return 0
}

# Main execution
main() {
    wait_for_db || exit 1
    run_python_init || exit 1
    run_migrations || exit 1
    populate_initial_data
    
    echo ""
    echo "=========================================="
    if verify_schema; then
        echo "✓ DATABASE SETUP COMPLETE"
        echo "=========================================="
        echo ""
        echo "Database is ready for use!"
        exit 0
    else
        echo "⚠ DATABASE SETUP COMPLETE WITH WARNINGS"
        echo "=========================================="
        echo ""
        echo "Some schema checks failed. Review the logs above."
        exit 1
    fi
}

# Run main function
main

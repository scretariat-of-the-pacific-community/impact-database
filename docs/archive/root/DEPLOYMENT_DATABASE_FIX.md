# Deployment Guide - Database Setup

## Overview
This deployment includes automated database initialization and migration handling to prevent the errors you've been experiencing.

## Key Changes

### 1. **New Migration (025_fix_migration_conflicts.py)**
- Idempotent migration that fixes schema conflicts
- Checks for existing columns/tables before creating
- Handles the `poster_url` duplicate error
- Ensures `queue_id` references are correct
- Creates missing `curation_comments` and `curation_actions` tables

### 2. **Database Initialization Script (init_database.py)**
- Creates required database roles (`impact_user`, `oceanportal`)
- Enables PostgreSQL extensions (PostGIS, UUID, etc.)
- Initializes Alembic version tracking
- Grants proper permissions
- Verifies schema health

### 3. **Automated Setup Script (setup_database.sh)**
- Waits for database to be ready
- Runs initialization
- Executes Alembic migrations
- Verifies schema health
- Provides clear status reporting

### 4. **Frontend Role Fix**
- Updated `UserRole` type to match backend roles
- Removed `editor` role
- Added `reviewer`, `senior_reviewer`, `curator` roles
- Prevents "Invalid role 'editor'" errors

## Deployment Instructions

### For Fresh Deployment

```bash
# 1. Start with database initialization
./scripts/setup_database.sh

# 2. Start all services
docker-compose up -d

# 3. Verify
docker-compose logs -f api
```

### For Existing Deployment (Current Situation)

```bash
# 1. Stop all services
docker-compose down

# 2. Run database fixes (without dropping data)
docker-compose up -d postgis_db
docker-compose exec postgis_db python3 /scripts/init_database.py

# 3. Run migrations
docker-compose run --rm api bash -c "cd /app && alembic upgrade head"

# 4. Start all services
docker-compose up -d

# 5. Check logs
docker-compose logs -f api frontend
```

### Alternative: Complete Reset (if safe to do so)

```bash
# WARNING: This deletes all data
docker-compose down -v
docker-compose up -d
```

## Automated Startup

Use the new startup script that handles initialization:

```bash
./docker-start-with-init.sh
```

This script:
1. Starts database first
2. Runs initialization
3. Executes migrations
4. Starts all other services

## Migration Strategy

### Idempotent Migrations
All migrations now check for existence before creating:
- Tables: `CREATE TABLE IF NOT EXISTS`
- Columns: Check with `column_exists()` helper
- Indexes: Wrapped in try/except blocks
- Foreign keys: Check before adding

### Version Tracking
The `alembic_version` table is automatically created and initialized to the latest migration, preventing re-execution of old migrations.

## Common Issues Fixed

### 1. **"role 'oceanportal' does not exist"**
**Solution:** `init_database.py` creates all required roles

### 2. **"column 'poster_url' already exists"**
**Solution:** Migration 025 checks before adding columns

### 3. **"column 'queue_id' does not exist"**
**Solution:** Curation tables now use correct `queue_item_id` column name

### 4. **"Invalid role 'editor'"**
**Solution:** Frontend now uses correct backend role names

### 5. **"relation 'alembic_version' does not exist"**
**Solution:** `init_database.py` creates and initializes the table

## Environment Variables

Ensure these are set in your `.env` file:

```bash
# Database
DATABASE_HOST=postgis_db
DATABASE_PORT=5432
DATABASE_NAME=postgres
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres

# Optional: Custom passwords for database roles
IMPACT_USER_PASSWORD=impact_user_password
OCEANPORTAL_PASSWORD=oceanportal_password
```

## Verification Commands

### Check Database Schema
```bash
docker-compose exec postgis_db psql -U postgres -d postgres -c "\dt"
```

### Check Alembic Version
```bash
docker-compose exec api bash -c "cd /app && alembic current"
```

### Check Migration History
```bash
docker-compose exec api bash -c "cd /app && alembic history"
```

### Verify Roles
```bash
docker-compose exec postgis_db psql -U postgres -d postgres -c "\du"
```

### Check Critical Columns
```bash
docker-compose exec postgis_db psql -U postgres -d postgres -c "
  SELECT table_name, column_name 
  FROM information_schema.columns 
  WHERE table_name IN ('video_metadata', 'curation_queue', 'curation_comments') 
  ORDER BY table_name, column_name;
"
```

## Health Checks

The setup includes automated health checks:

### Database Health
```bash
./scripts/setup_database.sh
# Returns exit code 0 if healthy, 1 if issues found
```

### Manual Verification
```bash
# Check all services
docker-compose ps

# Check specific service logs
docker-compose logs postgis_db
docker-compose logs api
docker-compose logs frontend
```

## Rollback Strategy

If issues occur:

### Rollback Migrations
```bash
docker-compose exec api bash -c "cd /app && alembic downgrade -1"
```

### Check Current Version
```bash
docker-compose exec api bash -c "cd /app && alembic current"
```

### Downgrade to Specific Version
```bash
docker-compose exec api bash -c "cd /app && alembic downgrade <revision_id>"
```

## Production Deployment

For production, update your deployment pipeline:

```bash
# In your CI/CD pipeline
1. Build images
2. Start database service only
3. Run: docker-compose exec postgis_db python3 /scripts/init_database.py
4. Run: docker-compose run --rm api alembic upgrade head
5. Start remaining services
6. Run health checks
```

## Monitoring

Add these checks to your monitoring:

1. **Alembic Version**: Should match expected version
2. **Table Existence**: All critical tables present
3. **Role Existence**: Database roles created
4. **Migration Errors**: Check API logs for migration failures

## Future Migrations

When creating new migrations:

```python
# Always check before creating
def upgrade():
    if not column_exists('table_name', 'column_name'):
        op.add_column('table_name', sa.Column('column_name', ...))

def column_exists(table_name, column_name):
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns
```

## Support

If you encounter issues:

1. Check logs: `docker-compose logs -f`
2. Verify schema: Run verification commands above
3. Check migration status: `alembic current`
4. Review error messages in PostgreSQL logs

## Summary

All database issues have been resolved with:
- ✅ Idempotent migrations
- ✅ Automated role creation
- ✅ Schema verification
- ✅ Frontend/backend role alignment
- ✅ Proper initialization scripts
- ✅ Health check validation

# Quick Reference - Database Fix Commands

## Health Check
```bash
# Run complete health check
docker cp scripts/init_database.py impact-database_postgis_db_1:/tmp/
docker-compose exec -T postgis_db python3 /tmp/init_database.py

# Check migration version
docker-compose exec api bash -c "cd /app && alembic current"

# Check service status
docker-compose ps
```

## Expected Output
```
✓ DATABASE INITIALIZATION COMPLETE
Current: 026_merge_heads (head) (mergepoint)
All services: Up (healthy)
```

## If You See Errors

### "role 'oceanportal' does not exist"
```bash
docker-compose exec postgis_db python3 /tmp/init_database.py
```

### "column 'poster_url' already exists"
```bash
docker-compose exec api bash -c "cd /app && alembic stamp 026_merge_heads"
```

### "Multiple head revisions"
Already fixed - migration 026_merge_heads resolves this

### "Invalid role 'editor'"
Already fixed - frontend now uses correct roles: reviewer, senior_reviewer, curator

## Verification Commands
```bash
# Check roles exist
docker-compose exec postgis_db psql -U postgres -d postgres -c "\du" | grep -E "(oceanportal|impact_user)"

# Check critical columns
docker-compose exec postgis_db psql -U postgres -d postgres -c "
  SELECT column_name FROM information_schema.columns 
  WHERE table_name='video_metadata' AND column_name IN ('poster_url', 'thumbnail_url');"

# Check curation tables
docker-compose exec postgis_db psql -U postgres -d postgres -c "\dt" | grep curation
```

## Restart Services (if needed)
```bash
docker-compose restart
```

## Full Reset (DANGER: Loses data)
```bash
docker-compose down -v
docker-compose up -d
```

## Documentation
- Full details: [DATABASE_FIXES_COMPLETE_SUMMARY.md](DATABASE_FIXES_COMPLETE_SUMMARY.md)
- Deployment guide: [DEPLOYMENT_DATABASE_FIX.md](DEPLOYMENT_DATABASE_FIX.md)

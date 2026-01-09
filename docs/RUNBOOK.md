# Operations Runbook

Comprehensive guide for day-to-day operations, incident response, and maintenance procedures for Impact Database production systems.

## Table of Contents

- [Emergency Contacts](#emergency-contacts)
- [System Overview](#system-overview)
- [Common Operations](#common-operations)
- [Incident Response](#incident-response)
- [Backup & Restore](#backup--restore)
- [Performance Tuning](#performance-tuning)
- [Scaling Operations](#scaling-operations)
- [Log Management](#log-management)
- [Database Maintenance](#database-maintenance)
- [Security Procedures](#security-procedures)
- [Troubleshooting Guide](#troubleshooting-guide)

---

## Emergency Contacts

### On-Call Rotation

| Role | Primary | Secondary | Phone | Email |
|------|---------|-----------|-------|-------|
| DevOps Lead | TBD | TBD | TBD | ops@impactdb.org |
| Backend Engineer | TBD | TBD | TBD | backend@impactdb.org |
| Frontend Engineer | TBD | TBD | TBD | frontend@impactdb.org |
| DBA | TBD | TBD | TBD | dba@impactdb.org |

### Escalation Path

1. **P1 (Critical)**: Immediate escalation to on-call engineer → Team Lead (15 min) → CTO (30 min)
2. **P2 (High)**: On-call engineer → Team Lead (1 hour)
3. **P3 (Medium)**: On-call engineer handles → Report next business day
4. **P4 (Low)**: Ticket in backlog

---

## System Overview

### Architecture Components

```
Production Stack:
- Frontend: Next.js 16 (2-10 instances)
- Backend: FastAPI (3-20 instances)
- Database: PostgreSQL 14 + PostGIS
- Cache: Redis 7
- Storage: S3/MinIO
- Workers: Celery (2-5 workers)
- Queue: Redis
- Monitoring: Prometheus + Grafana
- Logging: CloudWatch/ELK Stack
- APM: Sentry
```

### Service URLs

- **Production**: https://impactdb.org
- **API**: https://api.impactdb.org
- **Admin**: https://admin.impactdb.org
- **Grafana**: https://grafana.impactdb.org
- **Sentry**: https://sentry.io/organizations/impact-db

### Key Metrics

- **Response Time**: p95 < 500ms
- **Uptime SLA**: 99.9%
- **Error Rate**: < 0.1%
- **Database Queries**: p95 < 100ms

---

## Common Operations

### 1. Deploying New Version

#### Blue-Green Deployment (Recommended)

```bash
# 1. Build new version
docker build -t backend:v2.0.0 ./app
docker build -t frontend:v2.0.0 ./frontend

# 2. Tag and push
docker tag backend:v2.0.0 registry.example.com/backend:v2.0.0
docker push registry.example.com/backend:v2.0.0

# 3. Deploy to green environment
kubectl set image deployment/backend backend=registry.example.com/backend:v2.0.0 -n impact-db-green

# 4. Wait for health checks
kubectl rollout status deployment/backend -n impact-db-green

# 5. Run smoke tests
./scripts/smoke-test.sh https://green.impactdb.org

# 6. Switch traffic (update load balancer)
kubectl patch service backend -n impact-db -p '{"spec":{"selector":{"version":"v2.0.0"}}}'

# 7. Monitor for 15 minutes
watch -n 5 'kubectl top pods -n impact-db'

# 8. If issues, rollback
kubectl rollout undo deployment/backend -n impact-db
```

#### Rolling Update

```bash
# Update image
kubectl set image deployment/backend backend=registry.example.com/backend:v2.0.0

# Monitor rollout
kubectl rollout status deployment/backend

# Pause if issues
kubectl rollout pause deployment/backend

# Resume
kubectl rollout resume deployment/backend

# Rollback
kubectl rollout undo deployment/backend
```

### 2. Scaling Services

#### Auto-Scaling (Recommended)

```bash
# Configure HPA (Horizontal Pod Autoscaler)
kubectl autoscale deployment backend \
  --cpu-percent=70 \
  --min=3 \
  --max=20

# Check status
kubectl get hpa
```

#### Manual Scaling

```bash
# Scale backend
kubectl scale deployment backend --replicas=10

# Scale frontend
kubectl scale deployment frontend --replicas=5

# AWS ECS
aws ecs update-service \
  --cluster impact-db-prod \
  --service backend \
  --desired-count 10
```

### 3. Certificate Renewal

```bash
# Check expiry
echo | openssl s_client -servername impactdb.org -connect impactdb.org:443 2>/dev/null | openssl x509 -noout -dates

# Renew (Let's Encrypt)
sudo certbot renew --dry-run
sudo certbot renew
sudo systemctl reload nginx

# AWS Certificate Manager (auto-renews)
aws acm describe-certificate --certificate-arn arn:aws:acm:...
```

### 4. Database Migrations

```bash
# 1. Create backup FIRST
pg_dump -h prod-db.example.com -U postgres impact_db > backup_pre_migration.sql

# 2. Test migration on staging
cd app
alembic upgrade head --sql > migration.sql
# Review migration.sql

# 3. Apply to production during maintenance window
alembic upgrade head

# 4. Verify
alembic current
alembic history

# 5. If rollback needed
alembic downgrade -1  # Go back one version
```

### 5. Cache Management

#### Clear Specific Cache Keys

```bash
# Connect to Redis
redis-cli -h prod-redis.example.com -p 6379

# List keys
KEYS user:*
KEYS activity:*

# Delete specific key
DEL user:123:profile

# Delete pattern
redis-cli --scan --pattern 'user:*' | xargs redis-cli DEL

# Flush entire cache (USE WITH CAUTION)
FLUSHDB
```

#### Warm Cache

```bash
# Pre-populate frequently accessed data
python scripts/warm_cache.py --keys=popular_activities,featured_images
```

### 6. Worker Management

#### Check Worker Status

```bash
# Celery workers
celery -A app.celery inspect active
celery -A app.celery inspect stats
celery -A app.celery inspect registered

# Kubernetes
kubectl get pods -l app=celery-worker
kubectl logs -f celery-worker-abc123
```

#### Scale Workers

```bash
# Increase workers
kubectl scale deployment celery-worker --replicas=5

# Check queue depth
redis-cli LLEN celery

# Purge queue (if stuck)
celery -A app.celery purge
```

#### Restart Workers

```bash
# Kubernetes
kubectl rollout restart deployment celery-worker

# Docker Compose
docker-compose restart celery-worker
```

---

## Incident Response

### P1: Production Down (Complete Outage)

**Symptoms**: 5xx errors, no response, health checks failing

**Immediate Actions** (5-10 minutes):

```bash
# 1. Check service status
kubectl get pods -n impact-db
kubectl describe pod <failing-pod>

# 2. Check recent deployments
kubectl rollout history deployment/backend

# 3. Immediate rollback if recent deploy
kubectl rollout undo deployment/backend

# 4. Check resource exhaustion
kubectl top nodes
kubectl top pods

# 5. Check logs
kubectl logs -f deployment/backend --tail=100

# 6. Scale up if resource issue
kubectl scale deployment backend --replicas=10

# 7. Check external dependencies
curl https://api.impactdb.org/health
psql -h db.example.com -U postgres -c "SELECT 1;"
redis-cli -h redis.example.com PING
```

**Investigation** (10-30 minutes):

```bash
# Check Sentry for errors
# Check Grafana dashboards
# Review CloudWatch logs
# Check database connections

# Database connection pool
SELECT count(*), state FROM pg_stat_activity GROUP BY state;

# Long-running queries
SELECT pid, now() - query_start AS duration, query
FROM pg_stat_activity
WHERE state = 'active' AND now() - query_start > interval '1 minute';
```

**Resolution**:
1. Identify root cause
2. Apply fix (rollback, scale, restart)
3. Verify health
4. Post-mortem within 24 hours

### P2: Degraded Performance

**Symptoms**: Slow response times, elevated latency

**Actions**:

```bash
# 1. Check response times
curl -w "@curl-format.txt" -o /dev/null -s https://api.impactdb.org/api/activities

# curl-format.txt:
#     time_namelookup:  %{time_namelookup}s\n
#        time_connect:  %{time_connect}s\n
#     time_appconnect:  %{time_appconnect}s\n
#    time_pretransfer:  %{time_pretransfer}s\n
#       time_redirect:  %{time_redirect}s\n
#  time_starttransfer:  %{time_starttransfer}s\n
#                     ----------\n
#          time_total:  %{time_total}s\n

# 2. Check database
SELECT * FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;

# 3. Check cache hit rate
redis-cli INFO stats | grep hit_rate

# 4. Check CPU/Memory
kubectl top pods

# 5. Scale if needed
kubectl autoscale deployment backend --cpu-percent=70 --min=5 --max=20
```

### P3: Partial Functionality Broken

**Symptoms**: Specific feature not working, some API endpoints failing

**Actions**:

```bash
# 1. Identify affected component
# Check error logs for specific endpoint

# 2. Check recent changes
git log --since="24 hours ago" --oneline

# 3. Rollback specific service
kubectl set image deployment/backend backend=previous-version

# 4. Or restart pod
kubectl delete pod <pod-name>  # Will auto-recreate
```

---

## Backup & Restore

### Database Backups

#### Automated Daily Backup

```bash
#!/bin/bash
# /opt/scripts/backup_database.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/database"
RETENTION_DAYS=30

# Create backup
pg_dump -h prod-db.example.com \
  -U postgres \
  -F c \
  -f "$BACKUP_DIR/impact_db_$DATE.dump" \
  impact_db

# Compress
gzip "$BACKUP_DIR/impact_db_$DATE.dump"

# Upload to S3
aws s3 cp "$BACKUP_DIR/impact_db_$DATE.dump.gz" \
  s3://impact-db-backups/database/impact_db_$DATE.dump.gz \
  --storage-class STANDARD_IA

# Cleanup old backups
find "$BACKUP_DIR" -name "impact_db_*.dump.gz" -mtime +$RETENTION_DAYS -delete

# Verify backup
if [ $? -eq 0 ]; then
  echo "Backup successful: impact_db_$DATE.dump.gz"
else
  echo "Backup failed!" | mail -s "BACKUP FAILED" ops@impactdb.org
fi
```

**Cron Schedule**:
```bash
# Daily at 3 AM
0 3 * * * /opt/scripts/backup_database.sh >> /var/log/backup.log 2>&1
```

#### Manual Backup Before Major Changes

```bash
# Full backup
pg_dump -h prod-db.example.com -U postgres -F c impact_db > backup_$(date +%Y%m%d).dump

# Specific table
pg_dump -h prod-db.example.com -U postgres -t images impact_db > images_backup.sql

# Schema only
pg_dump -h prod-db.example.com -U postgres --schema-only impact_db > schema.sql
```

### Restore Database

#### Full Restore

```bash
# 1. Stop application
kubectl scale deployment backend --replicas=0
kubectl scale deployment celery-worker --replicas=0

# 2. Drop and recreate database
psql -h prod-db.example.com -U postgres -c "DROP DATABASE impact_db;"
psql -h prod-db.example.com -U postgres -c "CREATE DATABASE impact_db;"

# 3. Restore
pg_restore -h prod-db.example.com \
  -U postgres \
  -d impact_db \
  -v backup_20240115.dump

# 4. Verify
psql -h prod-db.example.com -U postgres impact_db -c "\dt"
psql -h prod-db.example.com -U postgres impact_db -c "SELECT COUNT(*) FROM images;"

# 5. Restart application
kubectl scale deployment backend --replicas=3
kubectl scale deployment celery-worker --replicas=2
```

#### Point-in-Time Recovery (PITR)

```bash
# AWS RDS
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier impact-db-prod \
  --target-db-instance-identifier impact-db-restored \
  --restore-time 2024-01-15T03:00:00Z
```

### File Storage Backups

```bash
# Sync to backup bucket
aws s3 sync s3://impact-db-images-prod s3://impact-db-images-backup \
  --storage-class GLACIER_IR

# Restore specific file
aws s3 cp s3://impact-db-images-backup/uploads/image123.jpg \
  s3://impact-db-images-prod/uploads/image123.jpg
```

---

## Performance Tuning

### Database Optimization

#### Identify Slow Queries

```sql
-- Enable pg_stat_statements
CREATE EXTENSION pg_stat_statements;

-- Top 10 slowest queries
SELECT
  mean_exec_time,
  calls,
  query
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Most frequent queries
SELECT
  calls,
  mean_exec_time,
  query
FROM pg_stat_statements
ORDER BY calls DESC
LIMIT 10;
```

#### Add Missing Indexes

```sql
-- Find missing indexes
SELECT
  schemaname,
  tablename,
  attname,
  n_distinct,
  correlation
FROM pg_stats
WHERE schemaname = 'public'
  AND n_distinct > 100
  AND correlation < 0.5;

-- Create indexes
CREATE INDEX CONCURRENTLY idx_images_location ON images USING GIST(location);
CREATE INDEX CONCURRENTLY idx_activities_date ON activities(created_at DESC);
CREATE INDEX CONCURRENTLY idx_users_email ON users(email);
```

#### Vacuum and Analyze

```bash
# Manual vacuum
psql -h prod-db.example.com -U postgres impact_db -c "VACUUM ANALYZE;"

# Vacuum specific table
psql -h prod-db.example.com -U postgres impact_db -c "VACUUM ANALYZE images;"

# Check bloat
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
  n_dead_tup
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC;
```

#### Connection Pooling

```python
# SQLAlchemy settings
SQLALCHEMY_POOL_SIZE = 20
SQLALCHEMY_MAX_OVERFLOW = 10
SQLALCHEMY_POOL_TIMEOUT = 30
SQLALCHEMY_POOL_RECYCLE = 3600
```

### Application Performance

#### Enable Query Caching

```python
from functools import lru_cache
from redis import Redis

redis_client = Redis(host='redis', port=6379)

@lru_cache(maxsize=1000)
def get_popular_activities():
    """Cache popular activities"""
    cached = redis_client.get('popular_activities')
    if cached:
        return json.loads(cached)

    # Fetch from database
    activities = db.query(Activity).filter_by(featured=True).limit(10).all()
    redis_client.setex('popular_activities', 3600, json.dumps(activities))
    return activities
```

#### Optimize Image Delivery

```bash
# Use CloudFront/CDN
aws cloudfront create-distribution \
  --origin-domain-name impact-db-images-prod.s3.amazonaws.com \
  --default-cache-behavior MinTTL=86400,MaxTTL=31536000

# Generate thumbnails on upload
# (See app/services/image_service.py)
```

### Frontend Performance

```typescript
// Implement pagination
const ITEMS_PER_PAGE = 20;

// Use React.memo for expensive components
const ActivityCard = React.memo(({ activity }) => {
  // Component logic
});

// Lazy load images
<Image
  src={imageUrl}
  loading="lazy"
  placeholder="blur"
/>

// Code splitting
const MapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => <LoadingSpinner />
});
```

---

## Scaling Operations

### Horizontal Scaling

#### Scale Backend API

```bash
# Manual scale
kubectl scale deployment backend --replicas=10

# Auto-scale based on CPU
kubectl autoscale deployment backend \
  --cpu-percent=70 \
  --min=3 \
  --max=20

# Auto-scale based on custom metrics (requests per second)
kubectl autoscale deployment backend \
  --metric-name=requests_per_second \
  --target-average-value=1000 \
  --min=3 \
  --max=20
```

#### Scale Celery Workers

```bash
# Scale workers
kubectl scale deployment celery-worker --replicas=5

# Monitor queue depth
watch -n 5 'redis-cli LLEN celery'

# Auto-scale based on queue depth
# (Requires custom metrics)
```

### Vertical Scaling

#### Increase Container Resources

```yaml
# k8s/backend-deployment.yaml
resources:
  requests:
    memory: "2Gi"  # Increased from 1Gi
    cpu: "1000m"   # Increased from 500m
  limits:
    memory: "4Gi"  # Increased from 2Gi
    cpu: "2000m"   # Increased from 1000m
```

#### Upgrade Database Instance

```bash
# AWS RDS
aws rds modify-db-instance \
  --db-instance-identifier impact-db-prod \
  --db-instance-class db.r5.xlarge \
  --apply-immediately
```

### Read Replicas

```bash
# Create read replica
aws rds create-db-instance-read-replica \
  --db-instance-identifier impact-db-read-replica \
  --source-db-instance-identifier impact-db-prod \
  --db-instance-class db.r5.large

# Route read queries to replica
# Update connection string for read-only operations
READ_DATABASE_URL=postgresql://postgres:pass@read-replica.example.com:5432/impact_db
```

---

## Log Management

### Log Rotation

#### Application Logs

```bash
# /etc/logrotate.d/impact-db
/var/log/impact-db/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 644 www-data www-data
    sharedscripts
    postrotate
        systemctl reload nginx
    endscript
}
```

#### Test Log Rotation

```bash
sudo logrotate -f /etc/logrotate.d/impact-db
```

### Centralized Logging

#### Ship Logs to CloudWatch

```python
# app/core/logging.py
import watchtower
import logging

logger = logging.getLogger(__name__)
logger.addHandler(watchtower.CloudWatchLogHandler(
    log_group='/aws/ecs/impact-db',
    stream_name='backend'
))
```

#### Query Logs

```bash
# AWS CloudWatch Insights
aws logs start-query \
  --log-group-name /aws/ecs/impact-db \
  --start-time $(date -u -d '1 hour ago' +%s) \
  --end-time $(date -u +%s) \
  --query-string 'fields @timestamp, @message | filter @message like /ERROR/ | sort @timestamp desc | limit 20'
```

### Log Analysis

```bash
# Find errors
kubectl logs -l app=backend | grep ERROR

# Count errors by type
kubectl logs -l app=backend | grep ERROR | awk '{print $5}' | sort | uniq -c | sort -rn

# Follow logs from all pods
kubectl logs -f -l app=backend --all-containers=true

# Export logs
kubectl logs deployment/backend --since=24h > backend_logs.txt
```

---

## Database Maintenance

### Regular Maintenance Tasks

#### Weekly Maintenance

```sql
-- Vacuum and analyze
VACUUM ANALYZE;

-- Update statistics
ANALYZE;

-- Reindex if needed
REINDEX TABLE images;
REINDEX TABLE activities;
```

#### Monthly Maintenance

```sql
-- Check for bloat
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Full vacuum (requires downtime)
VACUUM FULL ANALYZE;
```

### Database Health Checks

```sql
-- Check replication lag
SELECT
  client_addr,
  state,
  sent_lsn,
  write_lsn,
  flush_lsn,
  replay_lsn,
  sync_state
FROM pg_stat_replication;

-- Check lock contention
SELECT
  locktype,
  relation::regclass,
  mode,
  granted
FROM pg_locks
WHERE NOT granted;

-- Check cache hit ratio (should be > 99%)
SELECT
  sum(heap_blks_read) as heap_read,
  sum(heap_blks_hit) as heap_hit,
  sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)) as ratio
FROM pg_statio_user_tables;
```

### Partition Management

```sql
-- Create new partition for next month
CREATE TABLE images_2024_02 PARTITION OF images
FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');

-- Drop old partitions
DROP TABLE images_2023_01;
```

---

## Security Procedures

### Credential Rotation

```bash
# 1. Generate new credentials
NEW_PASSWORD=$(openssl rand -base64 32)

# 2. Update in secrets manager
aws secretsmanager update-secret \
  --secret-id impact-db/database-password \
  --secret-string "$NEW_PASSWORD"

# 3. Update database
psql -h prod-db.example.com -U postgres -c "ALTER USER app_user WITH PASSWORD '$NEW_PASSWORD';"

# 4. Restart applications to pick up new credentials
kubectl rollout restart deployment/backend

# 5. Verify connectivity
kubectl exec -it deployment/backend -- python -c "from app.db import engine; print(engine.execute('SELECT 1').scalar())"
```

### Security Auditing

```bash
# Check for vulnerabilities
trivy image registry.example.com/backend:latest

# Audit npm packages
cd frontend && npm audit

# Audit Python packages
cd app && pip-audit

# Check SSL configuration
ssllabs-scan --quiet impactdb.org
```

### Access Control

```bash
# Review IAM policies
aws iam list-attached-role-policies --role-name ImpactDBBackendRole

# Review Kubernetes RBAC
kubectl get rolebindings -n impact-db
kubectl describe rolebinding backend-role -n impact-db
```

---

## Troubleshooting Guide

### High CPU Usage

**Diagnosis**:
```bash
# Check pod CPU
kubectl top pods -n impact-db

# Check node CPU
kubectl top nodes

# Identify process
kubectl exec -it pod-name -- top
```

**Solutions**:
1. Scale horizontally: `kubectl scale deployment backend --replicas=10`
2. Optimize slow queries (see Performance Tuning)
3. Enable caching
4. Upgrade to larger instance types

### High Memory Usage

**Diagnosis**:
```bash
# Check memory usage
kubectl top pods

# Check for memory leaks
kubectl exec -it pod-name -- cat /proc/meminfo
```

**Solutions**:
1. Increase memory limits
2. Check for connection leaks
3. Reduce connection pool size
4. Enable garbage collection

### Database Connection Pool Exhausted

**Symptoms**: `connection pool exhausted` errors

**Diagnosis**:
```sql
SELECT count(*) FROM pg_stat_activity WHERE datname = 'impact_db';
```

**Solutions**:
```python
# Increase pool size
SQLALCHEMY_POOL_SIZE = 30
SQLALCHEMY_MAX_OVERFLOW = 20

# Or reduce connection lifetime
SQLALCHEMY_POOL_RECYCLE = 1800
```

### Redis Out of Memory

**Diagnosis**:
```bash
redis-cli INFO memory
```

**Solutions**:
```bash
# Set max memory policy
redis-cli CONFIG SET maxmemory-policy allkeys-lru

# Clear cache
redis-cli FLUSHDB

# Upgrade instance size
```

### Failed Deployments

**Diagnosis**:
```bash
kubectl describe pod failing-pod-name
kubectl logs failing-pod-name --previous
```

**Common Issues**:
1. Image pull errors → Check registry credentials
2. CrashLoopBackOff → Check application logs
3. ImagePullBackOff → Verify image exists
4. Insufficient resources → Scale down or upgrade nodes

### SSL Certificate Expiration

**Diagnosis**:
```bash
echo | openssl s_client -servername impactdb.org -connect impactdb.org:443 2>/dev/null | openssl x509 -noout -dates
```

**Solutions**:
```bash
# Renew Let's Encrypt
sudo certbot renew

# Or request new certificate
sudo certbot certonly --nginx -d impactdb.org -d www.impactdb.org
```

---

## Maintenance Windows

### Scheduled Maintenance

**Frequency**: First Sunday of every month, 2:00 AM - 4:00 AM UTC

**Procedure**:

```bash
# 1. Notify users (48 hours advance)
# Send email, post banner on website

# 2. Create maintenance branch
git checkout -b maintenance/2024-01-07

# 3. Take backups
./scripts/backup_all.sh

# 4. Put site in maintenance mode
kubectl apply -f k8s/maintenance-mode.yaml

# 5. Perform maintenance
# - Database migrations
# - Security updates
# - Performance optimizations

# 6. Run smoke tests
./scripts/smoke-test.sh

# 7. Take site out of maintenance mode
kubectl delete -f k8s/maintenance-mode.yaml

# 8. Monitor for 1 hour
watch -n 30 'kubectl get pods && kubectl top pods'

# 9. Send completion notification
```

---

## Post-Incident Review Template

After every P1/P2 incident, complete a post-mortem within 24 hours:

```markdown
# Incident Post-Mortem: [TITLE]

**Date**: YYYY-MM-DD
**Duration**: [Start Time] - [End Time] (X hours)
**Severity**: P1/P2/P3
**Impact**: [Number of users affected, downtime duration]

## Timeline
- [Time]: Incident detected
- [Time]: On-call engineer paged
- [Time]: Root cause identified
- [Time]: Fix applied
- [Time]: Service restored

## Root Cause
[Detailed explanation]

## Resolution
[What was done to fix]

## Action Items
- [ ] [Action 1] - Owner: [Name] - Due: [Date]
- [ ] [Action 2] - Owner: [Name] - Due: [Date]

## Lessons Learned
[What went well, what could be improved]
```

---

*For deployment procedures, see [DEPLOYMENT.md](DEPLOYMENT.md)*

*Last updated: January 2026*

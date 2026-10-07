# Database Backup & Recovery Guide

## Overview

This guide covers automated database backup and recovery procedures for the Impact Database. Regular backups are **critical** for:

- 🔒 Data protection against hardware failures
- 🔄 Recovery from accidental data deletion
- 🚀 Migration to new infrastructure
- 📊 Compliance with data retention policies
- 🧪 Creating test/staging environments

---

## Quick Start

### 1. Install the Backup Script

The backup script is located at `/scripts/backup_database.sh`

```bash
# Make executable (already done in repo)
chmod +x scripts/backup_database.sh

# Test backup
./scripts/backup_database.sh

# Backup with S3 upload
./scripts/backup_database.sh --s3
```

### 2. Configure Environment Variables

Add to your `.env` or `.env.production`:

```bash
# Backup Configuration
BACKUP_DIR=/var/backups/impact-database
BACKUP_RETENTION_DAYS=30

# S3 Configuration (optional but recommended)
BACKUP_S3_BUCKET=your-backup-bucket
BACKUP_S3_REGION=us-east-1
BACKUP_S3_ACCESS_KEY=your-access-key
BACKUP_S3_SECRET_KEY=your-secret-key

# Encryption (optional)
ENCRYPT_BACKUPS=true
GPG_RECIPIENT=admin@yourdomain.com

# Notifications (optional)
ALERT_EMAIL=admin@yourdomain.com
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

### 3. Set Up Automated Backups

Add to crontab for daily backups at 2 AM:

```bash
# Edit crontab
crontab -e

# Add this line (adjust path as needed)
0 2 * * * /path/to/impact-database/scripts/backup_database.sh --s3 >> /var/log/impact-db-backup.log 2>&1
```

**Alternative schedules:**

```bash
# Every 6 hours
0 */6 * * * /path/to/backup_database.sh --s3

# Daily at 3 AM
0 3 * * * /path/to/backup_database.sh --s3

# Weekly on Sunday at 2 AM
0 2 * * 0 /path/to/backup_database.sh --s3

# Monthly on 1st at 2 AM
0 2 1 * * /path/to/backup_database.sh --s3
```

---

## Backup Types

### 1. Local Backup (Default)

Stores compressed SQL dumps locally.

```bash
./scripts/backup_database.sh
```

**Pros:**
- ✅ Fast backup and restore
- ✅ No external dependencies
- ✅ No additional costs

**Cons:**
- ❌ Vulnerable to server failures
- ❌ Limited by local disk space
- ❌ No offsite redundancy

### 2. S3 Backup (Recommended)

Uploads backups to Amazon S3 or S3-compatible storage.

```bash
./scripts/backup_database.sh --s3
```

**Pros:**
- ✅ Offsite redundancy
- ✅ Unlimited scalability
- ✅ Automated lifecycle policies
- ✅ High durability (99.999999999%)

**Cons:**
- ❌ Requires AWS account
- ❌ Transfer costs
- ❌ Slightly slower restore

### 3. Encrypted Backup (Optional)

Encrypts backups using GPG before storage.

```bash
export ENCRYPT_BACKUPS=true
export GPG_RECIPIENT=admin@yourdomain.com
./scripts/backup_database.sh --s3
```

**Use cases:**
- ✅ Compliance requirements (GDPR, HIPAA)
- ✅ Storing in untrusted locations
- ✅ Additional security layer

---

## Restore Procedures

### Restore from Latest Backup

```bash
./scripts/backup_database.sh --restore latest
```

### Restore from Specific Backup

```bash
# List available backups
./scripts/backup_database.sh --list

# Restore specific file
./scripts/backup_database.sh --restore /var/backups/impact-database/impact_db_backup_20241218_020000.sql.gz
```

### Restore from S3

```bash
# Download from S3
aws s3 cp s3://your-backup-bucket/backups/impact_db_backup_20241218_020000.sql.gz /tmp/

# Restore
./scripts/backup_database.sh --restore /tmp/impact_db_backup_20241218_020000.sql.gz
```

### Manual Restore

```bash
# Decompress and restore
gunzip -c backup_file.sql.gz | docker exec -i impact-database-postgis_db-1 psql -U postgres -d impact_db

# Or if using Docker Compose
gunzip -c backup_file.sql.gz | docker compose exec -T postgis_db psql -U postgres -d impact_db
```

### Restore Encrypted Backup

```bash
# Decrypt and restore
gpg --decrypt backup_file.sql.gz.gpg | gunzip | docker exec -i impact-database-postgis_db-1 psql -U postgres -d impact_db
```

---

## S3 Setup

### 1. Create S3 Bucket

```bash
# Using AWS CLI
aws s3 mb s3://impact-database-backups --region us-east-1

# Set versioning (recommended)
aws s3api put-bucket-versioning \
    --bucket impact-database-backups \
    --versioning-configuration Status=Enabled

# Enable encryption
aws s3api put-bucket-encryption \
    --bucket impact-database-backups \
    --server-side-encryption-configuration '{
        "Rules": [{
            "ApplyServerSideEncryptionByDefault": {
                "SSEAlgorithm": "AES256"
            }
        }]
    }'
```

### 2. Configure IAM Policy

Create an IAM user with this policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:ListBucket",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::impact-database-backups",
        "arn:aws:s3:::impact-database-backups/*"
      ]
    }
  ]
}
```

### 3. Configure AWS CLI

```bash
aws configure
# Enter Access Key ID
# Enter Secret Access Key
# Enter Region: us-east-1
# Enter Output format: json
```

### 4. Set Up Lifecycle Policy (Cost Optimization)

```bash
aws s3api put-bucket-lifecycle-configuration \
    --bucket impact-database-backups \
    --lifecycle-configuration '{
        "Rules": [{
            "Id": "Move to Glacier after 30 days",
            "Status": "Enabled",
            "Transitions": [{
                "Days": 30,
                "StorageClass": "GLACIER"
            }],
            "Expiration": {
                "Days": 365
            }
        }]
    }'
```

**Cost breakdown:**
- S3 Standard: $0.023/GB/month
- S3 Standard-IA: $0.0125/GB/month (used by script)
- S3 Glacier: $0.004/GB/month (after 30 days)

---

## Backup Verification

### 1. Automated Verification

The backup script automatically verifies gzip integrity:

```bash
# This is done automatically
gzip -t backup_file.sql.gz
```

### 2. Test Restore (Monthly Recommended)

```bash
# Create test database
docker exec impact-database-postgis_db-1 createdb -U postgres test_restore

# Restore to test database
gunzip -c backup_file.sql.gz | docker exec -i impact-database-postgis_db-1 psql -U postgres -d test_restore

# Verify data
docker exec impact-database-postgis_db-1 psql -U postgres -d test_restore -c "SELECT COUNT(*) FROM image_metadata;"

# Cleanup
docker exec impact-database-postgis_db-1 dropdb -U postgres test_restore
```

### 3. Backup Monitoring Script

Create `/scripts/monitor_backups.sh`:

```bash
#!/bin/bash

BACKUP_DIR=/var/backups/impact-database
MAX_AGE_HOURS=26  # Alert if no backup in 26 hours
ALERT_EMAIL=admin@yourdomain.com

LATEST_BACKUP=$(ls -t $BACKUP_DIR/impact_db_backup_*.sql.gz 2>/dev/null | head -1)

if [ -z "$LATEST_BACKUP" ]; then
    echo "No backups found!" | mail -s "CRITICAL: No Database Backups" $ALERT_EMAIL
    exit 1
fi

AGE_SECONDS=$(( $(date +%s) - $(stat -c %Y "$LATEST_BACKUP") ))
AGE_HOURS=$(( AGE_SECONDS / 3600 ))

if [ $AGE_HOURS -gt $MAX_AGE_HOURS ]; then
    echo "Latest backup is $AGE_HOURS hours old" | mail -s "WARNING: Backup Age Alert" $ALERT_EMAIL
fi
```

Add to crontab:

```bash
0 */4 * * * /path/to/monitor_backups.sh
```

---

## Disaster Recovery Scenarios

### Scenario 1: Accidental Data Deletion

**Problem:** User accidentally deleted important records.

**Solution:**

```bash
# 1. Stop application to prevent further changes
docker compose stop api frontend

# 2. Restore from latest backup
./scripts/backup_database.sh --restore latest

# 3. Restart application
docker compose start api frontend

# 4. Verify data is restored
curl http://localhost:8000/api/v1/images
```

### Scenario 2: Database Corruption

**Problem:** Database files are corrupted, PostgreSQL won't start.

**Solution:**

```bash
# 1. Stop all services
docker compose down

# 2. Remove corrupted database volume
docker volume rm impact-database_postgres_data

# 3. Restart database
docker compose up -d postgis_db

# 4. Wait for database to initialize
sleep 10

# 5. Restore from backup
./scripts/backup_database.sh --restore latest

# 6. Restart all services
docker compose up -d
```

### Scenario 3: Server Hardware Failure

**Problem:** Primary server failed, need to migrate to new server.

**Solution:**

```bash
# On new server:

# 1. Clone repository and set up
git clone https://github.com/yourusername/impact-database.git
cd impact-database

# 2. Configure environment
cp .env.example .env
# Edit .env with production values

# 3. Start services
docker compose up -d

# 4. Download backup from S3
aws s3 cp s3://your-backup-bucket/backups/latest_backup.sql.gz /tmp/

# 5. Restore
./scripts/backup_database.sh --restore /tmp/latest_backup.sql.gz

# 6. Update DNS to point to new server

# 7. Verify application works
curl https://yourdomain.com/api/v1/health
```

### Scenario 4: Ransomware Attack

**Problem:** Files encrypted by ransomware.

**Solution:**

```bash
# 1. Immediately disconnect from network
sudo ifconfig eth0 down

# 2. Take snapshot/image of compromised system (for forensics)

# 3. Build clean server from trusted source

# 4. Restore from backup BEFORE ransomware infection
# Check backup dates carefully!
./scripts/backup_database.sh --list

# 5. Restore from pre-infection backup
./scripts/backup_database.sh --restore /var/backups/.../backup_BEFORE_INFECTION.sql.gz

# 6. Scan for vulnerabilities before going live

# 7. Update all passwords and secrets

# 8. Monitor for suspicious activity
```

---

## Backup Best Practices

### 1. 3-2-1 Backup Rule

- ✅ **3** copies of data (original + 2 backups)
- ✅ **2** different storage types (local + S3)
- ✅ **1** offsite backup (S3 in different region)

### 2. Backup Schedule Recommendations

| Database Size | Change Frequency | Recommended Schedule |
|--------------|------------------|---------------------|
| < 1 GB | Low | Daily |
| < 10 GB | Medium | Every 6 hours |
| < 100 GB | High | Every 3 hours |
| > 100 GB | High | Continuous (streaming) |

### 3. Retention Policy

Recommended retention schedule:

```bash
# Daily backups: Keep 7 days
# Weekly backups: Keep 4 weeks
# Monthly backups: Keep 12 months
# Yearly backups: Keep 7 years (compliance)
```

Implement with:

```bash
# Daily - already implemented (30 days)
0 2 * * * /path/to/backup_database.sh --s3

# Weekly - keep in separate folder
0 2 * * 0 /path/to/backup_database.sh --s3 && \
  cp /var/backups/impact-database/latest.sql.gz /var/backups/weekly/

# Monthly - keep in separate folder
0 2 1 * * /path/to/backup_database.sh --s3 && \
  cp /var/backups/impact-database/latest.sql.gz /var/backups/monthly/
```

### 4. Security Best Practices

- ✅ Encrypt backups at rest and in transit
- ✅ Restrict backup access with IAM policies
- ✅ Use separate AWS account for backup storage
- ✅ Enable MFA delete on S3 bucket
- ✅ Log all backup/restore operations
- ✅ Regular restore testing (monthly minimum)
- ✅ Store recovery procedures offline
- ✅ Maintain backup of backup scripts

---

## Monitoring & Alerting

### 1. Set Up CloudWatch Alarms (AWS)

```bash
aws cloudwatch put-metric-alarm \
    --alarm-name impact-database-backup-age \
    --alarm-description "Alert if no backup in 48 hours" \
    --metric-name BackupAge \
    --namespace CustomMetrics \
    --statistic Average \
    --period 3600 \
    --threshold 48 \
    --comparison-operator GreaterThanThreshold \
    --evaluation-periods 1 \
    --alarm-actions arn:aws:sns:us-east-1:123456789:backup-alerts
```

### 2. Backup Dashboard

Key metrics to monitor:

- 📊 Last successful backup timestamp
- 📊 Backup size trend over time
- 📊 Backup duration
- 📊 Failed backup count
- 📊 S3 storage costs
- 📊 Time to restore (RTO)

### 3. Alerts to Configure

- ⚠️ No backup in 26 hours (daily schedule)
- ⚠️ Backup size increased >50% (potential data issue)
- ⚠️ Backup failed 3 times in a row
- ⚠️ S3 upload failed
- ⚠️ Disk space low (<20% free)

---

## Troubleshooting

### Backup Fails with "Permission Denied"

```bash
# Fix backup directory permissions
sudo chown -R $USER:$USER /var/backups/impact-database
chmod 700 /var/backups/impact-database
```

### S3 Upload Fails

```bash
# Check AWS credentials
aws sts get-caller-identity

# Test S3 access
aws s3 ls s3://your-backup-bucket

# Check network connectivity
curl -I https://s3.amazonaws.com
```

### Restore Fails with "Database does not exist"

```bash
# Create database first
docker exec impact-database-postgis_db-1 createdb -U postgres impact_db

# Then restore
./scripts/backup_database.sh --restore latest
```

### Out of Disk Space

```bash
# Check disk usage
df -h

# Clean old backups manually
find /var/backups/impact-database -name "*.sql.gz" -mtime +7 -delete

# Move backups to S3 and delete local
./scripts/backup_database.sh --s3
find /var/backups/impact-database -name "*.sql.gz" -mtime +1 -delete
```

---

## Backup Script Reference

### Commands

```bash
# Create local backup
./scripts/backup_database.sh

# Create backup and upload to S3
./scripts/backup_database.sh --s3

# List all backups
./scripts/backup_database.sh --list

# Restore from latest
./scripts/backup_database.sh --restore latest

# Restore from specific file
./scripts/backup_database.sh --restore /path/to/backup.sql.gz

# Show help
./scripts/backup_database.sh --help
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BACKUP_DIR` | Local backup directory | `/var/backups/impact-database` |
| `BACKUP_RETENTION_DAYS` | Days to keep backups | `30` |
| `BACKUP_S3_BUCKET` | S3 bucket name | - |
| `BACKUP_S3_REGION` | S3 region | `us-east-1` |
| `ENCRYPT_BACKUPS` | Enable encryption | `false` |
| `GPG_RECIPIENT` | GPG recipient email | - |
| `ALERT_EMAIL` | Email for notifications | - |
| `SLACK_WEBHOOK_URL` | Slack webhook URL | - |

---

## Next Steps

1. ✅ Test backup script manually
2. ✅ Configure S3 bucket and credentials
3. ✅ Set up automated backups in crontab
4. ✅ Test restore procedure
5. ✅ Configure monitoring and alerts
6. ✅ Document recovery procedures
7. ✅ Schedule regular restore tests
8. ✅ Train team on recovery procedures

---

**Document Version:** 1.0
**Last Updated:** December 18, 2025
**Maintained By:** DevOps Team

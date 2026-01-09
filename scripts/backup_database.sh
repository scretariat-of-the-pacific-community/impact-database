#!/bin/bash

# ============================================================================
# Impact Database - Automated Backup Script
# ============================================================================
#
# This script performs automated backups of the PostgreSQL database
# with optional S3 upload, encryption, and retention management.
#
# Usage:
#   ./backup_database.sh                    # Local backup only
#   ./backup_database.sh --s3               # Local + S3 backup
#   ./backup_database.sh --restore latest   # Restore latest backup
#
# Requirements:
#   - Docker and docker compose installed
#   - AWS CLI configured (for S3 backups)
#   - GPG installed (for encryption)
#
# Setup:
#   1. Make executable: chmod +x backup_database.sh
#   2. Configure variables below
#   3. Add to crontab: 0 2 * * * /path/to/backup_database.sh --s3
#
# ============================================================================

set -euo pipefail

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/var/backups/impact-database}"
DB_CONTAINER="${DB_CONTAINER:-impact-database-postgis_db-1}"
DB_NAME="${POSTGRES_DB:-impact_db}"
DB_USER="${POSTGRES_USER:-postgres}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="impact_db_backup_${TIMESTAMP}.sql.gz"
LOG_FILE="${BACKUP_DIR}/backup.log"

# S3 Configuration (optional)
S3_BUCKET="${BACKUP_S3_BUCKET:-}"
S3_REGION="${BACKUP_S3_REGION:-us-east-1}"

# Encryption (optional)
ENCRYPT_BACKUPS="${ENCRYPT_BACKUPS:-false}"
GPG_RECIPIENT="${GPG_RECIPIENT:-admin@yourdomain.com}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ============================================================================
# Helper Functions
# ============================================================================

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" | tee -a "$LOG_FILE" >&2
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1" | tee -a "$LOG_FILE"
}

check_prerequisites() {
    log "Checking prerequisites..."

    # Check if backup directory exists
    if [ ! -d "$BACKUP_DIR" ]; then
        mkdir -p "$BACKUP_DIR"
        log "Created backup directory: $BACKUP_DIR"
    fi

    # Check if Docker container is running
    if ! docker ps | grep -q "$DB_CONTAINER"; then
        error "Database container '$DB_CONTAINER' is not running"
        exit 1
    fi

    # Check S3 prerequisites if S3 backup is requested
    if [ "$UPLOAD_S3" = true ]; then
        if [ -z "$S3_BUCKET" ]; then
            error "S3_BUCKET not configured"
            exit 1
        fi
        if ! command -v aws &> /dev/null; then
            error "AWS CLI not installed"
            exit 1
        fi
    fi

    # Check encryption prerequisites
    if [ "$ENCRYPT_BACKUPS" = true ]; then
        if ! command -v gpg &> /dev/null; then
            error "GPG not installed"
            exit 1
        fi
    fi

    log "All prerequisites met"
}

# ============================================================================
# Backup Functions
# ============================================================================

create_backup() {
    log "Starting database backup..."

    local backup_path="${BACKUP_DIR}/${BACKUP_FILE}"

    # Create database dump
    if docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$backup_path"; then
        log "Database backup created: $backup_path"

        # Get file size
        local size=$(du -h "$backup_path" | cut -f1)
        log "Backup size: $size"

        # Encrypt if enabled
        if [ "$ENCRYPT_BACKUPS" = true ]; then
            encrypt_backup "$backup_path"
        fi

        # Upload to S3 if enabled
        if [ "$UPLOAD_S3" = true ]; then
            upload_to_s3 "$backup_path"
        fi

        # Verify backup
        verify_backup "$backup_path"

        return 0
    else
        error "Failed to create database backup"
        return 1
    fi
}

encrypt_backup() {
    local backup_path="$1"
    log "Encrypting backup..."

    if gpg --encrypt --recipient "$GPG_RECIPIENT" "$backup_path"; then
        log "Backup encrypted: ${backup_path}.gpg"
        rm "$backup_path"
        log "Removed unencrypted backup"
    else
        error "Failed to encrypt backup"
    fi
}

verify_backup() {
    local backup_path="$1"
    log "Verifying backup integrity..."

    if gzip -t "$backup_path" 2>/dev/null; then
        log "Backup verification successful"
    else
        error "Backup verification failed - file may be corrupted!"
        return 1
    fi
}

upload_to_s3() {
    local backup_path="$1"
    local s3_path="s3://${S3_BUCKET}/backups/$(basename "$backup_path")"

    log "Uploading backup to S3: $s3_path"

    if aws s3 cp "$backup_path" "$s3_path" --region "$S3_REGION" --storage-class STANDARD_IA; then
        log "Backup uploaded to S3 successfully"

        # Upload encrypted version if it exists
        if [ -f "${backup_path}.gpg" ]; then
            aws s3 cp "${backup_path}.gpg" "${s3_path}.gpg" --region "$S3_REGION" --storage-class STANDARD_IA
            log "Encrypted backup uploaded to S3"
        fi
    else
        error "Failed to upload backup to S3"
        return 1
    fi
}

# ============================================================================
# Retention Management
# ============================================================================

cleanup_old_backups() {
    log "Cleaning up backups older than $RETENTION_DAYS days..."

    # Local cleanup
    local deleted_count=0
    while IFS= read -r -d '' file; do
        rm "$file"
        ((deleted_count++))
    done < <(find "$BACKUP_DIR" -name "impact_db_backup_*.sql.gz*" -type f -mtime +$RETENTION_DAYS -print0)

    if [ $deleted_count -gt 0 ]; then
        log "Deleted $deleted_count old local backup(s)"
    else
        log "No old local backups to delete"
    fi

    # S3 cleanup
    if [ "$UPLOAD_S3" = true ] && [ -n "$S3_BUCKET" ]; then
        log "Cleaning up old S3 backups..."

        aws s3 ls "s3://${S3_BUCKET}/backups/" | while read -r line; do
            createDate=$(echo "$line" | awk '{print $1" "$2}')
            createDate=$(date -d "$createDate" +%s)
            olderThan=$(date -d "$RETENTION_DAYS days ago" +%s)

            if [ $createDate -lt $olderThan ]; then
                fileName=$(echo "$line" | awk '{print $4}')
                if [ "$fileName" != "" ]; then
                    aws s3 rm "s3://${S3_BUCKET}/backups/$fileName" --region "$S3_REGION"
                    log "Deleted old S3 backup: $fileName"
                fi
            fi
        done 2>/dev/null || warn "Could not clean S3 backups (this may be normal if bucket is empty)"
    fi
}

# ============================================================================
# Restore Functions
# ============================================================================

list_backups() {
    log "Available backups:"
    echo ""
    echo "Local backups:"
    ls -lh "$BACKUP_DIR"/impact_db_backup_*.sql.gz* 2>/dev/null | awk '{print $9, "("$5")"} ' || echo "  No local backups found"

    if [ "$UPLOAD_S3" = true ] && [ -n "$S3_BUCKET" ]; then
        echo ""
        echo "S3 backups:"
        aws s3 ls "s3://${S3_BUCKET}/backups/" --region "$S3_REGION" | grep impact_db_backup || echo "  No S3 backups found"
    fi
}

restore_backup() {
    local restore_file="$1"

    if [ "$restore_file" = "latest" ]; then
        restore_file=$(ls -t "$BACKUP_DIR"/impact_db_backup_*.sql.gz 2>/dev/null | head -1)
        if [ -z "$restore_file" ]; then
            error "No backups found to restore"
            exit 1
        fi
    fi

    if [ ! -f "$restore_file" ]; then
        error "Backup file not found: $restore_file"
        exit 1
    fi

    warn "This will REPLACE the current database with the backup!"
    read -p "Are you sure you want to continue? (yes/no): " confirm

    if [ "$confirm" != "yes" ]; then
        log "Restore cancelled"
        exit 0
    fi

    log "Restoring database from: $restore_file"

    # Decrypt if encrypted
    if [[ "$restore_file" == *.gpg ]]; then
        log "Decrypting backup..."
        gpg --decrypt "$restore_file" | gunzip | docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME"
    else
        gunzip -c "$restore_file" | docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME"
    fi

    if [ $? -eq 0 ]; then
        log "Database restored successfully"
    else
        error "Database restore failed"
        exit 1
    fi
}

# ============================================================================
# Monitoring & Notifications
# ============================================================================

send_notification() {
    local status="$1"
    local message="$2"

    # Email notification (requires mail/sendmail configured)
    if command -v mail &> /dev/null && [ -n "${ALERT_EMAIL:-}" ]; then
        echo "$message" | mail -s "Impact Database Backup $status" "$ALERT_EMAIL"
    fi

    # Slack webhook (optional)
    if [ -n "${SLACK_WEBHOOK_URL:-}" ]; then
        curl -X POST "$SLACK_WEBHOOK_URL" \
            -H 'Content-Type: application/json' \
            -d "{\"text\":\"Impact Database Backup $status: $message\"}" \
            2>/dev/null || true
    fi
}

generate_backup_report() {
    log "Generating backup report..."

    local total_backups=$(ls -1 "$BACKUP_DIR"/impact_db_backup_*.sql.gz* 2>/dev/null | wc -l)
    local total_size=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)
    local latest_backup=$(ls -t "$BACKUP_DIR"/impact_db_backup_*.sql.gz 2>/dev/null | head -1)
    local latest_date=$(date -r "$latest_backup" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || echo "N/A")

    cat << EOF

============================================================================
BACKUP REPORT
============================================================================
Timestamp:       $(date '+%Y-%m-%d %H:%M:%S')
Total Backups:   $total_backups
Total Size:      $total_size
Latest Backup:   $latest_date
Retention:       $RETENTION_DAYS days
S3 Enabled:      $UPLOAD_S3
Encryption:      $ENCRYPT_BACKUPS
============================================================================

EOF
}

# ============================================================================
# Main Script
# ============================================================================

main() {
    # Parse command line arguments
    UPLOAD_S3=false
    RESTORE_MODE=false
    RESTORE_FILE=""
    LIST_MODE=false

    while [[ $# -gt 0 ]]; do
        case $1 in
            --s3)
                UPLOAD_S3=true
                shift
                ;;
            --restore)
                RESTORE_MODE=true
                RESTORE_FILE="$2"
                shift 2
                ;;
            --list)
                LIST_MODE=true
                shift
                ;;
            --help)
                cat << EOF
Usage: $0 [OPTIONS]

Options:
    --s3                Upload backup to S3
    --restore FILE      Restore from backup file (use 'latest' for most recent)
    --list              List available backups
    --help              Show this help message

Examples:
    $0                              # Create local backup
    $0 --s3                         # Create backup and upload to S3
    $0 --restore latest             # Restore from latest backup
    $0 --restore /path/to/backup    # Restore from specific file
    $0 --list                       # List all backups

Environment Variables:
    BACKUP_DIR                  Backup directory (default: /var/backups/impact-database)
    BACKUP_RETENTION_DAYS       Days to keep backups (default: 30)
    BACKUP_S3_BUCKET           S3 bucket name
    BACKUP_S3_REGION           S3 region (default: us-east-1)
    ENCRYPT_BACKUPS            Enable GPG encryption (true/false)
    GPG_RECIPIENT              GPG recipient for encryption
    ALERT_EMAIL                Email for notifications
    SLACK_WEBHOOK_URL          Slack webhook for notifications

EOF
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                exit 1
                ;;
        esac
    done

    # Handle list mode
    if [ "$LIST_MODE" = true ]; then
        list_backups
        exit 0
    fi

    # Handle restore mode
    if [ "$RESTORE_MODE" = true ]; then
        check_prerequisites
        restore_backup "$RESTORE_FILE"
        exit 0
    fi

    # Normal backup mode
    log "========================================="
    log "Impact Database Backup Starting"
    log "========================================="

    check_prerequisites

    if create_backup; then
        cleanup_old_backups
        generate_backup_report
        send_notification "SUCCESS" "Backup completed successfully"
        log "Backup completed successfully"
        exit 0
    else
        send_notification "FAILED" "Backup failed - check logs"
        error "Backup failed"
        exit 1
    fi
}

# Run main function
main "$@"

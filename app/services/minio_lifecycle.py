"""
MinIO lifecycle management and backup configuration
Implements automated backup, tiered storage, and retention policies
"""

import json
import boto3
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from minio import Minio
from minio.lifecycle import LifecycleConfig, Rule, Transition, Expiration

from core.config import settings


class MinIOLifecycleManager:
    """Manage MinIO lifecycle policies for automated tiering and cleanup"""

    def __init__(self):
        self.client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_USE_SSL,
        )
        self.bucket_name = settings.MINIO_BUCKET_NAME

    def create_lifecycle_policies(self):
        """Create comprehensive lifecycle policies"""

        # Policy 1: Original images - transition to cold storage after 90 days
        original_images_rule = Rule(
            rule_id="original-images-lifecycle",
            rule_status="Enabled",
            rule_filter={"Prefix": "uploads/"},
            transition=Transition(days=90, storage_class="COLD"),
        )

        # Policy 2: Thumbnails - delete after 180 days (can be regenerated)
        thumbnails_rule = Rule(
            rule_id="thumbnails-lifecycle",
            rule_status="Enabled",
            rule_filter={"Prefix": "thumbnails/"},
            expiration=Expiration(days=180),
        )

        # Policy 3: Temporary files - delete after 7 days
        temp_files_rule = Rule(
            rule_id="temp-files-lifecycle",
            rule_status="Enabled",
            rule_filter={"Prefix": "temp/"},
            expiration=Expiration(days=7),
        )

        # Policy 4: Backup files - transition to archive after 30 days, delete after 2555 days (7 years)
        backup_rule = Rule(
            rule_id="backup-lifecycle",
            rule_status="Enabled",
            rule_filter={"Prefix": "backups/"},
            transition=Transition(days=30, storage_class="ARCHIVE"),
            expiration=Expiration(days=2555),  # 7 years
        )

        # Policy 5: Exports - delete after 30 days
        exports_rule = Rule(
            rule_id="exports-lifecycle",
            rule_status="Enabled",
            rule_filter={"Prefix": "exports/"},
            expiration=Expiration(days=30),
        )

        # Create lifecycle configuration
        lifecycle_config = LifecycleConfig(
            [original_images_rule, thumbnails_rule, temp_files_rule, backup_rule, exports_rule]
        )

        try:
            self.client.set_bucket_lifecycle(self.bucket_name, lifecycle_config)
            print("Lifecycle policies created successfully")
            return True
        except Exception as e:
            print(f"Error creating lifecycle policies: {e}")
            return False

    def get_lifecycle_policies(self) -> Dict[str, Any]:
        """Get current lifecycle policies"""
        try:
            config = self.client.get_bucket_lifecycle(self.bucket_name)
            return {
                "policies": [
                    {
                        "id": rule.rule_id,
                        "status": rule.rule_status,
                        "filter": str(rule.rule_filter),
                        "transition": (
                            {
                                "days": rule.transition.days if rule.transition else None,
                                "storage_class": (
                                    rule.transition.storage_class if rule.transition else None
                                ),
                            }
                            if rule.transition
                            else None
                        ),
                        "expiration": (
                            {"days": rule.expiration.days if rule.expiration else None}
                            if rule.expiration
                            else None
                        ),
                    }
                    for rule in config.rules
                ],
                "timestamp": datetime.utcnow().isoformat(),
            }
        except Exception as e:
            return {"error": f"Failed to get lifecycle policies: {e}"}

    def update_retention_policy(self, rule_id: str, days: int):
        """Update retention policy for a specific rule"""
        try:
            # Get current config
            config = self.client.get_bucket_lifecycle(self.bucket_name)

            # Update the specific rule
            for rule in config.rules:
                if rule.rule_id == rule_id:
                    if rule.expiration:
                        rule.expiration.days = days
                    else:
                        rule.expiration = Expiration(days=days)
                    break

            # Apply updated config
            self.client.set_bucket_lifecycle(self.bucket_name, config)
            print(f"Updated retention policy for {rule_id} to {days} days")
            return True

        except Exception as e:
            print(f"Error updating retention policy: {e}")
            return False


class MinIOBackupManager:
    """Manage automated backups of metadata and critical data"""

    def __init__(self):
        self.client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_USE_SSL,
        )
        self.bucket_name = settings.MINIO_BUCKET_NAME
        self.backup_bucket = f"{settings.MINIO_BUCKET_NAME}-backups"

    def setup_backup_bucket(self):
        """Create and configure backup bucket"""
        try:
            # Create backup bucket if it doesn't exist
            if not self.client.bucket_exists(self.backup_bucket):
                self.client.make_bucket(self.backup_bucket)
                print(f"Created backup bucket: {self.backup_bucket}")

            # Set versioning on backup bucket
            self.client.set_bucket_versioning(self.backup_bucket, {"Status": "Enabled"})

            # Set backup bucket policy (read-only for most users)
            backup_policy = {
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Effect": "Allow",
                        "Principal": {"AWS": "*"},
                        "Action": ["s3:GetObject"],
                        "Resource": f"arn:aws:s3:::{self.backup_bucket}/*",
                    },
                    {
                        "Effect": "Allow",
                        "Principal": {"AWS": "arn:aws:iam::admin:user/backup-service"},
                        "Action": ["s3:*"],
                        "Resource": [
                            f"arn:aws:s3:::{self.backup_bucket}",
                            f"arn:aws:s3:::{self.backup_bucket}/*",
                        ],
                    },
                ],
            }

            self.client.set_bucket_policy(self.backup_bucket, json.dumps(backup_policy))
            return True

        except Exception as e:
            print(f"Error setting up backup bucket: {e}")
            return False

    def backup_database_metadata(self, db_dump_file: str):
        """Backup database metadata dump to MinIO"""
        try:
            backup_key = f"backups/database/{datetime.utcnow().strftime('%Y/%m/%d')}/metadata_dump_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.sql"

            # Upload database dump
            self.client.fput_object(
                self.backup_bucket,
                backup_key,
                db_dump_file,
                metadata={
                    "backup-type": "database",
                    "backup-date": datetime.utcnow().isoformat(),
                    "source": "postgresql",
                },
            )

            print(f"Database backup uploaded: {backup_key}")
            return backup_key

        except Exception as e:
            print(f"Error backing up database: {e}")
            return None

    def backup_configuration(self, config_data: Dict[str, Any]):
        """Backup system configuration"""
        try:
            backup_key = f"backups/config/{datetime.utcnow().strftime('%Y/%m/%d')}/config_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"

            # Convert config to JSON and upload
            config_json = json.dumps(config_data, indent=2, default=str)

            from io import BytesIO

            config_bytes = BytesIO(config_json.encode("utf-8"))

            self.client.put_object(
                self.backup_bucket,
                backup_key,
                config_bytes,
                len(config_json),
                content_type="application/json",
                metadata={
                    "backup-type": "configuration",
                    "backup-date": datetime.utcnow().isoformat(),
                },
            )

            print(f"Configuration backup uploaded: {backup_key}")
            return backup_key

        except Exception as e:
            print(f"Error backing up configuration: {e}")
            return None

    def create_incremental_backup(self):
        """Create incremental backup of changed files"""
        try:
            # Get list of objects modified in the last 24 hours
            yesterday = datetime.utcnow() - timedelta(days=1)

            objects_to_backup = []
            for obj in self.client.list_objects(self.bucket_name, recursive=True):
                if obj.last_modified >= yesterday:
                    objects_to_backup.append(obj)

            if not objects_to_backup:
                print("No files to backup in incremental backup")
                return []

            backed_up_files = []
            backup_date = datetime.utcnow().strftime("%Y%m%d")

            for obj in objects_to_backup:
                try:
                    # Create backup path
                    backup_key = f"backups/incremental/{backup_date}/{obj.object_name}"

                    # Copy object to backup bucket
                    copy_source = {"Bucket": self.bucket_name, "Key": obj.object_name}

                    self.client.copy_object(
                        self.backup_bucket,
                        backup_key,
                        f"{self.bucket_name}/{obj.object_name}",
                        metadata={
                            "backup-type": "incremental",
                            "backup-date": datetime.utcnow().isoformat(),
                            "original-modified": obj.last_modified.isoformat(),
                        },
                    )

                    backed_up_files.append(backup_key)

                except Exception as e:
                    print(f"Error backing up {obj.object_name}: {e}")

            print(f"Incremental backup completed: {len(backed_up_files)} files")
            return backed_up_files

        except Exception as e:
            print(f"Error creating incremental backup: {e}")
            return []

    def list_backups(self, backup_type: str = None) -> List[Dict[str, Any]]:
        """List available backups"""
        try:
            prefix = "backups/"
            if backup_type:
                prefix += f"{backup_type}/"

            backups = []
            for obj in self.client.list_objects(self.backup_bucket, prefix=prefix, recursive=True):
                backup_info = {
                    "key": obj.object_name,
                    "size": obj.size,
                    "last_modified": obj.last_modified.isoformat(),
                    "etag": obj.etag,
                }

                # Get metadata if available
                try:
                    stat = self.client.stat_object(self.backup_bucket, obj.object_name)
                    backup_info["metadata"] = stat.metadata
                except:
                    pass

                backups.append(backup_info)

            return sorted(backups, key=lambda x: x["last_modified"], reverse=True)

        except Exception as e:
            print(f"Error listing backups: {e}")
            return []

    def restore_from_backup(self, backup_key: str, restore_path: str):
        """Restore file from backup"""
        try:
            # Download backup file
            self.client.fget_object(self.backup_bucket, backup_key, restore_path)
            print(f"Restored {backup_key} to {restore_path}")
            return True

        except Exception as e:
            print(f"Error restoring backup: {e}")
            return False

    def cleanup_old_backups(self, retention_days: int = 30):
        """Clean up backups older than retention period"""
        try:
            cutoff_date = datetime.utcnow() - timedelta(days=retention_days)
            deleted_count = 0

            for obj in self.client.list_objects(
                self.backup_bucket, prefix="backups/", recursive=True
            ):
                if obj.last_modified < cutoff_date:
                    try:
                        self.client.remove_object(self.backup_bucket, obj.object_name)
                        deleted_count += 1
                    except Exception as e:
                        print(f"Error deleting old backup {obj.object_name}: {e}")

            print(f"Cleaned up {deleted_count} old backups")
            return deleted_count

        except Exception as e:
            print(f"Error cleaning up old backups: {e}")
            return 0


class MinIOMonitoring:
    """Monitor MinIO storage usage and performance"""

    def __init__(self):
        self.client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_USE_SSL,
        )
        self.bucket_name = settings.MINIO_BUCKET_NAME

    def get_storage_usage(self) -> Dict[str, Any]:
        """Get detailed storage usage statistics"""
        try:
            usage_stats = {
                "buckets": {},
                "total_size": 0,
                "total_objects": 0,
                "storage_classes": {},
                "timestamp": datetime.utcnow().isoformat(),
            }

            # Check all buckets
            buckets = self.client.list_buckets()

            for bucket in buckets:
                bucket_stats = {"size": 0, "objects": 0, "prefixes": {}}

                # Get objects in bucket
                for obj in self.client.list_objects(bucket.name, recursive=True):
                    bucket_stats["size"] += obj.size
                    bucket_stats["objects"] += 1

                    # Categorize by prefix
                    prefix = obj.object_name.split("/")[0] if "/" in obj.object_name else "root"
                    if prefix not in bucket_stats["prefixes"]:
                        bucket_stats["prefixes"][prefix] = {"size": 0, "objects": 0}

                    bucket_stats["prefixes"][prefix]["size"] += obj.size
                    bucket_stats["prefixes"][prefix]["objects"] += 1

                usage_stats["buckets"][bucket.name] = bucket_stats
                usage_stats["total_size"] += bucket_stats["size"]
                usage_stats["total_objects"] += bucket_stats["objects"]

            return usage_stats

        except Exception as e:
            return {"error": f"Failed to get storage usage: {e}"}

    def check_presigned_url_usage(self) -> Dict[str, Any]:
        """Monitor presigned URL usage patterns"""
        try:
            # This would typically require MinIO audit logs or metrics
            # For now, return placeholder data
            return {
                "presigned_urls_generated_24h": 0,  # Would need audit logs
                "presigned_urls_accessed_24h": 0,  # Would need access logs
                "average_url_lifetime": "1 hour",
                "expired_urls_cleaned": 0,
                "timestamp": datetime.utcnow().isoformat(),
            }
        except Exception as e:
            return {"error": f"Failed to check presigned URL usage: {e}"}

    def get_bandwidth_usage(self) -> Dict[str, Any]:
        """Get bandwidth usage statistics"""
        try:
            # This would require MinIO metrics/prometheus integration
            return {
                "bandwidth_in_24h": "0 GB",  # Would need metrics
                "bandwidth_out_24h": "0 GB",  # Would need metrics
                "peak_bandwidth": "0 Mbps",  # Would need metrics
                "requests_per_hour": 0,  # Would need metrics
                "timestamp": datetime.utcnow().isoformat(),
            }
        except Exception as e:
            return {"error": f"Failed to get bandwidth usage: {e}"}


def setup_minio_lifecycle_and_backup():
    """Initialize MinIO lifecycle and backup management"""

    try:
        # Setup lifecycle management
        lifecycle_manager = MinIOLifecycleManager()
        lifecycle_manager.create_lifecycle_policies()

        # Setup backup management
        backup_manager = MinIOBackupManager()
        backup_manager.setup_backup_bucket()

        print("MinIO lifecycle and backup management initialized successfully")
        return True

    except Exception as e:
        print(f"Error setting up MinIO management: {e}")
        return False


def get_minio_health_status() -> Dict[str, Any]:
    """Get comprehensive MinIO health status"""
    try:
        monitoring = MinIOMonitoring()

        storage_usage = monitoring.get_storage_usage()
        presigned_usage = monitoring.check_presigned_url_usage()
        bandwidth_usage = monitoring.get_bandwidth_usage()

        # Get lifecycle policies
        lifecycle_manager = MinIOLifecycleManager()
        lifecycle_policies = lifecycle_manager.get_lifecycle_policies()

        # Get backup status
        backup_manager = MinIOBackupManager()
        recent_backups = backup_manager.list_backups()[:5]  # Last 5 backups

        return {
            "status": "healthy",
            "storage": storage_usage,
            "presigned_urls": presigned_usage,
            "bandwidth": bandwidth_usage,
            "lifecycle_policies": lifecycle_policies,
            "recent_backups": recent_backups,
            "timestamp": datetime.utcnow().isoformat(),
        }

    except Exception as e:
        return {"status": "unhealthy", "error": str(e), "timestamp": datetime.utcnow().isoformat()}

#!/usr/bin/env python3
"""
Environment Configuration Validator

This script validates that all environment configurations are properly set
and there are no conflicts between storage backends.
"""

import os
import sys
import logging
from typing import List, Dict, Any
import subprocess

# Add the app directory to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))

try:
    from core.config import Settings
    from services.unified_storage import get_storage_config
except ImportError as e:
    print(f"Failed to import app modules: {e}")
    print("Make sure you're running this script from the app directory")
    sys.exit(1)

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


def validate_environment() -> Dict[str, Any]:
    """Validate environment configuration and return summary"""

    print("🔍 Pacific Impact Database - Environment Validation")
    print("=" * 60)

    results = {
        "errors": [],
        "warnings": [],
        "info": [],
        "storage_config": {},
        "database_accessible": False,
        "minio_accessible": False,
        "redis_accessible": False,
    }

    # Load settings
    try:
        settings = Settings()
        results["info"].append("✅ Settings loaded successfully")
    except Exception as e:
        results["errors"].append(f"❌ Failed to load settings: {e}")
        return results

    # Get storage configuration
    try:
        storage_config = get_storage_config()
        results["storage_config"] = storage_config.get_storage_summary()
        results["info"].append("✅ Storage configuration loaded")
    except Exception as e:
        results["errors"].append(f"❌ Failed to get storage config: {e}")
        return results

    # Validate database connection
    try:
        from sqlalchemy import create_engine, text

        engine = create_engine(settings.DATABASE_URL)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        results["database_accessible"] = True
        results["info"].append("✅ Database connection successful")
    except Exception as e:
        results["warnings"].append(f"⚠️  Database not accessible: {e}")

    # Validate MinIO connection (if configured)
    if results["storage_config"]["file_storage_type"] == "minio":
        try:
            from services.minio_client import get_minio_client

            client = get_minio_client()
            client.list_buckets()  # Test connection
            results["minio_accessible"] = True
            results["info"].append("✅ MinIO connection successful")
        except Exception as e:
            results["warnings"].append(f"⚠️  MinIO not accessible: {e}")
            results["info"].append("ℹ️  Will fallback to local storage")

    # Validate Redis connection
    try:
        import redis

        r = redis.from_url(settings.REDIS_URL)
        r.ping()
        results["redis_accessible"] = True
        results["info"].append("✅ Redis connection successful")
    except Exception as e:
        results["warnings"].append(f"⚠️  Redis not accessible: {e}")

    # Check environment-specific issues
    if settings.is_production:
        if settings.database.DATABASE_URL.startswith("sqlite://"):
            results["errors"].append("❌ SQLite not allowed in production")
        if settings.security.SECRET_KEY == "dev-secret-key-change-in-production":
            results["errors"].append("❌ Using default SECRET_KEY in production")

    # Check for conflicting configurations
    storage_issues = results["storage_config"].get("issues", [])
    for issue in storage_issues:
        results["warnings"].append(f"⚠️  {issue}")

    return results


def print_results(results: Dict[str, Any]):
    """Print validation results in a user-friendly format"""

    print("\n📊 CONFIGURATION SUMMARY")
    print("-" * 40)
    config = results["storage_config"]
    print(f"Environment: {config.get('environment', 'unknown')}")
    print(f"Database: {config.get('database_type', 'unknown')}")
    print(f"File Storage: {config.get('file_storage_type', 'unknown')}")
    if config.get("minio_endpoint", "N/A") != "N/A":
        print(f"MinIO Endpoint: {config.get('minio_endpoint')}")

    print("\n🔍 VALIDATION RESULTS")
    print("-" * 40)

    # Print info messages
    for info in results["info"]:
        print(info)

    # Print warnings
    for warning in results["warnings"]:
        print(warning)

    # Print errors
    for error in results["errors"]:
        print(error)

    print("\n📈 CONNECTION STATUS")
    print("-" * 40)
    print(f"Database: {'✅ Connected' if results['database_accessible'] else '❌ Not Connected'}")
    print(f"MinIO: {'✅ Connected' if results['minio_accessible'] else '❌ Not Connected'}")
    print(f"Redis: {'✅ Connected' if results['redis_accessible'] else '❌ Not Connected'}")

    # Overall status
    print("\n🎯 OVERALL STATUS")
    print("-" * 40)
    if results["errors"]:
        print("❌ CRITICAL ISSUES FOUND - App may not start properly")
        return False
    elif results["warnings"]:
        print("⚠️  WARNINGS FOUND - App should work but some features may be limited")
        return True
    else:
        print("✅ ALL CHECKS PASSED - Configuration looks good!")
        return True


def suggest_fixes(results: Dict[str, Any]):
    """Suggest fixes for common issues"""

    if not results["errors"] and not results["warnings"]:
        return

    print("\n🔧 SUGGESTED FIXES")
    print("-" * 40)

    if not results["database_accessible"]:
        print("Database Issues:")
        print("  1. Make sure PostgreSQL is running: docker-compose up -d postgis_db")
        print("  2. Check DATABASE_URL in .env file")
        print("  3. Ensure database credentials are correct")

    if (
        not results["minio_accessible"]
        and results["storage_config"]["file_storage_type"] == "minio"
    ):
        print("\nMinIO Issues:")
        print("  1. Start MinIO: docker-compose up -d minio")
        print("  2. Check MINIO_* environment variables in .env")
        print("  3. For development, local storage will be used as fallback")

    if not results["redis_accessible"]:
        print("\nRedis Issues:")
        print("  1. Start Redis: docker-compose up -d redis")
        print("  2. Check REDIS_URL in .env file")
        print("  3. Some features (caching, background tasks) may not work")

    for error in results["errors"]:
        if "SECRET_KEY" in error:
            print("\nSecret Key Issue:")
            print(
                "  Generate a secure key: python -c 'import secrets; print(secrets.token_urlsafe(32))'"
            )
            print("  Update SECRET_KEY in .env file")


def main():
    """Main validation function"""
    try:
        results = validate_environment()
        success = print_results(results)

        if not success or results["warnings"]:
            suggest_fixes(results)

        # Exit with appropriate code
        if results["errors"]:
            sys.exit(1)
        else:
            sys.exit(0)

    except KeyboardInterrupt:
        print("\n\n⚠️  Validation interrupted by user")
        sys.exit(130)
    except Exception as e:
        print(f"\n❌ Unexpected error during validation: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()

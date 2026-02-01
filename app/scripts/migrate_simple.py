#!/usr/bin/env python3
"""
Simple migration script using raw SQL
Migrates admin_users to RBAC users table
"""

import os
import psycopg2
from psycopg2.extras import RealDictCursor
import sys
from datetime import datetime
import uuid

# Database connection
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@postgis_db:5432/impact_db")

# Role mapping
ROLE_MAP = {
    "SUPER_ADMIN": ("admin", True, True),   # (rbac_role, is_super_admin, can_access_admin_panel)
    "ADMIN": ("admin", False, True),
    "VIEWER": ("viewer", False, True)
}

def get_connection():
    """Get database connection"""
    import re
    match = re.match(r'postgresql://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)', DATABASE_URL)
    if not match:
        raise ValueError(f"Invalid DATABASE_URL: {DATABASE_URL}")
    
    user, password, host, port, database = match.groups()
    
    return psycopg2.connect(
        host=host,
        port=port,
        database=database,
        user=user,
        password=password
    )

def log_migration(cur, admin_user_id, rbac_user_id, migration_type, status, conflicts=None, details=None):
    """Log migration event"""
    import json
    
    # Convert conflicts to JSON if it's a string
    conflicts_json = None
    if conflicts:
        if isinstance(conflicts, str):
            conflicts_json = json.dumps({"type": conflicts})
        else:
            conflicts_json = json.dumps(conflicts)
    
    # Convert details to JSON if needed
    details_json = None
    if details:
        if isinstance(details, str):
            details_json = json.dumps({"info": details})
        else:
            details_json = json.dumps(details)
    
    cur.execute("""
        INSERT INTO auth_migration_log 
        (admin_user_id, rbac_user_id, migration_type, status, conflicts, details, migrated_by)
        VALUES (%s, %s, %s, %s, %s::jsonb, %s::jsonb, %s)
    """, (
        str(admin_user_id),
        str(rbac_user_id) if rbac_user_id else None,
        migration_type,
        status,
        conflicts_json,
        details_json,
        "migration_script"
    ))

def migrate_user(cur, admin_user, dry_run=False):
    """Migrate a single admin user"""
    username = admin_user['username']
    email = admin_user['email']
    admin_id = admin_user['id']
    admin_role = admin_user['role']
    
    print(f"\nProcessing: {username} ({email})")
    
    # Check if already migrated
    cur.execute("""
        SELECT id FROM users WHERE legacy_admin_id = %s
    """, (str(admin_id),))
    existing_migrated = cur.fetchone()
    
    if existing_migrated:
        print(f"  ✓ Already migrated (skipping)")
        log_migration(cur, admin_id, existing_migrated['id'], "skip", "already_migrated")
        return "skipped"
    
    # Check for existing RBAC user by email
    cur.execute("""
        SELECT id, username FROM users WHERE email = %s
    """, (email,))
    existing_rbac = cur.fetchone()
    
    if existing_rbac:
        # Update existing RBAC user
        print(f"  → Email match found, updating existing RBAC user...")
        
        if admin_role not in ROLE_MAP:
            print(f"  ✗ Invalid admin role: {admin_role}")
            log_migration(cur, admin_id, existing_rbac['id'], "error", "invalid_role", 
                         f"unknown_role: {admin_role}")
            return "error"
        
        rbac_role_name, is_super_admin, can_access_admin_panel = ROLE_MAP[admin_role]
        
        # Get role_id
        cur.execute("SELECT id FROM roles WHERE name = %s", (rbac_role_name,))
        role = cur.fetchone()
        if not role:
            print(f"  ✗ RBAC role not found: {rbac_role_name}")
            log_migration(cur, admin_id, existing_rbac['id'], "error", "rbac_role_missing")
            return "error"
        
        if not dry_run:
            cur.execute("""
                UPDATE users SET
                    role_id = %s,
                    is_super_admin = %s,
                    can_access_admin_panel = %s,
                    organization = %s,
                    migrated_from_admin = true,
                    migration_date = %s,
                    legacy_admin_id = %s
                WHERE id = %s
            """, (
                role['id'],
                is_super_admin,
                can_access_admin_panel,
                admin_user.get('organization'),
                datetime.utcnow(),
                str(admin_id),
                existing_rbac['id']
            ))
            print(f"  ✓ Updated existing RBAC user")
        else:
            print(f"  [DRY RUN] Would update existing RBAC user")
        
        log_migration(cur, admin_id, existing_rbac['id'], "update_existing", "success", 
                     "email_match", f"updated with {admin_role}")
        return "migrated"
    
    # No conflict - create new RBAC user
    print(f"  → Creating new RBAC user...")
    
    if admin_role not in ROLE_MAP:
        print(f"  ✗ Invalid admin role: {admin_role}")
        log_migration(cur, admin_id, None, "error", "invalid_role", f"unknown_role: {admin_role}")
        return "error"
    
    rbac_role_name, is_super_admin, can_access_admin_panel = ROLE_MAP[admin_role]
    
    # Get role_id
    cur.execute("SELECT id FROM roles WHERE name = %s", (rbac_role_name,))
    role = cur.fetchone()
    if not role:
        print(f"  ✗ RBAC role not found: {rbac_role_name}")
        log_migration(cur, admin_id, None, "error", "rbac_role_missing")
        return "error"
    
    new_user_id = str(uuid.uuid4())
    
    if not dry_run:
        cur.execute("""
            INSERT INTO users (
                id, username, email, hashed_password, full_name, role_id,
                is_super_admin, can_access_admin_panel, organization,
                failed_login_attempts, lockout_until, last_password_change,
                email_verification_token, is_active, is_verified,
                migrated_from_admin, migration_date, legacy_admin_id,
                last_login, created_at,
                notification_preferences, review_preferences, timezone, language
            ) VALUES (
                %s, %s, %s, %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s,
                %s, %s,
                %s, %s, %s, %s
            )
        """, (
            new_user_id,
            admin_user['username'],
            admin_user['email'],
            admin_user['password_hash'],
            admin_user.get('full_name') or admin_user['username'],
            role['id'],
            is_super_admin,
            can_access_admin_panel,
            admin_user.get('organization'),
            admin_user.get('failed_login_attempts', 0),
            admin_user.get('lockout_until'),
            admin_user.get('last_password_change'),
            admin_user.get('email_verification_token'),
            admin_user.get('is_active', True),
            admin_user.get('is_verified', False),
            True,
            datetime.utcnow(),
            str(admin_id),
            admin_user.get('last_login'),
            admin_user.get('created_at', datetime.utcnow()),
            '{"email": true, "push": false, "sms": false}',
            '{"auto_assign": false}',
            'UTC',
            'en'
        ))
        print(f"  ✓ Created new RBAC user")
    else:
        print(f"  [DRY RUN] Would create new RBAC user with role: {rbac_role_name}")
    
    log_migration(cur, admin_id, new_user_id, "create_new", "success", 
                 None, f"created with {admin_role} -> {rbac_role_name}")
    return "migrated"

def main():
    """Main migration function"""
    import argparse
    parser = argparse.ArgumentParser(description="Migrate admin_users to RBAC users")
    parser.add_argument("--dry-run", action="store_true", help="Run in dry-run mode")
    parser.add_argument("--execute", action="store_true", help="Execute actual migration")
    args = parser.parse_args()
    
    dry_run = not args.execute
    
    print("=" * 60)
    if dry_run:
        print("DRY RUN MODE - No changes will be made")
    print("ADMIN TO RBAC MIGRATION")
    print("=" * 60)
    
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    try:
        # Get all admin users
        cur.execute("""
            SELECT id, username, email, password_hash, full_name, role,
                   organization, position, is_active, is_verified, is_locked,
                   failed_login_attempts, lockout_until, last_password_change,
                   email_verification_token, last_login, created_at
            FROM admin_users
            ORDER BY created_at
        """)
        admin_users = cur.fetchall()
        
        print(f"\nFound {len(admin_users)} admin users to process")
        
        stats = {"total": 0, "migrated": 0, "skipped": 0, "errors": 0}
        
        for admin_user in admin_users:
            stats["total"] += 1
            result = migrate_user(cur, admin_user, dry_run)
            
            if result == "migrated":
                stats["migrated"] += 1
            elif result == "skipped":
                stats["skipped"] += 1
            elif result == "error":
                stats["errors"] += 1
        
        if not dry_run:
            conn.commit()
            print("\n✓ Migration committed to database")
        
        # Summary
        print()
        print("=" * 60)
        print("MIGRATION SUMMARY")
        print("=" * 60)
        print(f"Total processed:        {stats['total']}")
        print(f"Successfully migrated:  {stats['migrated']}")
        print(f"Already migrated (skipped): {stats['skipped']}")
        print(f"Errors:                 {stats['errors']}")
        
        if dry_run:
            print()
            print("This was a DRY RUN - no actual changes were made")
            print("Run with --execute to perform actual migration")
        else:
            print()
            print("✓ Migration complete!")
        
        cur.close()
        conn.close()
        
        sys.exit(0 if stats['errors'] == 0 else 1)
        
    except Exception as e:
        print(f"\n✗ Migration failed: {e}")
        import traceback
        traceback.print_exc()
        conn.rollback()
        cur.close()
        conn.close()
        sys.exit(1)

if __name__ == "__main__":
    main()

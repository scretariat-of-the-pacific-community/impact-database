#!/usr/bin/env python3
"""
Simple pre-migration validation using raw SQL only
No model imports to avoid circular dependency issues
"""

import os
import psycopg2
from psycopg2.extras import RealDictCursor
import sys

# Database connection
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@postgis_db:5432/impact_db")

def get_connection():
    """Get database connection"""
    # Parse DATABASE_URL
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

def main():
    """Run validation checks"""
    print("=" * 60)
    print("PRE-MIGRATION VALIDATION")
    print("=" * 60)
    print()
    
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    errors = []
    warnings = []
    
    # Check 1: Duplicate emails in admin_users
    print("Checking for duplicate emails in admin_users...")
    cur.execute("""
        SELECT email, COUNT(email) as count
        FROM admin_users
        GROUP BY email
        HAVING COUNT(email) > 1
    """)
    duplicates = cur.fetchall()
    if duplicates:
        for row in duplicates:
            errors.append(f"Duplicate email in admin_users: {row['email']} (count: {row['count']})")
    else:
        print("✓ No duplicate emails found")
    
    # Check 2: Duplicate usernames in admin_users
    print("Checking for duplicate usernames in admin_users...")
    cur.execute("""
        SELECT username, COUNT(username) as count
        FROM admin_users
        GROUP BY username
        HAVING COUNT(username) > 1
    """)
    duplicates = cur.fetchall()
    if duplicates:
        for row in duplicates:
            errors.append(f"Duplicate username in admin_users: {row['username']} (count: {row['count']})")
    else:
        print("✓ No duplicate usernames found")
    
    # Check 3: Username conflicts with RBAC users (non-migrated)
    print("Checking for username conflicts with RBAC users...")
    cur.execute("""
        SELECT 
            a.username,
            a.email as admin_email,
            u.email as rbac_email,
            u.legacy_admin_id
        FROM admin_users a
        INNER JOIN users u ON a.username = u.username
        WHERE u.legacy_admin_id IS NULL OR u.legacy_admin_id != a.id
    """)
    conflicts = cur.fetchall()
    if conflicts:
        for row in conflicts:
            if row['legacy_admin_id']:
                warnings.append(f"Username conflict (different users): {row['username']}")
            else:
                errors.append(f"Username conflict: {row['username']} exists in both tables")
    else:
        print("✓ No username conflicts found")
    
    # Check 4: Email conflicts with RBAC users (non-migrated)
    print("Checking for email conflicts with RBAC users...")
    cur.execute("""
        SELECT 
            a.email,
            a.username as admin_username,
            u.username as rbac_username,
            u.legacy_admin_id
        FROM admin_users a
        INNER JOIN users u ON a.email = u.email
        WHERE u.legacy_admin_id IS NULL OR u.legacy_admin_id != a.id
    """)
    conflicts = cur.fetchall()
    if conflicts:
        for row in conflicts:
            if row['legacy_admin_id']:
                warnings.append(f"Email conflict (different users): {row['email']}")
            else:
                errors.append(f"Email conflict: {row['email']} exists in both tables")
    else:
        print("✓ No email conflicts found")
    
    # Check 5: Invalid roles
    print("Checking for invalid admin roles...")
    cur.execute("""
        SELECT username, email, role
        FROM admin_users
        WHERE role NOT IN ('SUPER_ADMIN', 'ADMIN', 'VIEWER')
    """)
    invalid = cur.fetchall()
    if invalid:
        for row in invalid:
            errors.append(f"Invalid role '{row['role']}' for user {row['username']}")
    else:
        print("✓ All roles are valid")
    
    # Check 6: Required RBAC roles exist
    print("Checking for required RBAC roles...")
    cur.execute("""
        SELECT COUNT(*) as count
        FROM roles
        WHERE name IN ('admin', 'viewer')
    """)
    result = cur.fetchone()
    if result['count'] < 2:
        errors.append("Missing required RBAC roles (admin, viewer)")
    else:
        print("✓ All required RBAC roles exist")
    
    # Check 7: Data integrity
    print("Checking data integrity...")
    cur.execute("""
        SELECT id, username, email, password_hash
        FROM admin_users
        WHERE username IS NULL OR email IS NULL OR password_hash IS NULL
    """)
    invalid = cur.fetchall()
    if invalid:
        for row in invalid:
            errors.append(f"Missing critical data for user: {row.get('username', 'NO_USERNAME')} / {row.get('email', 'NO_EMAIL')}")
    else:
        print("✓ Data integrity OK")
    
    # Check 8: Migration status
    print("Checking migration status...")
    cur.execute("SELECT COUNT(*) as count FROM admin_users")
    total_admin = cur.fetchone()['count']
    
    cur.execute("SELECT COUNT(*) as count FROM users WHERE migrated_from_admin = true")
    migrated = cur.fetchone()['count']
    
    remaining = total_admin - migrated
    
    print(f"Total admin users: {total_admin}")
    print(f"Already migrated: {migrated}")
    print(f"Remaining to migrate: {remaining}")
    
    # Summary
    print()
    print("=" * 60)
    print("VALIDATION SUMMARY")
    print("=" * 60)
    
    if errors:
        print(f"\n✗ Found {len(errors)} CRITICAL issues:")
        for i, error in enumerate(errors, 1):
            print(f"  {i}. {error}")
    
    if warnings:
        print(f"\n⚠ Found {len(warnings)} warnings:")
        for i, warning in enumerate(warnings, 1):
            print(f"  {i}. {warning}")
    
    if not errors and not warnings:
        print("\n✓ All validation checks passed!")
        print(f"Ready to migrate {remaining} users")
        cur.close()
        conn.close()
        sys.exit(0)
    elif errors:
        print("\n✗ Migration CANNOT proceed until critical issues are resolved")
        cur.close()
        conn.close()
        sys.exit(1)
    else:
        print("\n⚠ Migration can proceed but review warnings first")
        cur.close()
        conn.close()
        sys.exit(0)

if __name__ == "__main__":
    main()

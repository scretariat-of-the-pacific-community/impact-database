#!/usr/bin/env python3
"""
Helper script to reset password for admin users
This allows setting a known password for testing migrated users
"""

import sys
import os
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

import bcrypt
import secrets
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@postgis_db:5432/impact_db")


def reset_admin_password(username: str, new_password: str):
    """Reset password for an admin user"""
    # Parse DATABASE_URL
    import re
    match = re.match(r'postgresql://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)', DATABASE_URL)
    if not match:
        print(f"Invalid DATABASE_URL: {DATABASE_URL}")
        return False
    
    user_db, password_db, host, port, database = match.groups()
    
    import psycopg2
    conn = psycopg2.connect(
        host=host,
        port=port,
        database=database,
        user=user_db,
        password=password_db
    )
    cur = conn.cursor()
    
    try:
        # Generate salt and hash
        salt = f"bcrypt-salt-{username}"
        password_with_salt = new_password + salt
        password_hash = bcrypt.hashpw(password_with_salt.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        
        # Update admin_users
        cur.execute("""
            UPDATE admin_users 
            SET password_hash = %s, salt = %s, last_password_change = NOW()
            WHERE username = %s OR email = %s
            RETURNING id, username, email
        """, (password_hash, salt, username, username))
        
        result = cur.fetchone()
        if result:
            admin_id, admin_username, admin_email = result
            print(f"✓ Updated admin_users password for: {admin_username} ({admin_email})")
            
            # Also update RBAC users if they were migrated
            cur.execute("""
                UPDATE users 
                SET hashed_password = %s
                WHERE legacy_admin_id = %s
                RETURNING username, email
            """, (password_hash, admin_id))
            
            rbac_result = cur.fetchone()
            if rbac_result:
                rbac_username, rbac_email = rbac_result
                print(f"✓ Updated RBAC users password for: {rbac_username} ({rbac_email})")
            
            conn.commit()
            print(f"\n✓ Password reset successful for {username}")
            print(f"  New password: {new_password}")
            return True
        else:
            print(f"✗ User not found: {username}")
            return False
            
    except Exception as e:
        print(f"✗ Error: {e}")
        conn.rollback()
        return False
    finally:
        cur.close()
        conn.close()


def main():
    """Main function"""
    import argparse
    parser = argparse.ArgumentParser(description="Reset admin user password")
    parser.add_argument("username", help="Username or email of admin user")
    parser.add_argument("password", help="New password")
    args = parser.parse_args()
    
    success = reset_admin_password(args.username, args.password)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()

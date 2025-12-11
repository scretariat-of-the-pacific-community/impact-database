#!/usr/bin/env python3
"""
Seed test users for development and testing.
SECURITY: Use this instead of auth bypass for development.
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'app'))

from models.database import get_db, SessionLocal
from models.rbac import User, Role
from passlib.context import CryptContext
import uuid

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def seed_test_users():
    """Create test users with proper authentication."""
    db = SessionLocal()
    
    try:
        # Check if admin role exists
        admin_role = db.query(Role).filter(Role.name == "admin").first()
        reviewer_role = db.query(Role).filter(Role.name == "reviewer").first()
        contributor_role = db.query(Role).filter(Role.name == "contributor").first()
        
        print("="*70)
        print("SEEDING TEST USERS")
        print("="*70)
        
        # Test user 1: Admin
        admin_user = db.query(User).filter(User.username == "admin").first()
        if not admin_user:
            admin_user = User(
                id=uuid.UUID("aa0f7643-7f27-463b-88c2-45687d5a07c5"),  # Fixed UUID for testing
                username="admin",
                email="admin@example.com",
                full_name="Admin User",
                hashed_password=pwd_context.hash("admin123"),
                role_id=admin_role.id if admin_role else None,
                is_active=True,
                is_verified=True,
                department="IT",
                position="System Administrator"
            )
            db.add(admin_user)
            print(f"✓ Created user: admin (password: admin123)")
        else:
            # Update password in case it changed
            admin_user.hashed_password = pwd_context.hash("admin123")
            admin_user.is_active = True
            print(f"✓ Updated user: admin (password: admin123)")
        
        # Test user 2: Reviewer
        reviewer_user = db.query(User).filter(User.username == "reviewer1").first()
        if not reviewer_user:
            reviewer_user = User(
                username="reviewer1",
                email="reviewer1@example.com",
                full_name="Senior Reviewer",
                hashed_password=pwd_context.hash("reviewer123"),
                role_id=reviewer_role.id if reviewer_role else None,
                is_active=True,
                is_verified=True,
                department="Quality Assurance",
                position="Senior Reviewer"
            )
            db.add(reviewer_user)
            print(f"✓ Created user: reviewer1 (password: reviewer123)")
        else:
            reviewer_user.hashed_password = pwd_context.hash("reviewer123")
            reviewer_user.is_active = True
            print(f"✓ Updated user: reviewer1 (password: reviewer123)")
        
        # Test user 3: Contributor (for upload testing)
        contributor_user = db.query(User).filter(User.username == "johndoe").first()
        if not contributor_user:
            contributor_user = User(
                username="johndoe",
                email="johndoe@example.com",
                full_name="John Doe",
                hashed_password=pwd_context.hash("secret"),
                role_id=contributor_role.id if contributor_role else None,
                is_active=True,
                is_verified=True,
                department="Field Operations",
                position="Data Contributor"
            )
            db.add(contributor_user)
            print(f"✓ Created user: johndoe (password: secret)")
        else:
            contributor_user.hashed_password = pwd_context.hash("secret")
            contributor_user.is_active = True
            print(f"✓ Updated user: johndoe (password: secret)")
        
        # Test user 4: Dev user (migrated from auth bypass)
        dev_user = db.query(User).filter(User.username == "dev_user").first()
        if not dev_user:
            dev_user = User(
                username="dev_user",
                email="dev@example.com",
                full_name="Development User",
                hashed_password=pwd_context.hash("dev123"),
                role_id=contributor_role.id if contributor_role else None,
                is_active=True,
                is_verified=True,
                department="Development",
                position="Test User"
            )
            db.add(dev_user)
            print(f"✓ Created user: dev_user (password: dev123)")
        else:
            dev_user.hashed_password = pwd_context.hash("dev123")
            dev_user.is_active = True
            print(f"✓ Updated user: dev_user (password: dev123)")
        
        db.commit()
        
        print("\n" + "="*70)
        print("TEST USERS SEEDED SUCCESSFULLY")
        print("="*70)
        print("\nAvailable test accounts:")
        print("  • admin / admin123 (Admin role)")
        print("  • reviewer1 / reviewer123 (Reviewer role)")
        print("  • johndoe / secret (Contributor role)")
        print("  • dev_user / dev123 (Contributor role)")
        print("\nGet token via:")
        print("  curl -X POST http://localhost:8000/api/auth/token \\")
        print("    -d 'username=admin&password=admin123'")
        print("\n" + "="*70)
        
    except Exception as e:
        db.rollback()
        print(f"\n❌ Error seeding users: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    seed_test_users()

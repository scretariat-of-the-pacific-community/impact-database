#!/usr/bin/env python3
"""Create test curator user for testing role-based curation queue."""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from models.database import SessionLocal
from models.rbac import User, Role
import uuid
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def create_curator_user():
    db = SessionLocal()
    try:
        # Get curator role
        curator_role = db.query(Role).filter(Role.name == 'curator').first()
        if not curator_role:
            print("Error: Curator role not found. Run migration first.")
            return
        
        # Check if curator user already exists
        existing = db.query(User).filter(User.email == 'curator@spc.int').first()
        if existing:
            print(f"Curator user already exists: {existing.email}")
            return
        
        # Create curator user
        curator_user = User(
            id=uuid.uuid4(),
            username='curator_test',
            email='curator@spc.int',
            hashed_password=pwd_context.hash('curator123'),
            role_id=curator_role.id,
            is_active=True,
            is_verified=True
        )
        
        db.add(curator_user)
        db.commit()
        db.refresh(curator_user)
        
        print(f"✅ Created curator user:")
        print(f"   Email: {curator_user.email}")
        print(f"   Username: {curator_user.username}")
        print(f"   Password: curator123")
        print(f"   ID: {curator_user.id}")
        print(f"   Role: {curator_role.name}")
        
    except Exception as e:
        db.rollback()
        print(f"Error creating curator user: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    create_curator_user()

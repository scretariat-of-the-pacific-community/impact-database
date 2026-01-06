#!/usr/bin/env python3
"""
Setup script for Impact Database Admin System
Creates initial admin user and applies database migrations
"""

import os
import sys
import secrets
import bcrypt
from datetime import datetime

# Add the app directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from models.database import Base, get_db, DATABASE_URL
from services.admin_service import AdminUser, UserRole
from models.curation import *


def create_tables():
    """Create database tables."""
    print("🔧 Creating database tables...")

    engine = create_engine(DATABASE_URL)
    Base.metadata.create_all(bind=engine)

    print("✅ Database tables created successfully")


def create_admin_user(db_session):
    """Create initial admin user."""
    print("👤 Creating initial admin user...")

    # Check if admin user already exists
    existing_admin = db_session.query(AdminUser).filter(AdminUser.username == "admin").first()

    if existing_admin:
        print("ℹ️  Admin user already exists")
        return existing_admin

    # Generate secure password
    password = "admin123"  # Change this in production
    salt = secrets.token_hex(16)
    password_hash = bcrypt.hashpw((password + salt).encode("utf-8"), bcrypt.gensalt()).decode(
        "utf-8"
    )

    # Create admin user
    admin_user = AdminUser(
        username="admin",
        email="admin@example.com",
        full_name="System Administrator",
        password_hash=password_hash,
        salt=salt,
        role=UserRole.SUPER_ADMIN.value,
        is_active=True,
        is_verified=True,
        organization="System",
        position="Administrator",
    )

    db_session.add(admin_user)
    db_session.commit()

    print(f"✅ Admin user created:")
    print(f"   Username: admin")
    print(f"   Password: {password}")
    print(f"   Email: admin@example.com")
    print("⚠️  Please change the password after first login!")

    return admin_user


def create_sample_data(db_session):
    """Create sample curation data for testing."""
    print("📄 Creating sample data...")

    # Check if sample data already exists
    existing_queue = db_session.query(CurationQueue).first()
    if existing_queue:
        print("ℹ️  Sample data already exists")
        return

    # This would typically be populated from actual image uploads
    # For now, we'll just confirm the tables are working
    print("✅ Sample data structure ready")


def setup_admin_system():
    """Main setup function."""
    print("🚀 Setting up Impact Database Admin System")
    print("=" * 50)

    try:
        # Create tables
        create_tables()

        # Create database session
        engine = create_engine(DATABASE_URL)
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        db = SessionLocal()

        try:
            # Create admin user
            admin_user = create_admin_user(db)

            # Create sample data
            create_sample_data(db)

            print("\n🎉 Setup completed successfully!")
            print("\nNext steps:")
            print("1. Start the API server: python core/main.py")
            print("2. Access admin interface at: http://localhost:8000/docs")
            print("3. Run tests: ./test_admin_features.sh")
            print("4. Create additional users via the admin API")

        finally:
            db.close()

    except Exception as e:
        print(f"❌ Setup failed: {str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    setup_admin_system()

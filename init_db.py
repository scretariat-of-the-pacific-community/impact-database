#!/usr/bin/env python3
"""Initialize database schema by running migrations."""
import sys
import os
from alembic.config import Config
from alembic.command import upgrade

# Setup path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Load Alembic config
alembic_cfg = Config("app/alembic/alembic.ini")

# Run all migrations
print("Running database migrations...")
try:
    upgrade(alembic_cfg, "head")
    print("✓ Database migrations completed successfully")
except Exception as e:
    print(f"✗ Migration error: {e}")
    sys.exit(1)

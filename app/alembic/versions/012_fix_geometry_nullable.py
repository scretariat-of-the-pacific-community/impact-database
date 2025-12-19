"""Fix geometry column to be nullable

Revision ID: 012_fix_geometry_nullable
Revises: 011_add_validation_errors_column
Create Date: 2025-12-19 00:00:00.000000

This migration fixes a schema mismatch where the geometry column
was incorrectly set as NOT NULL in the database, while the SQLAlchemy
model defines it as nullable=True. This allows images without GPS
coordinates to be uploaded successfully.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '012_fix_geometry_nullable'
down_revision = '010_add_achievements'
branch_labels = None
depends_on = None

def upgrade():
    """Make geometry column nullable"""
    op.alter_column(
        'image_metadata',
        'geometry',
        nullable=True,
        existing_type=sa.Text(),  # Will be handled by PostGIS
        existing_nullable=False
    )

def downgrade():
    """Revert geometry column to NOT NULL (not recommended)"""
    # Note: This will fail if there are any NULL geometry values
    op.alter_column(
        'image_metadata',
        'geometry',
        nullable=False,
        existing_type=sa.Text(),
        existing_nullable=True
    )

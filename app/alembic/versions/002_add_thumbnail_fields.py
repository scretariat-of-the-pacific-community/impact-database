"""Add thumbnail fields to ImageMetadata

Revision ID: 002_add_thumbnail_fields
Revises: None
Create Date: 2025-08-10 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '002_add_thumbnail_fields'
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    """Add thumbnail_url and thumbnail_key columns to image_metadata table"""
    # Add thumbnail_url column
    op.add_column('image_metadata', sa.Column('thumbnail_url', sa.String(), nullable=True))
    
    # Add thumbnail_key column
    op.add_column('image_metadata', sa.Column('thumbnail_key', sa.String(), nullable=True))

def downgrade():
    """Remove thumbnail fields from image_metadata table"""
    # Remove thumbnail columns
    op.drop_column('image_metadata', 'thumbnail_key')
    op.drop_column('image_metadata', 'thumbnail_url')

"""Add featured stories and before/after image pairing fields

Revision ID: 017_add_featured_stories_fields
Revises: 73aeb4a0da8a
Create Date: 2026-01-08

This migration adds:
- before_image_id: Link to a "before" image for comparison slider
- is_featured: Mark images as featured stories
- featured_priority: Order priority for featured display
- featured_description: Custom description for featured stories

Example: Tonga volcanic eruption before/after satellite imagery
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '017_add_featured_stories_fields'
down_revision = '73aeb4a0da8a'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add before_image_id for linking before/after image pairs
    op.add_column('image_metadata', sa.Column(
        'before_image_id', 
        postgresql.UUID(as_uuid=True), 
        sa.ForeignKey('image_metadata.id'),
        nullable=True,
        comment='Reference to the "before" image for comparison sliders'
    ))
    
    # Add featured story fields
    op.add_column('image_metadata', sa.Column(
        'is_featured', 
        sa.Boolean(), 
        nullable=False, 
        server_default='false',
        comment='Mark as a featured story on homepage'
    ))
    
    op.add_column('image_metadata', sa.Column(
        'featured_priority', 
        sa.SmallInteger(), 
        nullable=True,
        server_default='0',
        comment='Display priority (higher = more prominent)'
    ))
    
    op.add_column('image_metadata', sa.Column(
        'featured_description', 
        sa.Text(), 
        nullable=True,
        comment='Custom rich description for featured story display'
    ))
    
    # Create index for efficient featured stories query
    op.create_index(
        'ix_image_metadata_is_featured',
        'image_metadata',
        ['is_featured', 'featured_priority'],
        postgresql_where=sa.text("is_featured = true")
    )
    
    # Create index for before_image lookups
    op.create_index(
        'ix_image_metadata_before_image_id',
        'image_metadata',
        ['before_image_id'],
        postgresql_where=sa.text("before_image_id IS NOT NULL")
    )


def downgrade() -> None:
    op.drop_index('ix_image_metadata_before_image_id', table_name='image_metadata')
    op.drop_index('ix_image_metadata_is_featured', table_name='image_metadata')
    op.drop_column('image_metadata', 'featured_description')
    op.drop_column('image_metadata', 'featured_priority')
    op.drop_column('image_metadata', 'is_featured')
    op.drop_column('image_metadata', 'before_image_id')

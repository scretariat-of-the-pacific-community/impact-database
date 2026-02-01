"""Add polymorphic support to curation queue for both images and videos.

Revision ID: 022_polymorphic_curation_queue
Revises: 021_video_metadata
Create Date: 2026-01-27 03:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '022_polymorphic_curation_queue'
down_revision = '021_video_metadata'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add new columns for polymorphic support
    op.add_column('curation_queue', sa.Column('content_type', sa.String(20), nullable=True, server_default='image'))
    op.add_column('curation_queue', sa.Column('content_id', postgresql.UUID(as_uuid=True), nullable=True))
    
    # Create index on content_id for performance
    op.create_index('ix_curation_queue_content_id', 'curation_queue', ['content_id'])
    op.create_index('ix_curation_queue_content_type', 'curation_queue', ['content_type'])
    
    # Migrate existing data: set content_id = image_id and content_type = 'image' for existing records
    op.execute("""
        UPDATE curation_queue 
        SET content_id = image_id, content_type = 'image' 
        WHERE content_id IS NULL AND image_id IS NOT NULL
    """)
    
    # Make image_id nullable since new records may be videos
    op.alter_column('curation_queue', 'image_id',
               existing_type=postgresql.UUID(as_uuid=True),
               nullable=True)


def downgrade() -> None:
    # Restore image_id to NOT NULL
    op.alter_column('curation_queue', 'image_id',
               existing_type=postgresql.UUID(as_uuid=True),
               nullable=False)
    
    # Remove indexes
    op.drop_index('ix_curation_queue_content_type', table_name='curation_queue')
    op.drop_index('ix_curation_queue_content_id', table_name='curation_queue')
    
    # Remove columns
    op.drop_column('curation_queue', 'content_id')
    op.drop_column('curation_queue', 'content_type')

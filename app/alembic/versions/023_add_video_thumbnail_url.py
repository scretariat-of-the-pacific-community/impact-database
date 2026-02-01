"""Add thumbnail_url column to video_metadata table.

Revision ID: 023_add_video_thumbnail_url
Revises: 022_polymorphic_curation_queue
Create Date: 2026-01-29 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '023_add_video_thumbnail_url'
down_revision = '022_polymorphic_curation_queue'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add thumbnail_url column if it doesn't exist
    try:
        op.add_column('video_metadata', sa.Column('thumbnail_url', sa.String(255), nullable=True))
    except Exception:
        pass  # Column already exists
    
    try:
        op.add_column('video_metadata', sa.Column('poster_url', sa.String(255), nullable=True))
    except Exception:
        pass  # Column already exists


def downgrade() -> None:
    # Remove columns if they exist
    try:
        op.drop_column('video_metadata', 'poster_url')
    except Exception:
        pass
    
    try:
        op.drop_column('video_metadata', 'thumbnail_url')
    except Exception:
        pass

"""Add thumbnail_url column to video_metadata table.

Revision ID: 023_add_video_thumbnail_url
Revises: 022_polymorphic_curation_queue
Create Date: 2026-01-29 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = '023_add_video_thumbnail_url'
down_revision = '022_polymorphic_curation_queue'
branch_labels = None
depends_on = None


def column_exists(table_name, column_name):
    """Check if a column exists in a table."""
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns


def upgrade() -> None:
    # Add thumbnail_url column if it doesn't exist
    if not column_exists('video_metadata', 'thumbnail_url'):
        op.add_column('video_metadata', sa.Column('thumbnail_url', sa.String(255), nullable=True))
    
    # Add poster_url column if it doesn't exist
    if not column_exists('video_metadata', 'poster_url'):
        op.add_column('video_metadata', sa.Column('poster_url', sa.String(255), nullable=True))


def downgrade() -> None:
    # Remove columns if they exist
    if column_exists('video_metadata', 'poster_url'):
        op.drop_column('video_metadata', 'poster_url')
    
    if column_exists('video_metadata', 'thumbnail_url'):
        op.drop_column('video_metadata', 'thumbnail_url')

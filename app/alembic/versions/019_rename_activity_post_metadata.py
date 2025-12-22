"""Rename metadata column to post_metadata in activity_posts

Revision ID: 019_rename_metadata
Revises: 018_add_collaboration_tables
Create Date: 2025-12-22 00:00:00.000000

"""
from alembic import op

# revision identifiers, used by Alembic.
revision = '019_rename_metadata'
down_revision = '018_add_collaboration_tables'
branch_labels = None
depends_on = None


def upgrade():
    # Rename metadata column to post_metadata to avoid SQLAlchemy reserved name conflict
    op.alter_column('activity_posts', 'metadata', new_column_name='post_metadata')


def downgrade():
    # Revert the column name change
    op.alter_column('activity_posts', 'post_metadata', new_column_name='metadata')

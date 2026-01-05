"""Merge heads to a single linear chain

Revision ID: 021_merge_heads
Revises: 017_add_collaboration_tables, 020_add_folder_items
Create Date: 2025-12-23 00:15:00.000000

"""
from alembic import op

# revision identifiers, used by Alembic.
revision = '021_merge_heads'
down_revision = ('017_add_collaboration_tables', '020_add_folder_items')
branch_labels = None
depends_on = None


def upgrade():
    # This is a merge point; no operations required.
    pass


def downgrade():
    # Downgrade is a no-op for merge points.
    pass

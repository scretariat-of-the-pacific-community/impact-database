"""Merge heads: image_tagging and migration fixes.

Revision ID: 026_merge_heads
Revises: 024_image_tagging_system, 025_fix_migration_conflicts
Create Date: 2026-02-02 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '026_merge_heads'
down_revision = ('024_image_tagging_system', '025_fix_migration_conflicts')
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Merge multiple migration heads - no schema changes needed."""
    pass


def downgrade() -> None:
    """No downgrade needed for merge."""
    pass

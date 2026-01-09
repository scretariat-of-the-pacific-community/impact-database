"""Add is_locked column to users table

Revision ID: 018_add_is_locked_to_users
Revises: 017_add_featured_stories_fields
Create Date: 2026-01-08 06:30:00.000000

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "018_add_is_locked_to_users"
down_revision = "017_add_featured_stories_fields"
branch_labels = None
depends_on = None


def upgrade():
    """Add is_locked column to users table"""
    op.add_column(
        "users",
        sa.Column("is_locked", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade():
    """Remove is_locked column from users table"""
    op.drop_column("users", "is_locked")

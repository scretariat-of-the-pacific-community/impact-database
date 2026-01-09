"""merge_batch_templates_and_admin_users

Revision ID: 73aeb4a0da8a
Revises: 016_add_batch_templates, 0ead3919fd4f
Create Date: 2026-01-07 22:06:30.897095

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "73aeb4a0da8a"
down_revision = ("016_add_batch_templates", "0ead3919fd4f")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

"""merge password reset and audit log migrations

Revision ID: 020_merge_password_reset_and_audit_log
Revises: 019_add_password_reset_fields, 58f6c72a27d2
Create Date: 2026-01-27 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '020_merge_password_reset_and_audit_log'
down_revision = ('019_add_password_reset_fields', '58f6c72a27d2')
branch_labels = None
depends_on = None


def upgrade() -> None:
    # This is a merge migration, no changes needed
    pass


def downgrade() -> None:
    # This is a merge migration, no changes needed
    pass

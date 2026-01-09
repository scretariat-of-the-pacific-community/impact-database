"""Add validation_errors column to audit_logs

Revision ID: 011_validation_errors
Revises: 010_add_achievements
Create Date: 2025-12-19 04:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "011_validation_errors"
down_revision = "010_add_achievements"
branch_labels = None
depends_on = None


def upgrade():
    """Add validation_errors JSONB column to audit_logs table"""
    # Add validation_errors column if it doesn't exist
    op.execute(
        """
        ALTER TABLE audit_logs
        ADD COLUMN IF NOT EXISTS validation_errors jsonb;
    """
    )


def downgrade():
    """Remove validation_errors column from audit_logs table"""
    op.drop_column("audit_logs", "validation_errors")

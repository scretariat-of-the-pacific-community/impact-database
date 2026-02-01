"""add_missing_audit_log_columns

Revision ID: 58f6c72a27d2
Revises: 018_add_is_locked_to_users
Create Date: 2026-01-25 22:24:22.356769

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '58f6c72a27d2'
down_revision = '018_add_is_locked_to_users'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add missing columns to user_audit_logs table
    op.add_column('user_audit_logs', sa.Column('resource_type', sa.String(), nullable=True))
    op.add_column('user_audit_logs', sa.Column('resource_id', sa.String(), nullable=True))
    op.add_column('user_audit_logs', sa.Column('timestamp', sa.DateTime(), nullable=True))
    op.add_column('user_audit_logs', sa.Column('success', sa.Boolean(), nullable=True, server_default='true'))
    op.add_column('user_audit_logs', sa.Column('error_message', sa.String(), nullable=True))
    
    # Copy created_at to timestamp for existing rows
    op.execute("UPDATE user_audit_logs SET timestamp = created_at WHERE timestamp IS NULL")


def downgrade() -> None:
    op.drop_column('user_audit_logs', 'error_message')
    op.drop_column('user_audit_logs', 'success')
    op.drop_column('user_audit_logs', 'timestamp')
    op.drop_column('user_audit_logs', 'resource_id')
    op.drop_column('user_audit_logs', 'resource_type')

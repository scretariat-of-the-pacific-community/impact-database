"""Add push_subscriptions table for web push notifications

Revision ID: 007_add_push_subscriptions
Revises: 006_add_rbac_foundation
Create Date: 2025-12-18 00:00:00.000000

"""
import sqlalchemy as sa
from alembic import op
from datetime import datetime

# revision identifiers, used by Alembic.
revision = "007_add_push_subscriptions"
down_revision = "006_add_rbac_foundation"
branch_labels = None
depends_on = None


def upgrade():
    """
    Create push_subscriptions table for storing web push notification subscriptions
    """
    op.create_table(
        'push_subscriptions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('endpoint', sa.String(length=500), nullable=False),
        sa.Column('p256dh', sa.String(length=200), nullable=False),
        sa.Column('auth', sa.String(length=50), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, default=datetime.utcnow),
        sa.Column('last_used', sa.DateTime(), nullable=False, default=datetime.utcnow),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('endpoint', name='uq_push_subscriptions_endpoint')
    )
    
    # Create indexes for better query performance
    op.create_index('ix_push_subscriptions_user_id', 'push_subscriptions', ['user_id'])
    op.create_index('ix_push_subscriptions_last_used', 'push_subscriptions', ['last_used'])


def downgrade():
    """
    Drop push_subscriptions table
    """
    op.drop_index('ix_push_subscriptions_last_used', table_name='push_subscriptions')
    op.drop_index('ix_push_subscriptions_user_id', table_name='push_subscriptions')
    op.drop_table('push_subscriptions')

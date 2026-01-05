"""Add workspace collaboration tables

Revision ID: 016_add_workspaces
Revises: 015_add_upload_batches
Create Date: 2024-02-15 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '016_add_workspaces'
down_revision = '015_add_upload_batches'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'workspaces',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column('name', sa.String(length=150), nullable=False),
        sa.Column('description', sa.String(length=500), nullable=True),
        sa.Column('owner_id', sa.String(), sa.ForeignKey('users.username', ondelete='SET NULL'), nullable=True, index=True),
        sa.Column('settings', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
    )
    op.create_index('ix_workspaces_owner_id', 'workspaces', ['owner_id'])

    op.create_table(
        'workspace_members',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('workspace_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workspaces.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('user_id', sa.String(), sa.ForeignKey('users.username', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('role', sa.String(length=20), nullable=False, server_default='viewer'),
        sa.Column('invited_by', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.UniqueConstraint('workspace_id', 'user_id', name='uq_workspace_member')
    )
    op.create_index('ix_workspace_members_workspace_id', 'workspace_members', ['workspace_id'])
    op.create_index('ix_workspace_members_user_id', 'workspace_members', ['user_id'])
    op.create_index('ix_workspace_members_role', 'workspace_members', ['role'])

    op.create_table(
        'workspace_channels',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('workspace_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workspaces.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.UniqueConstraint('workspace_id', 'name', name='uq_workspace_channel_name')
    )
    op.create_index('ix_workspace_channels_workspace_id', 'workspace_channels', ['workspace_id'])


def downgrade():
    op.drop_index('ix_workspace_channels_workspace_id', table_name='workspace_channels')
    op.drop_table('workspace_channels')

    op.drop_index('ix_workspace_members_role', table_name='workspace_members')
    op.drop_index('ix_workspace_members_user_id', table_name='workspace_members')
    op.drop_index('ix_workspace_members_workspace_id', table_name='workspace_members')
    op.drop_table('workspace_members')

    op.drop_index('ix_workspaces_owner_id', table_name='workspaces')
    op.drop_table('workspaces')

"""Add collaboration tables for follows, activity posts, and invitations

Revision ID: 017_add_collaboration_tables
Revises: 016_add_workspaces
Create Date: 2024-02-15 00:10:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '017_add_collaboration_tables'
down_revision = '016_add_workspaces'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'followed_areas',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column('user_id', sa.String(), sa.ForeignKey('users.username', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('target_type', sa.String(length=20), nullable=False),
        sa.Column('target_value', sa.String(length=200), nullable=False),
        sa.Column('context', sa.String(length=200), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.UniqueConstraint('user_id', 'target_type', 'target_value', name='uq_follow'),
    )
    op.create_index('ix_followed_areas_user_id', 'followed_areas', ['user_id'])
    op.create_index('ix_followed_areas_target', 'followed_areas', ['target_type', 'target_value'])

    op.create_table(
        'activity_posts',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column('author_id', sa.String(), sa.ForeignKey('users.username', ondelete='SET NULL'), nullable=True, index=True),
        sa.Column('workspace_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workspaces.id', ondelete='SET NULL'), nullable=True, index=True),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('metadata', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP'), index=True),
        sa.Column('is_pinned', sa.Boolean(), nullable=False, server_default='false'),
        sa.UniqueConstraint('author_id', 'created_at', name='uq_activity_post_author_timestamp'),
    )
    op.create_index('ix_activity_posts_workspace_id', 'activity_posts', ['workspace_id'])
    op.create_index('ix_activity_posts_author_id', 'activity_posts', ['author_id'])

    op.create_table(
        'workspace_invitations',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column('workspace_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workspaces.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('invitee_email', sa.String(length=255), nullable=False, index=True),
        sa.Column('invitee_username', sa.String(), sa.ForeignKey('users.username', ondelete='SET NULL'), nullable=True, index=True),
        sa.Column('invited_by', sa.String(), sa.ForeignKey('users.username', ondelete='SET NULL'), nullable=True, index=True),
        sa.Column('role', sa.String(length=20), nullable=False, server_default='viewer'),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='pending'),
        sa.Column('token', sa.String(length=64), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint('workspace_id', 'invitee_email', name='uq_workspace_invitee'),
    )
    op.create_index('ix_workspace_invitations_workspace_id', 'workspace_invitations', ['workspace_id'])
    op.create_index('ix_workspace_invitations_invited_by', 'workspace_invitations', ['invited_by'])


def downgrade():
    op.drop_index('ix_workspace_invitations_invited_by', table_name='workspace_invitations')
    op.drop_index('ix_workspace_invitations_workspace_id', table_name='workspace_invitations')
    op.drop_table('workspace_invitations')

    op.drop_index('ix_activity_posts_author_id', table_name='activity_posts')
    op.drop_index('ix_activity_posts_workspace_id', table_name='activity_posts')
    op.drop_table('activity_posts')

    op.drop_index('ix_followed_areas_target', table_name='followed_areas')
    op.drop_index('ix_followed_areas_user_id', table_name='followed_areas')
    op.drop_table('followed_areas')

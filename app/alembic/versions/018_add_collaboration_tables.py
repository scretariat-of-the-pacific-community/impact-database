"""Add collaboration tables for follows, posts, and invitations

Revision ID: 018_add_collaboration_tables
Revises: 017_add_shared_folders
Create Date: 2025-12-22

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '018_add_collaboration_tables'
down_revision = '017_add_shared_folders'
branch_labels = None
depends_on = None


def upgrade():
    # Create followed_areas table (replaces 'follows' from original plan)
    op.create_table(
        'followed_areas',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('target_type', sa.String(length=20), nullable=False),
        sa.Column('target_value', sa.String(length=200), nullable=False),
        sa.Column('context', sa.String(length=200), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.username'], ondelete='CASCADE'),
        sa.UniqueConstraint('user_id', 'target_type', 'target_value', name='uq_follow'),
    )
    op.create_index('ix_followed_areas_user_id', 'followed_areas', ['user_id'])

    # Create activity_posts table (replaces 'team_posts' from original plan)
    op.create_table(
        'activity_posts',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('author_id', sa.String(), nullable=True),
        sa.Column('workspace_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('metadata', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('is_pinned', sa.Boolean(), server_default='false', nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['author_id'], ['users.username'], ondelete='SET NULL'),
        # Note: workspace FK constraint commented out until workspaces table exists
        # sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='SET NULL'),
        sa.UniqueConstraint('author_id', 'created_at', name='uq_activity_post_author_timestamp'),
    )
    op.create_index('ix_activity_posts_author_id', 'activity_posts', ['author_id'])
    op.create_index('ix_activity_posts_workspace_id', 'activity_posts', ['workspace_id'])
    op.create_index('ix_activity_posts_created_at', 'activity_posts', ['created_at'])

    # Create workspace_invitations table
    op.create_table(
        'workspace_invitations',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('workspace_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('invitee_email', sa.String(length=255), nullable=False),
        sa.Column('invitee_username', sa.String(), nullable=True),
        sa.Column('invited_by', sa.String(), nullable=True),
        sa.Column('role', sa.String(length=20), server_default='viewer', nullable=False),
        sa.Column('status', sa.String(length=20), server_default='pending', nullable=False),
        sa.Column('token', sa.String(length=64), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        # Note: workspace FK constraint commented out until workspaces table exists
        # sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['invitee_username'], ['users.username'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['invited_by'], ['users.username'], ondelete='SET NULL'),
        sa.UniqueConstraint('workspace_id', 'invitee_email', name='uq_workspace_invitee'),
    )
    op.create_index('ix_workspace_invitations_workspace_id', 'workspace_invitations', ['workspace_id'])
    op.create_index('ix_workspace_invitations_invitee_email', 'workspace_invitations', ['invitee_email'])
    op.create_index('ix_workspace_invitations_invitee_username', 'workspace_invitations', ['invitee_username'])
    op.create_index('ix_workspace_invitations_invited_by', 'workspace_invitations', ['invited_by'])

    # Add check constraints
    op.execute("""
        ALTER TABLE followed_areas 
        ADD CONSTRAINT chk_followed_areas_target_type 
        CHECK (target_type IN ('hazard', 'region'))
    """)

    op.execute("""
        ALTER TABLE workspace_invitations 
        ADD CONSTRAINT chk_workspace_invitations_role 
        CHECK (role IN ('admin', 'editor', 'viewer'))
    """)

    op.execute("""
        ALTER TABLE workspace_invitations 
        ADD CONSTRAINT chk_workspace_invitations_status 
        CHECK (status IN ('pending', 'accepted', 'declined', 'expired'))
    """)


def downgrade():
    op.drop_index('ix_workspace_invitations_invited_by', table_name='workspace_invitations')
    op.drop_index('ix_workspace_invitations_invitee_username', table_name='workspace_invitations')
    op.drop_index('ix_workspace_invitations_invitee_email', table_name='workspace_invitations')
    op.drop_index('ix_workspace_invitations_workspace_id', table_name='workspace_invitations')
    op.drop_table('workspace_invitations')

    op.drop_index('ix_activity_posts_created_at', table_name='activity_posts')
    op.drop_index('ix_activity_posts_workspace_id', table_name='activity_posts')
    op.drop_index('ix_activity_posts_author_id', table_name='activity_posts')
    op.drop_table('activity_posts')

    op.drop_index('ix_followed_areas_user_id', table_name='followed_areas')
    op.drop_table('followed_areas')

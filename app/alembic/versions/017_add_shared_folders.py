"""Add shared folders and folder watches

Revision ID: 017_add_shared_folders
Revises: 016_add_workspaces
Create Date: 2025-12-22

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '017_add_shared_folders'
down_revision = '016_add_workspaces'
branch_labels = None
depends_on = None


def upgrade():
    # Create shared_folders table
    op.create_table(
        'shared_folders',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('workspace_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('owner_id', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('hazard_filter', sa.String(length=50), nullable=True),
        sa.Column('region_filter', sa.String(length=200), nullable=True),
        sa.Column('is_public', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        # Removed workspace FK constraint - workspace_id can be null or reference external system
        sa.ForeignKeyConstraint(['owner_id'], ['users.username'], ondelete='CASCADE'),
    )
    op.create_index('ix_shared_folders_workspace_id', 'shared_folders', ['workspace_id'])
    op.create_index('ix_shared_folders_owner_id', 'shared_folders', ['owner_id'])

    # Create folder_watches table
    op.create_table(
        'folder_watches',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('folder_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['folder_id'], ['shared_folders.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.username'], ondelete='CASCADE'),
        sa.UniqueConstraint('folder_id', 'user_id', name='uq_folder_watch'),
    )
    op.create_index('ix_folder_watches_folder_id', 'folder_watches', ['folder_id'])
    op.create_index('ix_folder_watches_user_id', 'folder_watches', ['user_id'])

    # NOTE: folder_items table requires 'images' table to exist
    # This will be added in a future migration when images table is confirmed
    # For now, folders and watches are functional without items


def downgrade():
    # op.drop_index('ix_folder_items_image_id', table_name='folder_items')
    # op.drop_index('ix_folder_items_folder_id', table_name='folder_items')
    # op.drop_table('folder_items')
    
    op.drop_index('ix_folder_watches_user_id', table_name='folder_watches')
    op.drop_index('ix_folder_watches_folder_id', table_name='folder_watches')
    op.drop_table('folder_watches')
    
    op.drop_index('ix_shared_folders_owner_id', table_name='shared_folders')
    op.drop_index('ix_shared_folders_workspace_id', table_name='shared_folders')
    op.drop_table('shared_folders')

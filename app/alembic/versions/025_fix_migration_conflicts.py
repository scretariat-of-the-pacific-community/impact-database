"""Fix migration conflicts and schema issues.

Revision ID: 025_fix_migration_conflicts
Revises: 023_add_video_thumbnail_url
Create Date: 2026-02-02 00:00:00.000000

This migration fixes:
1. Duplicate poster_url column creation
2. Missing queue_id references
3. Schema inconsistencies
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = '025_fix_migration_conflicts'
down_revision = '023_add_video_thumbnail_url'
branch_labels = None
depends_on = None


def column_exists(table_name, column_name):
    """Check if a column exists in a table."""
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns


def table_exists(table_name):
    """Check if a table exists."""
    bind = op.get_bind()
    inspector = inspect(bind)
    return table_name in inspector.get_table_names()


def upgrade() -> None:
    """Apply schema fixes."""
    
    # 1. Ensure video_metadata has both poster_url and thumbnail_url
    if table_exists('video_metadata'):
        if not column_exists('video_metadata', 'poster_url'):
            op.add_column('video_metadata', sa.Column('poster_url', sa.String(255), nullable=True))
        
        if not column_exists('video_metadata', 'thumbnail_url'):
            op.add_column('video_metadata', sa.Column('thumbnail_url', sa.String(255), nullable=True))
    
    # 2. Ensure curation_queue has polymorphic fields
    if table_exists('curation_queue'):
        if not column_exists('curation_queue', 'content_type'):
            op.add_column('curation_queue', sa.Column('content_type', sa.String(20), 
                                                       nullable=True, server_default='image'))
        
        if not column_exists('curation_queue', 'content_id'):
            op.add_column('curation_queue', sa.Column('content_id', postgresql.UUID(as_uuid=True), nullable=True))
            
            # Migrate existing data
            op.execute("""
                UPDATE curation_queue 
                SET content_id = image_id, content_type = 'image' 
                WHERE content_id IS NULL AND image_id IS NOT NULL
            """)
        
        # Make image_id nullable for video support
        try:
            op.alter_column('curation_queue', 'image_id',
                           existing_type=postgresql.UUID(as_uuid=True),
                           nullable=True)
        except Exception:
            pass  # Already nullable
        
        # Create indexes if they don't exist
        try:
            op.create_index('ix_curation_queue_content_id', 'curation_queue', ['content_id'])
        except Exception:
            pass  # Index already exists
        
        try:
            op.create_index('ix_curation_queue_content_type', 'curation_queue', ['content_type'])
        except Exception:
            pass  # Index already exists
    
    # 3. Ensure curation_comments exists with correct schema
    if not table_exists('curation_comments'):
        op.create_table(
            'curation_comments',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('queue_item_id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('author', sa.String(), nullable=False),
            sa.Column('content', sa.Text(), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('comment_type', sa.String(), server_default='general'),
            sa.Column('is_internal', sa.Boolean(), server_default='false'),
            sa.Column('parent_comment_id', postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column('is_deleted', sa.Boolean(), server_default='false'),
            sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        )
        
        op.create_foreign_key(
            'fk_curation_comments_queue',
            'curation_comments', 'curation_queue',
            ['queue_item_id'], ['id'],
            ondelete='CASCADE'
        )
        
        op.create_foreign_key(
            'fk_curation_comments_parent',
            'curation_comments', 'curation_comments',
            ['parent_comment_id'], ['id'],
            ondelete='SET NULL'
        )
        
        op.create_index('ix_curation_comments_queue_item_id', 'curation_comments', ['queue_item_id'])
        op.create_index('ix_curation_comments_author', 'curation_comments', ['author'])
    
    # 4. Ensure curation_actions exists with correct schema
    if not table_exists('curation_actions'):
        op.create_table(
            'curation_actions',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('queue_item_id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('action_type', sa.String(), nullable=False),
            sa.Column('performed_by', sa.String(), nullable=False),
            sa.Column('performed_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('metadata_changes', postgresql.JSON(astext_type=sa.Text()), nullable=True),
            sa.Column('notes', sa.Text(), nullable=True),
            sa.Column('related_item_id', sa.String(), nullable=True),
        )
        
        op.create_foreign_key(
            'fk_curation_actions_queue',
            'curation_actions', 'curation_queue',
            ['queue_item_id'], ['id'],
            ondelete='CASCADE'
        )
        
        op.create_index('ix_curation_actions_queue_item_id', 'curation_actions', ['queue_item_id'])
        op.create_index('ix_curation_actions_action_type', 'curation_actions', ['action_type'])
        op.create_index('ix_curation_actions_performed_by', 'curation_actions', ['performed_by'])


def downgrade() -> None:
    """Revert schema fixes."""
    # This is a fix migration, downgrade is not recommended
    pass

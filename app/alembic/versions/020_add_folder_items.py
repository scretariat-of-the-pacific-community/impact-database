"""Add folder_items table referencing image_metadata

Revision ID: 020_add_folder_items
Revises: 019_rename_metadata
Create Date: 2025-12-23 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '020_add_folder_items'
down_revision = '019_rename_metadata'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'folder_items',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column('folder_id', postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column('image_id', postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column('added_by', sa.String(), nullable=True),
        sa.Column('added_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['folder_id'], ['shared_folders.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['image_id'], ['image_metadata.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['added_by'], ['users.username'], ondelete='SET NULL'),
        sa.UniqueConstraint('folder_id', 'image_id', name='uq_folder_item'),
    )
    # Note: indexes will be created automatically due to index=True on columns


def downgrade():
    op.drop_table('folder_items')

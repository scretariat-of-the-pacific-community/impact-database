"""Add batch_templates table

Revision ID: 016_add_batch_templates
Revises: 015_add_upload_batches
Create Date: 2026-01-07

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '016_add_batch_templates'
down_revision = '015_add_upload_batches'  # Points to upload_batches migration
branch_labels = None
depends_on = None


def upgrade():
    """Create batch_templates table."""
    op.create_table(
        'batch_templates',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', sa.String(), nullable=False, index=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('template_data', postgresql.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, index=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('use_count', sa.String(), default='0'),
        sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True),
    )
    
    # Create index on user_id for faster queries
    op.create_index('ix_batch_templates_user_id', 'batch_templates', ['user_id'])


def downgrade():
    """Drop batch_templates table."""
    op.drop_index('ix_batch_templates_user_id', 'batch_templates')
    op.drop_table('batch_templates')

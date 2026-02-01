"""Add image tagging and report linking tables.

Revision ID: 024_image_tagging_system
Revises: 023_add_video_thumbnail_url
Create Date: 2026-01-29 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = '024_image_tagging_system'
down_revision = '023_add_video_thumbnail_url'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create image_tags table
    op.create_table(
        'image_tags',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text('gen_random_uuid()')),
        sa.Column('image_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('tag_name', sa.String(100), nullable=False),
        sa.Column('tag_category', sa.String(50), nullable=True),  # E.g., 'damage-type', 'content-type', 'location'
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(['image_id'], ['image_metadata.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_image_tags_image_id', 'image_tags', ['image_id'])
    op.create_index('ix_image_tags_tag_name', 'image_tags', ['tag_name'])
    op.create_index('ix_image_tags_tag_category', 'image_tags', ['tag_category'])
    op.create_unique_constraint('uq_image_tag_unique', 'image_tags', ['image_id', 'tag_name'])

    # Create image_report_links table
    op.create_table(
        'image_report_links',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text('gen_random_uuid()')),
        sa.Column('image_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('report_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('report_tags', sa.JSON(), nullable=True),  # Tags specific to this image in this report
        sa.Column('linked_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('linked_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['image_id'], ['image_metadata.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_image_report_links_image_id', 'image_report_links', ['image_id'])
    op.create_index('ix_image_report_links_report_id', 'image_report_links', ['report_id'])
    op.create_unique_constraint('uq_image_report_link_unique', 'image_report_links', ['image_id', 'report_id'])

    # Create image_usage_stats table for tracking
    op.create_table(
        'image_usage_stats',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text('gen_random_uuid()')),
        sa.Column('image_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('reports_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_views', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_downloads', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('last_used_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['image_id'], ['image_metadata.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('image_id')
    )
    op.create_index('ix_image_usage_stats_reports_count', 'image_usage_stats', ['reports_count'])

    # Grant permissions
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON image_tags TO postgres")
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON image_report_links TO postgres")
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON image_usage_stats TO postgres")


def downgrade() -> None:
    # Drop tables
    op.drop_table('image_usage_stats')
    op.drop_table('image_report_links')
    op.drop_table('image_tags')

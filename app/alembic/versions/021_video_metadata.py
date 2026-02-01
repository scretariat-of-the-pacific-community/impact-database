"""Add video metadata table

Revision ID: 021_video_metadata
Revises: 020_merge_password_reset_and_audit_log
Create Date: 2026-01-27 (Ticket 1.5)

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import geoalchemy2

# revision identifiers, used by Alembic.
revision = '021_video_metadata'
down_revision = '020_merge_password_reset_and_audit_log'
branch_labels = None
depends_on = None


def upgrade():
    # Create video_metadata table
    op.create_table(
        'video_metadata',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        
        # File information
        sa.Column('filename', sa.String(), nullable=False),
        sa.Column('original_filename', sa.String(), nullable=True),
        sa.Column('file_size', sa.BigInteger(), nullable=False),
        sa.Column('file_hash', sa.String(64), nullable=True),
        
        # Video-specific metadata
        sa.Column('media_type', sa.String(), nullable=False, server_default='video'),
        sa.Column('duration', sa.Float(), nullable=True),
        sa.Column('width', sa.SmallInteger(), nullable=True),
        sa.Column('height', sa.SmallInteger(), nullable=True),
        sa.Column('fps', sa.Float(), nullable=True),
        sa.Column('codec', sa.String(50), nullable=True),
        sa.Column('container_format', sa.String(50), nullable=True),
        sa.Column('bitrate', sa.Integer(), nullable=True),
        
        # Processing state
        sa.Column('processing_state', sa.String(), nullable=False, server_default='queued'),
        sa.Column('processing_error', sa.Text(), nullable=True),
        sa.Column('processing_started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('processing_completed_at', sa.DateTime(timezone=True), nullable=True),
        
        # Storage references
        sa.Column('poster_url', sa.String(), nullable=True),
        sa.Column('poster_key', sa.String(), nullable=True),
        sa.Column('variants', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        
        # Geospatial data
        sa.Column('geometry', geoalchemy2.Geometry(geometry_type='POINTZ', srid=4326), nullable=True),
        sa.Column('altitude', sa.Float(), nullable=True),
        sa.Column('altitude_ref', sa.SmallInteger(), server_default='0', nullable=True),
        
        # Hazard/event metadata
        sa.Column('hazard_type', sa.String(), nullable=False),
        sa.Column('event_id', sa.String(), nullable=True),
        
        # User and permissions
        sa.Column('uploader_id', sa.String(), nullable=False),
        sa.Column('source_type', sa.String(), nullable=False),
        
        # Content moderation
        sa.Column('status', sa.String(), nullable=False, server_default='pending_review'),
        sa.Column('moderation_flags', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('reviewed_by', sa.String(), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        
        # Metadata
        sa.Column('title', sa.String(), nullable=True),
        sa.Column('abstract', sa.Text(), nullable=True),
        sa.Column('keywords', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('data_license', sa.String(), nullable=False, 
                  server_default='https://creativecommons.org/licenses/by/4.0/'),
        
        # Analytics
        sa.Column('view_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('download_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('last_viewed_at', sa.DateTime(timezone=True), nullable=True),
    )
    
    # Create indexes for performance
    op.create_index('ix_video_metadata_filename', 'video_metadata', ['filename'], unique=True)
    op.create_index('ix_video_metadata_file_hash', 'video_metadata', ['file_hash'])
    op.create_index('ix_video_metadata_hazard_type', 'video_metadata', ['hazard_type'])
    op.create_index('ix_video_metadata_event_id', 'video_metadata', ['event_id'])
    op.create_index('ix_video_metadata_uploader_id', 'video_metadata', ['uploader_id'])
    op.create_index('ix_video_metadata_status', 'video_metadata', ['status'])
    op.create_index('ix_video_metadata_processing_state', 'video_metadata', ['processing_state'])
    
    # Create spatial index on geometry column using GIST
    op.execute('CREATE INDEX ix_video_metadata_geometry ON video_metadata USING GIST (geometry)')
    
    print("✓ Created video_metadata table with indexes")


def downgrade():
    # Drop indexes first
    op.drop_index('ix_video_metadata_geometry', table_name='video_metadata')
    op.drop_index('ix_video_metadata_processing_state', table_name='video_metadata')
    op.drop_index('ix_video_metadata_status', table_name='video_metadata')
    op.drop_index('ix_video_metadata_uploader_id', table_name='video_metadata')
    op.drop_index('ix_video_metadata_event_id', table_name='video_metadata')
    op.drop_index('ix_video_metadata_hazard_type', table_name='video_metadata')
    op.drop_index('ix_video_metadata_file_hash', table_name='video_metadata')
    op.drop_index('ix_video_metadata_filename', table_name='video_metadata')
    
    # Drop table
    op.drop_table('video_metadata')
    
    print("✓ Dropped video_metadata table")

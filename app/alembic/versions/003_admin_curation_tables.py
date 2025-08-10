"""Create admin and curation tables

Revision ID: 003_admin_curation_tables
Revises: 002_add_thumbnail_fields
Create Date: 2025-01-10 15:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
import uuid

# revision identifiers, used by Alembic.
revision = '003_admin_curation_tables'
down_revision = '002_add_thumbnail_fields'
branch_labels = None
depends_on = None

def upgrade():
    # Create admin_users table
    op.create_table('admin_users',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('username', sa.String(), nullable=False, unique=True),
        sa.Column('email', sa.String(), nullable=False, unique=True),
        sa.Column('full_name', sa.String(), nullable=True),
        sa.Column('password_hash', sa.String(), nullable=False),
        sa.Column('salt', sa.String(), nullable=False),
        sa.Column('role', sa.String(), nullable=False, default='viewer'),
        sa.Column('custom_permissions', sa.JSON(), nullable=True),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('is_verified', sa.Boolean(), default=False),
        sa.Column('is_locked', sa.Boolean(), default=False),
        sa.Column('created_at', sa.DateTime(), default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), default=sa.func.now(), onupdate=sa.func.now()),
        sa.Column('last_login', sa.DateTime(), nullable=True),
        sa.Column('last_password_change', sa.DateTime(), default=sa.func.now()),
        sa.Column('failed_login_attempts', sa.Integer(), default=0),
        sa.Column('lockout_until', sa.DateTime(), nullable=True),
        sa.Column('password_reset_token', sa.String(), nullable=True),
        sa.Column('password_reset_expires', sa.DateTime(), nullable=True),
        sa.Column('email_verification_token', sa.String(), nullable=True),
        sa.Column('organization', sa.String(), nullable=True),
        sa.Column('position', sa.String(), nullable=True),
        sa.Column('timezone', sa.String(), default='UTC'),
        sa.Column('language_preference', sa.String(), default='en'),
    )

    # Create user_sessions table
    op.create_table('user_sessions',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('admin_users.id'), nullable=False),
        sa.Column('session_token', sa.String(), unique=True, nullable=False),
        sa.Column('created_at', sa.DateTime(), default=sa.func.now()),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('last_activity', sa.DateTime(), default=sa.func.now()),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('ip_address', sa.String(), nullable=True),
        sa.Column('user_agent', sa.String(), nullable=True),
        sa.Column('device_info', sa.JSON(), nullable=True),
    )

    # Create user_audit_logs table
    op.create_table('user_audit_logs',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('admin_users.id'), nullable=True),
        sa.Column('action', sa.String(), nullable=False),
        sa.Column('resource_type', sa.String(), nullable=True),
        sa.Column('resource_id', sa.String(), nullable=True),
        sa.Column('timestamp', sa.DateTime(), default=sa.func.now()),
        sa.Column('ip_address', sa.String(), nullable=True),
        sa.Column('user_agent', sa.String(), nullable=True),
        sa.Column('details', sa.JSON(), nullable=True),
        sa.Column('success', sa.Boolean(), default=True),
        sa.Column('error_message', sa.String(), nullable=True),
    )

    # Create curation_queue table
    op.create_table('curation_queue',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('image_filename', sa.String(), sa.ForeignKey('image_metadata.filename'), nullable=False),
        sa.Column('status', sa.String(), default='pending', nullable=False),
        sa.Column('priority', sa.String(), default='medium', nullable=False),
        sa.Column('assigned_to', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), default=sa.func.now(), onupdate=sa.func.now()),
        sa.Column('due_date', sa.DateTime(), nullable=True),
        sa.Column('submitted_by', sa.String(), nullable=True),
        sa.Column('submission_notes', sa.Text(), nullable=True),
        sa.Column('reviewed_by', sa.String(), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(), nullable=True),
        sa.Column('review_notes', sa.Text(), nullable=True),
        sa.Column('is_flagged', sa.Boolean(), default=False),
        sa.Column('flag_reason', sa.String(), nullable=True),
        sa.Column('is_duplicate', sa.Boolean(), default=False),
        sa.Column('duplicate_of', sa.String(), nullable=True),
        sa.Column('is_deleted', sa.Boolean(), default=False),
        sa.Column('deleted_by', sa.String(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
    )

    # Create curation_comments table
    op.create_table('curation_comments',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('queue_item_id', UUID(as_uuid=True), sa.ForeignKey('curation_queue.id'), nullable=False),
        sa.Column('author', sa.String(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), default=sa.func.now(), onupdate=sa.func.now()),
        sa.Column('comment_type', sa.String(), default='general'),
        sa.Column('is_internal', sa.Boolean(), default=False),
        sa.Column('parent_comment_id', UUID(as_uuid=True), sa.ForeignKey('curation_comments.id'), nullable=True),
        sa.Column('is_deleted', sa.Boolean(), default=False),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
    )

    # Create curation_actions table
    op.create_table('curation_actions',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('queue_item_id', UUID(as_uuid=True), sa.ForeignKey('curation_queue.id'), nullable=False),
        sa.Column('action_type', sa.String(), nullable=False),
        sa.Column('performed_by', sa.String(), nullable=False),
        sa.Column('performed_at', sa.DateTime(), default=sa.func.now(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('metadata_changes', sa.JSON(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('related_item_id', sa.String(), nullable=True),
    )

    # Create bulk_imports table
    op.create_table('bulk_imports',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('import_type', sa.String(), nullable=False),
        sa.Column('original_filename', sa.String(), nullable=True),
        sa.Column('total_items', sa.Integer(), default=0),
        sa.Column('processed_items', sa.Integer(), default=0),
        sa.Column('successful_items', sa.Integer(), default=0),
        sa.Column('failed_items', sa.Integer(), default=0),
        sa.Column('status', sa.String(), default='pending'),
        sa.Column('created_at', sa.DateTime(), default=sa.func.now(), nullable=False),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('created_by', sa.String(), nullable=False),
        sa.Column('is_dry_run', sa.Boolean(), default=False),
        sa.Column('import_report', sa.JSON(), nullable=True),
        sa.Column('error_log', sa.JSON(), nullable=True),
        sa.Column('validation_results', sa.JSON(), nullable=True),
        sa.Column('import_settings', sa.JSON(), nullable=True),
        sa.Column('mapping_config', sa.JSON(), nullable=True),
    )

    # Create export_requests table
    op.create_table('export_requests',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('export_type', sa.String(), nullable=False),
        sa.Column('format_options', sa.JSON(), nullable=True),
        sa.Column('filters', sa.JSON(), nullable=True),
        sa.Column('status', sa.String(), default='pending'),
        sa.Column('created_at', sa.DateTime(), default=sa.func.now(), nullable=False),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('requested_by', sa.String(), nullable=False),
        sa.Column('total_records', sa.Integer(), default=0),
        sa.Column('file_url', sa.String(), nullable=True),
        sa.Column('file_size', sa.Integer(), nullable=True),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
    )

    # Create indexes for better performance
    op.create_index('idx_admin_users_username', 'admin_users', ['username'])
    op.create_index('idx_admin_users_email', 'admin_users', ['email'])
    op.create_index('idx_admin_users_role', 'admin_users', ['role'])
    op.create_index('idx_admin_users_is_active', 'admin_users', ['is_active'])
    
    op.create_index('idx_user_sessions_token', 'user_sessions', ['session_token'])
    op.create_index('idx_user_sessions_user_id', 'user_sessions', ['user_id'])
    op.create_index('idx_user_sessions_expires_at', 'user_sessions', ['expires_at'])
    
    op.create_index('idx_user_audit_logs_user_id', 'user_audit_logs', ['user_id'])
    op.create_index('idx_user_audit_logs_action', 'user_audit_logs', ['action'])
    op.create_index('idx_user_audit_logs_timestamp', 'user_audit_logs', ['timestamp'])
    
    op.create_index('idx_curation_queue_status', 'curation_queue', ['status'])
    op.create_index('idx_curation_queue_priority', 'curation_queue', ['priority'])
    op.create_index('idx_curation_queue_assigned_to', 'curation_queue', ['assigned_to'])
    op.create_index('idx_curation_queue_is_flagged', 'curation_queue', ['is_flagged'])
    op.create_index('idx_curation_queue_is_deleted', 'curation_queue', ['is_deleted'])
    op.create_index('idx_curation_queue_created_at', 'curation_queue', ['created_at'])
    
    op.create_index('idx_curation_comments_queue_item_id', 'curation_comments', ['queue_item_id'])
    op.create_index('idx_curation_comments_is_deleted', 'curation_comments', ['is_deleted'])
    
    op.create_index('idx_curation_actions_queue_item_id', 'curation_actions', ['queue_item_id'])
    op.create_index('idx_curation_actions_action_type', 'curation_actions', ['action_type'])
    op.create_index('idx_curation_actions_performed_at', 'curation_actions', ['performed_at'])
    
    op.create_index('idx_bulk_imports_status', 'bulk_imports', ['status'])
    op.create_index('idx_bulk_imports_created_by', 'bulk_imports', ['created_by'])
    op.create_index('idx_bulk_imports_created_at', 'bulk_imports', ['created_at'])
    
    op.create_index('idx_export_requests_status', 'export_requests', ['status'])
    op.create_index('idx_export_requests_requested_by', 'export_requests', ['requested_by'])
    op.create_index('idx_export_requests_created_at', 'export_requests', ['created_at'])

def downgrade():
    # Drop indexes
    op.drop_index('idx_export_requests_created_at')
    op.drop_index('idx_export_requests_requested_by')
    op.drop_index('idx_export_requests_status')
    op.drop_index('idx_bulk_imports_created_at')
    op.drop_index('idx_bulk_imports_created_by')
    op.drop_index('idx_bulk_imports_status')
    op.drop_index('idx_curation_actions_performed_at')
    op.drop_index('idx_curation_actions_action_type')
    op.drop_index('idx_curation_actions_queue_item_id')
    op.drop_index('idx_curation_comments_is_deleted')
    op.drop_index('idx_curation_comments_queue_item_id')
    op.drop_index('idx_curation_queue_created_at')
    op.drop_index('idx_curation_queue_is_deleted')
    op.drop_index('idx_curation_queue_is_flagged')
    op.drop_index('idx_curation_queue_assigned_to')
    op.drop_index('idx_curation_queue_priority')
    op.drop_index('idx_curation_queue_status')
    op.drop_index('idx_user_audit_logs_timestamp')
    op.drop_index('idx_user_audit_logs_action')
    op.drop_index('idx_user_audit_logs_user_id')
    op.drop_index('idx_user_sessions_expires_at')
    op.drop_index('idx_user_sessions_user_id')
    op.drop_index('idx_user_sessions_token')
    op.drop_index('idx_admin_users_is_active')
    op.drop_index('idx_admin_users_role')
    op.drop_index('idx_admin_users_email')
    op.drop_index('idx_admin_users_username')

    # Drop tables
    op.drop_table('export_requests')
    op.drop_table('bulk_imports')
    op.drop_table('curation_actions')
    op.drop_table('curation_comments')
    op.drop_table('curation_queue')
    op.drop_table('user_audit_logs')
    op.drop_table('user_sessions')
    op.drop_table('admin_users')

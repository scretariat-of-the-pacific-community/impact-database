"""Add upload_batches table

Revision ID: 015_add_upload_batches
Revises: 014_add_upload_failures_table
Create Date: 2024-01-XX XX:XX:XX.XXXXXX

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "015_add_upload_batches"
down_revision = "014_add_upload_failures_table"
branch_labels = None
depends_on = None


def upgrade():
    # Create enum type for batch status
    batch_status = postgresql.ENUM(
        "PENDING",
        "PROCESSING",
        "COMPLETED",
        "PARTIAL",
        "FAILED",
        "CANCELLED",
        name="batchstatus",
        create_type=True,
    )
    batch_status.create(op.get_bind(), checkfirst=True)

    # Create upload_batches table
    op.create_table(
        "upload_batches",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("uploader_id", sa.String(255), nullable=False, index=True),
        sa.Column("status", batch_status, nullable=False, server_default="PENDING", index=True),
        sa.Column("total_files", sa.Integer, nullable=False, server_default="0"),
        sa.Column("processed_files", sa.Integer, nullable=False, server_default="0"),
        sa.Column("successful_files", sa.Integer, nullable=False, server_default="0"),
        sa.Column("failed_files", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, index=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True, index=True),
        sa.Column("failure_summary", postgresql.JSONB, nullable=True),
    )

    # Create indexes for common queries
    op.create_index(
        "idx_upload_batches_uploader_status", "upload_batches", ["uploader_id", "status"]
    )
    op.create_index(
        "idx_upload_batches_created_at",
        "upload_batches",
        ["created_at"],
        postgresql_ops={"created_at": "DESC"},
    )


def downgrade():
    # Drop table
    op.drop_table("upload_batches")

    # Drop enum type
    batch_status = postgresql.ENUM(
        "PENDING", "PROCESSING", "COMPLETED", "PARTIAL", "FAILED", "CANCELLED", name="batchstatus"
    )
    batch_status.drop(op.get_bind(), checkfirst=True)

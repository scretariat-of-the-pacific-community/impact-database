"""Add upload_failures table for tracking failed uploads

Revision ID: 014_add_upload_failures_table
Revises: 013_upgrade_to_pointz_exif
Create Date: 2025-12-19 01:00:00.000000

"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "014_add_upload_failures_table"
down_revision = "013_upgrade_to_pointz_exif"
branch_labels = None
depends_on = None


def upgrade():
    # Create failure reason enum type
    failure_reason_enum = sa.Enum(
        "NO_GEOTAG",
        "CORRUPTED_EXIF",
        "UNREADABLE_FILE",
        "INVALID_COORDINATES",
        "UNSUPPORTED_FORMAT",
        "FILE_TOO_LARGE",
        "DUPLICATE_CONTENT",
        "SECURITY_VIOLATION",
        "DATABASE_ERROR",
        "STORAGE_ERROR",
        "VALIDATION_ERROR",
        name="failurereason",
    )

    failure_reason_enum.create(op.get_bind(), checkfirst=True)

    # Create upload_failures table
    op.create_table(
        "upload_failures",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("file_size", sa.BigInteger(), nullable=True),
        sa.Column("mime_type", sa.String(100), nullable=True),
        sa.Column("file_hash", sa.String(64), nullable=True),
        sa.Column("failure_reason", failure_reason_enum, nullable=False),
        sa.Column("error_details", sa.Text(), nullable=True),
        sa.Column("uploader_id", sa.String(), nullable=True),
        sa.Column("attempted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("user_agent", sa.String(500), nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    # Create indexes for common queries
    op.create_index("idx_upload_failures_reason", "upload_failures", ["failure_reason"])
    op.create_index("idx_upload_failures_attempted_at", "upload_failures", ["attempted_at"])
    op.create_index("idx_upload_failures_hash", "upload_failures", ["file_hash"])
    op.create_index("idx_upload_failures_uploader", "upload_failures", ["uploader_id"])


def downgrade():
    # Drop indexes
    op.drop_index("idx_upload_failures_uploader", table_name="upload_failures")
    op.drop_index("idx_upload_failures_hash", table_name="upload_failures")
    op.drop_index("idx_upload_failures_attempted_at", table_name="upload_failures")
    op.drop_index("idx_upload_failures_reason", table_name="upload_failures")

    # Drop table
    op.drop_table("upload_failures")

    # Drop enum type
    sa.Enum(name="failurereason").drop(op.get_bind(), checkfirst=True)

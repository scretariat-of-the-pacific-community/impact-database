"""Add performance indexes for uploader_id queries

Revision ID: 009_add_uploader_indexes
Revises: 008_add_user_data_tables
Create Date: 2025-12-19 14:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "009_add_uploader_indexes"
down_revision = "008_add_user_data_tables"
branch_labels = None
depends_on = None


def upgrade():
    """
    Add performance indexes for common queries:
    - uploader_id queries
    - status filters
    - date range queries
    - composite indexes for common query patterns
    """

    # Index for uploader_id (most common query)
    op.create_index("idx_image_metadata_uploader_id", "image_metadata", ["uploader_id"])

    # Composite index for uploader + status (common filtering)
    op.create_index(
        "idx_image_metadata_uploader_status", "image_metadata", ["uploader_id", "status"]
    )

    # Composite index for uploader + datetime (for timeline queries)
    op.create_index(
        "idx_image_metadata_uploader_datetime", "image_metadata", ["uploader_id", "datetime"]
    )

    # Index for status alone (for admin queries)
    op.create_index("idx_image_metadata_status", "image_metadata", ["status"])

    # Index for hazard_type (for filtering by hazard)
    op.create_index("idx_image_metadata_hazard_type", "image_metadata", ["hazard_type"])

    # Composite index for date range queries
    op.create_index("idx_image_metadata_datetime", "image_metadata", ["datetime"])

    # Composite index for geographic queries (if not using spatial index)
    # Note: PostGIS already creates spatial index for geometry column
    # This is for cases where we query by latitude/longitude directly
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_image_metadata_location
        ON image_metadata (latitude, longitude)
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
    """
    )


def downgrade():
    """Remove performance indexes"""

    op.drop_index("idx_image_metadata_location", table_name="image_metadata")
    op.drop_index("idx_image_metadata_datetime", table_name="image_metadata")
    op.drop_index("idx_image_metadata_hazard_type", table_name="image_metadata")
    op.drop_index("idx_image_metadata_status", table_name="image_metadata")
    op.drop_index("idx_image_metadata_uploader_datetime", table_name="image_metadata")
    op.drop_index("idx_image_metadata_uploader_status", table_name="image_metadata")
    op.drop_index("idx_image_metadata_uploader_id", table_name="image_metadata")

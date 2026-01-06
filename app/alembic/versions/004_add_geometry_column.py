"""Add geometry column to ImageMetadata

Revision ID: 004_add_geometry_column
Revises: 003_admin_curation_tables
Create Date: 2025-08-12 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from geoalchemy2 import Geometry

# revision identifiers, used by Alembic.
revision = "004_add_geometry_column"
down_revision = "003_admin_curation_tables"
branch_labels = None
depends_on = None


def upgrade():
    # Add geometry column
    op.add_column(
        "image_metadata", sa.Column("geometry", Geometry("POINT", srid=4326), nullable=True)
    )

    # Populate geometry from existing latitude and longitude
    op.execute(
        """
        UPDATE image_metadata
        SET geometry = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL
    """
    )

    # Drop old indexes and columns
    op.drop_index("idx_image_metadata_spatial", table_name="image_metadata")
    op.drop_index("idx_image_metadata_composite", table_name="image_metadata")
    op.drop_column("image_metadata", "latitude")
    op.drop_column("image_metadata", "longitude")


def downgrade():
    # Re-add latitude and longitude columns
    op.add_column("image_metadata", sa.Column("longitude", sa.Float(), nullable=True))
    op.add_column("image_metadata", sa.Column("latitude", sa.Float(), nullable=True))

    # Populate lat/long from geometry
    op.execute(
        """
        UPDATE image_metadata
        SET latitude = ST_Y(geometry),
            longitude = ST_X(geometry)
        WHERE geometry IS NOT NULL
    """
    )

    # Recreate indexes
    op.create_index(
        "idx_image_metadata_spatial",
        "image_metadata",
        ["longitude", "latitude"],
        postgresql_where=sa.text("longitude IS NOT NULL AND latitude IS NOT NULL"),
    )
    op.create_index(
        "idx_image_metadata_composite",
        "image_metadata",
        ["hazard_type", "country", "timestamp"],
        postgresql_where=sa.text("hazard_type IS NOT NULL"),
    )

    # Drop geometry column
    op.drop_column("image_metadata", "geometry")

"""Upgrade geometry to PointZ and add EXIF metadata columns

Revision ID: 013_upgrade_to_pointz_exif
Revises: 012_fix_geometry_nullable
Create Date: 2025-12-19 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from geoalchemy2 import Geometry

# revision identifiers, used by Alembic.
revision = "013_upgrade_to_pointz_exif"
down_revision = ("011_validation_errors", "012_fix_geometry_nullable")
branch_labels = None
depends_on = None


def upgrade():
    # Add new EXIF-related columns
    op.add_column(
        "image_metadata",
        sa.Column(
            "altitude", sa.Float(), nullable=True, comment="Altitude in meters from GPS EXIF data"
        ),
    )
    op.add_column(
        "image_metadata",
        sa.Column(
            "altitude_ref",
            sa.SmallInteger(),
            nullable=True,
            server_default="0",
            comment="0=above sea level, 1=below sea level",
        ),
    )
    op.add_column(
        "image_metadata",
        sa.Column(
            "orientation", sa.SmallInteger(), nullable=True, comment="EXIF orientation value (1-8)"
        ),
    )
    op.add_column(
        "image_metadata",
        sa.Column("camera_make", sa.String(100), nullable=True, comment="Camera manufacturer"),
    )
    op.add_column(
        "image_metadata",
        sa.Column("camera_model", sa.String(100), nullable=True, comment="Camera model"),
    )
    op.add_column(
        "image_metadata",
        sa.Column(
            "camera_bearing", sa.Float(), nullable=True, comment="GPS image direction in degrees"
        ),
    )
    op.add_column(
        "image_metadata",
        sa.Column("exif_metadata", sa.JSON(), nullable=True, comment="Full EXIF data as JSON"),
    )

    # Upgrade geometry from POINT to POINTZ (2D to 3D)
    # PostgreSQL/PostGIS allows this upgrade without data loss
    op.execute(
        """
        ALTER TABLE image_metadata
        ALTER COLUMN geometry TYPE Geometry(PointZ, 4326)
        USING ST_Force3D(geometry)
    """
    )

    # Create index on altitude for queries
    op.create_index(
        "idx_image_metadata_altitude",
        "image_metadata",
        ["altitude"],
        postgresql_where=sa.text("altitude IS NOT NULL"),
    )

    # Create index on camera fields for filtering
    op.create_index("idx_image_metadata_camera", "image_metadata", ["camera_make", "camera_model"])

    # Create GiST index on 3D geometry for spatial queries
    op.execute(
        "CREATE INDEX idx_image_metadata_geometry_3d ON image_metadata USING GIST (geometry)"
    )


def downgrade():
    # Drop new indexes
    op.drop_index("idx_image_metadata_geometry_3d", table_name="image_metadata")
    op.drop_index("idx_image_metadata_camera", table_name="image_metadata")
    op.drop_index("idx_image_metadata_altitude", table_name="image_metadata")

    # Downgrade geometry from POINTZ to POINT (loses Z dimension)
    op.execute(
        """
        ALTER TABLE image_metadata
        ALTER COLUMN geometry TYPE Geometry(Point, 4326)
        USING ST_Force2D(geometry)
    """
    )

    # Drop new columns
    op.drop_column("image_metadata", "exif_metadata")
    op.drop_column("image_metadata", "camera_bearing")
    op.drop_column("image_metadata", "camera_model")
    op.drop_column("image_metadata", "camera_make")
    op.drop_column("image_metadata", "orientation")
    op.drop_column("image_metadata", "altitude_ref")
    op.drop_column("image_metadata", "altitude")

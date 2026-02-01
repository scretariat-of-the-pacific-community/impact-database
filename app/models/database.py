import logging
import os
import uuid
from datetime import datetime, timezone

from geoalchemy2 import Geometry
from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    Text,
    create_engine,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import declarative_base, object_session, relationship, sessionmaker

logger = logging.getLogger(__name__)


# Get database URL from unified configuration
def get_database_url():
    """Get database URL from environment with fallback"""
    try:
        from core.config import Settings

        settings = Settings()
        return settings.DATABASE_URL
    except Exception as e:
        logger.warning(f"Could not load settings: {e}, using fallback")
        return os.getenv("DATABASE_URL", "sqlite:///./app.db")


DATABASE_URL = get_database_url()
logger.info(
    f"Using database: {DATABASE_URL.split('@')[0] if '@' in DATABASE_URL else DATABASE_URL}"
)

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Alembic migration hint:
# alembic revision --autogenerate -m "Add core metadata fields to ImageMetadata"
# You will likely need to manually adjust the migration file to handle the
# transition from 'filename' to 'id' and to set default values.


class ImageMetadata(Base):
    __tablename__ = "image_metadata"

    # Core metadata fields
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    datetime = Column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    geometry = Column(Geometry(geometry_type="POINTZ", srid=4326), nullable=True)
    hazard_type = Column(String, nullable=False)  # Or Enum
    event_id = Column(String, nullable=True)
    status = Column(
        String, default="pending_review", nullable=False
    )  # Enum: pending_review, approved, rejected
    data_license = Column(
        String, default="https://creativecommons.org/licenses/by/4.0/", nullable=False
    )
    source_type = Column(String, nullable=False)  # Enum: citizen, official, remote_sensing, other
    uploader_id = Column(String, nullable=False)
    positional_accuracy = Column(Float, nullable=True)  # In meters
    thumbnail_url = Column(String, nullable=True)
    thumbnail_key = Column(String, nullable=True)  # MinIO object key for thumbnail

    # EXIF-derived metadata
    altitude = Column(Float, nullable=True)  # Altitude in meters from GPS EXIF
    altitude_ref = Column(SmallInteger, default=0, nullable=True)  # 0=above sea level, 1=below
    orientation = Column(SmallInteger, nullable=True)  # EXIF orientation value (1-8)
    camera_make = Column(String(100), nullable=True)  # Camera manufacturer
    camera_model = Column(String(100), nullable=True)  # Camera model
    camera_bearing = Column(Float, nullable=True)  # GPS image direction in degrees
    exif_metadata = Column(JSON, nullable=True)  # Full EXIF data as JSON

    # TODO: Before/After image pairing and featured stories - awaiting DB migration
    # before_image_id = Column(UUID(as_uuid=True), ForeignKey("image_metadata.id"), nullable=True)
    # before_image = relationship("ImageMetadata", remote_side="ImageMetadata.id", foreign_keys=[before_image_id])
    # is_featured = Column(Boolean, default=False, nullable=False)
    # featured_priority = Column(SmallInteger, default=0, nullable=True)
    # featured_description = Column(Text, nullable=True)

    # Original filename, kept for reference
    filename = Column(String, nullable=True)

    # Deprecated/legacy fields (can be removed in a future migration)
    location = Column(String, nullable=True)
    country = Column(String, nullable=True)
    timestamp = Column(DateTime, nullable=True)

    # ISO 19115 fields (can be mapped from core fields or extended)
    title = Column(String, nullable=True)
    abstract = Column(Text, nullable=True)
    purpose = Column(String, nullable=True)
    point_of_contact = Column(String, nullable=True)
    date_stamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    maintenance_frequency = Column(String, nullable=True)
    geographic_bounding_box = Column(JSON, nullable=True)
    geographic_identifier = Column(String, nullable=True)
    temporal_extent_start = Column(DateTime, nullable=True)
    temporal_extent_end = Column(DateTime, nullable=True)
    vertical_extent = Column(Float, nullable=True)
    topic_category = Column(JSON, default=["environment", "disaster", "imageryBaseMapsEarthCover"])
    keywords = Column(JSON, nullable=True)
    keyword_thesaurus = Column(String, default="SPC Hazard Vocabulary")
    resource_locator = Column(String, nullable=True)
    format_name = Column(String, default="JPEG")
    format_version = Column(String, default="1.0")
    lineage_statement = Column(Text, nullable=True)
    source = Column(String, nullable=True)
    use_constraints = Column(String, default="CC-BY")
    access_constraints = Column(String, default="Public")
    security_classification = Column(String, default="Unclassified")
    metadata_language = Column(String, default="eng")
    metadata_standard_name = Column(String, default="ISO 19115:2003")
    metadata_standard_version = Column(String, default="1.0")
    metadata_date = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    @hybrid_property
    def latitude(self):
        if self.geometry is None:
            return None
        session = object_session(self)
        if session is None:
            return None
        return session.scalar(func.ST_Y(self.geometry))

    @latitude.expression
    def latitude(cls):
        return func.ST_Y(cls.geometry)

    @hybrid_property
    def longitude(self):
        if self.geometry is None:
            return None
        session = object_session(self)
        if session is None:
            return None
        return session.scalar(func.ST_X(self.geometry))

    @longitude.expression
    def longitude(cls):
        return func.ST_X(cls.geometry)

    @hybrid_property
    def z_coordinate(self):
        """Get Z coordinate (altitude) from geometry if available."""
        if self.geometry is None:
            return None
        session = object_session(self)
        if session is None:
            return None
        return session.scalar(func.ST_Z(self.geometry))

    @z_coordinate.expression
    def z_coordinate(cls):
        return func.ST_Z(cls.geometry)

    @property
    def rotation_degrees(self) -> int:
        """Get rotation in degrees from EXIF orientation value."""
        if not self.orientation:
            return 0
        orientation_map = {
            1: 0,
            2: 0,  # Normal
            3: 180,
            4: 180,  # Upside down
            5: 90,
            6: 90,  # Rotated 90° CW
            7: 270,
            8: 270,  # Rotated 90° CCW
        }
        return orientation_map.get(self.orientation, 0)

    def to_dict(self):
        """Convert model to dictionary for JSON serialization"""
        return {
            "id": str(self.id) if self.id else None,
            "datetime": self.datetime.isoformat() if self.datetime else None,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "hazard_type": self.hazard_type,
            "event_id": self.event_id,
            "status": self.status,
            "data_license": self.data_license,
            "source_type": self.source_type,
            "uploader_id": self.uploader_id,
            "positional_accuracy": self.positional_accuracy,
            "thumbnail_url": self.thumbnail_url,
            # Original filename, kept for reference
            "filename": self.filename,
            # ISO 19115 fields (can be mapped from core fields or extended)
            "title": self.title,
            "abstract": self.abstract,
            "purpose": self.purpose,
            "point_of_contact": self.point_of_contact,
            "date_stamp": self.date_stamp.isoformat() if self.date_stamp else None,
            "maintenance_frequency": self.maintenance_frequency,
            "geographic_bounding_box": self.geographic_bounding_box,
            "geographic_identifier": self.geographic_identifier,
            "temporal_extent_start": (
                self.temporal_extent_start.isoformat() if self.temporal_extent_start else None
            ),
            "temporal_extent_end": (
                self.temporal_extent_end.isoformat() if self.temporal_extent_end else None
            ),
            "vertical_extent": self.vertical_extent,
            "topic_category": self.topic_category,
            "keywords": self.keywords,
            "keyword_thesaurus": self.keyword_thesaurus,
            "resource_locator": self.resource_locator,
            "format_name": self.format_name,
            "format_version": self.format_version,
            "lineage_statement": self.lineage_statement,
            "source": self.source,
            "use_constraints": self.use_constraints,
            "access_constraints": self.access_constraints,
            "security_classification": self.security_classification,
            "metadata_language": self.metadata_language,
            "metadata_standard_name": self.metadata_standard_name,
            "metadata_standard_version": self.metadata_standard_version,
            "metadata_date": self.metadata_date.isoformat() if self.metadata_date else None,
        }


# Video Metadata Model (Ticket 1.5)
class VideoMetadata(Base):
    __tablename__ = "video_metadata"

    # Primary key and timestamps
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # File information
    filename = Column(String, nullable=False, unique=True, index=True)
    original_filename = Column(String, nullable=True)
    file_size = Column(BigInteger, nullable=False)  # In bytes
    file_hash = Column(String(64), nullable=True, index=True)  # SHA256

    # Video-specific metadata
    media_type = Column(String, default="video", nullable=False)
    duration = Column(Float, nullable=True)  # In seconds
    width = Column(SmallInteger, nullable=True)
    height = Column(SmallInteger, nullable=True)
    fps = Column(Float, nullable=True)  # Frames per second
    codec = Column(String(50), nullable=True)  # h264, h265, vp9, etc.
    container_format = Column(String(50), nullable=True)  # mp4, webm, mkv
    bitrate = Column(Integer, nullable=True)  # In kbps

    # Processing state
    processing_state = Column(
        String, default="queued", nullable=False, index=True
    )  # queued, processing, ready, failed
    processing_error = Column(Text, nullable=True)
    processing_started_at = Column(DateTime(timezone=True), nullable=True)
    processing_completed_at = Column(DateTime(timezone=True), nullable=True)

    # Storage references
    poster_url = Column(String, nullable=True)  # Thumbnail image URL
    poster_key = Column(String, nullable=True)  # MinIO object key for poster
    variants = Column(JSON, nullable=True)  # List of transcoded variants
    # Format: [{"profile": "720p", "codec": "h264", "url": "...", "size": 123456}]

    # Geospatial data (same as ImageMetadata)
    geometry = Column(Geometry(geometry_type="POINTZ", srid=4326), nullable=True)
    altitude = Column(Float, nullable=True)
    altitude_ref = Column(SmallInteger, default=0, nullable=True)

    # Hazard/event metadata (same as ImageMetadata)
    hazard_type = Column(String, nullable=False, index=True)
    event_id = Column(String, nullable=True, index=True)

    # User and permissions
    uploader_id = Column(String, nullable=False, index=True)
    source_type = Column(String, nullable=False)  # citizen, official, etc.

    # Content moderation
    status = Column(
        String, default="pending_review", nullable=False, index=True
    )  # pending_review, approved, rejected, flagged
    moderation_flags = Column(JSON, nullable=True)
    # Format: {"inappropriate": false, "copyright_concern": true, "notes": "..."}
    reviewed_by = Column(String, nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)

    # Metadata
    title = Column(String, nullable=True)
    abstract = Column(Text, nullable=True)
    keywords = Column(JSON, nullable=True)
    data_license = Column(
        String, default="https://creativecommons.org/licenses/by/4.0/", nullable=False
    )

    # Analytics
    view_count = Column(Integer, default=0, nullable=False)
    download_count = Column(Integer, default=0, nullable=False)
    last_viewed_at = Column(DateTime(timezone=True), nullable=True)

    # Hybrid properties for coordinates (same as ImageMetadata)
    @hybrid_property
    def latitude(self):
        if self.geometry is None:
            return None
        session = object_session(self)
        if session is None:
            return None
        return session.scalar(func.ST_Y(self.geometry))

    @latitude.expression
    def latitude(cls):
        return func.ST_Y(cls.geometry)

    @hybrid_property
    def longitude(self):
        if self.geometry is None:
            return None
        session = object_session(self)
        if session is None:
            return None
        return session.scalar(func.ST_X(self.geometry))

    @longitude.expression
    def longitude(cls):
        return func.ST_X(cls.geometry)

    def to_dict(self):
        """Convert model to dictionary for JSON serialization"""
        return {
            "id": str(self.id),
            "media_type": "video",
            "content_type": "video",  # Add for consistency with curation queue
            "filename": self.filename,
            "original_filename": self.original_filename,
            "file_size": self.file_size,
            "duration": self.duration,
            "width": self.width,
            "height": self.height,
            "resolution": f"{self.width}x{self.height}" if self.width and self.height else None,
            "fps": self.fps,
            "codec": self.codec,
            "bitrate": self.bitrate,
            "poster_url": self.poster_url,
            "thumbnail_url": f"/api/video/thumbnail/{self.id}",  # Add explicit thumbnail URL for curation queue
            "resource_locator": f"/api/video/stream/{self.id}",  # Add video stream URL
            "variants": self.variants,
            "processing_state": self.processing_state,
            "processing_error": self.processing_error,
            "status": self.status,
            "hazard_type": self.hazard_type,
            "event_id": self.event_id,
            "title": self.title,
            "abstract": self.abstract,
            "uploader_id": self.uploader_id,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "altitude": self.altitude,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "view_count": self.view_count,
            "download_count": self.download_count,
        }

    def __repr__(self):
        return f"<VideoMetadata(id={self.id}, filename={self.filename}, duration={self.duration}s, state={self.processing_state})>"

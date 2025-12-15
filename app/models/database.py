from sqlalchemy import create_engine, Column, String, Float, DateTime, Text, JSON, Boolean, func
from sqlalchemy.orm import declarative_base, sessionmaker, object_session
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.hybrid import hybrid_property
from geoalchemy2 import Geometry
from datetime import datetime, timezone
import uuid
import os
import logging

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
logger.info(f"Using database: {DATABASE_URL.split('@')[0] if '@' in DATABASE_URL else DATABASE_URL}")

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
    datetime = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    geometry = Column(Geometry(geometry_type='POINT', srid=4326), nullable=True)
    hazard_type = Column(String, nullable=False) # Or Enum
    event_id = Column(String, nullable=True)
    status = Column(String, default="pending_review", nullable=False) # Enum: pending_review, approved, rejected
    data_license = Column(String, default="https://creativecommons.org/licenses/by/4.0/", nullable=False)
    source_type = Column(String, nullable=False) # Enum: citizen, official, remote_sensing, other
    uploader_id = Column(String, nullable=False)
    positional_accuracy = Column(Float, nullable=True) # In meters
    thumbnail_url = Column(String, nullable=True)

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
    
    def to_dict(self):
        """Convert model to dictionary for JSON serialization"""
        return {
            'id': str(self.id) if self.id else None,
            'datetime': self.datetime.isoformat() if self.datetime else None,
            'latitude': self.latitude,
            'longitude': self.longitude,
            'hazard_type': self.hazard_type,
            'event_id': self.event_id,
            'status': self.status,
            'data_license': self.data_license,
            'source_type': self.source_type,
            'uploader_id': self.uploader_id,
            'positional_accuracy': self.positional_accuracy,
            'thumbnail_url': self.thumbnail_url,
            
            # Original filename, kept for reference
            'filename': self.filename,

            # ISO 19115 fields (can be mapped from core fields or extended)
            'title': self.title,
            'abstract': self.abstract,
            'purpose': self.purpose,
            'point_of_contact': self.point_of_contact,
            'date_stamp': self.date_stamp.isoformat() if self.date_stamp else None,
            'maintenance_frequency': self.maintenance_frequency,
            'geographic_bounding_box': self.geographic_bounding_box,
            'geographic_identifier': self.geographic_identifier,
            'temporal_extent_start': self.temporal_extent_start.isoformat() if self.temporal_extent_start else None,
            'temporal_extent_end': self.temporal_extent_end.isoformat() if self.temporal_extent_end else None,
            'vertical_extent': self.vertical_extent,
            'topic_category': self.topic_category,
            'keywords': self.keywords,
            'keyword_thesaurus': self.keyword_thesaurus,
            'resource_locator': self.resource_locator,
            'format_name': self.format_name,
            'format_version': self.format_version,
            'lineage_statement': self.lineage_statement,
            'source': self.source,
            'use_constraints': self.use_constraints,
            'access_constraints': self.access_constraints,
            'security_classification': self.security_classification,
            'metadata_language': self.metadata_language,
            'metadata_standard_name': self.metadata_standard_name,
            'metadata_standard_version': self.metadata_standard_version,
            'metadata_date': self.metadata_date.isoformat() if self.metadata_date else None
        }

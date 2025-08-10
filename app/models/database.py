from sqlalchemy import create_engine, Column, String, Float, DateTime, Text, JSON, Boolean
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid
import os

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://impactuser:impactpass@db:5432/impactdb")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class ImageMetadata(Base):
    __tablename__ = "image_metadata"
    
    # Primary key
    filename = Column(String, primary_key=True)
    
    # Original fields
    hazard_type = Column(String, nullable=False)
    location = Column(String, nullable=False)
    country = Column(String, nullable=True)
    timestamp = Column(DateTime, nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    
    # ISO 19115 Identification Information
    title = Column(String, nullable=True)  # gmd:title
    title_i18n = Column(JSON, nullable=True)  # title translations keyed by ISO 639-2 codes
    abstract = Column(Text, nullable=True)  # gmd:abstract
    abstract_i18n = Column(JSON, nullable=True)  # abstract translations
    purpose = Column(String, nullable=True)  # gmd:purpose
    purpose_i18n = Column(JSON, nullable=True)  # purpose translations
    status = Column(String, default="Completed")  # gmd:status
    point_of_contact = Column(String, nullable=True)  # gmd:pointOfContact
    date_stamp = Column(DateTime, default=datetime.utcnow)  # gmd:dateStamp
    maintenance_frequency = Column(String, nullable=True)  # gmd:maintenanceAndUpdateFrequency
    
    # ISO 19115 Spatial & Temporal Extent
    geographic_bounding_box = Column(JSON, nullable=True)  # gmd:EX_GeographicBoundingBox
    geographic_identifier = Column(String, nullable=True)  # gmd:geographicIdentifier
    temporal_extent_start = Column(DateTime, nullable=True)  # gmd:EX_TemporalExtent
    temporal_extent_end = Column(DateTime, nullable=True)
    vertical_extent = Column(Float, nullable=True)  # gmd:verticalElement (elevation in meters)
    
    # ISO 19115 Content Information
    topic_category = Column(JSON, default=["environment", "disaster", "imageryBaseMapsEarthCover"])  # gmd:topicCategory
    keywords = Column(JSON, nullable=True)  # gmd:descriptiveKeywords
    keywords_i18n = Column(JSON, nullable=True)  # keyword translations keyed by ISO 639-2 codes
    keyword_thesaurus = Column(String, default="SPC Hazard Vocabulary")  # gmd:thesaurusName
    
    # ISO 19115 Distribution Information
    resource_locator = Column(String, nullable=True)  # gmd:linkage
    format_name = Column(String, default="JPEG")  # gmd:name
    format_version = Column(String, default="1.0")  # gmd:version
    
    # Thumbnail information
    thumbnail_url = Column(String, nullable=True)  # URL to thumbnail image
    thumbnail_key = Column(String, nullable=True)  # MinIO object key for thumbnail
    
    # ISO 19115 Data Quality & Lineage
    lineage_statement = Column(Text, nullable=True)  # gmd:lineage
    source = Column(String, nullable=True)  # gmd:source
    positional_accuracy = Column(Float, nullable=True)  # gmd:positionalAccuracy
    
    # ISO 19115 Constraints
    use_constraints = Column(String, default="CC-BY")  # gmd:useLimitation
    access_constraints = Column(String, default="Public")  # gmd:accessConstraints
    security_classification = Column(String, default="Unclassified")  # gmd:classification
    
    # ISO 19115 Metadata Record Info
    metadata_language = Column(String, default="eng")  # gmd:language
    metadata_standard_name = Column(String, default="ISO 19115:2003")  # gmd:metadataStandardName
    metadata_standard_version = Column(String, default="1.0")  # gmd:metadataStandardVersion
    metadata_date = Column(DateTime, default=datetime.utcnow)  # gmd:dateStamp
    
    def to_dict(self):
        """Convert model to dictionary for JSON serialization"""
        return {
            'filename': self.filename,
            'hazard_type': self.hazard_type,
            'location': self.location,
            'country': self.country,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
            'latitude': self.latitude,
            'longitude': self.longitude,
            'title': self.title,
            'title_i18n': self.title_i18n,
            'abstract': self.abstract,
            'abstract_i18n': self.abstract_i18n,
            'purpose': self.purpose,
            'purpose_i18n': self.purpose_i18n,
            'status': self.status,
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
            'keywords_i18n': self.keywords_i18n,
            'keyword_thesaurus': self.keyword_thesaurus,
            'resource_locator': self.resource_locator,
            'format_name': self.format_name,
            'format_version': self.format_version,
            'thumbnail_url': self.thumbnail_url,
            'thumbnail_key': self.thumbnail_key,
            'lineage_statement': self.lineage_statement,
            'source': self.source,
            'positional_accuracy': self.positional_accuracy,
            'use_constraints': self.use_constraints,
            'access_constraints': self.access_constraints,
            'security_classification': self.security_classification,
            'metadata_language': self.metadata_language,
            'metadata_standard_name': self.metadata_standard_name,
            'metadata_standard_version': self.metadata_standard_version,
            'metadata_date': self.metadata_date.isoformat() if self.metadata_date else None
        }

"""Scientific Reports and Impact Assessment Models"""

from datetime import datetime, date
from typing import Optional, List
from uuid import uuid4

from geoalchemy2 import Geometry
from sqlalchemy import (
    Column, String, Text, DateTime, Date, Integer, Float, Boolean, ForeignKey, 
    ARRAY, Enum as SQLEnum, Index, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from models.database import Base


class ImpactReport(Base):
    """Scientific impact reports linked to citizen data"""
    
    __tablename__ = "impact_reports"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=False)
    report_type = Column(String(50), nullable=False)  # scientific, assessment, policy, research
    date_published = Column(Date, nullable=False)
    
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    
    author_organization = Column(String(255))
    author_contact = Column(String(255))
    data_license = Column(String(100))
    
    # Spatial/Temporal
    geometry = Column(Geometry('POLYGON', srid=4326))  # Study area
    date_start = Column(Date)
    date_end = Column(Date)
    
    # Quality
    is_published = Column(Boolean, default=False)
    peer_reviewed = Column(Boolean, default=False)
    confidence_level = Column(String(20))  # high, medium, low
    
    created_by = Column(UUID(as_uuid=True), ForeignKey('rbac_user.id'))
    
    # Relationships
    citations = relationship("ImpactReportCitation", back_populates="report", cascade="all, delete-orphan")
    assessment = relationship("ImpactAssessment", back_populates="report", uselist=False, cascade="all, delete-orphan")
    
    __table_args__ = (
        Index('idx_report_type', 'report_type'),
        Index('idx_published', 'is_published'),
        Index('idx_author_org', 'author_organization'),
        Index('idx_created_by', 'created_by'),
    )
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'title': self.title,
            'description': self.description,
            'report_type': self.report_type,
            'date_published': self.date_published.isoformat() if self.date_published else None,
            'author_organization': self.author_organization,
            'author_contact': self.author_contact,
            'peer_reviewed': self.peer_reviewed,
            'confidence_level': self.confidence_level,
            'is_published': self.is_published,
            'date_start': self.date_start.isoformat() if self.date_start else None,
            'date_end': self.date_end.isoformat() if self.date_end else None,
        }


class ImpactReportCitation(Base):
    """Link between impact reports and citizen-contributed content"""
    
    __tablename__ = "impact_report_citations"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    impact_report_id = Column(UUID(as_uuid=True), ForeignKey('impact_reports.id', ondelete='CASCADE'), nullable=False)
    
    # References either image_metadata or video_metadata
    content_id = Column(UUID(as_uuid=True), nullable=False)
    content_type = Column(String(20), nullable=False)  # image, video
    
    citation_type = Column(String(50), nullable=False)  # evidence, validation, context, impact
    relevance_score = Column(Float, default=0.5)  # 0.0-1.0
    
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    
    # Relationships
    report = relationship("ImpactReport", back_populates="citations")
    
    __table_args__ = (
        Index('idx_report_id', 'impact_report_id'),
        Index('idx_content_id', 'content_id'),
        Index('idx_citation_type', 'citation_type'),
        UniqueConstraint('impact_report_id', 'content_id', name='uq_report_content'),
    )
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'impact_report_id': str(self.impact_report_id),
            'content_id': str(self.content_id),
            'content_type': self.content_type,
            'citation_type': self.citation_type,
            'relevance_score': self.relevance_score,
            'notes': self.notes,
        }


class ImpactAssessment(Base):
    """Impact metrics for scientific reports"""
    
    __tablename__ = "impact_assessments"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    impact_report_id = Column(UUID(as_uuid=True), ForeignKey('impact_reports.id', ondelete='CASCADE'), nullable=False)
    
    # Human Impact
    people_affected = Column(Integer)
    people_injured = Column(Integer)
    people_missing = Column(Integer)
    people_displaced = Column(Integer)
    fatalities = Column(Integer)
    
    # Infrastructure Impact
    buildings_damaged = Column(Integer)
    buildings_destroyed = Column(Integer)
    critical_infrastructure_affected = Column(ARRAY(String))
    
    # Economic Impact
    economic_loss_usd = Column(Integer)
    insured_loss_usd = Column(Integer)
    
    # Environmental Impact
    area_affected_km2 = Column(Float)
    ecosystems_affected = Column(ARRAY(String))
    species_threatened = Column(ARRAY(String))
    
    # Recovery Metrics
    recovery_time_months = Column(Integer)
    recovery_cost_usd = Column(Integer)
    
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    report = relationship("ImpactReport", back_populates="assessment")
    
    __table_args__ = (
        Index('idx_report_id', 'impact_report_id'),
    )
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'impact_report_id': str(self.impact_report_id),
            'people_affected': self.people_affected,
            'people_injured': self.people_injured,
            'people_missing': self.people_missing,
            'people_displaced': self.people_displaced,
            'fatalities': self.fatalities,
            'buildings_damaged': self.buildings_damaged,
            'buildings_destroyed': self.buildings_destroyed,
            'critical_infrastructure_affected': self.critical_infrastructure_affected,
            'economic_loss_usd': self.economic_loss_usd,
            'insured_loss_usd': self.insured_loss_usd,
            'area_affected_km2': self.area_affected_km2,
            'ecosystems_affected': self.ecosystems_affected,
            'species_threatened': self.species_threatened,
            'recovery_time_months': self.recovery_time_months,
            'recovery_cost_usd': self.recovery_cost_usd,
        }

from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime

Base = declarative_base()

class AuditLog(Base):
    """Audit log for tracking all metadata changes"""
    __tablename__ = "audit_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # What was changed
    table_name = Column(String(50), nullable=False, index=True)
    record_id = Column(String(255), nullable=False, index=True)
    action = Column(String(20), nullable=False, index=True)  # CREATE, UPDATE, DELETE
    field_name = Column(String(100), nullable=True)
    
    # Change details
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    change_summary = Column(JSON, nullable=True)
    
    # Who and when
    user_id = Column(String(255), nullable=False, index=True)
    username = Column(String(255), nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    
    # Additional context
    session_id = Column(String(255), nullable=True)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(500), nullable=True)
    api_endpoint = Column(String(255), nullable=True)
    
    # Validation status at time of change
    validation_status = Column(String(20), nullable=True)  # VALID, INVALID, QUARANTINED
    validation_errors = Column(JSON, nullable=True)

class QuarantinedRecord(Base):
    """Records that failed validation and are quarantined"""
    __tablename__ = "quarantined_records"
    
    id = Column(Integer, primary_key=True, index=True)
    original_record_id = Column(String(255), nullable=False, index=True)
    table_name = Column(String(50), nullable=False)
    
    # Quarantine details
    quarantine_reason = Column(String(255), nullable=False)
    validation_errors = Column(JSON, nullable=False)
    quarantined_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    quarantined_by = Column(String(255), nullable=False)
    
    # Original data
    original_data = Column(JSON, nullable=False)
    
    # Resolution
    resolved_at = Column(DateTime, nullable=True)
    resolved_by = Column(String(255), nullable=True)
    resolution_notes = Column(Text, nullable=True)
    status = Column(String(20), default="QUARANTINED", nullable=False)  # QUARANTINED, RESOLVED, REJECTED
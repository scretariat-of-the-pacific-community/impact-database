from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum

class StatusEnum(str, Enum):
    """Status values for image metadata"""
    PENDING_REVIEW = "pending_review"
    APPROVED = "approved"
    REJECTED = "rejected"

class ImageMetadataUpdate(BaseModel):
    """Schema for updating image metadata"""
    title: Optional[str] = Field(None, max_length=255, description="Image title")
    abstract: Optional[str] = Field(None, max_length=2000, description="Image description/abstract")
    keywords: Optional[List[str]] = Field(None, description="List of keywords")
    extent_description: Optional[str] = Field(None, max_length=500)
    topic_category: Optional[str] = Field(None, max_length=100)
    character_set: Optional[str] = Field("utf8", max_length=50)
    language: Optional[str] = Field("en", max_length=10)
    metadata_standard: Optional[str] = Field("ISO 19115:2003", max_length=100)
    hierarchy_level: Optional[str] = Field("dataset", max_length=50)
    spatial_resolution: Optional[str] = Field(None, max_length=100)
    reference_system: Optional[str] = Field("WGS84", max_length=50)
    lineage: Optional[str] = Field(None, max_length=1000)
    format_name: Optional[str] = Field(None, max_length=100)
    format_version: Optional[str] = Field(None, max_length=50)
    
    # Geographic extent
    latitude: Optional[float] = Field(None, ge=-90, le=90, description="Latitude coordinate")
    longitude: Optional[float] = Field(None, ge=-180, le=180, description="Longitude coordinate")
    
    # Additional fields
    hazard_type: Optional[str] = Field(None, max_length=100)
    photographer: Optional[str] = Field(None, max_length=255)
    date_taken: Optional[str] = Field(None, description="Date when photo was taken")
    camera_model: Optional[str] = Field(None, max_length=255)
    
    # Core metadata fields
    event_id: Optional[str] = Field(None, max_length=255, description="Event identifier")
    positional_accuracy: Optional[float] = Field(None, ge=0, description="Positional accuracy in meters")
    
    # Status and review (admin only)
    status: Optional[StatusEnum] = Field(None, description="Review status (admin only)")
    review_notes: Optional[str] = Field(None, max_length=2000, description="Review notes (admin only)")
    
    # Contact and citation info
    metadata_contact: Optional[Dict[str, Any]] = Field(None)
    resource_maintenance: Optional[Dict[str, Any]] = Field(None)
    resource_constraints: Optional[Dict[str, Any]] = Field(None)
    data_quality: Optional[Dict[str, Any]] = Field(None)
    citation: Optional[Dict[str, Any]] = Field(None)
    transfer_options: Optional[Dict[str, Any]] = Field(None)

    @validator('keywords')
    def validate_keywords(cls, v):
        if v is not None:
            # Remove empty strings and strip whitespace
            return [keyword.strip() for keyword in v if keyword.strip()]
        return v

    @validator('date_taken')
    def validate_date_taken(cls, v):
        if v is not None:
            try:
                # Try to parse the date to ensure it's valid
                datetime.fromisoformat(v.replace('Z', '+00:00'))
            except ValueError:
                raise ValueError('date_taken must be a valid ISO format date')
        return v

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class ImageResponse(BaseModel):
    """Schema for image response"""
    success: bool
    filename: str
    metadata: Dict[str, Any]
    
    class Config:
        from_attributes = True

class DeleteResponse(BaseModel):
    """Schema for delete operation response"""
    success: bool
    message: str

class UpdateResponse(BaseModel):
    """Schema for update operation response"""
    success: bool
    message: str
    updated_fields: List[str]
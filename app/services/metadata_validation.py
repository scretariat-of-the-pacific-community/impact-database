"""Metadata validation utilities."""

import json
import jsonschema
import logging
from typing import Dict, Any, List
from datetime import datetime

logger = logging.getLogger(__name__)

# Basic metadata schema
METADATA_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "minLength": 1, "maxLength": 255},
        "description": {"type": "string"},
        "agency": {"type": "string"},
        "project": {"type": "string"},
        "hazard_type": {"type": "string"},
        "keywords": {
            "type": "array",
            "items": {"type": "string"}
        },
        "date_taken": {"type": "string", "format": "date-time"},
        "location": {
            "type": "object",
            "properties": {
                "country": {"type": "string"},
                "region": {"type": "string"},
                "site": {"type": "string"},
                "latitude": {"type": "number"},
                "longitude": {"type": "number"}
            }
        },
        "technical": {
            "type": "object",
            "properties": {
                "camera_make": {"type": "string"},
                "camera_model": {"type": "string"},
                "iso": {"type": "integer"},
                "aperture": {"type": "string"},
                "shutter_speed": {"type": "string"},
                "focal_length": {"type": "string"}
            }
        }
    },
    "required": ["title"]
}

def validate_metadata(metadata: Dict[str, Any]) -> Dict[str, Any]:
    """Validate metadata against schema."""
    result = {
        "valid": True,
        "errors": [],
        "warnings": []
    }
    
    try:
        # Validate against JSON schema
        jsonschema.validate(metadata, METADATA_SCHEMA)
        
        # Additional validations
        _validate_coordinates(metadata, result)
        _validate_dates(metadata, result)
        _validate_hazard_type(metadata, result)
        
    except jsonschema.ValidationError as e:
        result["valid"] = False
        result["errors"].append(f"Schema validation error: {e.message}")
    except Exception as e:
        result["valid"] = False
        result["errors"].append(f"Validation error: {str(e)}")
    
    return result

def _validate_coordinates(metadata: Dict[str, Any], result: Dict[str, Any]):
    """Validate GPS coordinates."""
    location = metadata.get("location", {})
    lat = location.get("latitude")
    lon = location.get("longitude")
    
    if lat is not None:
        if not (-90 <= lat <= 90):
            result["errors"].append("Latitude must be between -90 and 90")
            result["valid"] = False
    
    if lon is not None:
        if not (-180 <= lon <= 180):
            result["errors"].append("Longitude must be between -180 and 180")
            result["valid"] = False
    
    # Check if coordinates are in Pacific region
    if lat is not None and lon is not None:
        if not _is_in_pacific_region(lat, lon):
            result["warnings"].append("Coordinates appear to be outside Pacific Island region")

def _validate_dates(metadata: Dict[str, Any], result: Dict[str, Any]):
    """Validate date fields."""
    date_taken = metadata.get("date_taken")
    
    if date_taken:
        try:
            parsed_date = datetime.fromisoformat(date_taken.replace('Z', '+00:00'))
            if parsed_date > datetime.now():
                result["warnings"].append("Date taken is in the future")
        except ValueError:
            result["errors"].append("Invalid date format for date_taken")
            result["valid"] = False

def _validate_hazard_type(metadata: Dict[str, Any], result: Dict[str, Any]):
    """Validate hazard type against known values."""
    hazard_type = metadata.get("hazard_type")
    
    valid_hazard_types = [
        "cyclone", "tsunami", "flood", "drought", "landslide", 
        "earthquake", "volcanic", "wildfire", "coastal_erosion", "other"
    ]
    
    if hazard_type and hazard_type.lower() not in valid_hazard_types:
        result["warnings"].append(f"Unknown hazard type: {hazard_type}")

def _is_in_pacific_region(lat: float, lon: float) -> bool:
    """Check if coordinates are in Pacific Island region."""
    # Broad Pacific region bounds
    return (-25 <= lat <= 25) and (120 <= lon <= -120)

def clean_metadata(metadata: Dict[str, Any]) -> Dict[str, Any]:
    """Clean and normalize metadata."""
    cleaned = {}
    
    for key, value in metadata.items():
        if value is not None and value != "":
            if isinstance(value, str):
                cleaned[key] = value.strip()
            else:
                cleaned[key] = value
    
    return cleaned

class MetadataValidator:
    """Metadata validation service class."""
    
    def __init__(self):
        self.schema = METADATA_SCHEMA
    
    def validate(self, metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Validate metadata."""
        return validate_metadata(metadata)
    
    def clean(self, metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Clean metadata."""
        return clean_metadata(metadata)

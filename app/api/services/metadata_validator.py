import jsonschema
from typing import Dict, Any, List, Tuple
import logging
from datetime import datetime
import pyproj
from pyproj import CRS, Transformer

from ..schemas.iso_metadata import ISO19115Metadata, ImageMetadataCreate
from ..services.iso_vocabulary import validate_controlled_vocabulary

logger = logging.getLogger(__name__)


class MetadataValidationError(Exception):
    """Custom exception for metadata validation errors"""

    def __init__(self, message: str, errors: List[Dict[str, Any]] = None):
        super().__init__(message)
        self.errors = errors or []


class CoordinateValidator:
    """Validates and normalizes coordinates"""

    def __init__(self):
        self.wgs84 = CRS.from_epsg(4326)

    def validate_and_normalize_coordinates(
        self, longitude: float, latitude: float, source_crs: str = "EPSG:4326"
    ) -> Tuple[float, float]:
        """
        Validate coordinates and normalize to WGS84

        Args:
            longitude: X coordinate
            latitude: Y coordinate
            source_crs: Source coordinate reference system

        Returns:
            Tuple of (longitude, latitude) in WGS84
        """
        try:
            # Parse source CRS
            source_crs_obj = CRS.from_string(source_crs)

            # Basic range checks for common coordinate systems
            if source_crs.upper() == "EPSG:4326":
                if not (-180 <= longitude <= 180):
                    raise ValueError(f"Longitude {longitude} out of range [-180, 180] for WGS84")
                if not (-90 <= latitude <= 90):
                    raise ValueError(f"Latitude {latitude} out of range [-90, 90] for WGS84")

            # Transform to WGS84 if necessary
            if source_crs_obj != self.wgs84:
                transformer = Transformer.from_crs(source_crs_obj, self.wgs84, always_xy=True)
                lon_wgs84, lat_wgs84 = transformer.transform(longitude, latitude)
            else:
                lon_wgs84, lat_wgs84 = longitude, latitude

            # Final validation in WGS84
            if not (-180 <= lon_wgs84 <= 180):
                raise ValueError(f"Transformed longitude {lon_wgs84} out of valid range")
            if not (-90 <= lat_wgs84 <= 90):
                raise ValueError(f"Transformed latitude {lat_wgs84} out of valid range")

            return lon_wgs84, lat_wgs84

        except Exception as e:
            raise ValueError(f"Coordinate validation failed: {str(e)}")


class ISO19115Validator:
    """Validates metadata against ISO 19115 standards"""

    def __init__(self):
        self.coordinate_validator = CoordinateValidator()
        self.required_fields = [
            "file_identifier",
            "title",
            "abstract",
            "contact",
            "hazard_type",
            "source_agency",
            "topic_category",
            "geographic_element",
            "format_name",
        ]

    def validate_metadata(self, metadata: Dict[str, Any]) -> Tuple[bool, List[Dict[str, Any]]]:
        """
        Comprehensive validation of ISO 19115 metadata

        Args:
            metadata: Metadata dictionary to validate

        Returns:
            Tuple of (is_valid, list_of_errors)
        """
        errors = []

        try:
            # 1. Pydantic schema validation
            try:
                if "filename" in metadata:
                    validated = ImageMetadataCreate(**metadata)
                else:
                    validated = ISO19115Metadata(**metadata)
            except Exception as e:
                errors.append(
                    {
                        "type": "schema_validation",
                        "message": f"Schema validation failed: {str(e)}",
                        "severity": "error",
                    }
                )
                return False, errors

            # 2. Coordinate validation
            if "geographic_element" in metadata:
                geo_elem = metadata["geographic_element"]
                try:
                    self.coordinate_validator.validate_and_normalize_coordinates(
                        geo_elem.get("west_bound_longitude", 0),
                        geo_elem.get("south_bound_latitude", 0),
                    )
                    self.coordinate_validator.validate_and_normalize_coordinates(
                        geo_elem.get("east_bound_longitude", 0),
                        geo_elem.get("north_bound_latitude", 0),
                    )
                except ValueError as e:
                    errors.append(
                        {"type": "coordinate_validation", "message": str(e), "severity": "error"}
                    )

            # 3. Controlled vocabulary validation
            vocab_errors = self._validate_vocabularies(metadata)
            errors.extend(vocab_errors)

            # 4. Business rule validation
            business_errors = self._validate_business_rules(metadata)
            errors.extend(business_errors)

            # 5. Completeness check
            completeness_errors = self._validate_completeness(metadata)
            errors.extend(completeness_errors)

            # Return validation result
            has_critical_errors = any(e["severity"] == "error" for e in errors)
            return not has_critical_errors, errors

        except Exception as e:
            logger.error(f"Unexpected validation error: {str(e)}")
            errors.append(
                {
                    "type": "system_error",
                    "message": f"Unexpected validation error: {str(e)}",
                    "severity": "error",
                }
            )
            return False, errors

    def _validate_vocabularies(self, metadata: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Validate controlled vocabularies"""
        errors = []

        # Validate hazard type
        hazard_type = metadata.get("hazard_type")
        if hazard_type and not validate_controlled_vocabulary("hazard_type", hazard_type):
            errors.append(
                {
                    "type": "vocabulary_validation",
                    "field": "hazard_type",
                    "message": f"Invalid hazard type: {hazard_type}",
                    "severity": "error",
                }
            )

        # Validate source agency
        source_agency = metadata.get("source_agency")
        if source_agency and not validate_controlled_vocabulary("source_agency", source_agency):
            errors.append(
                {
                    "type": "vocabulary_validation",
                    "field": "source_agency",
                    "message": f"Invalid source agency: {source_agency}",
                    "severity": "warning",
                }
            )

        return errors

    def _validate_business_rules(self, metadata: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Validate business-specific rules"""
        errors = []

        # Rule: Title should be descriptive (at least 10 characters)
        title = metadata.get("title", "")
        if len(title) < 10:
            errors.append(
                {
                    "type": "business_rule",
                    "field": "title",
                    "message": "Title should be at least 10 characters long",
                    "severity": "warning",
                }
            )

        # Rule: Abstract should be meaningful (at least 50 characters)
        abstract = metadata.get("abstract", "")
        if len(abstract) < 50:
            errors.append(
                {
                    "type": "business_rule",
                    "field": "abstract",
                    "message": "Abstract should be at least 50 characters long",
                    "severity": "warning",
                }
            )

        # Rule: Should have at least 3 keywords
        keywords = metadata.get("keywords", [])
        if len(keywords) < 3:
            errors.append(
                {
                    "type": "business_rule",
                    "field": "keywords",
                    "message": "Should have at least 3 keywords for better discoverability",
                    "severity": "warning",
                }
            )

        return errors

    def _validate_completeness(self, metadata: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Validate metadata completeness"""
        errors = []

        for field in self.required_fields:
            if field not in metadata or not metadata[field]:
                errors.append(
                    {
                        "type": "completeness",
                        "field": field,
                        "message": f"Required field '{field}' is missing or empty",
                        "severity": "error",
                    }
                )

        return errors


# Global validator instance
metadata_validator = ISO19115Validator()


def validate_image_metadata(metadata: Dict[str, Any]) -> Tuple[bool, List[Dict[str, Any]]]:
    """
    Validate image metadata against ISO 19115 standards

    Returns:
        Tuple of (is_valid, errors_list)
    """
    return metadata_validator.validate_metadata(metadata)

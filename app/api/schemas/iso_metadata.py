from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict, Any, Union
from datetime import datetime
from enum import Enum


class CharacterSetCode(str, Enum):
    """ISO 19115 Character Set Codes"""

    UTF8 = "utf8"
    UTF16 = "utf16"
    ISO_8859_1 = "8859part1"


class ScopeCode(str, Enum):
    """ISO 19115 Scope Codes"""

    ATTRIBUTE = "attribute"
    ATTRIBUTE_TYPE = "attributeType"
    COLLECTION_HARDWARE = "collectionHardware"
    COLLECTION_SESSION = "collectionSession"
    DATASET = "dataset"
    SERIES = "series"
    NON_GEOGRAPHIC_DATASET = "nonGeographicDataset"
    DIMENSION_GROUP = "dimensionGroup"
    FEATURE = "feature"
    FEATURE_TYPE = "featureType"
    PROPERTY_TYPE = "propertyType"
    FIELD_SESSION = "fieldSession"
    SOFTWARE = "software"
    SERVICE = "service"
    MODEL = "model"
    TILE = "tile"


class TopicCategoryCode(str, Enum):
    """ISO 19115 Topic Category Codes"""

    FARMING = "farming"
    BIOTA = "biota"
    BOUNDARIES = "boundaries"
    CLIMATOLOGY_METEOROLOGY_ATMOSPHERE = "climatologyMeteorologyAtmosphere"
    ECONOMY = "economy"
    ELEVATION = "elevation"
    ENVIRONMENT = "environment"
    GEOSCIENTIFIC_INFORMATION = "geoscientificInformation"
    HEALTH = "health"
    IMAGERY_BASE_MAPS_EARTH_COVER = "imageryBaseMapsEarthCover"
    INTELLIGENCE_MILITARY = "intelligenceMilitary"
    INLAND_WATERS = "inlandWaters"
    LOCATION = "location"
    OCEANS = "oceans"
    PLANNING_CADASTRE = "planningCadastre"
    SOCIETY = "society"
    STRUCTURE = "structure"
    TRANSPORTATION = "transportation"
    UTILITIES_COMMUNICATION = "utilitiesCommunication"


class HazardTypeVocabulary(str, Enum):
    """Controlled vocabulary for hazard types"""

    EARTHQUAKE = "earthquake"
    FLOOD = "flood"
    TSUNAMI = "tsunami"
    HURRICANE = "hurricane"
    CYCLONE = "cyclone"
    TORNADO = "tornado"
    WILDFIRE = "wildfire"
    DROUGHT = "drought"
    LANDSLIDE = "landslide"
    VOLCANIC_ERUPTION = "volcanicEruption"
    AVALANCHE = "avalanche"
    HAILSTORM = "hailstorm"
    STORM_SURGE = "stormSurge"
    EXTREME_TEMPERATURE = "extremeTemperature"
    OTHER = "other"


class SourceAgencyVocabulary(str, Enum):
    """Controlled vocabulary for source agencies"""

    USGS = "usgs"
    NOAA = "noaa"
    NASA = "nasa"
    FEMA = "fema"
    UN_OCHA = "unOcha"
    WHO = "who"
    WMO = "wmo"
    IFRC = "ifrc"
    ACADEMIC = "academic"
    NGO = "ngo"
    GOVERNMENT = "government"
    PRIVATE = "private"
    CITIZEN = "citizen"
    OTHER = "other"


class ResponsibleParty(BaseModel):
    """ISO 19115 Responsible Party"""

    individual_name: Optional[str] = None
    organisation_name: Optional[str] = None
    position_name: Optional[str] = None
    role: str = Field(..., description="Role from ISO 19115 CI_RoleCode")
    contact_info: Optional[Dict[str, Any]] = None


class GeographicBoundingBox(BaseModel):
    """ISO 19115 Geographic Bounding Box"""

    west_bound_longitude: float = Field(..., ge=-180, le=180)
    east_bound_longitude: float = Field(..., ge=-180, le=180)
    south_bound_latitude: float = Field(..., ge=-90, le=90)
    north_bound_latitude: float = Field(..., ge=-90, le=90)

    @validator("east_bound_longitude")
    def validate_longitude_bounds(cls, v, values):
        if "west_bound_longitude" in values and v < values["west_bound_longitude"]:
            raise ValueError("east_bound_longitude must be >= west_bound_longitude")
        return v

    @validator("north_bound_latitude")
    def validate_latitude_bounds(cls, v, values):
        if "south_bound_latitude" in values and v < values["south_bound_latitude"]:
            raise ValueError("north_bound_latitude must be >= south_bound_latitude")
        return v


class TemporalExtent(BaseModel):
    """ISO 19115 Temporal Extent"""

    begin_position: Optional[datetime] = None
    end_position: Optional[datetime] = None
    time_instant: Optional[datetime] = None


class DataQuality(BaseModel):
    """ISO 19115 Data Quality"""

    scope: ScopeCode = ScopeCode.DATASET
    lineage: Optional[str] = None
    report: Optional[List[Dict[str, Any]]] = None


class ISO19115Metadata(BaseModel):
    """
    ISO 19115 Metadata - Authoritative Subset for Impact Assessment Images
    """

    # Required core elements
    file_identifier: str = Field(..., description="Unique identifier for this metadata record")
    language: str = Field(default="en", description="Language of the metadata")
    character_set: CharacterSetCode = CharacterSetCode.UTF8
    hierarchy_level: ScopeCode = ScopeCode.DATASET
    contact: ResponsibleParty = Field(..., description="Contact for the metadata")
    date_stamp: datetime = Field(default_factory=datetime.utcnow)

    # Identification information
    title: str = Field(..., max_length=255, description="Title of the resource")
    abstract: str = Field(..., description="Abstract describing the resource")
    purpose: Optional[str] = Field(None, description="Purpose for which the resource was created")

    # Keywords and classification
    topic_category: List[TopicCategoryCode] = Field(
        ..., description="Main theme(s) of the resource"
    )
    keywords: List[str] = Field(
        default_factory=list, description="Keywords describing the resource"
    )

    # Hazard-specific vocabulary
    hazard_type: HazardTypeVocabulary = Field(..., description="Type of hazard depicted")
    source_agency: SourceAgencyVocabulary = Field(
        ..., description="Agency that created/provided the data"
    )

    # Responsible parties
    cited_responsible_party: List[ResponsibleParty] = Field(default_factory=list)

    # Spatial representation
    spatial_representation_type: Optional[str] = None
    spatial_resolution: Optional[str] = None
    reference_system_info: str = Field(
        default="EPSG:4326", description="Coordinate reference system"
    )

    # Geographic extent
    geographic_element: GeographicBoundingBox = Field(..., description="Geographic extent")

    # Temporal extent
    temporal_element: Optional[TemporalExtent] = None

    # Data quality and lineage
    data_quality_info: DataQuality = Field(default_factory=DataQuality)

    # Distribution information
    format_name: str = Field(..., description="Format of the resource")
    format_version: Optional[str] = None

    # Provenance and rights
    creation_date: datetime = Field(default_factory=datetime.utcnow)
    publication_date: Optional[datetime] = None
    revision_date: Optional[datetime] = None

    # Rights and constraints
    access_constraints: Optional[str] = None
    use_constraints: Optional[str] = None
    classification: Optional[str] = None

    # Technical metadata for images
    image_description: Optional[Dict[str, Any]] = None
    camera_info: Optional[Dict[str, Any]] = None
    processing_level: Optional[str] = None

    class Config:
        use_enum_values = True
        json_encoders = {datetime: lambda v: v.isoformat()}


class ImageMetadataCreate(ISO19115Metadata):
    """Schema for creating new image metadata"""

    # File information
    filename: str = Field(..., description="Original filename")
    file_size: int = Field(..., gt=0, description="File size in bytes")
    content_type: str = Field(..., description="MIME type")

    # Upload information
    uploaded_by: str = Field(..., description="User who uploaded the file")

    @validator("content_type")
    def validate_content_type(cls, v):
        allowed_types = ["image/jpeg", "image/png", "image/tiff", "image/gif"]
        if v not in allowed_types:
            raise ValueError(f"Content type must be one of: {allowed_types}")
        return v


class ImageMetadataUpdate(BaseModel):
    """Schema for updating existing image metadata"""

    title: Optional[str] = None
    abstract: Optional[str] = None
    keywords: Optional[List[str]] = None
    hazard_type: Optional[HazardTypeVocabulary] = None
    source_agency: Optional[SourceAgencyVocabulary] = None
    topic_category: Optional[List[TopicCategoryCode]] = None
    purpose: Optional[str] = None
    spatial_resolution: Optional[str] = None
    access_constraints: Optional[str] = None
    use_constraints: Optional[str] = None
    processing_level: Optional[str] = None

    # Geographic extent updates
    west_bound_longitude: Optional[float] = Field(None, ge=-180, le=180)
    east_bound_longitude: Optional[float] = Field(None, ge=-180, le=180)
    south_bound_latitude: Optional[float] = Field(None, ge=-90, le=90)
    north_bound_latitude: Optional[float] = Field(None, ge=-90, le=90)

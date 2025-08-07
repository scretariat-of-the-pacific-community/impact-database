from django.db import models
from django.utils import timezone

# Try to import GIS models, fallback to regular models if not available
try:
    from django.contrib.gis.db import models as gis_models
    GIS_AVAILABLE = True
except (ImportError, Exception):
    # Fallback to regular models if PostGIS/GDAL is not available
    import django.db.models as gis_models
    GIS_AVAILABLE = False


class HazardImage(models.Model):
    """
    Model for storing hazard-related images with spatial metadata.
    Follows ISO 19115 metadata structure for hazard image indexing.
    
    Note: Spatial fields will only work when PostGIS is properly configured.
    """
    
    # Basic metadata fields
    title = models.CharField(max_length=255, help_text="Title of the hazard image")
    description = models.TextField(blank=True, help_text="Description of the hazard event")
    
    # Temporal metadata
    date_captured = models.DateTimeField(help_text="Date and time when the image was captured")
    date_uploaded = models.DateTimeField(default=timezone.now, help_text="Date and time when the image was uploaded")
    
    # Spatial metadata (will use PointField when PostGIS is available)
    if GIS_AVAILABLE:
        location = gis_models.PointField(help_text="Geographic location where the image was taken")
        coverage_area = gis_models.PolygonField(null=True, blank=True, help_text="Area covered by the image")
    else:
        # Fallback to lat/lng fields when PostGIS is not available
        latitude = models.FloatField(null=True, blank=True, help_text="Latitude of the image location")
        longitude = models.FloatField(null=True, blank=True, help_text="Longitude of the image location")
    
    # ISO 19115 metadata fields
    hazard_type = models.CharField(
        max_length=100,
        choices=[
            ('FLOOD', 'Flooding'),
            ('CYCLONE', 'Cyclone/Hurricane'),
            ('EARTHQUAKE', 'Earthquake'),
            ('TSUNAMI', 'Tsunami'),
            ('FIRE', 'Wildfire'),
            ('DROUGHT', 'Drought'),
            ('LANDSLIDE', 'Landslide'),
            ('OTHER', 'Other'),
        ],
        help_text="Type of hazard depicted in the image"
    )
    
    severity_level = models.CharField(
        max_length=10,
        choices=[
            ('LOW', 'Low'),
            ('MEDIUM', 'Medium'),
            ('HIGH', 'High'),
            ('CRITICAL', 'Critical'),
        ],
        help_text="Severity level of the hazard"
    )
    
    # Image file and metadata
    image_file = models.ImageField(upload_to='hazard_images/', help_text="The hazard image file")
    file_size = models.PositiveIntegerField(null=True, blank=True, help_text="File size in bytes")
    image_width = models.PositiveIntegerField(null=True, blank=True, help_text="Image width in pixels")
    image_height = models.PositiveIntegerField(null=True, blank=True, help_text="Image height in pixels")
    
    # Geographic reference system
    coordinate_system = models.CharField(
        max_length=20,
        default='EPSG:4326',
        help_text="Coordinate reference system (e.g., EPSG:4326 for WGS84)"
    )
    
    # Additional metadata
    source = models.CharField(max_length=255, blank=True, help_text="Source of the image")
    keywords = models.CharField(max_length=500, blank=True, help_text="Keywords for searching (comma-separated)")
    quality_score = models.FloatField(null=True, blank=True, help_text="Quality score from 0.0 to 1.0")
    
    # Administrative fields
    is_public = models.BooleanField(default=True, help_text="Whether the image is publicly accessible")
    created_by = models.CharField(max_length=255, blank=True, help_text="User who uploaded the image")
    
    class Meta:
        verbose_name = "Hazard Image"
        verbose_name_plural = "Hazard Images"
        ordering = ['-date_captured']
        indexes = [
            models.Index(fields=['hazard_type']),
            models.Index(fields=['severity_level']),
            models.Index(fields=['date_captured']),
            # Spatial index will be automatically created for PointField and PolygonField when available
        ]
    
    def __str__(self):
        return f"{self.title} - {self.hazard_type} ({self.date_captured.strftime('%Y-%m-%d')})"
    
    @property
    def lat_lng_available(self):
        """Returns True if spatial data is available."""
        if GIS_AVAILABLE and hasattr(self, 'location'):
            return self.location is not None
        return hasattr(self, 'latitude') and self.latitude is not None and self.longitude is not None
    
    def get_latitude(self):
        """Returns the latitude of the location."""
        if GIS_AVAILABLE and hasattr(self, 'location') and self.location:
            return self.location.y
        elif hasattr(self, 'latitude'):
            return self.latitude
        return None
    
    def get_longitude(self):
        """Returns the longitude of the location."""
        if GIS_AVAILABLE and hasattr(self, 'location') and self.location:
            return self.location.x
        elif hasattr(self, 'longitude'):
            return self.longitude
        return None


class SpatialTestModel(models.Model):
    """
    Simple test model to verify PostGIS functionality.
    This can be used to test spatial queries and operations.
    Will fallback to lat/lng fields if PostGIS is not available.
    """
    name = models.CharField(max_length=100)
    
    # Spatial fields (PostGIS) or fallback fields
    if GIS_AVAILABLE:
        point = gis_models.PointField()
        polygon = gis_models.PolygonField(null=True, blank=True)
    else:
        # Fallback to regular lat/lng fields
        latitude = models.FloatField(help_text="Latitude of the point")
        longitude = models.FloatField(help_text="Longitude of the point")
    
    created_at = models.DateTimeField(default=timezone.now)
    
    class Meta:
        verbose_name = "Spatial Test"
        verbose_name_plural = "Spatial Tests"
    
    def __str__(self):
        if GIS_AVAILABLE and hasattr(self, 'point'):
            return f"{self.name} at ({self.point.x}, {self.point.y})"
        elif hasattr(self, 'latitude'):
            return f"{self.name} at ({self.longitude}, {self.latitude})"
        return f"{self.name}"

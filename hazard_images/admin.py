from django.contrib import admin
from .models import HazardImage, SpatialTestModel, GIS_AVAILABLE

# Import GIS admin if available, otherwise use regular admin
if GIS_AVAILABLE:
    try:
        from django.contrib.gis.admin import OSMGeoAdmin
        GeoAdminClass = OSMGeoAdmin
    except ImportError:
        GeoAdminClass = admin.ModelAdmin
else:
    GeoAdminClass = admin.ModelAdmin


@admin.register(HazardImage)
class HazardImageAdmin(GeoAdminClass):
    """
    Admin interface for HazardImage model with spatial support when available.
    Uses OpenStreetMap widget for geographic fields if PostGIS is configured.
    """
    if GIS_AVAILABLE:
        list_display = ['title', 'hazard_type', 'severity_level', 'date_captured', 'is_public']
    else:
        list_display = ['title', 'hazard_type', 'severity_level', 'date_captured', 'is_public', 'latitude', 'longitude']
    
    list_filter = ['hazard_type', 'severity_level', 'is_public', 'date_captured']
    search_fields = ['title', 'description', 'keywords', 'source']
    readonly_fields = ['date_uploaded', 'file_size']
    
    if GIS_AVAILABLE:
        fieldsets = (
            ('Basic Information', {
                'fields': ('title', 'description', 'hazard_type', 'severity_level')
            }),
            ('Spatial Data', {
                'fields': ('location', 'coverage_area', 'coordinate_system')
            }),
            ('Temporal Data', {
                'fields': ('date_captured', 'date_uploaded')
            }),
            ('Image Information', {
                'fields': ('image_file', 'file_size', 'image_width', 'image_height')
            }),
            ('Metadata', {
                'fields': ('source', 'keywords', 'quality_score')
            }),
            ('Administrative', {
                'fields': ('is_public', 'created_by')
            }),
        )
    else:
        fieldsets = (
            ('Basic Information', {
                'fields': ('title', 'description', 'hazard_type', 'severity_level')
            }),
            ('Location Data', {
                'fields': ('latitude', 'longitude', 'coordinate_system')
            }),
            ('Temporal Data', {
                'fields': ('date_captured', 'date_uploaded')
            }),
            ('Image Information', {
                'fields': ('image_file', 'file_size', 'image_width', 'image_height')
            }),
            ('Metadata', {
                'fields': ('source', 'keywords', 'quality_score')
            }),
            ('Administrative', {
                'fields': ('is_public', 'created_by')
            }),
        )
    
    # Use OpenStreetMap widget for spatial fields if available
    if GIS_AVAILABLE and hasattr(GeoAdminClass, 'default_lon'):
        default_lon = 179.0  # Pacific region default
        default_lat = -17.0
        default_zoom = 5


@admin.register(SpatialTestModel)
class SpatialTestModelAdmin(GeoAdminClass):
    """
    Admin interface for SpatialTestModel with spatial support when available.
    """
    if GIS_AVAILABLE:
        list_display = ['name', 'point', 'created_at']
    else:
        list_display = ['name', 'latitude', 'longitude', 'created_at']
    
    search_fields = ['name']
    readonly_fields = ['created_at']
    
    # Use OpenStreetMap widget for spatial fields if available
    if GIS_AVAILABLE and hasattr(GeoAdminClass, 'default_lon'):
        default_lon = 179.0  # Pacific region default
        default_lat = -17.0
        default_zoom = 5

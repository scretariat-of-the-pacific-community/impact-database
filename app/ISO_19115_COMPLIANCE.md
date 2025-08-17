# ISO 19115:2003 Compliance Guide

The Impact Database has been enhanced to fully support ISO 19115:2003 geographic information metadata standards, making it interoperable with international geospatial systems and catalogs.

## Overview

ISO 19115 is the international standard for geographic information metadata. This compliance ensures that hazard images and their metadata can be:

- Discovered through international geospatial catalogs
- Integrated with other geospatial datasets
- Exchanged between organizations following standard protocols
- Archived according to international best practices

## Supported ISO 19115 Elements

### 1. Identification Information
- **Title**: Descriptive title for each image
- **Abstract**: Detailed description of hazard event and image content
- **Purpose**: Reason for image capture (e.g., damage assessment)
- **Status**: Completion status (Completed, Ongoing, Planned, etc.)
- **Point of Contact**: Responsible person or organization
- **Date Stamp**: Metadata creation date
- **Maintenance Frequency**: Update schedule

### 2. Spatial & Temporal Extent
- **Geographic Bounding Box**: Automatically generated from coordinates
- **Geographic Identifier**: Place names and administrative areas
- **Temporal Extent**: Event start/end times
- **Vertical Extent**: Elevation data (optional)

### 3. Content Information
- **Topic Category**: ISO standard categories (environment, disaster, imagery)
- **Keywords**: Controlled vocabulary terms from SPC Hazard Taxonomy
- **Keyword Thesaurus**: Reference to controlled vocabulary source

### 4. Distribution Information
- **Resource Locator**: URL to access the image
- **Format Name**: File format (JPEG, PNG, etc.)
- **Format Version**: Format specification version

### 5. Data Quality & Lineage
- **Lineage Statement**: Capture method and processing history
- **Source**: Original data source
- **Positional Accuracy**: GPS precision in meters

### 6. Constraints
- **Use Constraints**: Licensing terms (CC-BY, etc.)
- **Access Constraints**: Access limitations (Public, Restricted)
- **Security Classification**: Classification level

### 7. Metadata Record Information
- **Metadata Language**: Language code (eng, fra, etc.)
- **Metadata Standard**: ISO 19115:2003
- **Standard Version**: Implementation version
- **Metadata Date**: Last update timestamp

## Controlled Vocabularies

### Hazard Types (SPC Taxonomy)
- `cyclone`: Tropical cyclones, hurricanes, typhoons
- `flood`: All flood types (riverine, coastal, flash)
- `drought`: Water scarcity and agricultural drought
- `landslide`: Mass movements and slope failures
- `tsunami`: Seismic sea waves
- `earthquake`: Seismic events
- `volcano`: Volcanic eruptions and related hazards
- `wildfire`: Vegetation fires

### Topic Categories
Automatically assigned based on hazard type:
- `environment` (all hazards)
- `imageryBaseMapsEarthCover` (all images)
- `climatologyMeteorologyAtmosphere` (cyclone, drought)
- `inlandWaters` (flood)
- `geoscientificInformation` (earthquake, tsunami, volcano, landslide)
- `oceans` (tsunami)
- `farming` (drought)
- `biota` (wildfire)

## Usage Examples

### Basic Upload with ISO Metadata
```bash
curl -X POST "http://localhost:8000/api/upload" \
  -F "file=@flood_damage.jpg" \
  -F "hazard_type=flood" \
  -F "location=Port Vila, Vanuatu" \
  -F "title=Flood Impact Assessment - Downtown Area" \
  -F "abstract=Post-event imagery showing flood damage to commercial buildings" \
  -F "purpose=Damage assessment" \
  -F "point_of_contact=SPC DRM Team" \
  -F "lineage_statement=Captured with mobile phone during field survey" \
  -F "use_constraints=CC-BY-SA"
```

### Query by Access Constraints
```bash
curl "http://localhost:8000/api/images?access_constraints=Public"
```

### Get Controlled Vocabularies
```bash
curl "http://localhost:8000/api/vocabularies"
```

### Get Image Metadata
```bash
curl "http://localhost:8000/api/images/flood_1.jpg"
```

### Get ISO 19139 XML
```bash
curl "http://localhost:8000/api/metadata/flood_1.jpg/xml"
```

## Database Migration

To upgrade existing databases to ISO compliance:

```bash
cd /workspaces/impact-database/app
python migrate_to_iso.py
```

## Testing Compliance

Run the ISO compliance test suite:

```bash
chmod +x test_iso_compliance.sh
./test_iso_compliance.sh
```

## Future Enhancements

### Planned Features
1. **CSW Interface**: Catalog Service for Web (OGC CSW) endpoint
2. **STAC Compliance**: SpatioTemporal Asset Catalog integration
3. **Multilingual Support**: Metadata in multiple languages

### Integration Opportunities
- **GEOSS Portal**: Global Earth Observation System of Systems
- **UN-SPIDER**: Space-based Information for Disaster Management
- **Copernicus Emergency Management**: EU emergency response system
- **GDACS**: Global Disaster Alert and Coordination System

## Validation

The system validates all metadata against ISO 19115 requirements:
- ✅ Mandatory elements are enforced
- ✅ Controlled vocabularies are validated
- ✅ Coordinate ranges are checked
- ✅ Date formats follow ISO 8601
- ✅ Language codes follow ISO 639

This compliance ensures your hazard image database meets international standards for geospatial metadata and can participate in global disaster risk management initiatives.
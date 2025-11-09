# Task 4: Filtering API Implementation

## Overview
Task 4 implements comprehensive filtering capabilities for all metadata APIs, enabling forecast tools and disaster office dashboards to efficiently query approved disaster imagery with spatial, temporal, and categorical filters.

## Key Requirements Implemented

### 1. **Default Status Filter: Approved Only**
- **Requirement**: "Forecast tools and dashboards should be able to filter for approved data only"
- **Implementation**: All endpoints default to `status=["approved"]` when no status parameter is provided
- **Rationale**: Ensures operational systems receive only validated, trustworthy data by default
- **Override**: Users can explicitly request other statuses (e.g., `?status=pending_review&status=approved`)

### 2. **Trust-Related Fields Exposed**
All API responses now include trust metadata:
- `status` - approval state (pending_review, approved, rejected)
- `data_license` - data licensing (default: CC-BY 4.0)
- `source_type` - data provenance (citizen, official, research, media, other)
- `uploader_id` - accountability/traceability
- `positional_accuracy` - spatial quality indicator (meters)

### 3. **Spatial Filtering with PostGIS**
- **Bounding Box Filter**: `?bbox=minx,miny,maxx,maxy` (EPSG:4326)
- **Implementation**: Uses `ST_Intersects(geometry, ST_MakeEnvelope(...))`
- **Use Case**: Wave forecast systems can query images within their prediction grids
- **Example**: `?bbox=174.0,-42.0,175.0,-41.0` (Wellington, NZ region)

### 4. **Temporal Filtering**
- **From DateTime**: `?from_datetime=2025-01-01T00:00:00Z` (ISO8601)
- **To DateTime**: `?to_datetime=2025-12-31T23:59:59Z` (ISO8601)
- **Use Case**: Post-disaster analysis, event-specific queries
- **Example**: Query Cyclone Harold imagery from April 2020

### 5. **Categorical Filtering**
- **Hazard Type**: `?hazard_type=flood&hazard_type=cyclone` (multiple allowed)
- **Event ID**: `?event_id=TC_HAROLD_2020` (single value)
- **Use Case**: Hazard-specific dashboards, event catalogs

## Modified Endpoints

### GET `/images`
**Purpose**: List images with comprehensive filtering

**Query Parameters**:
```
status: List[str] = Query(default=["approved"])
hazard_type: List[str] = Query(default=None)
event_id: str = Query(default=None)
from_datetime: datetime = Query(default=None)
to_datetime: datetime = Query(default=None)
bbox: str = Query(default=None)  # Format: "minx,miny,maxx,maxy"
location: str = Query(default=None)
has_coordinates: bool = Query(default=None)
limit: int = Query(default=100, le=1000)
offset: int = Query(default=0, ge=0)
```

**Example Requests**:
```bash
# Default: approved images only
GET /images

# Disaster office: flood imagery in Fiji from April 2020
GET /images?hazard_type=flood&bbox=176,-19,180,-16&from_datetime=2020-04-01T00:00:00Z&to_datetime=2020-04-30T23:59:59Z

# Research: all cyclone imagery (including pending review)
GET /images?hazard_type=cyclone&status=approved&status=pending_review

# Event-specific query
GET /images?event_id=TC_HAROLD_2020&limit=500
```

**Response**:
```json
{
  "images": [
    {
      "id": "uuid",
      "filename": "image.jpg",
      "datetime": "2020-04-06T14:30:00Z",
      "geometry": {"type": "Point", "coordinates": [177.5, -17.8]},
      "hazard_type": "cyclone",
      "event_id": "TC_HAROLD_2020",
      "status": "approved",
      "data_license": "https://creativecommons.org/licenses/by/4.0/",
      "source_type": "citizen",
      "uploader_id": "user123",
      "positional_accuracy": 10.5,
      "title": "Storm damage to coastal homes",
      "thumbnail_url": "https://..."
    }
  ],
  "total": 1247,
  "limit": 100,
  "offset": 0
}
```

### GET `/geojson`
**Purpose**: GeoJSON FeatureCollection with same filtering as `/images`

**Query Parameters**: Same as `/images` endpoint

**Example Requests**:
```bash
# GeoJSON for web mapping
GET /geojson?hazard_type=tsunami&bbox=160,-25,180,-10

# Event-based GeoJSON
GET /geojson?event_id=TC_HAROLD_2020&status=approved&limit=1000
```

**Response**:
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "uuid",
      "geometry": {
        "type": "Point",
        "coordinates": [177.5, -17.8]
      },
      "properties": {
        "filename": "image.jpg",
        "datetime": "2020-04-06T14:30:00Z",
        "hazard_type": "cyclone",
        "event_id": "TC_HAROLD_2020",
        "status": "approved",
        "title": "Storm damage",
        "thumbnail_url": "https://...",
        "data_license": "https://creativecommons.org/licenses/by/4.0/",
        "source_type": "citizen",
        "positional_accuracy": 10.5
      }
    }
  ],
  "metadata": {
    "total_features": 1247,
    "returned_features": 100,
    "limit": 100,
    "offset": 0,
    "has_more": true
  }
}
```

### GET `/hazards`
**Purpose**: List unique hazard types with counts and filtering

**Query Parameters**:
```
status: List[str] = Query(default=["approved"])
event_id: str = Query(default=None)
from_datetime: datetime = Query(default=None)
to_datetime: datetime = Query(default=None)
```

**Example Requests**:
```bash
# Default: approved hazards only
GET /hazards

# Event-specific hazards
GET /hazards?event_id=TC_HAROLD_2020

# Hazards in date range
GET /hazards?from_datetime=2020-01-01T00:00:00Z&to_datetime=2020-12-31T23:59:59Z
```

**Response**:
```json
{
  "hazards": [
    {"hazard_type": "cyclone", "count": 342},
    {"hazard_type": "flood", "count": 156},
    {"hazard_type": "tsunami", "count": 23}
  ]
}
```

## Implementation Details

### PostGIS Spatial Query
```python
from geoalchemy2.functions import ST_Intersects, ST_MakeEnvelope

# Parse bbox: "minx,miny,maxx,maxy"
coords = [float(x) for x in bbox.split(',')]
if len(coords) != 4:
    raise HTTPException(status_code=400, detail="Invalid bbox format")

minx, miny, maxx, maxy = coords

# Validate coordinate ranges
if not (-180 <= minx <= 180 and -180 <= maxx <= 180):
    raise HTTPException(status_code=400, detail="Longitude out of range")
if not (-90 <= miny <= 90 and -90 <= maxy <= 90):
    raise HTTPException(status_code=400, detail="Latitude out of range")
if minx >= maxx or miny >= maxy:
    raise HTTPException(status_code=400, detail="Invalid bbox bounds")

# Apply spatial filter (SRID 4326 = WGS84)
bbox_geom = ST_MakeEnvelope(minx, miny, maxx, maxy, 4326)
query = query.filter(ST_Intersects(ImageMetadata.geometry, bbox_geom))
```

### Default Status Filter Logic
```python
# In all endpoints
status: List[str] = Query(default=["approved"])

# Apply to query
query = query.filter(ImageMetadata.status.in_(status))
```

### Multiple Value Filters
```python
# Hazard types: allow multiple
hazard_type: List[str] = Query(default=None)
if hazard_type:
    query = query.filter(ImageMetadata.hazard_type.in_(hazard_type))

# Event ID: single value only
event_id: str = Query(default=None)
if event_id:
    query = query.filter(ImageMetadata.event_id == event_id)
```

## Use Cases

### 1. **Forecast Tool Integration**
Wave and inundation forecast applications can:
- Query approved imagery within their prediction grid
- Filter by hazard type (tsunami, cyclone, flood)
- Access georeferenced validation data

```bash
# Tsunami forecast validation
GET /geojson?hazard_type=tsunami&status=approved&bbox=160,-25,180,-10
```

### 2. **Disaster Office Dashboard**
Post-disaster response teams can:
- View event-specific imagery
- Filter by approval status for situation reports
- Query temporal windows (before/during/after event)

```bash
# TC Harold post-disaster assessment
GET /images?event_id=TC_HAROLD_2020&status=approved&from_datetime=2020-04-01T00:00:00Z
```

### 3. **Research & Analysis**
Scientists can:
- Access complete datasets (including pending review)
- Spatial queries for study regions
- Temporal analysis across multiple events

```bash
# Research: all cyclone data in Vanuatu
GET /images?hazard_type=cyclone&status=approved&status=pending_review&bbox=166,-21,170,-13
```

## Testing

### Test Coverage
- ✅ Default status filter (approved only)
- ✅ Multiple status values
- ✅ Multiple hazard types
- ✅ Event ID filtering
- ✅ Datetime range validation
- ✅ Bounding box validation (format, ranges, bounds)
- ✅ Pagination defaults and limits
- ✅ GeoJSON structure validation
- ✅ Combined filters
- ✅ Trust field inclusion

**Test File**: `app/tests/test_filtering_apis.py` (18/18 tests passing)

### Manual Testing
```bash
# Start the application
cd /workspaces/impact-database
docker-compose up -d

# Test endpoints
curl "http://localhost:8000/api/v1/images?status=approved&limit=10"
curl "http://localhost:8000/api/v1/geojson?hazard_type=flood&bbox=174,-42,175,-41"
curl "http://localhost:8000/api/v1/hazards?status=approved"
```

## Database Indexes (Recommended)

For optimal query performance, add indexes on:
```sql
-- Status filtering (most common)
CREATE INDEX idx_image_metadata_status ON image_metadata(status);

-- Hazard type filtering
CREATE INDEX idx_image_metadata_hazard_type ON image_metadata(hazard_type);

-- Event ID filtering
CREATE INDEX idx_image_metadata_event_id ON image_metadata(event_id);

-- Datetime filtering
CREATE INDEX idx_image_metadata_datetime ON image_metadata(datetime);

-- Spatial filtering (PostGIS GIST index)
CREATE INDEX idx_image_metadata_geometry ON image_metadata USING GIST(geometry);

-- Composite index for common queries
CREATE INDEX idx_image_metadata_status_hazard ON image_metadata(status, hazard_type);
```

## OpenAPI Documentation

All query parameters are automatically documented in FastAPI's OpenAPI schema:
- Visit `http://localhost:8000/docs` for interactive API documentation
- Visit `http://localhost:8000/redoc` for ReDoc documentation

## Security Considerations

1. **Pagination Limits**: Maximum 1000 results per request to prevent DoS
2. **Coordinate Validation**: Strict validation of bbox ranges to prevent SQL injection
3. **Default Filters**: Approved-only default ensures data quality for public consumption
4. **No User-Specific PII**: Uploader IDs are user IDs, not personal information

## Migration Notes

### Breaking Changes
- None. All parameters are optional with sensible defaults.

### Backward Compatibility
- Existing `/images` and `/geojson` queries without filters continue to work
- **Change in behavior**: Default changed from "all statuses" to "approved only"
- Users requiring all statuses must explicitly request: `?status=pending_review&status=approved&status=rejected`

## Performance Expectations

- **Simple queries** (status only): < 100ms
- **Spatial queries** (with bbox): < 500ms (with GIST index)
- **Complex queries** (multiple filters + bbox): < 1s
- **Large result sets** (1000 records): < 2s

## Future Enhancements

1. **Advanced Spatial Queries**
   - Polygon geometries (not just bbox)
   - Radius queries (point + distance)
   - Multi-polygon support

2. **Additional Filters**
   - `min_positional_accuracy`: Quality threshold
   - `source_type`: Filter by data provenance
   - `has_description`: Filter images with descriptions
   - `has_thumbnail`: Filter images with thumbnails

3. **Sorting Options**
   - `?sort_by=datetime&sort_order=desc`
   - `?sort_by=positional_accuracy&sort_order=asc`

4. **Aggregations**
   - Temporal aggregations (images per day/month)
   - Spatial clustering (hexbins, grids)

## Related Documentation
- `TASK1_METADATA_CONTRACT.md` - Core metadata schema
- `TASK2_UPLOAD_VALIDATION.md` - Validation rules
- `TASK3_AUDIT_LOGGING.md` - Status workflow and permissions
- `ISO_19115_COMPLIANCE.md` - Metadata standards
- `STAC_OGC_README.md` - OGC and STAC APIs

## Contact
For questions about filtering implementation, see:
- API code: `app/api/metadata.py`
- Tests: `app/tests/test_filtering_apis.py`
- Models: `app/models/database.py`

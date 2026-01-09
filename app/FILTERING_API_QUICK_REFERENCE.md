# Quick Reference: Filtering APIs

## For Forecast Tools & Disaster Offices

### Basic Queries

**Get approved images only (default)**:
```bash
curl http://localhost:8000/api/v1/images
```

**Get all flood imagery**:
```bash
curl "http://localhost:8000/api/v1/images?hazard_type=flood"
```

**Get specific event**:
```bash
curl "http://localhost:8000/api/v1/images?event_id=TC_HAROLD_2020"
```

### Spatial Queries (Bounding Box)

**Wellington, New Zealand region**:
```bash
curl "http://localhost:8000/api/v1/geojson?bbox=174.0,-42.0,175.0,-41.0"
```

**Vanuatu region**:
```bash
curl "http://localhost:8000/api/v1/geojson?bbox=166.0,-21.0,170.0,-13.0"
```

**Fiji region**:
```bash
curl "http://localhost:8000/api/v1/geojson?bbox=176.0,-19.0,180.0,-16.0"
```

### Temporal Queries

**Images from 2020**:
```bash
curl "http://localhost:8000/api/v1/images?from_datetime=2020-01-01T00:00:00Z&to_datetime=2020-12-31T23:59:59Z"
```

**Last 30 days**:
```bash
# Calculate from_datetime = today - 30 days
curl "http://localhost:8000/api/v1/images?from_datetime=2024-12-08T00:00:00Z"
```

### Combined Queries

**TC Harold event - spatial + temporal**:
```bash
curl "http://localhost:8000/api/v1/geojson?event_id=TC_HAROLD_2020&bbox=166,-21,170,-13&from_datetime=2020-04-01T00:00:00Z&to_datetime=2020-04-30T23:59:59Z"
```

**Flood imagery in Fiji - last 3 months**:
```bash
curl "http://localhost:8000/api/v1/images?hazard_type=flood&bbox=176,-19,180,-16&from_datetime=2024-10-01T00:00:00Z"
```

**Multiple hazard types**:
```bash
curl "http://localhost:8000/api/v1/images?hazard_type=cyclone&hazard_type=flood&hazard_type=tsunami"
```

### Status Filtering

**Include pending review (for admins)**:
```bash
curl "http://localhost:8000/api/v1/images?status=approved&status=pending_review"
```

**All statuses**:
```bash
curl "http://localhost:8000/api/v1/images?status=approved&status=pending_review&status=rejected"
```

### Pagination

**First 100 results**:
```bash
curl "http://localhost:8000/api/v1/images?limit=100&offset=0"
```

**Next 100 results**:
```bash
curl "http://localhost:8000/api/v1/images?limit=100&offset=100"
```

**Maximum results (1000)**:
```bash
curl "http://localhost:8000/api/v1/images?limit=1000"
```

### Response Formats

**JSON List** (`/images`):
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
      "positional_accuracy": 10.5
    }
  ],
  "total": 1247,
  "limit": 100,
  "offset": 0
}
```

**GeoJSON** (`/geojson`):
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
        "status": "approved"
      }
    }
  ],
  "metadata": {
    "total_features": 1247,
    "returned_features": 100,
    "has_more": true
  }
}
```

### Common Use Cases

#### 1. Tsunami Forecast Validation
```bash
# Get approved tsunami imagery in Pacific region
curl "http://localhost:8000/api/v1/geojson?hazard_type=tsunami&bbox=160,-25,180,-10&status=approved"
```

#### 2. Post-Disaster Assessment Dashboard
```bash
# Get all imagery for specific event
curl "http://localhost:8000/api/v1/images?event_id=TC_HAROLD_2020&status=approved&limit=1000"
```

#### 3. Cyclone Track Mapping
```bash
# Get cyclone imagery along track path
curl "http://localhost:8000/api/v1/geojson?hazard_type=cyclone&bbox=160,-20,180,-10&from_datetime=2020-04-01T00:00:00Z&to_datetime=2020-04-15T23:59:59Z"
```

#### 4. Research Analysis
```bash
# Get all flood data including pending review
curl "http://localhost:8000/api/v1/images?hazard_type=flood&status=approved&status=pending_review&limit=1000"
```

#### 5. Quality-Filtered Results
```bash
# Get only official/research sources (higher trust)
# Note: This requires filtering in client application
curl "http://localhost:8000/api/v1/images?status=approved" | jq '.images[] | select(.source_type == "official" or .source_type == "research")'
```

### Query Parameters Reference

| Parameter | Type | Default | Description | Example |
|-----------|------|---------|-------------|---------|
| `status` | List[str] | `["approved"]` | Filter by status | `?status=approved&status=pending_review` |
| `hazard_type` | List[str] | None | Filter by hazard type(s) | `?hazard_type=flood&hazard_type=cyclone` |
| `event_id` | str | None | Filter by event ID | `?event_id=TC_HAROLD_2020` |
| `from_datetime` | ISO8601 | None | Images from this time | `?from_datetime=2020-01-01T00:00:00Z` |
| `to_datetime` | ISO8601 | None | Images until this time | `?to_datetime=2020-12-31T23:59:59Z` |
| `bbox` | str | None | Bounding box (minx,miny,maxx,maxy) | `?bbox=174,-42,175,-41` |
| `limit` | int | 100 | Max results (max 1000) | `?limit=500` |
| `offset` | int | 0 | Skip results | `?offset=100` |

### Bbox Format

**Format**: `minx,miny,maxx,maxy` (WGS84 coordinates)

**Constraints**:
- Longitude (minx, maxx): -180 to 180
- Latitude (miny, maxy): -90 to 90
- minx < maxx
- miny < maxy

**Examples**:
- Wellington, NZ: `174.0,-42.0,175.0,-41.0`
- Vanuatu: `166.0,-21.0,170.0,-13.0`
- Fiji: `176.0,-19.0,180.0,-16.0`
- Pacific Region: `160.0,-25.0,180.0,-10.0`

### Datetime Format

**ISO8601 with timezone**:
- Format: `YYYY-MM-DDTHH:MM:SSZ`
- Timezone: UTC (Z suffix)
- Example: `2020-04-06T14:30:00Z`

### Error Responses

**Invalid bbox format**:
```json
{
  "detail": "Invalid bbox format. Expected: minx,miny,maxx,maxy"
}
```

**Invalid coordinate range**:
```json
{
  "detail": "Longitude out of range [-180, 180]"
}
```

**Invalid datetime**:
```json
{
  "detail": "Invalid datetime format. Expected ISO8601: YYYY-MM-DDTHH:MM:SSZ"
}
```

### Performance Tips

1. **Use pagination** for large result sets
2. **Combine filters** to reduce results
3. **Use smaller bboxes** for spatial queries
4. **Cache results** on client side when appropriate
5. **Use GeoJSON endpoint** for mapping applications
6. **Use /images endpoint** for data processing

### API Documentation

**Interactive docs**: http://localhost:8000/docs
**ReDoc**: http://localhost:8000/redoc

### Support

For implementation details, see:
- `TASK4_FILTERING_IMPLEMENTATION.md` - Complete documentation
- `PHASE1_IMPLEMENTATION_SUMMARY.md` - Overview
- `app/api/metadata.py` - Source code

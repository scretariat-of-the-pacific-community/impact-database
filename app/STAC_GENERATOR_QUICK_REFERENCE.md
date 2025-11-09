# STAC Generator Quick Reference

## Basic Usage

```python
from services.stac_generator import image_to_stac_item

# Get image from database
image = db.query(ImageMetadata).filter_by(id=image_id).first()

# Generate STAC Item
stac_item = image_to_stac_item(
    image=image,
    base_url="https://api.example.com",
    collection_id="disaster-flood"  # Optional
)

# Return as JSON
return JSONResponse(content=stac_item)
```

## Function Reference

### `image_to_stac_item(image, base_url, collection_id=None)`

Convert ImageMetadata to STAC Item.

**Parameters**:
- `image: ImageMetadata` - Database model instance
- `base_url: str` - Base URL (e.g., "https://api.example.com")
- `collection_id: str` - Optional collection ID

**Returns**: `dict` - STAC Item

**Raises**: `ValueError` if geometry or datetime missing

### `get_collection_id_for_image(image)`

Get collection ID from hazard type.

```python
get_collection_id_for_image(image)  # → "disaster-flood"
```

### `validate_stac_item(stac_item)`

Validate STAC Item structure.

```python
validate_stac_item(stac_item)  # → True or raises ValueError
```

### `batch_images_to_stac_items(images, base_url, include_collection=True)`

Convert multiple images to STAC Items.

```python
images = db.query(ImageMetadata).filter_by(status="approved").all()
stac_items = batch_images_to_stac_items(images, "https://api.example.com")
```

## Property Namespaces

| Namespace | Purpose | Example Properties |
|-----------|---------|-------------------|
| (core) | STAC standard | `datetime`, `title`, `description` |
| `hazard:*` | Hazard metadata | `hazard:type`, `hazard:event_id` |
| `impact:*` | Status/license | `impact:status`, `impact:data_license` |
| `quality:*` | Data quality | `quality:positional_accuracy` |
| `contact:*` | Attribution | `contact:uploader_id` |
| `iso:*` | ISO 19115 | `iso:keywords`, `iso:lineage` |
| `temporal:*` | Time extent | `temporal:extent_start` |

## STAC Item Structure

```json
{
  "stac_version": "1.0.0",
  "type": "Feature",
  "id": "uuid",
  "collection": "disaster-flood",
  "geometry": {"type": "Point", "coordinates": [lon, lat]},
  "bbox": [minx, miny, maxx, maxy],
  "properties": {
    "datetime": "2025-11-07T10:00:00Z",
    "hazard:type": "flood",
    ...
  },
  "links": [
    {"rel": "self", "href": "..."},
    {"rel": "collection", "href": "..."}
  ],
  "assets": {
    "image": {"href": "...", "type": "image/jpeg", "roles": ["data"]},
    "thumbnail": {"href": "...", "type": "image/jpeg", "roles": ["thumbnail"]}
  }
}
```

## Common Patterns

### API Endpoint

```python
@router.get("/stac/items/{item_id}")
def get_stac_item(item_id: str, db: Session = Depends(get_db)):
    image = db.query(ImageMetadata).filter_by(id=item_id).first()
    if not image:
        raise HTTPException(404, "Item not found")
    
    stac_item = image_to_stac_item(image, "https://api.example.com")
    return stac_item
```

### Search Results

```python
def search_items(hazard_type: str, db: Session):
    images = db.query(ImageMetadata).filter_by(
        hazard_type=hazard_type,
        status="approved"
    ).all()
    
    stac_items = batch_images_to_stac_items(images, "https://api.example.com")
    
    return {
        "type": "FeatureCollection",
        "features": stac_items,
        "context": {"returned": len(stac_items)}
    }
```

### Error Handling

```python
try:
    stac_item = image_to_stac_item(image, base_url)
    validate_stac_item(stac_item)
except ValueError as e:
    logger.error(f"Invalid STAC Item: {e}")
    raise HTTPException(400, f"Cannot generate STAC Item: {e}")
```

## Coordinate Reference

**GeoJSON Order**: `[longitude, latitude]` (x, y)

```python
# Wellington, NZ
coordinates = [174.7762, -41.2865]  # [lon, lat]
```

**Valid Ranges**:
- Longitude: -180 to 180
- Latitude: -90 to 90

## Asset MIME Types

| Format | MIME Type |
|--------|-----------|
| JPEG | `image/jpeg` |
| PNG | `image/png` |
| TIFF | `image/tiff` |
| GeoTIFF | `image/tiff; application=geotiff` |

## Testing

```bash
# Run tests
pytest app/tests/test_stac_generator.py -v

# Test specific function
pytest app/tests/test_stac_generator.py::test_geometry_conversion -v

# With coverage
pytest app/tests/test_stac_generator.py --cov=services.stac_generator
```

## Validation

```python
# Internal validation
from services.stac_generator import validate_stac_item
validate_stac_item(stac_item)  # Raises ValueError if invalid

# External validation (recommended)
import pystac
item = pystac.Item.from_dict(stac_item)
item.validate()

# Online validator
# Visit: https://staclint.com/
```

## Common Errors

### Missing Geometry
```
ValueError: Image {id} has no geometry - cannot create STAC Item
```
**Fix**: Ensure image has valid geometry in database

### Missing Datetime
```
ValueError: Image {id} has no datetime - required by STAC spec
```
**Fix**: Ensure image has datetime field set

### Invalid Coordinates
```
ValueError: Longitude 200.0 out of valid range [-180, 180]
```
**Fix**: Check coordinate values are within valid ranges

## Best Practices

1. **Always provide base_url** - Required for asset/link hrefs
2. **Include collection_id** - Helps organize items
3. **Validate before returning** - Use `validate_stac_item()`
4. **Handle errors gracefully** - Use try/except for batch processing
5. **Use batch functions** - More efficient for multiple items
6. **Keep properties clean** - Generator removes None values automatically

## See Also

- Full documentation: `TASK5_STAC_GENERATOR.md`
- Test examples: `tests/test_stac_generator.py`
- STAC Specification: https://stacspec.org/
- PySTAC library: https://pystac.readthedocs.io/

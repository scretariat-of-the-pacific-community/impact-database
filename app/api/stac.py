"""
STAC (SpatioTemporal Asset Catalog) API implementation
Provides standardized access to geospatial data following STAC specification
Maps ISO 19115 metadata to STAC Items and Collections
"""

from datetime import datetime, timezone
from typing import Dict, List, Optional, Any, Union
from urllib.parse import urljoin
import json

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func, text
from pydantic import BaseModel, Field
from geojson import Point, Polygon, Feature, FeatureCollection

from models.database import get_db, ImageMetadata
from core.config import settings

router = APIRouter()

# STAC Models
class STACLink(BaseModel):
    """STAC Link object"""
    href: str
    rel: str
    type: Optional[str] = None
    title: Optional[str] = None

class STACAsset(BaseModel):
    """STAC Asset object"""
    href: str
    title: Optional[str] = None
    description: Optional[str] = None
    type: Optional[str] = None
    roles: Optional[List[str]] = None

class STACExtent(BaseModel):
    """STAC Collection Extent"""
    spatial: Dict[str, List[List[float]]]
    temporal: Dict[str, List[Optional[str]]]

class STACProvider(BaseModel):
    """STAC Provider information"""
    name: str
    description: Optional[str] = None
    roles: List[str]
    url: Optional[str] = None

class STACCollection(BaseModel):
    """STAC Collection object"""
    type: str = "Collection"
    stac_version: str = "1.0.0"
    id: str
    title: Optional[str] = None
    description: str
    keywords: Optional[List[str]] = None
    license: str
    providers: Optional[List[STACProvider]] = None
    extent: STACExtent
    links: List[STACLink]
    summaries: Optional[Dict[str, Any]] = None

class STACItem(BaseModel):
    """STAC Item object"""
    type: str = "Feature"
    stac_version: str = "1.0.0"
    id: str
    collection: Optional[str] = None
    geometry: Optional[Dict[str, Any]] = None
    bbox: Optional[List[float]] = None
    properties: Dict[str, Any]
    links: List[STACLink]
    assets: Dict[str, STACAsset]

class STACCatalog(BaseModel):
    """STAC Catalog object"""
    type: str = "Catalog"
    stac_version: str = "1.0.0"
    id: str
    title: Optional[str] = None
    description: str
    links: List[STACLink]

class STACItemCollection(BaseModel):
    """STAC Item Collection (search results)"""
    type: str = "FeatureCollection"
    features: List[STACItem]
    links: List[STACLink]
    context: Optional[Dict[str, Any]] = None

class STACConformance(BaseModel):
    """STAC API Conformance"""
    conformsTo: List[str]

# Helper functions for ISO to STAC mapping
def build_stac_links(request: Request, item_id: str = None, collection_id: str = None) -> List[STACLink]:
    """Build STAC links based on request context"""
    base_url = str(request.base_url).rstrip('/')
    links = []
    
    if item_id and collection_id:
        # Item links
        links.extend([
            STACLink(href=f"{base_url}/stac", rel="root", type="application/json"),
            STACLink(href=f"{base_url}/stac/collections/{collection_id}", rel="collection", type="application/json"),
            STACLink(href=f"{base_url}/stac/collections/{collection_id}/items/{item_id}", rel="self", type="application/json"),
        ])
    elif collection_id:
        # Collection links
        links.extend([
            STACLink(href=f"{base_url}/stac", rel="root", type="application/json"),
            STACLink(href=f"{base_url}/stac/collections/{collection_id}", rel="self", type="application/json"),
            STACLink(href=f"{base_url}/stac/collections/{collection_id}/items", rel="items", type="application/geo+json"),
        ])
    else:
        # Root catalog links
        links.extend([
            STACLink(href=f"{base_url}/stac", rel="self", type="application/json"),
            STACLink(href=f"{base_url}/stac/collections", rel="data", type="application/json"),
            STACLink(href=f"{base_url}/stac/search", rel="search", type="application/geo+json"),
            STACLink(href=f"{base_url}/stac/conformance", rel="conformance", type="application/json"),
        ])
    
    return links

def iso_to_stac_item(image: ImageMetadata, request: Request) -> STACItem:
    """Convert ISO 19115 metadata to STAC Item"""
    
    # Build geometry
    geometry = None
    bbox = None
    if image.latitude is not None and image.longitude is not None:
        geometry = {
            "type": "Point",
            "coordinates": [image.longitude, image.latitude]
        }
        bbox = [image.longitude, image.latitude, image.longitude, image.latitude]
    
    # Map properties from ISO 19115 to STAC
    properties = {
        "datetime": image.timestamp.isoformat() if image.timestamp else None,
        "title": image.title or image.filename,
        "description": image.abstract,
        "created": image.date_stamp.isoformat() if image.date_stamp else None,
        "updated": image.metadata_date.isoformat() if image.metadata_date else None,
        
        # Custom properties from ISO 19115
        "hazard:type": image.hazard_type,
        "location:country": image.country,
        "location:region": image.location,
        "location:site": image.geographic_identifier,
        
        # ISO 19115 specific fields
        "iso:purpose": image.purpose,
        "iso:status": image.status,
        "iso:maintenance_frequency": image.maintenance_frequency,
        "iso:topic_category": image.topic_category,
        "iso:keywords": image.keywords,
        "iso:keyword_thesaurus": image.keyword_thesaurus,
        "iso:lineage": image.lineage_statement,
        "iso:source": image.source,
        "iso:positional_accuracy": image.positional_accuracy,
        "iso:use_constraints": image.use_constraints,
        "iso:access_constraints": image.access_constraints,
        "iso:security_classification": image.security_classification,
        "iso:metadata_language": image.metadata_language,
        "iso:metadata_standard": image.metadata_standard_name,
        "iso:metadata_standard_version": image.metadata_standard_version,
        
        # Contact information
        "contact:point_of_contact": image.point_of_contact,
        
        # Spatial extent
        "spatial:bbox": image.geographic_bounding_box,
        "spatial:vertical_extent": image.vertical_extent,
        
        # Temporal extent
        "temporal:start": image.temporal_extent_start.isoformat() if image.temporal_extent_start else None,
        "temporal:end": image.temporal_extent_end.isoformat() if image.temporal_extent_end else None,
    }
    
    # Remove None values
    properties = {k: v for k, v in properties.items() if v is not None}
    
    # Build assets
    base_url = str(request.base_url).rstrip('/')
    assets = {
        "image": STACAsset(
            href=f"{base_url}/uploads/{image.filename}",
            title="Original Image",
            type=f"image/{image.format_name.lower()}" if image.format_name else "image/jpeg",
            roles=["data"]
        )
    }
    
    # Add thumbnail if available
    if image.thumbnail_url:
        assets["thumbnail"] = STACAsset(
            href=image.thumbnail_url,
            title="Thumbnail",
            type="image/jpeg",
            roles=["thumbnail"]
        )
    
    # Determine collection ID based on hazard type
    collection_id = f"hazard-{image.hazard_type.lower()}" if image.hazard_type else "general"
    
    return STACItem(
        id=image.filename,
        collection=collection_id,
        geometry=geometry,
        bbox=bbox,
        properties=properties,
        links=build_stac_links(request, image.filename, collection_id),
        assets=assets
    )

def build_stac_collection(hazard_type: str, images: List[ImageMetadata], request: Request) -> STACCollection:
    """Build STAC Collection for a hazard type"""
    collection_id = f"hazard-{hazard_type.lower()}"
    
    # Calculate spatial extent
    lats = [img.latitude for img in images if img.latitude is not None]
    lons = [img.longitude for img in images if img.longitude is not None]
    
    if lats and lons:
        spatial_bbox = [min(lons), min(lats), max(lons), max(lats)]
    else:
        spatial_bbox = [-180, -90, 180, 90]  # Global extent as fallback
    
    # Calculate temporal extent
    dates = [img.timestamp for img in images if img.timestamp is not None]
    if dates:
        temporal_start = min(dates).isoformat()
        temporal_end = max(dates).isoformat()
    else:
        temporal_start = None
        temporal_end = None
    
    # Build summaries
    summaries = {
        "datetime": [temporal_start, temporal_end] if temporal_start and temporal_end else [],
        "hazard:type": [hazard_type],
        "location:country": list(set(img.country for img in images if img.country)),
        "iso:topic_category": list(set(
            cat for img in images if img.topic_category 
            for cat in img.topic_category
        )),
    }
    
    return STACCollection(
        id=collection_id,
        title=f"{hazard_type.title()} Hazard Images",
        description=f"Collection of {hazard_type} hazard impact images with ISO 19115 compliant metadata",
        keywords=[hazard_type, "hazard", "disaster", "impact", "imagery"],
        license="CC-BY-4.0",
        providers=[
            STACProvider(
                name="Pacific Impact Database",
                description="SPC Pacific Impact Database for hazard imagery",
                roles=["host", "processor"],
                url=str(request.base_url)
            )
        ],
        extent=STACExtent(
            spatial={"bbox": [spatial_bbox]},
            temporal={"interval": [[temporal_start, temporal_end]]}
        ),
        links=build_stac_links(request, collection_id=collection_id),
        summaries=summaries
    )

# STAC API endpoints
@router.get("/", response_model=STACCatalog)
async def get_stac_catalog(request: Request):
    """STAC Catalog root endpoint"""
    return STACCatalog(
        id="pacific-impact-catalog",
        title="Pacific Impact Database STAC Catalog",
        description="SpatioTemporal Asset Catalog for Pacific Island hazard impact imagery with ISO 19115 compliant metadata",
        links=build_stac_links(request)
    )

@router.get("/conformance", response_model=STACConformance)
async def get_stac_conformance():
    """STAC API conformance endpoint"""
    return STACConformance(
        conformsTo=[
            "https://api.stacspec.org/v1.0.0/core",
            "https://api.stacspec.org/v1.0.0/collections",
            "https://api.stacspec.org/v1.0.0/item-search",
            "http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/core",
            "http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/geojson"
        ]
    )

@router.get("/collections", response_model=List[STACCollection])
async def get_stac_collections(
    request: Request,
    db: Session = Depends(get_db)
):
    """Get all STAC collections"""
    # Get unique hazard types
    hazard_types = db.query(ImageMetadata.hazard_type).distinct().all()
    collections = []
    
    for (hazard_type,) in hazard_types:
        if hazard_type:
            # Get images for this hazard type
            images = db.query(ImageMetadata).filter(
                ImageMetadata.hazard_type == hazard_type
            ).limit(100).all()  # Limit for performance
            
            collection = build_stac_collection(hazard_type, images, request)
            collections.append(collection)
    
    return collections

@router.get("/collections/{collection_id}", response_model=STACCollection)
async def get_stac_collection(
    collection_id: str,
    request: Request,
    db: Session = Depends(get_db)
):
    """Get specific STAC collection"""
    # Extract hazard type from collection ID
    if not collection_id.startswith("hazard-"):
        raise HTTPException(status_code=404, detail="Collection not found")
    
    hazard_type = collection_id.replace("hazard-", "").replace("-", "_")
    
    # Get images for this hazard type
    images = db.query(ImageMetadata).filter(
        ImageMetadata.hazard_type == hazard_type
    ).all()
    
    if not images:
        raise HTTPException(status_code=404, detail="Collection not found")
    
    return build_stac_collection(hazard_type, images, request)

@router.get("/collections/{collection_id}/items", response_model=STACItemCollection)
async def get_stac_collection_items(
    collection_id: str,
    request: Request,
    db: Session = Depends(get_db),
    limit: int = Query(10, ge=1, le=100),
    bbox: Optional[str] = Query(None, description="Bounding box as 'minx,miny,maxx,maxy'"),
    datetime: Optional[str] = Query(None, description="Date/time filter"),
    offset: int = Query(0, ge=0)
):
    """Get items from a STAC collection"""
    # Extract hazard type from collection ID
    if not collection_id.startswith("hazard-"):
        raise HTTPException(status_code=404, detail="Collection not found")
    
    hazard_type = collection_id.replace("hazard-", "").replace("-", "_")
    
    # Build query
    query = db.query(ImageMetadata).filter(ImageMetadata.hazard_type == hazard_type)
    
    # Apply spatial filter
    if bbox:
        try:
            minx, miny, maxx, maxy = map(float, bbox.split(','))
            query = query.filter(
                and_(
                    ImageMetadata.longitude >= minx,
                    ImageMetadata.longitude <= maxx,
                    ImageMetadata.latitude >= miny,
                    ImageMetadata.latitude <= maxy
                )
            )
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid bbox format")
    
    # Apply temporal filter
    if datetime:
        try:
            if "/" in datetime:
                start, end = datetime.split("/")
                if start != "..":
                    start_dt = datetime.fromisoformat(start.replace('Z', '+00:00'))
                    query = query.filter(ImageMetadata.timestamp >= start_dt)
                if end != "..":
                    end_dt = datetime.fromisoformat(end.replace('Z', '+00:00'))
                    query = query.filter(ImageMetadata.timestamp <= end_dt)
            else:
                dt = datetime.fromisoformat(datetime.replace('Z', '+00:00'))
                query = query.filter(ImageMetadata.timestamp == dt)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid datetime format")
    
    # Get total count for context
    total = query.count()
    
    # Apply pagination
    images = query.offset(offset).limit(limit).all()
    
    # Convert to STAC items
    stac_items = [iso_to_stac_item(img, request) for img in images]
    
    # Build context
    context = {
        "matched": total,
        "returned": len(stac_items),
        "limit": limit
    }
    
    # Build links for pagination
    base_url = str(request.url).split('?')[0]
    links = [
        STACLink(href=str(request.url), rel="self", type="application/geo+json")
    ]
    
    if offset + limit < total:
        next_url = f"{base_url}?limit={limit}&offset={offset + limit}"
        if bbox:
            next_url += f"&bbox={bbox}"
        if datetime:
            next_url += f"&datetime={datetime}"
        links.append(STACLink(href=next_url, rel="next", type="application/geo+json"))
    
    if offset > 0:
        prev_offset = max(0, offset - limit)
        prev_url = f"{base_url}?limit={limit}&offset={prev_offset}"
        if bbox:
            prev_url += f"&bbox={bbox}"
        if datetime:
            prev_url += f"&datetime={datetime}"
        links.append(STACLink(href=prev_url, rel="prev", type="application/geo+json"))
    
    return STACItemCollection(
        features=stac_items,
        links=links,
        context=context
    )

@router.get("/collections/{collection_id}/items/{item_id}", response_model=STACItem)
async def get_stac_item(
    collection_id: str,
    item_id: str,
    request: Request,
    db: Session = Depends(get_db)
):
    """Get specific STAC item"""
    image = db.query(ImageMetadata).filter(ImageMetadata.filename == item_id).first()
    
    if not image:
        raise HTTPException(status_code=404, detail="Item not found")
    
    # Verify collection
    expected_collection = f"hazard-{image.hazard_type.lower()}" if image.hazard_type else "general"
    if collection_id != expected_collection:
        raise HTTPException(status_code=404, detail="Item not found in this collection")
    
    return iso_to_stac_item(image, request)

@router.post("/search", response_model=STACItemCollection)
@router.get("/search", response_model=STACItemCollection)
async def search_stac_items(
    request: Request,
    db: Session = Depends(get_db),
    collections: Optional[List[str]] = Query(None, description="Collection IDs to search"),
    bbox: Optional[str] = Query(None, description="Bounding box as 'minx,miny,maxx,maxy'"),
    datetime: Optional[str] = Query(None, description="Date/time filter"),
    query: Optional[Dict[str, Any]] = None,
    limit: int = Query(10, ge=1, le=100),
    offset: int = Query(0, ge=0)
):
    """STAC Item Search endpoint"""
    # Build base query
    db_query = db.query(ImageMetadata)
    
    # Filter by collections
    if collections:
        hazard_types = []
        for coll_id in collections:
            if coll_id.startswith("hazard-"):
                hazard_type = coll_id.replace("hazard-", "").replace("-", "_")
                hazard_types.append(hazard_type)
        
        if hazard_types:
            db_query = db_query.filter(ImageMetadata.hazard_type.in_(hazard_types))
    
    # Apply spatial filter
    if bbox:
        try:
            minx, miny, maxx, maxy = map(float, bbox.split(','))
            db_query = db_query.filter(
                and_(
                    ImageMetadata.longitude >= minx,
                    ImageMetadata.longitude <= maxx,
                    ImageMetadata.latitude >= miny,
                    ImageMetadata.latitude <= maxy
                )
            )
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid bbox format")
    
    # Apply temporal filter
    if datetime:
        try:
            if "/" in datetime:
                start, end = datetime.split("/")
                if start != "..":
                    start_dt = datetime.fromisoformat(start.replace('Z', '+00:00'))
                    db_query = db_query.filter(ImageMetadata.timestamp >= start_dt)
                if end != "..":
                    end_dt = datetime.fromisoformat(end.replace('Z', '+00:00'))
                    db_query = db_query.filter(ImageMetadata.timestamp <= end_dt)
            else:
                dt = datetime.fromisoformat(datetime.replace('Z', '+00:00'))
                db_query = db_query.filter(ImageMetadata.timestamp == dt)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid datetime format")
    
    # Apply property queries
    if query:
        for prop, value in query.items():
            if prop == "hazard:type":
                db_query = db_query.filter(ImageMetadata.hazard_type == value)
            elif prop == "location:country":
                db_query = db_query.filter(ImageMetadata.country == value)
            # Add more property filters as needed
    
    # Get total count
    total = db_query.count()
    
    # Apply pagination
    images = db_query.offset(offset).limit(limit).all()
    
    # Convert to STAC items
    stac_items = [iso_to_stac_item(img, request) for img in images]
    
    # Build context
    context = {
        "matched": total,
        "returned": len(stac_items),
        "limit": limit
    }
    
    return STACItemCollection(
        features=stac_items,
        links=[STACLink(href=str(request.url), rel="self", type="application/geo+json")],
        context=context
    )

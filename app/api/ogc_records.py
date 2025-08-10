"""
OGC API - Records implementation
Provides standardized catalog access following OGC API - Records specification
Enables discovery of metadata records and collections
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

# OGC API - Records Models
class OGCLink(BaseModel):
    """OGC Link object"""
    href: str
    rel: str
    type: Optional[str] = None
    title: Optional[str] = None
    hreflang: Optional[str] = None

class OGCConformance(BaseModel):
    """OGC API conformance declaration"""
    conformsTo: List[str]

class OGCLandingPage(BaseModel):
    """OGC API Landing Page"""
    title: str
    description: str
    links: List[OGCLink]

class OGCExtent(BaseModel):
    """OGC Extent object"""
    spatial: Optional[Dict[str, List[List[float]]]] = None
    temporal: Optional[Dict[str, List[Optional[str]]]] = None

class OGCCollection(BaseModel):
    """OGC Collection object"""
    id: str
    title: Optional[str] = None
    description: Optional[str] = None
    links: List[OGCLink]
    extent: Optional[OGCExtent] = None
    itemType: str = "record"
    crs: List[str] = ["http://www.opengis.net/def/crs/OGC/1.3/CRS84"]

class OGCCollections(BaseModel):
    """OGC Collections response"""
    links: List[OGCLink]
    collections: List[OGCCollection]

class OGCRecord(BaseModel):
    """OGC Record object"""
    id: str
    type: str = "Feature"
    time: Optional[Dict[str, Any]] = None
    geometry: Optional[Dict[str, Any]] = None
    properties: Dict[str, Any]
    links: List[OGCLink]

class OGCRecords(BaseModel):
    """OGC Records collection response"""
    type: str = "FeatureCollection"
    features: List[OGCRecord]
    links: List[OGCLink]
    timeStamp: str
    numberMatched: int
    numberReturned: int

class OGCQueryables(BaseModel):
    """OGC Queryables schema"""
    type: str = "object"
    title: str
    properties: Dict[str, Any]
    additionalProperties: bool = False

# Helper functions
def build_ogc_links(request: Request, collection_id: str = None, record_id: str = None) -> List[OGCLink]:
    """Build OGC API links"""
    base_url = str(request.base_url).rstrip('/')
    links = []
    
    if record_id and collection_id:
        # Record links
        links.extend([
            OGCLink(href=f"{base_url}/ogc", rel="root", type="application/json", title="Landing page"),
            OGCLink(href=f"{base_url}/ogc/collections/{collection_id}", rel="collection", type="application/json"),
            OGCLink(href=f"{base_url}/ogc/collections/{collection_id}/items/{record_id}", rel="self", type="application/geo+json"),
            OGCLink(href=f"{base_url}/ogc/collections/{collection_id}/items/{record_id}?f=html", rel="alternate", type="text/html"),
        ])
    elif collection_id:
        # Collection links
        links.extend([
            OGCLink(href=f"{base_url}/ogc", rel="root", type="application/json", title="Landing page"),
            OGCLink(href=f"{base_url}/ogc/collections/{collection_id}", rel="self", type="application/json"),
            OGCLink(href=f"{base_url}/ogc/collections/{collection_id}/items", rel="items", type="application/geo+json"),
            OGCLink(href=f"{base_url}/ogc/collections/{collection_id}/queryables", rel="queryables", type="application/schema+json"),
        ])
    else:
        # Root links
        links.extend([
            OGCLink(href=f"{base_url}/ogc", rel="self", type="application/json", title="This document"),
            OGCLink(href=f"{base_url}/ogc/api", rel="service-desc", type="application/vnd.oai.openapi+json;version=3.0", title="API definition"),
            OGCLink(href=f"{base_url}/ogc/conformance", rel="conformance", type="application/json", title="Conformance declaration"),
            OGCLink(href=f"{base_url}/ogc/collections", rel="data", type="application/json", title="Collections"),
        ])
    
    return links

def iso_to_ogc_record(image: ImageMetadata, collection_id: str, request: Request) -> OGCRecord:
    """Convert ISO 19115 metadata to OGC Record"""
    
    # Build geometry
    geometry = None
    if image.latitude is not None and image.longitude is not None:
        geometry = {
            "type": "Point",
            "coordinates": [image.longitude, image.latitude]
        }
    
    # Build time object
    time_obj = None
    if image.timestamp:
        time_obj = {
            "date": image.timestamp.isoformat(),
            "timestamp": image.timestamp.isoformat()
        }
    
    # Build properties from ISO 19115
    properties = {
        "title": image.title or image.filename,
        "description": image.abstract,
        "type": "dataset",
        "created": image.date_stamp.isoformat() if image.date_stamp else None,
        "updated": image.metadata_date.isoformat() if image.metadata_date else None,
        
        # Core Dublin Core elements
        "identifier": image.file_identifier or image.filename,
        "language": image.metadata_language or "en",
        "rights": image.use_constraints,
        "publisher": image.responsible_party_organisation,
        
        # Subject and keywords
        "keywords": image.keywords if image.keywords else [],
        "themes": [
            {
                "concepts": image.keywords if image.keywords else [],
                "scheme": image.keyword_thesaurus
            }
        ] if image.keywords else [],
        
        # Spatial properties
        "geometry": geometry,
        "bbox": [image.longitude, image.latitude, image.longitude, image.latitude] if geometry else None,
        
        # Temporal properties
        "temporal": {
            "start": image.temporal_extent_start.isoformat() if image.temporal_extent_start else None,
            "end": image.temporal_extent_end.isoformat() if image.temporal_extent_end else None
        } if image.temporal_extent_start or image.temporal_extent_end else None,
        
        # Format and technical details
        "formats": [image.format_name] if image.format_name else [],
        "contactPoint": image.point_of_contact,
        
        # Custom properties from ISO 19115
        "iso19115": {
            "hierarchyLevel": "dataset",
            "purpose": image.purpose,
            "status": image.status,
            "maintenanceFrequency": image.maintenance_frequency,
            "topicCategory": image.topic_category,
            "lineage": image.lineage_statement,
            "source": image.source,
            "positionalAccuracy": image.positional_accuracy,
            "accessConstraints": image.access_constraints,
            "securityClassification": image.security_classification,
            "metadataStandard": {
                "name": image.metadata_standard_name,
                "version": image.metadata_standard_version
            }
        },
        
        # Hazard-specific properties
        "hazard": {
            "type": image.hazard_type,
            "location": {
                "country": image.country,
                "region": image.location,
                "site": image.geographic_identifier
            }
        }
    }
    
    # Remove None values from top level
    properties = {k: v for k, v in properties.items() if v is not None}
    
    # Build record links
    base_url = str(request.base_url).rstrip('/')
    links = build_ogc_links(request, collection_id, image.filename)
    
    # Add data access links
    links.extend([
        OGCLink(
            href=f"{base_url}/uploads/{image.filename}",
            rel="enclosure",
            type=f"image/{image.format_name.lower()}" if image.format_name else "image/jpeg",
            title="Download original image"
        )
    ])
    
    if image.thumbnail_url:
        links.append(
            OGCLink(
                href=image.thumbnail_url,
                rel="preview",
                type="image/jpeg",
                title="Thumbnail preview"
            )
        )
    
    return OGCRecord(
        id=image.filename,
        time=time_obj,
        geometry=geometry,
        properties=properties,
        links=links
    )

# OGC API - Records endpoints
@router.get("/", response_model=OGCLandingPage)
async def get_ogc_landing_page(request: Request):
    """OGC API - Records landing page"""
    return OGCLandingPage(
        title="Pacific Impact Database - OGC API Records",
        description="OGC API - Records implementation for Pacific Island hazard impact imagery with ISO 19115 compliant metadata. Provides standardized access to catalog records following OGC specifications.",
        links=build_ogc_links(request)
    )

@router.get("/conformance", response_model=OGCConformance)
async def get_ogc_conformance():
    """OGC API - Records conformance declaration"""
    return OGCConformance(
        conformsTo=[
            "http://www.opengis.net/spec/ogcapi-records-1/1.0/conf/core",
            "http://www.opengis.net/spec/ogcapi-records-1/1.0/conf/json",
            "http://www.opengis.net/spec/ogcapi-records-1/1.0/conf/html",
            "http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/core",
            "http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/geojson",
            "http://www.opengis.net/spec/ogcapi-common-1/1.0/conf/core",
            "http://www.opengis.net/spec/ogcapi-common-1/1.0/conf/json",
            "http://www.opengis.net/spec/ogcapi-common-1/1.0/conf/html"
        ]
    )

@router.get("/collections", response_model=OGCCollections)
async def get_ogc_collections(
    request: Request,
    db: Session = Depends(get_db)
):
    """Get all OGC collections"""
    # Get unique hazard types with spatial/temporal extents
    hazard_query = """
    SELECT 
        hazard_type,
        COUNT(*) as record_count,
        MIN(longitude) as min_lon,
        MAX(longitude) as max_lon,
        MIN(latitude) as min_lat,
        MAX(latitude) as max_lat,
        MIN(timestamp) as min_time,
        MAX(timestamp) as max_time
    FROM image_metadata 
    WHERE hazard_type IS NOT NULL 
    GROUP BY hazard_type
    """
    
    results = db.execute(text(hazard_query)).fetchall()
    collections = []
    
    for row in results:
        hazard_type = row.hazard_type
        collection_id = f"hazard-{hazard_type.lower().replace(' ', '-')}"
        
        # Build spatial extent
        extent = None
        if all(x is not None for x in [row.min_lon, row.max_lon, row.min_lat, row.max_lat]):
            spatial_extent = [[row.min_lon, row.min_lat, row.max_lon, row.max_lat]]
            temporal_extent = None
            
            if row.min_time and row.max_time:
                temporal_extent = [[row.min_time.isoformat(), row.max_time.isoformat()]]
            
            extent = OGCExtent(
                spatial={"bbox": spatial_extent, "crs": "http://www.opengis.net/def/crs/OGC/1.3/CRS84"},
                temporal={"interval": temporal_extent} if temporal_extent else None
            )
        
        collection = OGCCollection(
            id=collection_id,
            title=f"{hazard_type.title()} Hazard Records",
            description=f"Metadata records for {hazard_type} hazard impact imagery from the Pacific Islands region. Contains {row.record_count} records with ISO 19115 compliant metadata.",
            links=build_ogc_links(request, collection_id),
            extent=extent
        )
        collections.append(collection)
    
    # Add general collection for uncategorized records
    uncategorized_count = db.query(func.count(ImageMetadata.id)).filter(
        or_(ImageMetadata.hazard_type.is_(None), ImageMetadata.hazard_type == "")
    ).scalar()
    
    if uncategorized_count > 0:
        collections.append(
            OGCCollection(
                id="general",
                title="General Records",
                description=f"Metadata records for general imagery not categorized by hazard type. Contains {uncategorized_count} records.",
                links=build_ogc_links(request, "general")
            )
        )
    
    return OGCCollections(
        links=build_ogc_links(request),
        collections=collections
    )

@router.get("/collections/{collection_id}", response_model=OGCCollection)
async def get_ogc_collection(
    collection_id: str,
    request: Request,
    db: Session = Depends(get_db)
):
    """Get specific OGC collection"""
    if collection_id == "general":
        # Handle general collection
        count = db.query(func.count(ImageMetadata.id)).filter(
            or_(ImageMetadata.hazard_type.is_(None), ImageMetadata.hazard_type == "")
        ).scalar()
        
        if count == 0:
            raise HTTPException(status_code=404, detail="Collection not found")
        
        return OGCCollection(
            id="general",
            title="General Records",
            description=f"Metadata records for general imagery not categorized by hazard type. Contains {count} records.",
            links=build_ogc_links(request, "general")
        )
    
    # Handle hazard collections
    if not collection_id.startswith("hazard-"):
        raise HTTPException(status_code=404, detail="Collection not found")
    
    hazard_type = collection_id.replace("hazard-", "").replace("-", " ")
    
    # Get collection statistics
    stats_query = """
    SELECT 
        COUNT(*) as record_count,
        MIN(longitude) as min_lon,
        MAX(longitude) as max_lon,
        MIN(latitude) as min_lat,
        MAX(latitude) as max_lat,
        MIN(timestamp) as min_time,
        MAX(timestamp) as max_time
    FROM image_metadata 
    WHERE LOWER(hazard_type) = LOWER(:hazard_type)
    """
    
    result = db.execute(text(stats_query), {"hazard_type": hazard_type}).fetchone()
    
    if not result or result.record_count == 0:
        raise HTTPException(status_code=404, detail="Collection not found")
    
    # Build extent
    extent = None
    if all(x is not None for x in [result.min_lon, result.max_lon, result.min_lat, result.max_lat]):
        spatial_extent = [[result.min_lon, result.min_lat, result.max_lon, result.max_lat]]
        temporal_extent = None
        
        if result.min_time and result.max_time:
            temporal_extent = [[result.min_time.isoformat(), result.max_time.isoformat()]]
        
        extent = OGCExtent(
            spatial={"bbox": spatial_extent, "crs": "http://www.opengis.net/def/crs/OGC/1.3/CRS84"},
            temporal={"interval": temporal_extent} if temporal_extent else None
        )
    
    return OGCCollection(
        id=collection_id,
        title=f"{hazard_type.title()} Hazard Records",
        description=f"Metadata records for {hazard_type} hazard impact imagery from the Pacific Islands region. Contains {result.record_count} records with ISO 19115 compliant metadata.",
        links=build_ogc_links(request, collection_id),
        extent=extent
    )

@router.get("/collections/{collection_id}/queryables", response_model=OGCQueryables)
async def get_ogc_queryables(collection_id: str):
    """Get queryable properties for a collection"""
    return OGCQueryables(
        title=f"Queryable properties for {collection_id}",
        properties={
            "type": {
                "title": "Record type",
                "type": "string",
                "enum": ["dataset"]
            },
            "title": {
                "title": "Title",
                "type": "string"
            },
            "description": {
                "title": "Description", 
                "type": "string"
            },
            "keywords": {
                "title": "Keywords",
                "type": "array",
                "items": {"type": "string"}
            },
            "language": {
                "title": "Language",
                "type": "string"
            },
            "created": {
                "title": "Creation date",
                "type": "string",
                "format": "date-time"
            },
            "updated": {
                "title": "Update date",
                "type": "string", 
                "format": "date-time"
            },
            "hazard.type": {
                "title": "Hazard type",
                "type": "string"
            },
            "hazard.location.country": {
                "title": "Country",
                "type": "string"
            },
            "hazard.location.region": {
                "title": "Region",
                "type": "string"
            },
            "iso19115.topicCategory": {
                "title": "ISO 19115 Topic Category",
                "type": "array",
                "items": {"type": "string"}
            },
            "iso19115.status": {
                "title": "Status",
                "type": "string"
            }
        }
    )

@router.get("/collections/{collection_id}/items", response_model=OGCRecords)
async def get_ogc_records(
    collection_id: str,
    request: Request,
    db: Session = Depends(get_db),
    limit: int = Query(10, ge=1, le=100, description="Number of records to return"),
    offset: int = Query(0, ge=0, description="Starting offset"),
    bbox: Optional[str] = Query(None, description="Bounding box filter (minx,miny,maxx,maxy)"),
    datetime: Optional[str] = Query(None, description="Temporal filter"),
    q: Optional[str] = Query(None, description="Text search query"),
    type: Optional[str] = Query(None, description="Record type filter"),
    **kwargs
):
    """Get records from a collection"""
    # Build base query
    if collection_id == "general":
        query = db.query(ImageMetadata).filter(
            or_(ImageMetadata.hazard_type.is_(None), ImageMetadata.hazard_type == "")
        )
    elif collection_id.startswith("hazard-"):
        hazard_type = collection_id.replace("hazard-", "").replace("-", " ")
        query = db.query(ImageMetadata).filter(
            func.lower(ImageMetadata.hazard_type) == hazard_type.lower()
        )
    else:
        raise HTTPException(status_code=404, detail="Collection not found")
    
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
    
    # Apply text search
    if q:
        search_filter = or_(
            ImageMetadata.title.ilike(f"%{q}%"),
            ImageMetadata.abstract.ilike(f"%{q}%"),
            ImageMetadata.keywords.any(q)
        )
        query = query.filter(search_filter)
    
    # Get total count
    total_matched = query.count()
    
    # Apply pagination
    records = query.offset(offset).limit(limit).all()
    
    # Convert to OGC records
    ogc_records = [iso_to_ogc_record(record, collection_id, request) for record in records]
    
    # Build pagination links
    base_url = str(request.url).split('?')[0]
    links = [
        OGCLink(href=str(request.url), rel="self", type="application/geo+json")
    ]
    
    # Add next/prev links
    if offset + limit < total_matched:
        next_params = f"?limit={limit}&offset={offset + limit}"
        if bbox:
            next_params += f"&bbox={bbox}"
        if datetime:
            next_params += f"&datetime={datetime}"
        if q:
            next_params += f"&q={q}"
        links.append(OGCLink(href=f"{base_url}{next_params}", rel="next", type="application/geo+json"))
    
    if offset > 0:
        prev_offset = max(0, offset - limit)
        prev_params = f"?limit={limit}&offset={prev_offset}"
        if bbox:
            prev_params += f"&bbox={bbox}"
        if datetime:
            prev_params += f"&datetime={datetime}"
        if q:
            prev_params += f"&q={q}"
        links.append(OGCLink(href=f"{base_url}{prev_params}", rel="prev", type="application/geo+json"))
    
    return OGCRecords(
        features=ogc_records,
        links=links,
        timeStamp=datetime.now(timezone.utc).isoformat(),
        numberMatched=total_matched,
        numberReturned=len(ogc_records)
    )

@router.get("/collections/{collection_id}/items/{record_id}", response_model=OGCRecord)
async def get_ogc_record(
    collection_id: str,
    record_id: str,
    request: Request,
    db: Session = Depends(get_db)
):
    """Get specific OGC record"""
    # Find the record
    record = db.query(ImageMetadata).filter(ImageMetadata.filename == record_id).first()
    
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    
    # Verify collection membership
    if collection_id == "general":
        if record.hazard_type and record.hazard_type.strip():
            raise HTTPException(status_code=404, detail="Record not found in this collection")
    elif collection_id.startswith("hazard-"):
        expected_hazard = collection_id.replace("hazard-", "").replace("-", " ")
        if not record.hazard_type or record.hazard_type.lower() != expected_hazard.lower():
            raise HTTPException(status_code=404, detail="Record not found in this collection")
    else:
        raise HTTPException(status_code=404, detail="Collection not found")
    
    return iso_to_ogc_record(record, collection_id, request)

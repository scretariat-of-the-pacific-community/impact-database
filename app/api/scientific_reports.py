"""Scientific Reports API Endpoints"""

import logging
from datetime import date
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models.database import get_db, ImageMetadata, VideoMetadata
from models.rbac import User as DBUser
from models.scientific_reports import ImpactReport, ImpactReportCitation, ImpactAssessment
from api.auth_rbac import get_current_user_optional, get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/scientific-reports", tags=["scientific-reports"])


# Request/Response Models
class ImpactMetricsRequest(BaseModel):
    people_affected: Optional[int] = None
    people_injured: Optional[int] = None
    people_missing: Optional[int] = None
    people_displaced: Optional[int] = None
    fatalities: Optional[int] = None
    buildings_damaged: Optional[int] = None
    buildings_destroyed: Optional[int] = None
    critical_infrastructure_affected: Optional[List[str]] = None
    economic_loss_usd: Optional[int] = None
    insured_loss_usd: Optional[int] = None
    area_affected_km2: Optional[float] = None
    ecosystems_affected: Optional[List[str]] = None
    species_threatened: Optional[List[str]] = None
    recovery_time_months: Optional[int] = None
    recovery_cost_usd: Optional[int] = None


class CitizenDataLinkRequest(BaseModel):
    content_id: str
    content_type: str  # image or video
    citation_type: str  # evidence, validation, context, impact
    relevance_score: float = 0.5
    notes: Optional[str] = None


class ScientificReportRequest(BaseModel):
    title: str
    description: str
    report_type: str  # scientific, assessment, policy, research
    date_published: date
    author_organization: Optional[str] = None
    author_contact: Optional[str] = None
    confidence_level: str = "medium"
    peer_reviewed: bool = False
    geometry: Optional[dict] = None  # GeoJSON Polygon
    date_start: Optional[date] = None
    date_end: Optional[date] = None
    metrics: Optional[ImpactMetricsRequest] = None
    linked_uploads: Optional[List[CitizenDataLinkRequest]] = None


class ScientificReportResponse(BaseModel):
    id: str
    title: str
    description: str
    report_type: str
    date_published: str
    author_organization: Optional[str]
    peer_reviewed: bool
    confidence_level: str
    is_published: bool
    linked_data_count: int


# Endpoints

@router.post("/reports", response_model=dict)
async def create_scientific_report(
    request: ScientificReportRequest,
    current_user: DBUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Submit a new scientific report with linked citizen data"""
    try:
        # Create report
        report = ImpactReport(
            title=request.title,
            description=request.description,
            report_type=request.report_type,
            date_published=request.date_published,
            author_organization=request.author_organization,
            author_contact=request.author_contact,
            confidence_level=request.confidence_level,
            peer_reviewed=request.peer_reviewed,
            geometry=None,  # TODO: Parse GeoJSON geometry
            date_start=request.date_start,
            date_end=request.date_end,
            created_by=current_user.id
        )
        db.add(report)
        db.flush()
        
        # Create impact metrics if provided
        if request.metrics:
            metrics = ImpactAssessment(
                impact_report_id=report.id,
                **request.metrics.dict(exclude_none=True)
            )
            db.add(metrics)
        
        # Link citizen data
        if request.linked_uploads:
            for link in request.linked_uploads:
                citation = ImpactReportCitation(
                    impact_report_id=report.id,
                    content_id=link.content_id,
                    content_type=link.content_type,
                    citation_type=link.citation_type,
                    relevance_score=link.relevance_score,
                    notes=link.notes
                )
                db.add(citation)
        
        db.commit()
        
        logger.info(f"Scientific report created by {current_user.username}: {report.id}")
        
        return {
            "success": True,
            "report_id": str(report.id),
            "message": "Scientific report submitted successfully"
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating scientific report: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/reports/{report_id}")
async def get_scientific_report(
    report_id: str,
    db: Session = Depends(get_db)
):
    """Get scientific report details with linked citizen data"""
    try:
        report = db.query(ImpactReport).filter(ImpactReport.id == report_id).first()
        
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        
        # Get linked citizen data
        citations = db.query(ImpactReportCitation).filter(
            ImpactReportCitation.impact_report_id == report_id
        ).all()
        
        # Get impact metrics
        metrics = db.query(ImpactAssessment).filter(
            ImpactAssessment.impact_report_id == report_id
        ).first()
        
        return {
            **report.to_dict(),
            "linked_citizen_data": [c.to_dict() for c in citations],
            "impact_metrics": metrics.to_dict() if metrics else None,
            "linked_data_count": len(citations)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching report: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/reports")
async def list_scientific_reports(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    report_type: Optional[str] = None,
    author_org: Optional[str] = None,
    peer_reviewed: Optional[bool] = None,
    db: Session = Depends(get_db)
):
    """List published scientific reports with optional filtering"""
    try:
        query = db.query(ImpactReport).filter(ImpactReport.is_published == True)
        
        if report_type:
            query = query.filter(ImpactReport.report_type == report_type)
        
        if author_org:
            query = query.filter(ImpactReport.author_organization.ilike(f"%{author_org}%"))
        
        if peer_reviewed is not None:
            query = query.filter(ImpactReport.peer_reviewed == peer_reviewed)
        
        total = query.count()
        reports = query.order_by(ImpactReport.date_published.desc()).offset(skip).limit(limit).all()
        
        return {
            "total": total,
            "skip": skip,
            "limit": limit,
            "reports": [
                {
                    **r.to_dict(),
                    "linked_data_count": db.query(ImpactReportCitation).filter(
                        ImpactReportCitation.impact_report_id == r.id
                    ).count()
                }
                for r in reports
            ]
        }
        
    except Exception as e:
        logger.error(f"Error listing reports: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/reports/{report_id}")
async def update_scientific_report(
    report_id: str,
    request: ScientificReportRequest,
    current_user: DBUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a scientific report (only by author or admin)"""
    try:
        report = db.query(ImpactReport).filter(ImpactReport.id == report_id).first()
        
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        
        # Check permissions
        if str(report.created_by) != current_user.id and not current_user.has_role("admin"):
            raise HTTPException(status_code=403, detail="Only author or admin can update report")
        
        # Update fields
        report.title = request.title
        report.description = request.description
        report.report_type = request.report_type
        report.date_published = request.date_published
        report.author_organization = request.author_organization
        report.author_contact = request.author_contact
        report.confidence_level = request.confidence_level
        report.peer_reviewed = request.peer_reviewed
        report.date_start = request.date_start
        report.date_end = request.date_end
        
        # Update metrics if provided
        if request.metrics:
            existing_metrics = db.query(ImpactAssessment).filter(
                ImpactAssessment.impact_report_id == report_id
            ).first()
            
            if existing_metrics:
                for key, value in request.metrics.dict(exclude_none=True).items():
                    setattr(existing_metrics, key, value)
            else:
                metrics = ImpactAssessment(
                    impact_report_id=report.id,
                    **request.metrics.dict(exclude_none=True)
                )
                db.add(metrics)
        
        db.commit()
        
        logger.info(f"Report {report_id} updated by {current_user.username}")
        
        return {"success": True, "message": "Report updated successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating report: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/reports/{report_id}")
async def delete_scientific_report(
    report_id: str,
    current_user: DBUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a scientific report (only by author or admin)"""
    try:
        report = db.query(ImpactReport).filter(ImpactReport.id == report_id).first()
        
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        
        # Check permissions
        if str(report.created_by) != current_user.id and not current_user.has_role("admin"):
            raise HTTPException(status_code=403, detail="Only author or admin can delete report")
        
        db.delete(report)
        db.commit()
        
        logger.info(f"Report {report_id} deleted by {current_user.username}")
        
        return {"success": True, "message": "Report deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting report: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reports/{report_id}/link-citizen-data")
async def link_citizen_data(
    report_id: str,
    links: List[CitizenDataLinkRequest],
    current_user: DBUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add citizen data links to an existing report"""
    try:
        report = db.query(ImpactReport).filter(ImpactReport.id == report_id).first()
        
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        
        # Check permissions
        if str(report.created_by) != current_user.id and not current_user.has_role("admin"):
            raise HTTPException(status_code=403, detail="Only author or admin can link data")
        
        added_count = 0
        for link in links:
            # Check if citation already exists
            existing = db.query(ImpactReportCitation).filter(
                ImpactReportCitation.impact_report_id == report_id,
                ImpactReportCitation.content_id == link.content_id
            ).first()
            
            if not existing:
                citation = ImpactReportCitation(
                    impact_report_id=report_id,
                    content_id=link.content_id,
                    content_type=link.content_type,
                    citation_type=link.citation_type,
                    relevance_score=link.relevance_score,
                    notes=link.notes
                )
                db.add(citation)
                added_count += 1
        
        db.commit()
        
        logger.info(f"Added {added_count} citizen data links to report {report_id}")
        
        return {
            "success": True,
            "added_count": added_count,
            "message": f"Added {added_count} citizen data link(s)"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error linking citizen data: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/citizen-uploads/linked")
async def get_linked_citizen_uploads(
    report_id: Optional[str] = None,
    hazard_type: Optional[str] = None,
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db)
):
    """Get citizen uploads that are linked to impact reports"""
    try:
        query = db.query(ImpactReportCitation)
        
        if report_id:
            query = query.filter(ImpactReportCitation.impact_report_id == report_id)
        
        citations = query.limit(limit).all()
        
        # Fetch the actual content
        results = []
        for citation in citations:
            if citation.content_type == 'image':
                content = db.query(ImageMetadata).filter(
                    ImageMetadata.id == citation.content_id
                ).first()
            else:
                content = db.query(VideoMetadata).filter(
                    VideoMetadata.id == citation.content_id
                ).first()
            
            if content and (not hazard_type or content.hazard_type == hazard_type):
                results.append({
                    "id": str(content.id),
                    "title": getattr(content, 'title', None),
                    "filename": content.filename,
                    "hazard_type": getattr(content, 'hazard_type', None),
                    "location": getattr(content, 'location', None),
                    "citation_type": citation.citation_type,
                    "relevance_score": citation.relevance_score,
                    "report_id": str(citation.impact_report_id),
                    "content_type": citation.content_type
                })
        
        return {
            "total": len(results),
            "uploads": results
        }
        
    except Exception as e:
        logger.error(f"Error fetching linked uploads: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/citations/{content_id}")
async def get_citations_for_content(
    content_id: str,
    db: Session = Depends(get_db)
):
    """Get all scientific reports that cite a specific citizen upload"""
    try:
        citations = db.query(ImpactReportCitation).filter(
            ImpactReportCitation.content_id == content_id
        ).all()
        
        reports = []
        for citation in citations:
            report = db.query(ImpactReport).filter(
                ImpactReport.id == citation.impact_report_id,
                ImpactReport.is_published == True
            ).first()
            
            if report:
                reports.append({
                    **report.to_dict(),
                    "citation_type": citation.citation_type,
                    "relevance_score": citation.relevance_score,
                    "notes": citation.notes
                })
        
        return {
            "content_id": content_id,
            "citation_count": len(reports),
            "reports": reports
        }
        
    except Exception as e:
        logger.error(f"Error fetching citations: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reports/{report_id}/publish")
async def publish_report(
    report_id: str,
    current_user: DBUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Publish a scientific report (admin only)"""
    try:
        # Check permission
        if not current_user.has_role("admin") and not current_user.has_role("curator"):
            raise HTTPException(status_code=403, detail="Only admins/curators can publish reports")
        
        report = db.query(ImpactReport).filter(ImpactReport.id == report_id).first()
        
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        
        report.is_published = True
        db.commit()
        
        logger.info(f"Report {report_id} published by {current_user.username}")
        
        return {"success": True, "message": "Report published successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error publishing report: {e}")
        raise HTTPException(status_code=500, detail=str(e))

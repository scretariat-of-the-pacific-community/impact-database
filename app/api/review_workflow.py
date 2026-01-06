"""
Review Workflow API - Phase 1
Handles assignment, audit trail, and status management for review items
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, validator
from datetime import datetime, timezone
import uuid
import logging

from models.database import get_db
from api.auth_rbac import get_current_user, require_permission, EnhancedUser
from models.review_workflow import (
    ReviewItem,
    ReviewAssignment,
    ReviewAuditTrail,
    ReviewStatus,
    ReviewPriority,
    AssignmentReason,
    AuditAction,
)
from models.rbac import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/review-items", tags=["review-workflow"])

# ===========================
# Pydantic Schemas
# ===========================


class ReviewItemCreate(BaseModel):
    """Schema for creating a new review item"""

    image_id: uuid.UUID
    priority: ReviewPriority = ReviewPriority.MEDIUM
    notes: Optional[str] = None

    class Config:
        use_enum_values = True


class ReviewItemUpdate(BaseModel):
    """Schema for updating review item fields"""

    priority: Optional[ReviewPriority] = None
    notes: Optional[str] = None

    class Config:
        use_enum_values = True


class StatusUpdate(BaseModel):
    """Schema for changing review status"""

    status: ReviewStatus
    notes: Optional[str] = None

    class Config:
        use_enum_values = True

    @validator("status")
    def validate_status_transition(cls, v):
        allowed = [
            ReviewStatus.APPROVED,
            ReviewStatus.REJECTED,
            ReviewStatus.NEEDS_CHANGES,
            ReviewStatus.UNDER_REVIEW,
        ]
        if v not in allowed:
            raise ValueError(f"Status must be one of: {[s.value for s in allowed]}")
        return v


class AssignmentCreate(BaseModel):
    """Schema for assigning a review"""

    assigned_to_id: uuid.UUID  # Changed from int to UUID to match User model
    reason: Optional[AssignmentReason] = AssignmentReason.MANUAL
    notes: Optional[str] = None

    class Config:
        use_enum_values = True


class FlagRequest(BaseModel):
    """Schema for flagging a review item"""

    flagged_reason: str = Field(..., min_length=5, max_length=500)


class ReviewItemResponse(BaseModel):
    """Schema for review item response"""

    id: uuid.UUID
    image_id: uuid.UUID
    status: str
    priority: str
    assigned_to_id: Optional[int] = None
    assigned_by_id: Optional[int] = None
    assigned_at: Optional[datetime] = None
    assignment_reason: Optional[str] = None
    is_flagged: bool
    flagged_at: Optional[datetime] = None
    flagged_by_id: Optional[int] = None
    flag_reason: Optional[str] = None  # Changed from flagged_reason to match model
    reviewer_notes: Optional[str] = None  # Changed from notes to match model
    duplicate_of_id: Optional[uuid.UUID] = None
    submitted_at: datetime  # Changed from created_at to match model
    last_modified: datetime

    class Config:
        from_attributes = True


class AuditTrailResponse(BaseModel):
    """Schema for audit trail entry"""

    id: int
    review_item_id: uuid.UUID
    action: str
    actor_id: Optional[uuid.UUID] = None  # Changed from int to UUID to match model
    actor_username: Optional[str] = None
    change_summary: Optional[Dict[str, Any]] = None  # Changed from changes to match model
    notes: Optional[str] = None
    timestamp: datetime  # Changed from created_at to match model
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None

    class Config:
        from_attributes = True


class AssignmentHistoryResponse(BaseModel):
    """Schema for assignment history entry"""

    id: int
    review_item_id: uuid.UUID
    assigned_to_id: int
    assigned_to_username: Optional[str]
    assigned_by_id: int
    assigned_by_username: Optional[str]
    assigned_at: datetime
    unassigned_at: Optional[datetime]
    reason: str
    notes: Optional[str]

    class Config:
        from_attributes = True


# ===========================
# Helper Functions
# ===========================


def get_review_item_or_404(db: Session, item_id: uuid.UUID) -> ReviewItem:
    """Get review item or raise 404"""
    item = db.query(ReviewItem).filter(ReviewItem.id == item_id).first()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Review item {item_id} not found"
        )
    return item


def log_audit_action(
    db: Session,
    review_item_id: uuid.UUID,
    action: AuditAction,
    actor_id: Optional[int],
    changes: Optional[Dict[str, Any]] = None,
    notes: Optional[str] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
):
    """Helper to log audit trail entries"""
    try:
        audit_entry = ReviewAuditTrail(
            review_item_id=review_item_id,
            action=action,
            actor_id=actor_id,
            change_summary=changes,  # Changed from changes to change_summary to match model
            notes=notes,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        db.add(audit_entry)
        db.flush()
        logger.info(f"Audit logged: {action.value} on {review_item_id} by user {actor_id}")
    except Exception as e:
        logger.error(f"Failed to log audit: {e}")
        # Don't fail the main operation if audit logging fails


# ===========================
# API Endpoints
# ===========================


@router.post("", response_model=ReviewItemResponse, status_code=status.HTTP_201_CREATED)
def create_review_item(
    data: ReviewItemCreate,
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(require_permission("review:write")),
):
    """
    Create a new review item from an image
    Requires: review:write permission
    """
    # Check if review item already exists for this image
    existing = db.query(ReviewItem).filter(ReviewItem.image_id == data.image_id).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Review item already exists for image {data.image_id}",
        )

    # Create review item
    review_item = ReviewItem(
        image_id=data.image_id,
        status=ReviewStatus.PENDING,
        priority=data.priority,
        submitted_by=current_user.id,
    )
    db.add(review_item)
    db.flush()

    # Log audit trail
    log_audit_action(
        db=db,
        review_item_id=review_item.id,
        action=AuditAction.CREATED,
        actor_id=current_user.id,
        changes={"priority": data.priority},
        notes=data.notes,
    )

    db.commit()
    db.refresh(review_item)

    logger.info(f"Created review item {review_item.id} for image {data.image_id}")
    return review_item


@router.get("", response_model=List[ReviewItemResponse])
def list_review_items(
    status_filter: Optional[ReviewStatus] = Query(None, description="Filter by status"),
    priority_filter: Optional[ReviewPriority] = Query(None, description="Filter by priority"),
    assigned_to_me: bool = Query(False, description="Show only items assigned to current user"),
    is_flagged: Optional[bool] = Query(None, description="Filter by flagged status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(require_permission("review:read")),
):
    """
    List review items with optional filters
    Requires: review:read permission
    """
    query = db.query(ReviewItem)

    # Apply filters
    if status_filter:
        query = query.filter(ReviewItem.status == status_filter)

    if priority_filter:
        query = query.filter(ReviewItem.priority == priority_filter)

    if assigned_to_me:
        query = query.filter(ReviewItem.assigned_to == current_user.id)

    if is_flagged is not None:
        query = query.filter(ReviewItem.is_flagged == is_flagged)

    # Order by priority (high first) then by submitted_at
    query = query.order_by(ReviewItem.priority.desc(), ReviewItem.submitted_at.desc())

    # Pagination
    items = query.offset(skip).limit(limit).all()

    logger.info(
        f"Listed {len(items)} review items (filters: status={status_filter}, priority={priority_filter}, assigned_to_me={assigned_to_me})"
    )
    return items


@router.get("/my-assignments", response_model=List[ReviewItemResponse])
def get_my_assignments(
    db: Session = Depends(get_db), current_user: EnhancedUser = Depends(get_current_user)
):
    """
    Get review items assigned to the current user
    No special permission required (users can see their own assignments)
    """
    items = (
        db.query(ReviewItem)
        .filter(
            and_(
                ReviewItem.assigned_to == current_user.id,
                ReviewItem.status.in_([ReviewStatus.PENDING, ReviewStatus.UNDER_REVIEW]),
            )
        )
        .order_by(ReviewItem.priority.desc(), ReviewItem.assigned_at)
        .all()
    )

    logger.info(f"User {current_user.id} retrieved {len(items)} assigned items")
    return items


@router.get("/health", status_code=status.HTTP_200_OK)
def health_check(db: Session = Depends(get_db)):
    """Health check endpoint for review workflow"""
    try:
        total_items = db.query(func.count(ReviewItem.id)).scalar()
        pending_items = (
            db.query(func.count(ReviewItem.id))
            .filter(ReviewItem.status == ReviewStatus.PENDING)
            .scalar()
        )
        flagged_items = (
            db.query(func.count(ReviewItem.id)).filter(ReviewItem.is_flagged == True).scalar()
        )

        return {
            "status": "healthy",
            "total_items": total_items,
            "pending_items": pending_items,
            "flagged_items": flagged_items,
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Review workflow service unhealthy",
        )


@router.get("/{item_id}", response_model=ReviewItemResponse)
def get_review_item(
    item_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(require_permission("review:read")),
):
    """
    Get a specific review item by ID
    Requires: review:read permission
    """
    item = get_review_item_or_404(db, item_id)
    return item


@router.patch("/{item_id}", response_model=ReviewItemResponse)
def update_review_item(
    item_id: uuid.UUID,
    data: ReviewItemUpdate,
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(require_permission("review:write")),
):
    """
    Update review item fields (priority, notes)
    Requires: review:write permission
    """
    item = get_review_item_or_404(db, item_id)

    changes = {}
    if data.priority is not None and data.priority != item.priority:
        old_priority = item.priority if isinstance(item.priority, str) else item.priority.value
        item.priority = data.priority
        changes["priority"] = {"old": old_priority, "new": data.priority}

    if data.notes is not None:
        old_notes = item.reviewer_notes
        item.reviewer_notes = data.notes
        changes["notes"] = {"old": old_notes, "new": data.notes}

    if changes:
        log_audit_action(
            db=db,
            review_item_id=item.id,
            action=AuditAction.UPDATED,
            actor_id=current_user.id,
            changes=changes,
        )
        db.commit()
        db.refresh(item)
        logger.info(f"Updated review item {item_id} with changes: {changes}")

    return item


@router.patch("/{item_id}/status", response_model=ReviewItemResponse)
def change_status(
    item_id: uuid.UUID,
    data: StatusUpdate,
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(require_permission("review:write")),
):
    """
    Change the status of a review item (approve, reject, needs changes, in review)
    Requires: review:write permission
    """
    item = get_review_item_or_404(db, item_id)

    old_status = item.status if isinstance(item.status, str) else item.status.value
    item.status = data.status

    # Log audit trail
    log_audit_action(
        db=db,
        review_item_id=item.id,
        action=AuditAction.STATUS_CHANGED,
        actor_id=current_user.id,
        changes={"status": {"old": old_status, "new": data.status}},
        notes=data.notes,
    )

    db.commit()
    db.refresh(item)

    logger.info(f"Changed status of {item_id} from {old_status} to {data.status}")
    return item


@router.post("/{item_id}/assign", response_model=ReviewItemResponse)
def assign_review(
    item_id: uuid.UUID,
    data: AssignmentCreate,
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(require_permission("review:assign")),
):
    """
    Assign a review item to a user
    Requires: review:assign permission
    """
    item = get_review_item_or_404(db, item_id)

    # Verify assignee exists
    assignee = db.query(User).filter(User.id == data.assigned_to_id).first()
    if not assignee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"User {data.assigned_to_id} not found"
        )

    # Check if already assigned to someone
    if item.assigned_to:
        # Close previous assignment
        prev_assignment = (
            db.query(ReviewAssignment)
            .filter(
                and_(
                    ReviewAssignment.review_item_id == item.id,
                    ReviewAssignment.unassigned_at.is_(None),
                )
            )
            .first()
        )
        if prev_assignment:
            prev_assignment.unassigned_at = datetime.now(timezone.utc)

    # Create new assignment record
    assignment = ReviewAssignment(
        review_item_id=item.id,
        assigned_to=data.assigned_to_id,  # Changed from assigned_to_id to assigned_to
        assigned_by=current_user.id,  # Changed from assigned_by_id to assigned_by
        reason=data.reason,
        notes=data.notes,
    )
    db.add(assignment)

    # Update review item
    item.assigned_to = data.assigned_to_id
    item.assigned_by = current_user.id
    item.assigned_at = datetime.now(timezone.utc)  # Changed from utcnow() to now(timezone.utc)
    item.assignment_reason = data.reason

    # Log audit trail
    log_audit_action(
        db=db,
        review_item_id=item.id,
        action=AuditAction.ASSIGNED,
        actor_id=current_user.id,
        changes={
            "assigned_to": {
                "user_id": data.assigned_to_id,
                "username": assignee.username,
                "reason": data.reason,
            }
        },
        notes=data.notes,
    )

    db.commit()
    db.refresh(item)

    logger.info(f"Assigned review item {item_id} to user {data.assigned_to_id}")
    return item


@router.post("/{item_id}/unassign", response_model=ReviewItemResponse)
def unassign_review(
    item_id: uuid.UUID,
    notes: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(require_permission("review:assign")),
):
    """
    Unassign a review item
    Requires: review:assign permission
    """
    item = get_review_item_or_404(db, item_id)

    if not item.assigned_to:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Review item is not assigned"
        )

    old_assignee_id = item.assigned_to

    # Close current assignment
    current_assignment = (
        db.query(ReviewAssignment)
        .filter(
            and_(
                ReviewAssignment.review_item_id == item.id, ReviewAssignment.unassigned_at.is_(None)
            )
        )
        .first()
    )
    if current_assignment:
        current_assignment.unassigned_at = datetime.utcnow()
        if notes:
            current_assignment.notes = (current_assignment.notes or "") + f"\nUnassigned: {notes}"

    # Update review item
    item.assigned_to = None
    item.assigned_by = None
    item.assigned_at = None
    item.assignment_reason = None

    # Log audit trail
    log_audit_action(
        db=db,
        review_item_id=item.id,
        action=AuditAction.UNASSIGNED,
        actor_id=current_user.id,
        changes={"unassigned_from": old_assignee_id},
        notes=notes,
    )

    db.commit()
    db.refresh(item)

    logger.info(f"Unassigned review item {item_id} from user {old_assignee_id}")
    return item


@router.post("/{item_id}/flag", response_model=ReviewItemResponse)
def flag_review_item(
    item_id: uuid.UUID,
    data: FlagRequest,
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(require_permission("review:write")),
):
    """
    Flag a review item for attention
    Requires: review:write permission
    """
    item = get_review_item_or_404(db, item_id)

    if item.is_flagged:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Review item is already flagged"
        )

    item.is_flagged = True
    item.flagged_at = datetime.utcnow()
    item.flagged_by = current_user.id
    item.flagged_reason = data.flagged_reason

    # Log audit trail
    log_audit_action(
        db=db,
        review_item_id=item.id,
        action=AuditAction.FLAGGED,
        actor_id=current_user.id,
        changes={"flagged": True, "reason": data.flagged_reason},
    )

    db.commit()
    db.refresh(item)

    logger.info(f"Flagged review item {item_id}: {data.flagged_reason}")
    return item


@router.delete("/{item_id}/flag", response_model=ReviewItemResponse)
def unflag_review_item(
    item_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(require_permission("review:write")),
):
    """
    Remove flag from a review item
    Requires: review:write permission
    """
    item = get_review_item_or_404(db, item_id)

    if not item.is_flagged:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Review item is not flagged"
        )

    item.is_flagged = False
    old_reason = item.flag_reason
    item.flagged_at = None
    item.flagged_by = None
    item.flag_reason = None

    # Log audit trail
    log_audit_action(
        db=db,
        review_item_id=item.id,
        action=AuditAction.UNFLAGGED,
        actor_id=current_user.id,
        changes={"flagged": False, "old_reason": old_reason},
    )

    db.commit()
    db.refresh(item)

    logger.info(f"Unflagged review item {item_id}")
    return item


@router.get("/{item_id}/audit-trail", response_model=List[AuditTrailResponse])
def get_audit_trail(
    item_id: uuid.UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(require_permission("audit:read")),
):
    """
    Get audit trail for a review item
    Requires: audit:read permission
    """
    # Verify review item exists
    get_review_item_or_404(db, item_id)

    # Get audit entries with actor usernames
    audit_entries = (
        db.query(ReviewAuditTrail, User.username.label("actor_username"))
        .outerjoin(User, ReviewAuditTrail.actor_id == User.id)
        .filter(ReviewAuditTrail.review_item_id == item_id)
        .order_by(ReviewAuditTrail.timestamp.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    # Format response
    result = []
    for entry, username in audit_entries:
        entry_dict = entry.to_dict()
        entry_dict["actor_username"] = username
        result.append(AuditTrailResponse(**entry_dict))

    logger.info(f"Retrieved {len(result)} audit entries for review item {item_id}")
    return result


@router.get("/{item_id}/assignments", response_model=List[AssignmentHistoryResponse])
def get_assignment_history(
    item_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(require_permission("review:read")),
):
    """
    Get assignment history for a review item
    Requires: review:read permission
    """
    # Verify review item exists
    get_review_item_or_404(db, item_id)

    # Get assignments with usernames
    assignments = (
        db.query(ReviewAssignment, User.username.label("assigned_to_username"))
        .join(User, ReviewAssignment.assigned_to == User.id)
        .filter(ReviewAssignment.review_item_id == item_id)
        .order_by(ReviewAssignment.assigned_at.desc())
        .all()
    )

    # Get assigned_by usernames
    result = []
    for assignment, assigned_to_username in assignments:
        assigned_by_user = db.query(User).filter(User.id == assignment.assigned_by_id).first()

        assignment_dict = assignment.to_dict()
        assignment_dict["assigned_to_username"] = assigned_to_username
        assignment_dict["assigned_by_username"] = (
            assigned_by_user.username if assigned_by_user else None
        )
        result.append(AssignmentHistoryResponse(**assignment_dict))

    logger.info(f"Retrieved {len(result)} assignment records for review item {item_id}")
    return result

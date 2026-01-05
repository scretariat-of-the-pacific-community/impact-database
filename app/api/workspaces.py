"""Workspace collaboration API endpoints (Phase 1)."""

from typing import List, Optional, Dict
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func

from api.auth_rbac import EnhancedUser, get_current_user_enhanced
from models.database import get_db
from models.rbac import User as DBUser
from models.workspace import Workspace, WorkspaceMember, WorkspaceChannel

router = APIRouter()

class WorkspaceCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    description: Optional[str] = Field(default=None, max_length=500)
    settings: Dict = Field(default_factory=dict)
    channels: List[str] = Field(default_factory=list, description="Optional initial channels")


class WorkspaceUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=150)
    description: Optional[str] = Field(default=None, max_length=500)
    settings: Optional[Dict] = None


class WorkspaceMemberCreate(BaseModel):
    user_id: str = Field(..., min_length=1)
    role: str = Field(default="viewer", pattern="^(admin|editor|viewer)$")


class WorkspaceSummary(BaseModel):
    id: UUID
    name: str
    description: Optional[str]
    member_count: int
    channel_count: int
    role: str

    class Config:
        orm_mode = True


class WorkspacePermissions(BaseModel):
    role: str
    can_manage_settings: bool
    can_invite: bool
    can_remove_members: bool


def _get_workspace_or_404(db: Session, workspace_id: UUID) -> Workspace:
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    return workspace


def _get_membership(db: Session, workspace_id: UUID, username: str) -> Optional[WorkspaceMember]:
    return (
        db.query(WorkspaceMember)
        .filter(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == username)
        .first()
    )


def _resolve_role(workspace: Workspace, membership: Optional[WorkspaceMember], username: str) -> Optional[str]:
    if membership:
        return membership.role
    if workspace.owner_id and workspace.owner_id == username:
        return "admin"
    return None


def _build_counts(db: Session):
    member_counts = dict(
        db.query(WorkspaceMember.workspace_id, func.count(WorkspaceMember.id))
        .group_by(WorkspaceMember.workspace_id)
        .all()
    )
    channel_counts = dict(
        db.query(WorkspaceChannel.workspace_id, func.count(WorkspaceChannel.id))
        .group_by(WorkspaceChannel.workspace_id)
        .all()
    )
    return member_counts, channel_counts


def _build_summary(
    workspace: Workspace,
    role: str,
    member_counts: dict,
    channel_counts: dict,
) -> WorkspaceSummary:
    return WorkspaceSummary(
        id=workspace.id,
        name=workspace.name,
        description=workspace.description,
        member_count=member_counts.get(workspace.id, 0),
        channel_count=channel_counts.get(workspace.id, 0),
        role=role,
    )


@router.post("/workspaces", response_model=WorkspaceSummary, status_code=status.HTTP_201_CREATED)
def create_workspace(
    payload: WorkspaceCreate,
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced),
):
    workspace = Workspace(
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description else None,
        owner_id=current_user.username,
        settings=payload.settings or {},
    )
    db.add(workspace)
    db.flush()  # obtain workspace.id

    # Creator becomes admin member
    creator_membership = WorkspaceMember(
        workspace_id=workspace.id,
        user_id=current_user.username,
        role="admin",
        invited_by=current_user.username,
    )
    db.add(creator_membership)

    # Seed optional channels (deduplicated, with a default "general" if none provided)
    channel_names = payload.channels or ["general"]
    seen = set()
    for name in channel_names:
        cleaned = name.strip() or "general"
        if cleaned.lower() in seen:
            continue
        seen.add(cleaned.lower())
        db.add(WorkspaceChannel(workspace_id=workspace.id, name=cleaned))

    db.commit()
    db.refresh(workspace)

    member_counts, channel_counts = _build_counts(db)
    return _build_summary(workspace, "admin", member_counts, channel_counts)


@router.get("/workspaces", response_model=List[WorkspaceSummary])
def list_workspaces(
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced),
):
    member_counts, channel_counts = _build_counts(db)

    # Workspaces where the user is a member
    member_rows = (
        db.query(Workspace, WorkspaceMember.role)
        .join(WorkspaceMember, Workspace.id == WorkspaceMember.workspace_id)
        .filter(WorkspaceMember.user_id == current_user.username)
        .all()
    )

    workspaces_map = {str(w.id): (w, role) for w, role in member_rows}

    # Include workspaces the user owns even if not explicitly a member
    owned = db.query(Workspace).filter(Workspace.owner_id == current_user.username).all()
    for workspace in owned:
        key = str(workspace.id)
        if key not in workspaces_map:
            workspaces_map[key] = (workspace, "admin")

    summaries = [
        _build_summary(workspace, role, member_counts, channel_counts) for workspace, role in workspaces_map.values()
    ]
    return sorted(summaries, key=lambda item: item.name.lower())


@router.patch("/workspaces/{workspace_id}", response_model=WorkspaceSummary)
def update_workspace(
    workspace_id: UUID,
    payload: WorkspaceUpdate,
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced),
):
    workspace = _get_workspace_or_404(db, workspace_id)
    membership = _get_membership(db, workspace_id, current_user.username)
    role = _resolve_role(workspace, membership, current_user.username)
    if role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")

    if payload.name is not None:
        workspace.name = payload.name.strip()
    if payload.description is not None:
        workspace.description = payload.description.strip()
    if payload.settings is not None:
        workspace.settings = payload.settings

    db.commit()
    db.refresh(workspace)

    member_counts, channel_counts = _build_counts(db)
    return _build_summary(workspace, role, member_counts, channel_counts)


@router.post("/workspaces/{workspace_id}/members", status_code=status.HTTP_201_CREATED)
def invite_member(
    workspace_id: UUID,
    payload: WorkspaceMemberCreate,
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced),
):
    workspace = _get_workspace_or_404(db, workspace_id)
    membership = _get_membership(db, workspace_id, current_user.username)
    role = _resolve_role(workspace, membership, current_user.username)
    if role not in {"admin", "editor"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions to invite")

    # Validate invitee exists
    target_user = db.query(DBUser).filter(DBUser.username == payload.user_id).first()
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    existing = _get_membership(db, workspace_id, payload.user_id)
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User already a member")

    member = WorkspaceMember(
        workspace_id=workspace_id,
        user_id=payload.user_id,
        role=payload.role,
        invited_by=current_user.username,
    )
    db.add(member)
    db.commit()
    return {"workspace_id": str(workspace_id), "user_id": payload.user_id, "role": payload.role}


@router.delete("/workspaces/{workspace_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    workspace_id: UUID,
    user_id: str,
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced),
):
    workspace = _get_workspace_or_404(db, workspace_id)
    membership = _get_membership(db, workspace_id, current_user.username)
    role = _resolve_role(workspace, membership, current_user.username)
    if role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions to remove members")

    target = _get_membership(db, workspace_id, user_id)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    # Prevent removing the last admin
    if target.role == "admin":
        admin_count = (
            db.query(WorkspaceMember)
            .filter(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.role == "admin")
            .count()
        )
        if admin_count <= 1:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot remove the last admin")

    db.delete(target)
    db.commit()
    return {}


@router.get("/workspaces/{workspace_id}/permissions", response_model=WorkspacePermissions)
def get_permissions(
    workspace_id: UUID,
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced),
):
    workspace = _get_workspace_or_404(db, workspace_id)
    membership = _get_membership(db, workspace_id, current_user.username)
    role = _resolve_role(workspace, membership, current_user.username)
    if not role:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a workspace member")

    return WorkspacePermissions(
        role=role,
        can_manage_settings=role == "admin",
        can_invite=role in {"admin", "editor"},
        can_remove_members=role == "admin",
    )

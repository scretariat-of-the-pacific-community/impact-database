"""Shared Folders API endpoints for collaboration."""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from api.auth_rbac import EnhancedUser, get_current_user_enhanced
from models.database import get_db
from models.collaboration import SharedFolder, FolderWatch, FolderItem
from models.workspace import Workspace, WorkspaceMember

router = APIRouter()


class SharedFolderCreate(BaseModel):
    """Request model for creating a shared folder."""
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=1000)
    workspace_id: Optional[UUID] = None
    hazard_filter: Optional[str] = Field(default=None, max_length=50)
    region_filter: Optional[str] = Field(default=None, max_length=200)
    is_public: bool = False


class SharedFolderResponse(BaseModel):
    """Response model for shared folder with counts."""
    id: UUID
    name: str
    description: Optional[str]
    workspace_id: Optional[UUID]
    owner_id: str
    hazard_filter: Optional[str]
    region_filter: Optional[str]
    is_public: bool
    item_count: int
    watcher_count: int
    is_watching: bool
    created_at: str
    updated_at: str

    class Config:
        orm_mode = True


class FolderWatchResponse(BaseModel):
    """Response model for folder watch."""
    id: UUID
    folder_id: UUID
    user_id: str
    created_at: str

    class Config:
        orm_mode = True


def _check_folder_access(
    folder: SharedFolder,
    user: EnhancedUser,
    db: Session,
    require_owner: bool = False
) -> bool:
    """Check if user has access to folder."""
    # Owner always has access
    if folder.owner_id == user.username:
        return True
    
    # If require_owner, only owner can access
    if require_owner:
        return False
    
    # Public folders are accessible to all
    if folder.is_public:
        return True
    
    # Check workspace membership if folder is in a workspace
    if folder.workspace_id:
        member = db.query(WorkspaceMember).filter(
            WorkspaceMember.workspace_id == folder.workspace_id,
            WorkspaceMember.user_id == user.username
        ).first()
        return member is not None
    
    return False


@router.get("/shared-folders", response_model=List[SharedFolderResponse])
def list_shared_folders(
    workspace_id: Optional[UUID] = None,
    include_public: bool = True,
    user: EnhancedUser = Depends(get_current_user_enhanced),
    db: Session = Depends(get_db)
):
    """
    List shared folders accessible to the current user.
    
    - **workspace_id**: Optional filter by workspace
    - **include_public**: Include public folders (default: true)
    """
    query = db.query(SharedFolder)
    
    # Filter by workspace if provided
    if workspace_id:
        # Verify user has access to workspace
        member = db.query(WorkspaceMember).filter(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user.username
        ).first()
        
        if not member:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not a member of this workspace"
            )
        
        query = query.filter(SharedFolder.workspace_id == workspace_id)
    else:
        # Get folders user owns or has access to
        # Get user's workspace IDs
        workspace_ids = db.query(WorkspaceMember.workspace_id).filter(
            WorkspaceMember.user_id == user.username
        ).all()
        workspace_ids = [wid[0] for wid in workspace_ids]
        
        # Build filter: owned by user OR in user's workspaces OR public
        filters = [SharedFolder.owner_id == user.username]
        if workspace_ids:
            filters.append(SharedFolder.workspace_id.in_(workspace_ids))
        if include_public:
            filters.append(SharedFolder.is_public == True)
        
        from sqlalchemy import or_
        query = query.filter(or_(*filters))
    
    folders = query.order_by(SharedFolder.updated_at.desc()).all()
    
    # Build response with counts
    result = []
    for folder in folders:
        # Count items in folder
        item_count = db.query(func.count(FolderItem.id)).filter(
            FolderItem.folder_id == folder.id
        ).scalar() or 0
        
        # Count watchers
        watcher_count = db.query(func.count(FolderWatch.id)).filter(
            FolderWatch.folder_id == folder.id
        ).scalar() or 0
        
        # Check if current user is watching
        is_watching = db.query(FolderWatch).filter(
            FolderWatch.folder_id == folder.id,
            FolderWatch.user_id == user.username
        ).first() is not None
        
        result.append(SharedFolderResponse(
            id=folder.id,
            name=folder.name,
            description=folder.description,
            workspace_id=folder.workspace_id,
            owner_id=folder.owner_id,
            hazard_filter=folder.hazard_filter,
            region_filter=folder.region_filter,
            is_public=folder.is_public,
            item_count=item_count,
            watcher_count=watcher_count,
            is_watching=is_watching,
            created_at=folder.created_at.isoformat(),
            updated_at=folder.updated_at.isoformat()
        ))
    
    return result


@router.post("/shared-folders/{folder_id}/watch", response_model=FolderWatchResponse, status_code=status.HTTP_201_CREATED)
def watch_folder(
    folder_id: UUID,
    user: EnhancedUser = Depends(get_current_user_enhanced),
    db: Session = Depends(get_db)
):
    """
    Watch a shared folder to receive notifications about updates.
    
    - **folder_id**: UUID of the folder to watch
    """
    # Verify folder exists
    folder = db.query(SharedFolder).filter(SharedFolder.id == folder_id).first()
    if not folder:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Folder not found"
        )
    
    # Check access
    if not _check_folder_access(folder, user, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this folder"
        )
    
    # Check if already watching
    existing_watch = db.query(FolderWatch).filter(
        FolderWatch.folder_id == folder_id,
        FolderWatch.user_id == user.username
    ).first()
    
    if existing_watch:
        # Return existing watch
        return FolderWatchResponse(
            id=existing_watch.id,
            folder_id=existing_watch.folder_id,
            user_id=existing_watch.user_id,
            created_at=existing_watch.created_at.isoformat()
        )
    
    # Create new watch
    watch = FolderWatch(
        folder_id=folder_id,
        user_id=user.username
    )
    db.add(watch)
    db.commit()
    db.refresh(watch)
    
    return FolderWatchResponse(
        id=watch.id,
        folder_id=watch.folder_id,
        user_id=watch.user_id,
        created_at=watch.created_at.isoformat()
    )


@router.delete("/shared-folders/{folder_id}/watch", status_code=status.HTTP_204_NO_CONTENT)
def unwatch_folder(
    folder_id: UUID,
    user: EnhancedUser = Depends(get_current_user_enhanced),
    db: Session = Depends(get_db)
):
    """
    Unwatch a shared folder to stop receiving notifications.
    
    - **folder_id**: UUID of the folder to unwatch
    """
    # Find the watch
    watch = db.query(FolderWatch).filter(
        FolderWatch.folder_id == folder_id,
        FolderWatch.user_id == user.username
    ).first()
    
    if not watch:
        # Already not watching, return success
        return
    
    # Delete the watch
    db.delete(watch)
    db.commit()
    
    return


@router.post("/shared-folders", response_model=SharedFolderResponse, status_code=status.HTTP_201_CREATED)
def create_shared_folder(
    folder_data: SharedFolderCreate,
    user: EnhancedUser = Depends(get_current_user_enhanced),
    db: Session = Depends(get_db)
):
    """
    Create a new shared folder.
    
    - **name**: Folder name (required)
    - **description**: Optional description
    - **workspace_id**: Optional workspace to associate folder with
    - **hazard_filter**: Optional filter for hazard type
    - **region_filter**: Optional filter for region
    - **is_public**: Whether folder is publicly accessible
    """
    # If workspace_id provided, verify user is a member
    if folder_data.workspace_id:
        member = db.query(WorkspaceMember).filter(
            WorkspaceMember.workspace_id == folder_data.workspace_id,
            WorkspaceMember.user_id == user.username
        ).first()
        
        if not member:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not a member of this workspace"
            )
    
    # Create folder
    folder = SharedFolder(
        name=folder_data.name,
        description=folder_data.description,
        workspace_id=folder_data.workspace_id,
        owner_id=user.username,
        hazard_filter=folder_data.hazard_filter,
        region_filter=folder_data.region_filter,
        is_public=folder_data.is_public
    )
    
    db.add(folder)
    db.commit()
    db.refresh(folder)
    
    # Auto-watch folder for creator
    watch = FolderWatch(
        folder_id=folder.id,
        user_id=user.username
    )
    db.add(watch)
    db.commit()
    
    return SharedFolderResponse(
        id=folder.id,
        name=folder.name,
        description=folder.description,
        workspace_id=folder.workspace_id,
        owner_id=folder.owner_id,
        hazard_filter=folder.hazard_filter,
        region_filter=folder.region_filter,
        is_public=folder.is_public,
        item_count=0,
        watcher_count=1,
        is_watching=True,
        created_at=folder.created_at.isoformat(),
        updated_at=folder.updated_at.isoformat()
    )


@router.get("/shared-folders/{folder_id}", response_model=SharedFolderResponse)
def get_shared_folder(
    folder_id: UUID,
    user: EnhancedUser = Depends(get_current_user_enhanced),
    db: Session = Depends(get_db)
):
    """Get details of a specific shared folder."""
    folder = db.query(SharedFolder).filter(SharedFolder.id == folder_id).first()
    
    if not folder:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Folder not found"
        )
    
    # Check access
    if not _check_folder_access(folder, user, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this folder"
        )
    
    # Get counts
    item_count = db.query(func.count(FolderItem.id)).filter(
        FolderItem.folder_id == folder.id
    ).scalar() or 0
    
    watcher_count = db.query(func.count(FolderWatch.id)).filter(
        FolderWatch.folder_id == folder.id
    ).scalar() or 0
    
    is_watching = db.query(FolderWatch).filter(
        FolderWatch.folder_id == folder.id,
        FolderWatch.user_id == user.username
    ).first() is not None
    
    return SharedFolderResponse(
        id=folder.id,
        name=folder.name,
        description=folder.description,
        workspace_id=folder.workspace_id,
        owner_id=folder.owner_id,
        hazard_filter=folder.hazard_filter,
        region_filter=folder.region_filter,
        is_public=folder.is_public,
        item_count=item_count,
        watcher_count=watcher_count,
        is_watching=is_watching,
        created_at=folder.created_at.isoformat(),
        updated_at=folder.updated_at.isoformat()
    )


@router.delete("/shared-folders/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_shared_folder(
    folder_id: UUID,
    user: EnhancedUser = Depends(get_current_user_enhanced),
    db: Session = Depends(get_db)
):
    """
    Delete a shared folder. Only the owner can delete a folder.
    
    - **folder_id**: UUID of the folder to delete
    """
    # Verify folder exists
    folder = db.query(SharedFolder).filter(SharedFolder.id == folder_id).first()
    if not folder:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Folder not found"
        )
    
    # Check ownership - only owner can delete
    if not _check_folder_access(folder, user, db, require_owner=True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the folder owner can delete this folder"
        )
    
    # Delete associated watches first (cascade)
    db.query(FolderWatch).filter(FolderWatch.folder_id == folder_id).delete()
    
    # Delete associated folder items if any
    db.query(FolderItem).filter(FolderItem.folder_id == folder_id).delete()
    
    # Delete the folder
    db.delete(folder)
    db.commit()
    
    return None

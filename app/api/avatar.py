"""
Avatar upload endpoint for user profile pictures
Uploads avatars to MinIO with validation and processing
"""

from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from PIL import Image
import io
import hashlib
from datetime import datetime
import logging

from models.database import get_db
from models.user_data import UserProfile
from api.auth_rbac import EnhancedUser, get_current_user_enhanced
from services.minio_client import minio_service

logger = logging.getLogger(__name__)
router = APIRouter()

# Avatar constraints
MAX_AVATAR_SIZE = 5 * 1024 * 1024  # 5MB
ALLOWED_FORMATS = {'image/jpeg', 'image/png', 'image/webp'}
AVATAR_DIMENSIONS = (400, 400)  # Square avatars
AVATAR_BUCKET = 'impact-images'  # Reuse existing bucket
AVATAR_PREFIX = 'avatars/'


async def validate_and_process_avatar(file: UploadFile) -> tuple[bytes, str]:
    """
    Validate and process avatar image
    
    Returns:
        Tuple of (processed_image_bytes, content_type)
    """
    # Check file size
    contents = await file.read()
    if len(contents) > MAX_AVATAR_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Avatar file too large. Maximum size is {MAX_AVATAR_SIZE // (1024*1024)}MB"
        )
    
    # Check content type
    if file.content_type not in ALLOWED_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file format. Allowed formats: {', '.join(ALLOWED_FORMATS)}"
        )
    
    try:
        # Open and validate image
        image = Image.open(io.BytesIO(contents))
        
        # Convert to RGB (remove alpha channel if present)
        if image.mode in ('RGBA', 'LA', 'P'):
            background = Image.new('RGB', image.size, (255, 255, 255))
            if image.mode == 'P':
                image = image.convert('RGBA')
            background.paste(image, mask=image.split()[-1] if image.mode == 'RGBA' else None)
            image = background
        elif image.mode != 'RGB':
            image = image.convert('RGB')
        
        # Resize to square (crop to center if needed)
        width, height = image.size
        if width != height:
            # Crop to square from center
            size = min(width, height)
            left = (width - size) // 2
            top = (height - size) // 2
            image = image.crop((left, top, left + size, top + size))
        
        # Resize to target dimensions
        image = image.resize(AVATAR_DIMENSIONS, Image.Resampling.LANCZOS)
        
        # Save as optimized JPEG
        output = io.BytesIO()
        image.save(output, format='JPEG', quality=85, optimize=True)
        processed_bytes = output.getvalue()
        
        return processed_bytes, 'image/jpeg'
    
    except Exception as e:
        logger.error(f"Error processing avatar: {e}")
        raise HTTPException(
            status_code=400,
            detail="Invalid image file or unsupported format"
        )


@router.post("/user/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced)
):
    """
    Upload user avatar to MinIO
    
    - Validates file size (max 5MB)
    - Validates format (JPEG, PNG, WebP)
    - Processes to 400x400 square
    - Stores in MinIO with versioning
    - Updates user profile
    """
    try:
        # Validate and process avatar
        processed_bytes, content_type = await validate_and_process_avatar(file)
        
        # Generate unique filename
        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        file_hash = hashlib.md5(processed_bytes).hexdigest()[:8]
        object_name = f"{AVATAR_PREFIX}{current_user.username}_{timestamp}_{file_hash}.jpg"
        
        # Upload to MinIO
        try:
            minio_service.client.put_object(
                bucket_name=AVATAR_BUCKET,
                object_name=object_name,
                data=io.BytesIO(processed_bytes),
                length=len(processed_bytes),
                content_type=content_type
            )
            logger.info(f"Uploaded avatar for {current_user.username}: {object_name}")
        except Exception as e:
            logger.error(f"MinIO upload error: {e}")
            raise HTTPException(
                status_code=500,
                detail="Failed to upload avatar to storage"
            )
        
        # Generate public URL
        avatar_url = f"/api/files/{AVATAR_BUCKET}/{object_name}"
        
        # Update or create user profile
        profile = db.query(UserProfile).filter(
            UserProfile.user_id == current_user.username
        ).first()
        
        if not profile:
            profile = UserProfile(
                user_id=current_user.username,
                avatar_url=avatar_url
            )
            db.add(profile)
        else:
            # Delete old avatar if exists
            if profile.avatar_url and profile.avatar_url.startswith(f"/api/files/{AVATAR_BUCKET}/"):
                old_object = profile.avatar_url.split(f"{AVATAR_BUCKET}/", 1)[1]
                try:
                    minio_service.client.remove_object(AVATAR_BUCKET, old_object)
                    logger.info(f"Deleted old avatar: {old_object}")
                except Exception as e:
                    logger.warning(f"Failed to delete old avatar: {e}")
            
            profile.avatar_url = avatar_url
        
        db.commit()
        
        return {
            "success": True,
            "avatar_url": avatar_url,
            "object_name": object_name,
            "size_bytes": len(processed_bytes),
            "dimensions": f"{AVATAR_DIMENSIONS[0]}x{AVATAR_DIMENSIONS[1]}"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Avatar upload error: {e}")
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload avatar: {str(e)}"
        )


@router.delete("/user/avatar")
async def delete_avatar(
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced)
):
    """Delete user avatar"""
    try:
        profile = db.query(UserProfile).filter(
            UserProfile.user_id == current_user.username
        ).first()
        
        if not profile or not profile.avatar_url:
            raise HTTPException(status_code=404, detail="No avatar found")
        
        # Delete from MinIO
        if profile.avatar_url.startswith(f"/api/files/{AVATAR_BUCKET}/"):
            object_name = profile.avatar_url.split(f"{AVATAR_BUCKET}/", 1)[1]
            try:
                minio_service.client.remove_object(AVATAR_BUCKET, object_name)
                logger.info(f"Deleted avatar: {object_name}")
            except Exception as e:
                logger.warning(f"Failed to delete avatar from MinIO: {e}")
        
        # Update profile
        profile.avatar_url = None
        db.commit()
        
        return {"success": True, "message": "Avatar deleted"}
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Avatar deletion error: {e}")
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete avatar: {str(e)}"
        )

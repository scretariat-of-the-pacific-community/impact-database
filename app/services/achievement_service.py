"""
Achievement service for tracking and awarding achievements
"""

from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Optional
import logging

from models.achievements import Achievement, UserAchievement, DEFAULT_ACHIEVEMENTS
from models.database import ImageMetadata

logger = logging.getLogger(__name__)


class AchievementService:
    """Service for managing user achievements"""
    
    @staticmethod
    def seed_achievements(db: Session):
        """Seed default achievements into database"""
        for ach_data in DEFAULT_ACHIEVEMENTS:
            existing = db.query(Achievement).filter(
                Achievement.id == ach_data['id']
            ).first()
            
            if not existing:
                achievement = Achievement(**ach_data)
                db.add(achievement)
        
        db.commit()
        logger.info(f"Seeded {len(DEFAULT_ACHIEVEMENTS)} achievements")
    
    @staticmethod
    def calculate_user_stats(db: Session, username: str) -> Dict:
        """Calculate statistics needed for achievement checking"""
        from models.rbac import User as DBUser
        
        # Get user's UUID (image_metadata uses UUID, not username)
        user = db.query(DBUser).filter(DBUser.username == username).first()
        if not user:
            logger.warning(f"User {username} not found")
            return {'uploads': 0, 'approved_uploads': 0, 'approval_rate': 0, 'unique_hazards': 0, 
                    'unique_countries': 0, 'complete_metadata': 0, 'weekly_streak': 0}
        
        user_id_str = str(user.id)
        
        # Total uploads
        total_uploads = db.query(func.count(ImageMetadata.id)).filter(
            ImageMetadata.uploader_id == user_id_str
        ).scalar() or 0
        
        # Approved uploads
        approved_uploads = db.query(func.count(ImageMetadata.id)).filter(
            and_(
                ImageMetadata.uploader_id == user_id_str,
                ImageMetadata.status == "approved"
            )
        ).scalar() or 0
        
        # Approval rate
        approval_rate = approved_uploads / total_uploads if total_uploads > 0 else 0
        
        # Unique hazard types
        unique_hazards = db.query(func.count(func.distinct(ImageMetadata.hazard_type))).filter(
            ImageMetadata.uploader_id == user_id_str
        ).scalar() or 0
        
        # Unique countries
        unique_countries = db.query(func.count(func.distinct(ImageMetadata.country))).filter(
            and_(
                ImageMetadata.uploader_id == user_id_str,
                ImageMetadata.country.isnot(None)
            )
        ).scalar() or 0
        
        # Uploads with complete metadata (has title, abstract, and location)
        complete_metadata = db.query(func.count(ImageMetadata.id)).filter(
            and_(
                ImageMetadata.uploader_id == user_id_str,
                ImageMetadata.title.isnot(None),
                ImageMetadata.abstract.isnot(None),
                ImageMetadata.location.isnot(None)
            )
        ).scalar() or 0
        
        # Weekly streak calculation (simplified)
        # Check if user uploaded at least once per week for past 4 weeks
        weekly_streak = 0
        today = datetime.now(timezone.utc)
        for week in range(4):
            week_start = today - timedelta(weeks=week+1)
            week_end = today - timedelta(weeks=week)
            
            uploads_this_week = db.query(func.count(ImageMetadata.id)).filter(
                and_(
                    ImageMetadata.uploader_id == user_id_str,
                    ImageMetadata.datetime >= week_start,
                    ImageMetadata.datetime < week_end
                )
            ).scalar() or 0
            
            if uploads_this_week > 0:
                weekly_streak += 1
            else:
                break  # Streak broken
        
        # Hazard-specific approved counts for expert achievements
        hazard_types = ['flood', 'earthquake', 'cyclone', 'tsunami', 'wildfire', 'volcanic', 'drought', 'landslide']
        hazard_counts = {}
        for hazard in hazard_types:
            count = db.query(func.count(ImageMetadata.id)).filter(
                and_(
                    ImageMetadata.uploader_id == user_id_str,
                    ImageMetadata.status == "approved",
                    ImageMetadata.hazard_type == hazard
                )
            ).scalar() or 0
            hazard_counts[f'approved_{hazard}_count'] = count
        
        # Top country (for geographic achievements)
        top_country_query = db.query(
            ImageMetadata.country,
            func.count(ImageMetadata.id).label('count')
        ).filter(
            and_(
                ImageMetadata.uploader_id == user_id_str,
                ImageMetadata.status == "approved",
                ImageMetadata.country.isnot(None)
            )
        ).group_by(ImageMetadata.country).order_by(func.count(ImageMetadata.id).desc()).first()
        
        top_country_count = top_country_query[1] if top_country_query else 0
        
        # Consecutive approved uploads streak (quality streak)
        # Get recent uploads ordered by datetime descending
        recent_uploads = db.query(ImageMetadata.status).filter(
            ImageMetadata.uploader_id == user_id_str
        ).order_by(ImageMetadata.datetime.desc()).limit(20).all()
        
        consecutive_approvals = 0
        for upload in recent_uploads:
            if upload.status == 'approved':
                consecutive_approvals += 1
            else:
                break  # Streak broken by non-approved upload
        
        return {
            'uploads': total_uploads,
            'approved_uploads': approved_uploads,
            'approval_rate': approval_rate,
            'unique_hazards': unique_hazards,
            'unique_countries': unique_countries,
            'complete_metadata': complete_metadata,
            'top_country_count': top_country_count,
            'consecutive_approvals': consecutive_approvals,
            **hazard_counts,
            'weekly_streak': weekly_streak
        }
    
    @staticmethod
    def check_and_award_achievements(db: Session, username: str) -> List[Dict]:
        """
        Check all achievements for a user and award any newly unlocked ones
        Returns list of newly unlocked achievements
        """
        newly_unlocked = []
        
        # Get user stats
        stats = AchievementService.calculate_user_stats(db, username)
        
        # Get all active achievements
        achievements = db.query(Achievement).filter(
            Achievement.is_active == True
        ).all()
        
        for achievement in achievements:
            # Get or create user achievement record
            user_ach = db.query(UserAchievement).filter(
                and_(
                    UserAchievement.user_id == username,
                    UserAchievement.achievement_id == achievement.id
                )
            ).first()
            
            if not user_ach:
                user_ach = UserAchievement(
                    user_id=username,
                    achievement_id=achievement.id,
                    progress=0,
                    unlocked=False
                )
                db.add(user_ach)
            
            # Skip if already unlocked
            if user_ach.unlocked:
                continue
            
            # Check criteria
            metric_value = stats.get(achievement.criteria_metric, 0)
            user_ach.progress = metric_value
            
            # Check if threshold met
            if achievement.criteria_type == 'count':
                if metric_value >= achievement.criteria_threshold:
                    user_ach.unlocked = True
                    user_ach.unlocked_at = datetime.now(timezone.utc)
                    newly_unlocked.append(user_ach.to_dict())
                    logger.info(f"User {username} unlocked achievement: {achievement.name}")
            
            elif achievement.criteria_type == 'rate':
                # Rate achievements require minimum count AND rate threshold
                if stats['uploads'] >= 20 and metric_value >= achievement.criteria_threshold:
                    user_ach.unlocked = True
                    user_ach.unlocked_at = datetime.now(timezone.utc)
                    newly_unlocked.append(user_ach.to_dict())
                    logger.info(f"User {username} unlocked achievement: {achievement.name}")
            
            elif achievement.criteria_type == 'streak':
                if metric_value >= achievement.criteria_threshold:
                    user_ach.unlocked = True
                    user_ach.unlocked_at = datetime.now(timezone.utc)
                    newly_unlocked.append(user_ach.to_dict())
                    logger.info(f"User {username} unlocked achievement: {achievement.name}")
        
        db.commit()
        return newly_unlocked
    
    @staticmethod
    def get_user_achievements(db: Session, username: str) -> List[Dict]:
        """Get all achievements with progress for a user"""
        
        # Ensure achievements exist
        if db.query(Achievement).count() == 0:
            AchievementService.seed_achievements(db)
        
        # Get all achievements
        achievements = db.query(Achievement).filter(
            Achievement.is_active == True
        ).all()
        
        result = []
        for achievement in achievements:
            # Get user's progress
            user_ach = db.query(UserAchievement).filter(
                and_(
                    UserAchievement.user_id == username,
                    UserAchievement.achievement_id == achievement.id
                )
            ).first()
            
            if user_ach:
                result.append(user_ach.to_dict())
            else:
                # Return achievement with zero progress
                ach_dict = achievement.to_dict()
                ach_dict['progress'] = 0
                ach_dict['unlocked'] = False
                ach_dict['unlocked_at'] = None
                ach_dict['total'] = achievement.criteria_threshold
                result.append(ach_dict)
        
        return result
    
    @staticmethod
    def get_unlocked_achievements(db: Session, username: str) -> List[Dict]:
        """Get only unlocked achievements for a user"""
        user_achievements = db.query(UserAchievement).filter(
            and_(
                UserAchievement.user_id == username,
                UserAchievement.unlocked == True
            )
        ).all()
        
        return [ua.to_dict() for ua in user_achievements]


# Singleton instance
achievement_service = AchievementService()

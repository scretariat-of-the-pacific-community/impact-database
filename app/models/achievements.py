"""
Achievement tracking models and system
Tracks user achievements and progress towards badges
"""

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, Float, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import uuid

from models.database import Base


class Achievement(Base):
    """
    Achievement definitions (badges that users can earn)
    """

    __tablename__ = "achievements"

    id = Column(String, primary_key=True)  # e.g., "first_upload", "hundred_uploads"
    name = Column(String, nullable=False)
    description = Column(String, nullable=False)
    icon = Column(String, nullable=True)  # Icon identifier or emoji
    category = Column(String, nullable=False)  # e.g., "upload", "quality", "community"

    # Achievement criteria
    criteria_type = Column(String, nullable=False)  # "count", "rate", "streak", "special"
    criteria_metric = Column(String, nullable=False)  # "uploads", "approval_rate", etc.
    criteria_threshold = Column(Float, nullable=False)  # Target value

    # Display
    tier = Column(String, default="bronze")  # bronze, silver, gold, platinum
    points = Column(Integer, default=10)  # Points awarded
    is_hidden = Column(Boolean, default=False)  # Secret achievements
    is_active = Column(Boolean, default=True)

    # Metadata
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    user_achievements = relationship("UserAchievement", back_populates="achievement")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "icon": self.icon,
            "category": self.category,
            "criteria_type": self.criteria_type,
            "criteria_metric": self.criteria_metric,
            "criteria_threshold": self.criteria_threshold,
            "tier": self.tier,
            "points": self.points,
            "is_hidden": self.is_hidden,
        }


class UserAchievement(Base):
    """
    Tracks which achievements users have unlocked
    """

    __tablename__ = "user_achievements"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(
        String, ForeignKey("users.username", ondelete="CASCADE"), nullable=False, index=True
    )
    achievement_id = Column(
        String, ForeignKey("achievements.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Progress tracking
    progress = Column(Float, default=0.0)  # Current progress (0.0 to criteria_threshold)
    unlocked = Column(Boolean, default=False, index=True)
    unlocked_at = Column(DateTime(timezone=True), nullable=True)

    # Context
    unlock_metadata = Column(
        JSONB, default={}
    )  # Extra info about unlock (e.g., which upload triggered it)

    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    # user = relationship("User", backref="user_achievements")  # Forward ref issue
    achievement = relationship("Achievement", back_populates="user_achievements")

    # Indexes
    __table_args__ = (
        Index("idx_user_achievements_user_unlocked", "user_id", "unlocked"),
        Index("idx_user_achievements_unique", "user_id", "achievement_id", unique=True),
    )

    def to_dict(self):
        achievement_dict = self.achievement.to_dict() if self.achievement else {}
        return {
            **achievement_dict,
            "progress": self.progress,
            "unlocked": self.unlocked,
            "unlocked_at": self.unlocked_at.isoformat() if self.unlocked_at else None,
            "total": self.achievement.criteria_threshold if self.achievement else 0,
        }


# Default achievements to seed
DEFAULT_ACHIEVEMENTS = [
    {
        "id": "first_upload",
        "name": "First Steps",
        "description": "Upload your first image to the database",
        "icon": "🎯",
        "category": "upload",
        "criteria_type": "count",
        "criteria_metric": "uploads",
        "criteria_threshold": 1,
        "tier": "bronze",
        "points": 10,
    },
    {
        "id": "ten_uploads",
        "name": "Getting Started",
        "description": "Upload 10 images",
        "icon": "📸",
        "category": "upload",
        "criteria_type": "count",
        "criteria_metric": "uploads",
        "criteria_threshold": 10,
        "tier": "bronze",
        "points": 25,
    },
    {
        "id": "fifty_uploads",
        "name": "Active Contributor",
        "description": "Upload 50 images",
        "icon": "🌟",
        "category": "upload",
        "criteria_type": "count",
        "criteria_metric": "uploads",
        "criteria_threshold": 50,
        "tier": "silver",
        "points": 50,
    },
    {
        "id": "hundred_uploads",
        "name": "Prolific Contributor",
        "description": "Upload 100 images",
        "icon": "🏆",
        "category": "upload",
        "criteria_type": "count",
        "criteria_metric": "uploads",
        "criteria_threshold": 100,
        "tier": "gold",
        "points": 100,
    },
    {
        "id": "quality_contributor",
        "name": "Quality Contributor",
        "description": "Maintain 90% approval rate with at least 20 uploads",
        "icon": "⭐",
        "category": "quality",
        "criteria_type": "rate",
        "criteria_metric": "approval_rate",
        "criteria_threshold": 0.9,
        "tier": "gold",
        "points": 75,
    },
    {
        "id": "early_adopter",
        "name": "Early Adopter",
        "description": "One of the first 100 users",
        "icon": "🎖️",
        "category": "special",
        "criteria_type": "special",
        "criteria_metric": "user_rank",
        "criteria_threshold": 100,
        "tier": "platinum",
        "points": 150,
    },
    {
        "id": "week_streak",
        "name": "Consistency Champion",
        "description": "Upload at least one image per week for 4 consecutive weeks",
        "icon": "🔥",
        "category": "community",
        "criteria_type": "streak",
        "criteria_metric": "weekly_streak",
        "criteria_threshold": 4,
        "tier": "silver",
        "points": 60,
    },
    {
        "id": "hazard_specialist",
        "name": "Hazard Specialist",
        "description": "Upload images of 5 different hazard types",
        "icon": "🌊",
        "category": "diversity",
        "criteria_type": "count",
        "criteria_metric": "unique_hazards",
        "criteria_threshold": 5,
        "tier": "silver",
        "points": 40,
    },
    {
        "id": "global_mapper",
        "name": "Global Mapper",
        "description": "Upload images from 10 different countries",
        "icon": "🌍",
        "category": "diversity",
        "criteria_type": "count",
        "criteria_metric": "unique_countries",
        "criteria_threshold": 10,
        "tier": "gold",
        "points": 80,
    },
    {
        "id": "data_quality",
        "name": "Metadata Master",
        "description": "Upload 20 images with complete metadata",
        "icon": "📋",
        "category": "quality",
        "criteria_type": "count",
        "criteria_metric": "complete_metadata",
        "criteria_threshold": 20,
        "tier": "silver",
        "points": 50,
    },
    # Hazard-specific Expert Achievements
    {
        "id": "flood_expert",
        "name": "Flood Expert",
        "description": "Have 25+ approved flood images",
        "icon": "🌊",
        "category": "hazard",
        "criteria_type": "count",
        "criteria_metric": "approved_flood_count",
        "criteria_threshold": 25,
        "tier": "gold",
        "points": 75,
    },
    {
        "id": "earthquake_expert",
        "name": "Earthquake Expert",
        "description": "Have 25+ approved earthquake images",
        "icon": "🏚️",
        "category": "hazard",
        "criteria_type": "count",
        "criteria_metric": "approved_earthquake_count",
        "criteria_threshold": 25,
        "tier": "gold",
        "points": 75,
    },
    {
        "id": "cyclone_expert",
        "name": "Cyclone Expert",
        "description": "Have 25+ approved cyclone images",
        "icon": "🌀",
        "category": "hazard",
        "criteria_type": "count",
        "criteria_metric": "approved_cyclone_count",
        "criteria_threshold": 25,
        "tier": "gold",
        "points": 75,
    },
    {
        "id": "tsunami_expert",
        "name": "Tsunami Expert",
        "description": "Have 25+ approved tsunami images",
        "icon": "🌊",
        "category": "hazard",
        "criteria_type": "count",
        "criteria_metric": "approved_tsunami_count",
        "criteria_threshold": 25,
        "tier": "gold",
        "points": 75,
    },
    {
        "id": "wildfire_expert",
        "name": "Wildfire Expert",
        "description": "Have 25+ approved wildfire images",
        "icon": "🔥",
        "category": "hazard",
        "criteria_type": "count",
        "criteria_metric": "approved_wildfire_count",
        "criteria_threshold": 25,
        "tier": "gold",
        "points": 75,
    },
    {
        "id": "volcanic_expert",
        "name": "Volcanic Expert",
        "description": "Have 25+ approved volcanic images",
        "icon": "🌋",
        "category": "hazard",
        "criteria_type": "count",
        "criteria_metric": "approved_volcanic_count",
        "criteria_threshold": 25,
        "tier": "gold",
        "points": 75,
    },
    # Geographic Achievements
    {
        "id": "country_champion",
        "name": "Country Champion",
        "description": "Have 20+ approved uploads from a single country",
        "icon": "🏅",
        "category": "geographic",
        "criteria_type": "count",
        "criteria_metric": "top_country_count",
        "criteria_threshold": 20,
        "tier": "gold",
        "points": 80,
    },
    {
        "id": "regional_expert",
        "name": "Regional Expert",
        "description": "Have 50+ approved uploads from a single country",
        "icon": "🌏",
        "category": "geographic",
        "criteria_type": "count",
        "criteria_metric": "top_country_count",
        "criteria_threshold": 50,
        "tier": "platinum",
        "points": 150,
    },
    # Quality Streak Achievements
    {
        "id": "five_star_streak",
        "name": "5-Star Streak",
        "description": "Have 5 consecutive approved uploads",
        "icon": "⭐",
        "category": "quality",
        "criteria_type": "streak",
        "criteria_metric": "consecutive_approvals",
        "criteria_threshold": 5,
        "tier": "bronze",
        "points": 30,
    },
    {
        "id": "ten_star_streak",
        "name": "10-Star Streak",
        "description": "Have 10 consecutive approved uploads",
        "icon": "🌟",
        "category": "quality",
        "criteria_type": "streak",
        "criteria_metric": "consecutive_approvals",
        "criteria_threshold": 10,
        "tier": "silver",
        "points": 60,
    },
    {
        "id": "perfect_streak",
        "name": "Perfect Streak",
        "description": "Have 20 consecutive approved uploads",
        "icon": "💫",
        "category": "quality",
        "criteria_type": "streak",
        "criteria_metric": "consecutive_approvals",
        "criteria_threshold": 20,
        "tier": "gold",
        "points": 100,
    },
]

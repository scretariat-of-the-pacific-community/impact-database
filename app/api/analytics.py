"""
Analytics API endpoints for tracking user interactions and events
"""
from fastapi import APIRouter, Request
from pydantic import BaseModel
from typing import Dict, Any, Optional
import logging
import json

logger = logging.getLogger(__name__)

router = APIRouter()


class AnalyticsEvent(BaseModel):
    """Analytics event model"""
    name: str
    properties: Optional[Dict[str, Any]] = None
    timestamp: Optional[str] = None


@router.post("/analytics/events")
async def track_event(request: Request):
    """
    Track analytics events from the frontend
    
    Accepts both application/json and text/plain content types.
    navigator.sendBeacon() sends data as text/plain, while fetch() sends as application/json.
    
    This is a simple no-op endpoint that accepts events but doesn't store them.
    Can be extended to log to a database or external analytics service.
    """
    try:
        content_type = request.headers.get("content-type", "")
        
        # Handle both JSON and text/plain (from sendBeacon)
        if "text/plain" in content_type:
            body = await request.body()
            event_data = json.loads(body.decode("utf-8"))
        else:
            event_data = await request.json()
        
        # Validate the event data
        event = AnalyticsEvent(**event_data)
        
        # Log event for debugging (optional)
        logger.debug(f"Analytics event: {event.name} - {event.properties}")
        
        return {
            "success": True,
            "message": "Event tracked"
        }
    except Exception as e:
        logger.error(f"Error tracking analytics event: {e}")
        return {
            "success": False,
            "error": str(e)
        }

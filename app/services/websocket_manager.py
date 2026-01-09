"""WebSocket manager for real-time batch upload progress updates."""

import logging
import json
from typing import Dict, Set
from fastapi import WebSocket
from datetime import datetime

logger = logging.getLogger(__name__)


class BatchProgressWebSocketManager:
    """Manage WebSocket connections for batch upload progress updates."""

    def __init__(self):
        # Map of batch_id -> set of WebSocket connections
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        # Map of websocket -> user_id for auth tracking
        self.websocket_users: Dict[WebSocket, str] = {}

    async def connect(self, websocket: WebSocket, batch_id: str, user_id: str):
        """Connect a WebSocket for batch progress updates."""
        await websocket.accept()
        
        if batch_id not in self.active_connections:
            self.active_connections[batch_id] = set()
        
        self.active_connections[batch_id].add(websocket)
        self.websocket_users[websocket] = user_id
        
        logger.info(f"WebSocket connected for batch {batch_id}, user {user_id}")

    def disconnect(self, websocket: WebSocket, batch_id: str):
        """Disconnect a WebSocket."""
        if batch_id in self.active_connections:
            self.active_connections[batch_id].discard(websocket)
            
            # Clean up empty batch connections
            if not self.active_connections[batch_id]:
                del self.active_connections[batch_id]
        
        if websocket in self.websocket_users:
            del self.websocket_users[websocket]
        
        logger.info(f"WebSocket disconnected for batch {batch_id}")

    async def send_progress_update(self, batch_id: str, progress_data: dict):
        """Send progress update to all connected clients for a batch."""
        if batch_id not in self.active_connections:
            return
        
        # Create message
        message = {
            "type": "progress_update",
            "batch_id": batch_id,
            "timestamp": datetime.utcnow().isoformat(),
            "data": progress_data
        }
        
        # Send to all connected clients
        disconnected = set()
        for connection in self.active_connections[batch_id]:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.warning(f"Failed to send to WebSocket: {e}")
                disconnected.add(connection)
        
        # Clean up disconnected clients
        for conn in disconnected:
            self.disconnect(conn, batch_id)

    async def send_completion_update(self, batch_id: str, result_data: dict):
        """Send completion notification to all connected clients."""
        if batch_id not in self.active_connections:
            return
        
        message = {
            "type": "batch_complete",
            "batch_id": batch_id,
            "timestamp": datetime.utcnow().isoformat(),
            "data": result_data
        }
        
        # Send to all and then close connections
        disconnected = set()
        for connection in self.active_connections[batch_id]:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.warning(f"Failed to send completion: {e}")
            finally:
                disconnected.add(connection)
        
        # Clean up all connections for this batch
        for conn in disconnected:
            try:
                await conn.close()
            except:
                pass
            self.disconnect(conn, batch_id)

    def get_connection_count(self, batch_id: str) -> int:
        """Get number of active connections for a batch."""
        return len(self.active_connections.get(batch_id, set()))


# Global instance
ws_manager = BatchProgressWebSocketManager()

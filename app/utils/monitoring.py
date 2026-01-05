"""
Monitoring and metrics utilities for API endpoints
Provides decorators for tracking endpoint performance and errors
"""

import time
import logging
from functools import wraps
from typing import Callable, Optional
from datetime import datetime
import json

logger = logging.getLogger(__name__)


class MetricsCollector:
    """Collect and log metrics for API endpoints"""
    
    def __init__(self):
        self.metrics = {}
        self.enabled = True
    
    def record_request(self, endpoint: str, method: str, status_code: int, duration_ms: float):
        """Record request metrics"""
        if not self.enabled:
            return
        
        key = f"{method}:{endpoint}"
        if key not in self.metrics:
            self.metrics[key] = {
                'count': 0,
                'errors': 0,
                'total_duration_ms': 0,
                'max_duration_ms': 0,
                'min_duration_ms': float('inf')
            }
        
        stats = self.metrics[key]
        stats['count'] += 1
        stats['total_duration_ms'] += duration_ms
        stats['max_duration_ms'] = max(stats['max_duration_ms'], duration_ms)
        stats['min_duration_ms'] = min(stats['min_duration_ms'], duration_ms)
        
        if status_code >= 400:
            stats['errors'] += 1
        
        # Log slow requests (> 1 second)
        if duration_ms > 1000:
            logger.warning(
                f"Slow request detected: {method} {endpoint} "
                f"took {duration_ms:.2f}ms (status: {status_code})"
            )
    
    def get_stats(self, endpoint: Optional[str] = None) -> dict:
        """Get metrics for specific endpoint or all endpoints"""
        if endpoint:
            return self.metrics.get(endpoint, {})
        
        # Calculate aggregated stats
        result = {}
        for key, stats in self.metrics.items():
            avg_duration = stats['total_duration_ms'] / stats['count'] if stats['count'] > 0 else 0
            error_rate = stats['errors'] / stats['count'] if stats['count'] > 0 else 0
            
            result[key] = {
                **stats,
                'avg_duration_ms': round(avg_duration, 2),
                'error_rate': round(error_rate, 4),
                'min_duration_ms': stats['min_duration_ms'] if stats['min_duration_ms'] != float('inf') else 0
            }
        
        return result
    
    def reset(self):
        """Reset all metrics"""
        self.metrics = {}


# Singleton metrics collector
metrics_collector = MetricsCollector()


def monitor_endpoint(endpoint_name: Optional[str] = None):
    """
    Decorator to monitor endpoint performance
    
    Usage:
        @router.get("/api/user/stats")
        @monitor_endpoint("user_stats")
        async def get_stats():
            return calculate_stats()
    """
    def decorator(func: Callable) -> Callable:
        name = endpoint_name or func.__name__
        
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            start_time = time.time()
            status_code = 200
            error = None
            
            try:
                result = await func(*args, **kwargs)
                
                # Extract status code if response object
                if hasattr(result, 'status_code'):
                    status_code = result.status_code
                
                return result
            
            except Exception as e:
                error = e
                status_code = getattr(e, 'status_code', 500)
                logger.error(f"Error in {name}: {str(e)}", exc_info=True)
                raise
            
            finally:
                duration_ms = (time.time() - start_time) * 1000
                metrics_collector.record_request(
                    endpoint=name,
                    method='ASYNC',
                    status_code=status_code,
                    duration_ms=duration_ms
                )
                
                # Log request
                logger.info(
                    f"[{name}] {status_code} {duration_ms:.2f}ms "
                    f"{'ERROR: ' + str(error) if error else 'OK'}"
                )
        
        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            start_time = time.time()
            status_code = 200
            error = None
            
            try:
                result = func(*args, **kwargs)
                
                if hasattr(result, 'status_code'):
                    status_code = result.status_code
                
                return result
            
            except Exception as e:
                error = e
                status_code = getattr(e, 'status_code', 500)
                logger.error(f"Error in {name}: {str(e)}", exc_info=True)
                raise
            
            finally:
                duration_ms = (time.time() - start_time) * 1000
                metrics_collector.record_request(
                    endpoint=name,
                    method='SYNC',
                    status_code=status_code,
                    duration_ms=duration_ms
                )
                
                logger.info(
                    f"[{name}] {status_code} {duration_ms:.2f}ms "
                    f"{'ERROR: ' + str(error) if error else 'OK'}"
                )
        
        # Return appropriate wrapper based on function type
        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper
    
    return decorator


class AlertManager:
    """Manage alerts for critical events"""
    
    def __init__(self):
        self.alert_handlers = []
        self.alert_history = []
    
    def add_handler(self, handler: Callable):
        """Add alert handler (e.g., email, Slack, PagerDuty)"""
        self.alert_handlers.append(handler)
    
    def alert(self, level: str, message: str, context: Optional[dict] = None):
        """
        Send alert
        
        Args:
            level: 'info', 'warning', 'error', 'critical'
            message: Alert message
            context: Additional context data
        """
        alert_data = {
            'timestamp': datetime.utcnow().isoformat(),
            'level': level,
            'message': message,
            'context': context or {}
        }
        
        # Log alert
        log_func = getattr(logger, level.lower(), logger.info)
        log_func(f"ALERT [{level.upper()}]: {message}", extra={'context': context})
        
        # Store in history
        self.alert_history.append(alert_data)
        
        # Trigger handlers
        for handler in self.alert_handlers:
            try:
                handler(alert_data)
            except Exception as e:
                logger.error(f"Alert handler failed: {e}")
    
    def check_error_rate(self, endpoint: str, threshold: float = 0.1):
        """Check if error rate exceeds threshold and alert"""
        stats = metrics_collector.get_stats(endpoint)
        if stats:
            error_rate = stats.get('error_rate', 0)
            if error_rate > threshold:
                self.alert(
                    'warning',
                    f"High error rate on {endpoint}",
                    {'error_rate': error_rate, 'threshold': threshold, 'stats': stats}
                )
    
    def check_slow_requests(self, endpoint: str, threshold_ms: float = 1000):
        """Check if average response time exceeds threshold"""
        stats = metrics_collector.get_stats(endpoint)
        if stats:
            avg_duration = stats.get('avg_duration_ms', 0)
            if avg_duration > threshold_ms:
                self.alert(
                    'warning',
                    f"Slow response time on {endpoint}",
                    {'avg_duration_ms': avg_duration, 'threshold_ms': threshold_ms, 'stats': stats}
                )


# Singleton alert manager
alert_manager = AlertManager()


def setup_default_alert_handler():
    """Setup default console alert handler"""
    def console_handler(alert_data):
        print(f"\n🚨 ALERT: {alert_data['level'].upper()}")
        print(f"   Message: {alert_data['message']}")
        print(f"   Time: {alert_data['timestamp']}")
        if alert_data.get('context'):
            print(f"   Context: {json.dumps(alert_data['context'], indent=2)}")
        print()
    
    alert_manager.add_handler(console_handler)


# Initialize default handler
setup_default_alert_handler()

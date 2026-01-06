"""
Monitoring and observability configuration for Pacific Impact Database
Implements Prometheus metrics, health checks, and performance monitoring
"""

import time
import psutil
import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response, Depends
from starlette.middleware.base import BaseHTTPMiddleware
from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST
from sqlalchemy.orm import Session
from sqlalchemy import text

from models.database import get_db, ImageMetadata
from core.config import settings

# Prometheus metrics
REQUEST_COUNT = Counter(
    "http_requests_total", "Total HTTP requests", ["method", "endpoint", "status_code"]
)

REQUEST_DURATION = Histogram(
    "http_request_duration_seconds", "HTTP request duration in seconds", ["method", "endpoint"]
)

ACTIVE_CONNECTIONS = Gauge("database_connections_active", "Active database connections")

DATABASE_QUERY_DURATION = Histogram(
    "database_query_duration_seconds", "Database query duration in seconds", ["query_type"]
)

CACHE_HITS = Counter("cache_hits_total", "Total cache hits", ["cache_type"])

CACHE_MISSES = Counter("cache_misses_total", "Total cache misses", ["cache_type"])

STAC_REQUESTS = Counter(
    "stac_requests_total", "Total STAC API requests", ["endpoint", "collection"]
)

OGC_REQUESTS = Counter("ogc_requests_total", "Total OGC API requests", ["endpoint", "collection"])

UPLOAD_SIZE = Histogram("upload_size_bytes", "Size of uploaded files in bytes")

UPLOAD_DURATION = Histogram("upload_duration_seconds", "Upload processing duration in seconds")

SYSTEM_CPU_USAGE = Gauge("system_cpu_usage_percent", "System CPU usage percentage")
SYSTEM_MEMORY_USAGE = Gauge("system_memory_usage_percent", "System memory usage percentage")
SYSTEM_DISK_USAGE = Gauge("system_disk_usage_percent", "System disk usage percentage")


class MetricsMiddleware(BaseHTTPMiddleware):
    """Middleware to collect HTTP request metrics"""

    async def dispatch(self, request: Request, call_next):
        start_time = time.time()

        # Track request
        method = request.method
        path = request.url.path

        # Normalize endpoint for metrics (remove IDs)
        endpoint = self._normalize_endpoint(path)

        response = await call_next(request)

        # Calculate duration
        duration = time.time() - start_time

        # Record metrics
        REQUEST_COUNT.labels(
            method=method, endpoint=endpoint, status_code=response.status_code
        ).inc()

        REQUEST_DURATION.labels(method=method, endpoint=endpoint).observe(duration)

        # Track STAC/OGC specific metrics
        if path.startswith("/stac"):
            collection = self._extract_collection_from_path(path)
            STAC_REQUESTS.labels(endpoint=endpoint, collection=collection or "unknown").inc()
        elif path.startswith("/ogc"):
            collection = self._extract_collection_from_path(path)
            OGC_REQUESTS.labels(endpoint=endpoint, collection=collection or "unknown").inc()

        return response

    def _normalize_endpoint(self, path: str) -> str:
        """Normalize endpoint path for metrics"""
        # Replace UUIDs and IDs with placeholders
        import re

        # Replace UUIDs
        path = re.sub(
            r"/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", "/{uuid}", path
        )

        # Replace numeric IDs
        path = re.sub(r"/\d+", "/{id}", path)

        # Replace collection IDs
        path = re.sub(r"/hazard-[a-z-]+", "/hazard-{type}", path)

        # Replace item IDs (filenames)
        path = re.sub(r"/[^/]+\.(jpg|jpeg|png|tiff|gif)", "/{filename}", path, flags=re.IGNORECASE)

        return path

    def _extract_collection_from_path(self, path: str) -> Optional[str]:
        """Extract collection ID from request path"""
        parts = path.split("/")
        try:
            if "collections" in parts:
                idx = parts.index("collections")
                if idx + 1 < len(parts):
                    return parts[idx + 1]
        except (ValueError, IndexError):
            pass
        return None


class HealthChecker:
    """Health check utilities"""

    @staticmethod
    async def check_database(db: Session) -> Dict[str, Any]:
        """Check database connectivity and performance"""
        try:
            start_time = time.time()

            # Simple connectivity test
            result = db.execute(text("SELECT 1")).fetchone()

            # Check record count
            record_count = db.query(ImageMetadata).count()

            # Check for recent records
            recent_records = (
                db.query(ImageMetadata)
                .filter(ImageMetadata.date_stamp >= datetime.utcnow() - timedelta(days=7))
                .count()
            )

            duration = time.time() - start_time

            return {
                "status": "healthy",
                "response_time": duration,
                "total_records": record_count,
                "recent_records": recent_records,
                "timestamp": datetime.utcnow().isoformat(),
            }

        except Exception as e:
            return {
                "status": "unhealthy",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat(),
            }

    @staticmethod
    async def check_redis() -> Dict[str, Any]:
        """Check Redis connectivity"""
        try:
            from services.performance import redis_client

            if not redis_client:
                return {"status": "disabled", "message": "Redis not configured"}

            start_time = time.time()
            redis_client.ping()
            duration = time.time() - start_time

            info = redis_client.info()

            return {
                "status": "healthy",
                "response_time": duration,
                "memory_usage": info.get("used_memory_human"),
                "connected_clients": info.get("connected_clients"),
                "timestamp": datetime.utcnow().isoformat(),
            }

        except Exception as e:
            return {
                "status": "unhealthy",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat(),
            }

    @staticmethod
    async def check_minio() -> Dict[str, Any]:
        """Check MinIO connectivity"""
        try:
            from services.minio_client import get_minio_client

            client = get_minio_client()
            start_time = time.time()

            # Check if bucket exists
            bucket_exists = client.bucket_exists(settings.MINIO_BUCKET_NAME)
            duration = time.time() - start_time

            return {
                "status": "healthy" if bucket_exists else "warning",
                "response_time": duration,
                "bucket_exists": bucket_exists,
                "timestamp": datetime.utcnow().isoformat(),
            }

        except Exception as e:
            return {
                "status": "unhealthy",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat(),
            }

    @staticmethod
    def check_system_resources() -> Dict[str, Any]:
        """Check system resource usage"""
        try:
            # CPU usage
            cpu_percent = psutil.cpu_percent(interval=1)

            # Memory usage
            memory = psutil.virtual_memory()
            memory_percent = memory.percent

            # Disk usage
            disk = psutil.disk_usage("/")
            disk_percent = (disk.used / disk.total) * 100

            # Update Prometheus gauges
            SYSTEM_CPU_USAGE.set(cpu_percent)
            SYSTEM_MEMORY_USAGE.set(memory_percent)
            SYSTEM_DISK_USAGE.set(disk_percent)

            status = "healthy"
            if cpu_percent > 90 or memory_percent > 90 or disk_percent > 90:
                status = "warning"
            if cpu_percent > 95 or memory_percent > 95 or disk_percent > 95:
                status = "critical"

            return {
                "status": status,
                "cpu_percent": cpu_percent,
                "memory_percent": memory_percent,
                "disk_percent": disk_percent,
                "memory_available": memory.available,
                "disk_free": disk.free,
                "timestamp": datetime.utcnow().isoformat(),
            }

        except Exception as e:
            return {"status": "error", "error": str(e), "timestamp": datetime.utcnow().isoformat()}


class SLOMonitor:
    """Service Level Objective monitoring"""

    # Define SLOs
    SLO_TARGETS = {
        "availability": 99.9,  # 99.9% uptime
        "response_time_p95": 2.0,  # 95th percentile response time < 2s
        "response_time_p99": 5.0,  # 99th percentile response time < 5s
        "error_rate": 1.0,  # Error rate < 1%
    }

    @staticmethod
    async def calculate_slo_metrics(time_window: timedelta = timedelta(hours=24)) -> Dict[str, Any]:
        """Calculate SLO metrics for the specified time window"""
        try:
            from services.performance import redis_client

            if not redis_client:
                return {"error": "Redis not available for SLO calculation"}

            # Get current time and window start
            now = datetime.utcnow()
            window_start = now - time_window

            # Collect metrics from Redis
            metrics = []
            for hour in range(int(time_window.total_seconds() // 3600)):
                hour_key = (window_start + timedelta(hours=hour)).strftime("%Y-%m-%d-%H")

                for endpoint in ["stac", "ogc", "upload"]:
                    metric_key = f"metrics:{endpoint}:{hour_key}"
                    hour_metrics = redis_client.lrange(metric_key, 0, -1)

                    for metric_str in hour_metrics:
                        try:
                            metric = json.loads(metric_str)
                            metrics.append(metric)
                        except:
                            continue

            if not metrics:
                return {"error": "No metrics available for SLO calculation"}

            # Calculate SLO metrics
            total_requests = len(metrics)
            successful_requests = len(
                [m for m in metrics if m.get("execution_time", 0) < 30]
            )  # < 30s timeout
            error_requests = total_requests - successful_requests

            response_times = [m.get("execution_time", 0) for m in metrics]
            response_times.sort()

            # Calculate percentiles
            p95_index = int(len(response_times) * 0.95)
            p99_index = int(len(response_times) * 0.99)

            p95_response_time = response_times[p95_index] if response_times else 0
            p99_response_time = response_times[p99_index] if response_times else 0

            # Calculate availability (simple uptime based on successful requests)
            availability = (
                (successful_requests / total_requests * 100) if total_requests > 0 else 100
            )

            # Calculate error rate
            error_rate = (error_requests / total_requests * 100) if total_requests > 0 else 0

            # Compare against SLO targets
            slo_status = {
                "availability": {
                    "value": availability,
                    "target": SLOMonitor.SLO_TARGETS["availability"],
                    "status": (
                        "met"
                        if availability >= SLOMonitor.SLO_TARGETS["availability"]
                        else "missed"
                    ),
                },
                "response_time_p95": {
                    "value": p95_response_time,
                    "target": SLOMonitor.SLO_TARGETS["response_time_p95"],
                    "status": (
                        "met"
                        if p95_response_time <= SLOMonitor.SLO_TARGETS["response_time_p95"]
                        else "missed"
                    ),
                },
                "response_time_p99": {
                    "value": p99_response_time,
                    "target": SLOMonitor.SLO_TARGETS["response_time_p99"],
                    "status": (
                        "met"
                        if p99_response_time <= SLOMonitor.SLO_TARGETS["response_time_p99"]
                        else "missed"
                    ),
                },
                "error_rate": {
                    "value": error_rate,
                    "target": SLOMonitor.SLO_TARGETS["error_rate"],
                    "status": (
                        "met" if error_rate <= SLOMonitor.SLO_TARGETS["error_rate"] else "missed"
                    ),
                },
            }

            # Overall SLO status
            overall_status = (
                "met" if all(slo["status"] == "met" for slo in slo_status.values()) else "missed"
            )

            return {
                "time_window": str(time_window),
                "total_requests": total_requests,
                "slo_targets": SLOMonitor.SLO_TARGETS,
                "slo_status": slo_status,
                "overall_status": overall_status,
                "timestamp": now.isoformat(),
            }

        except Exception as e:
            return {"error": f"SLO calculation failed: {e}"}


class AlertManager:
    """Alert management for monitoring"""

    ALERT_THRESHOLDS = {
        "high_error_rate": 5.0,  # > 5% error rate
        "high_response_time": 10.0,  # > 10s response time
        "low_availability": 95.0,  # < 95% availability
        "high_cpu": 90.0,  # > 90% CPU usage
        "high_memory": 90.0,  # > 90% memory usage
        "high_disk": 85.0,  # > 85% disk usage
    }

    @staticmethod
    async def check_alerts() -> List[Dict[str, Any]]:
        """Check for alert conditions"""
        alerts = []

        # Check system resources
        system_health = HealthChecker.check_system_resources()

        if system_health.get("cpu_percent", 0) > AlertManager.ALERT_THRESHOLDS["high_cpu"]:
            alerts.append(
                {
                    "severity": "warning",
                    "alert": "high_cpu_usage",
                    "message": f"CPU usage is {system_health['cpu_percent']:.1f}%",
                    "threshold": AlertManager.ALERT_THRESHOLDS["high_cpu"],
                    "timestamp": datetime.utcnow().isoformat(),
                }
            )

        if system_health.get("memory_percent", 0) > AlertManager.ALERT_THRESHOLDS["high_memory"]:
            alerts.append(
                {
                    "severity": "warning",
                    "alert": "high_memory_usage",
                    "message": f"Memory usage is {system_health['memory_percent']:.1f}%",
                    "threshold": AlertManager.ALERT_THRESHOLDS["high_memory"],
                    "timestamp": datetime.utcnow().isoformat(),
                }
            )

        if system_health.get("disk_percent", 0) > AlertManager.ALERT_THRESHOLDS["high_disk"]:
            alerts.append(
                {
                    "severity": "critical",
                    "alert": "high_disk_usage",
                    "message": f"Disk usage is {system_health['disk_percent']:.1f}%",
                    "threshold": AlertManager.ALERT_THRESHOLDS["high_disk"],
                    "timestamp": datetime.utcnow().isoformat(),
                }
            )

        # Check SLO compliance
        slo_metrics = await SLOMonitor.calculate_slo_metrics()

        if "slo_status" in slo_metrics:
            for slo_name, slo_data in slo_metrics["slo_status"].items():
                if slo_data["status"] == "missed":
                    alerts.append(
                        {
                            "severity": "warning",
                            "alert": f"slo_violation_{slo_name}",
                            "message": f"SLO violation: {slo_name} is {slo_data['value']:.2f}, target is {slo_data['target']:.2f}",
                            "timestamp": datetime.utcnow().isoformat(),
                        }
                    )

        return alerts


def setup_monitoring(app: FastAPI):
    """Setup monitoring middleware and endpoints"""

    # Add metrics middleware
    app.add_middleware(MetricsMiddleware)

    # Health check endpoints
    @app.get("/health")
    async def health_check(db: Session = Depends(get_db)):
        """Basic health check"""
        db_health = await HealthChecker.check_database(db)
        redis_health = await HealthChecker.check_redis()
        minio_health = await HealthChecker.check_minio()
        system_health = HealthChecker.check_system_resources()

        overall_status = "healthy"
        if any(
            h.get("status") in ["unhealthy", "critical"]
            for h in [db_health, redis_health, minio_health, system_health]
        ):
            overall_status = "unhealthy"
        elif any(
            h.get("status") == "warning"
            for h in [db_health, redis_health, minio_health, system_health]
        ):
            overall_status = "warning"

        return {
            "status": overall_status,
            "timestamp": datetime.utcnow().isoformat(),
            "components": {
                "database": db_health,
                "redis": redis_health,
                "minio": minio_health,
                "system": system_health,
            },
        }

    @app.get("/health/ready")
    async def readiness_check(db: Session = Depends(get_db)):
        """Kubernetes readiness probe"""
        db_health = await HealthChecker.check_database(db)
        return {"ready": db_health.get("status") == "healthy"}

    @app.get("/health/live")
    async def liveness_check():
        """Kubernetes liveness probe"""
        return {"alive": True}

    # Metrics endpoint
    @app.get("/metrics")
    async def get_metrics():
        """Prometheus metrics endpoint"""
        return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

    # SLO monitoring endpoints
    @app.get("/monitoring/slo")
    async def get_slo_status():
        """Get current SLO status"""
        return await SLOMonitor.calculate_slo_metrics()

    @app.get("/monitoring/alerts")
    async def get_alerts():
        """Get current alerts"""
        return await AlertManager.check_alerts()

    @app.get("/monitoring/performance")
    async def get_performance_stats():
        """Get performance statistics"""
        from services.performance import get_performance_stats

        return get_performance_stats()


# Background tasks for monitoring
async def monitoring_background_tasks():
    """Background tasks for monitoring"""
    while True:
        try:
            # Update system metrics every 30 seconds
            HealthChecker.check_system_resources()

            # Check alerts every 5 minutes
            alerts = await AlertManager.check_alerts()
            if alerts:
                print(f"Active alerts: {len(alerts)}")
                for alert in alerts:
                    print(f"  {alert['severity']}: {alert['message']}")

            await asyncio.sleep(300)  # 5 minutes

        except Exception as e:
            print(f"Monitoring background task error: {e}")
            await asyncio.sleep(60)  # Wait 1 minute before retrying

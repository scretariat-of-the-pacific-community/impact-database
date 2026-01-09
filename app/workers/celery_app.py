import os
from celery import Celery
from celery.schedules import crontab
from core.config import settings


def create_celery_app():
    """Create and configure Celery app with Redis backend from settings."""

    celery_app = Celery(
        "impact_database_workers",
        broker=settings.CELERY_BROKER_URL,
        backend=settings.CELERY_RESULT_BACKEND,
        include=["workers.tasks", "workers.email_tasks", "workers.batch_upload_tasks"],
    )

    # Configure Celery
    celery_app.conf.update(
        task_serializer="json",
        accept_content=["json"],
        result_serializer="json",
        timezone="UTC",
        enable_utc=True,
        task_track_started=True,
        task_time_limit=30 * 60,  # 30 minutes
        task_soft_time_limit=25 * 60,  # 25 minutes
        worker_prefetch_multiplier=1,
        worker_max_tasks_per_child=1000,
        result_expires=3600,  # 1 hour
        task_compression="gzip",
        result_compression="gzip",
        worker_send_task_events=True,
        task_send_sent_event=True,
        # Redis specific settings
        broker_connection_retry_on_startup=True,
        broker_connection_retry=True,
        broker_connection_max_retries=10,
        # Task routing
        task_routes={
            "workers.tasks.process_upload": {"queue": "upload_processing"},
            "workers.tasks.generate_thumbnail": {"queue": "image_processing"},
            "workers.tasks.cleanup_failed_uploads": {"queue": "cleanup"},
            # Email tasks use default queue for simplicity
        },
        # Default queue
        task_default_queue="default",
        task_default_exchange="default",
        task_default_routing_key="default",
        # Worker configuration
        worker_disable_rate_limits=True,
        worker_max_memory_per_child=200000,  # 200MB
        # Beat schedule for periodic tasks
        beat_schedule={
            "weekly-digest-every-monday": {
                "task": "workers.email_tasks.send_weekly_digest_all_users",
                "schedule": crontab(hour=9, minute=0, day_of_week=1),  # Every Monday at 9 AM UTC
            },
            "cleanup-old-batches-daily": {
                "task": "workers.batch_upload_tasks.cleanup_old_batches",
                "schedule": crontab(hour=3, minute=0),  # Every day at 3 AM UTC
                "kwargs": {"days": 30},  # Clean batches older than 30 days
            },
        },
    )

    return celery_app


# Create the Celery app instance
celery_app = create_celery_app()


# Health check task
@celery_app.task
def health_check():
    """Simple health check task"""
    return {
        "status": "healthy",
        "redis_url": settings.REDIS_URL,
        "environment": settings.ENVIRONMENT,
    }

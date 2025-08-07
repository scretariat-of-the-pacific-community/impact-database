import logging
from celery import Celery

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

celery_app = Celery("worker", broker="redis://redis:6379/0")

@celery_app.task
def test_task():
    """Log and return a simple confirmation."""
    logger.info("Celery task executed")
    return "Celery task executed"

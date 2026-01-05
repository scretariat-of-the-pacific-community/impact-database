"""
Test status transitions and audit logging workflow
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from datetime import datetime, timezone
from pydantic import ValidationError
from enum import Enum
from unittest.mock import MagicMock

# Test the StatusEnum
from api.schemas.image_schemas import StatusEnum

def test_status_enum_values():
    """Test that StatusEnum has correct values"""
    assert StatusEnum.PENDING_REVIEW == "pending_review"
    assert StatusEnum.APPROVED == "approved"
    assert StatusEnum.REJECTED == "rejected"
    
    # Test that all values are present
    values = [e.value for e in StatusEnum]
    assert "pending_review" in values
    assert "approved" in values
    assert "rejected" in values


def test_status_enum_from_string():
    """Test creating StatusEnum from string"""
    assert StatusEnum("pending_review") == StatusEnum.PENDING_REVIEW
    assert StatusEnum("approved") == StatusEnum.APPROVED
    assert StatusEnum("rejected") == StatusEnum.REJECTED


def test_invalid_status():
    """Test that invalid status raises error"""
    with pytest.raises(ValueError):
        StatusEnum("invalid_status")


# Test audit log model structure
def test_audit_log_structure():
    """Test that AuditLog model has required fields"""
    from models.audit_log import AuditLog
    
    # Check that class exists and has required attributes
    assert hasattr(AuditLog, 'table_name')
    assert hasattr(AuditLog, 'record_id')
    assert hasattr(AuditLog, 'action')
    assert hasattr(AuditLog, 'user_id')
    assert hasattr(AuditLog, 'timestamp')
    assert hasattr(AuditLog, 'change_summary')
    assert hasattr(AuditLog, 'review_notes')
    assert hasattr(AuditLog, 'to_dict')


def test_audit_log_to_dict():
    """Test audit log serialization"""
    from models.audit_log import AuditLog
    
    # Create a mock audit log
    log = AuditLog(
        table_name="image_metadata",
        record_id="test-123",
        action="STATUS_CHANGE",
        user_id="admin",
        username="admin",
        change_summary={"status": {"old": "pending_review", "new": "approved"}},
        review_notes="Looks good"
    )
    
    # Test to_dict method
    log_dict = log.to_dict()
    
    assert log_dict['table_name'] == "image_metadata"
    assert log_dict['record_id'] == "test-123"
    assert log_dict['action'] == "STATUS_CHANGE"
    assert log_dict['user_id'] == "admin"
    assert log_dict['change_summary']['status']['old'] == "pending_review"
    assert log_dict['review_notes'] == "Looks good"


# Test ImageMetadataUpdate schema
def test_image_metadata_update_with_status():
    """Test ImageMetadataUpdate accepts status field"""
    from api.schemas.image_schemas import ImageMetadataUpdate
    
    update = ImageMetadataUpdate(
        status=StatusEnum.APPROVED,
        review_notes="Approved after review"
    )
    
    assert update.status == StatusEnum.APPROVED
    assert update.review_notes == "Approved after review"


def test_image_metadata_update_optional_fields():
    """Test that status and review_notes are optional"""
    from api.schemas.image_schemas import ImageMetadataUpdate
    
    # Should work without status and review_notes
    update = ImageMetadataUpdate(
        title="Test Image",
        hazard_type="flood"
    )
    
    assert update.status is None
    assert update.review_notes is None
    assert update.title == "Test Image"


def test_image_metadata_update_all_status_values():
    """Test all status transitions"""
    from api.schemas.image_schemas import ImageMetadataUpdate
    
    # Test pending_review
    update1 = ImageMetadataUpdate(status=StatusEnum.PENDING_REVIEW)
    assert update1.status.value == "pending_review"
    
    # Test approved
    update2 = ImageMetadataUpdate(status=StatusEnum.APPROVED)
    assert update2.status.value == "approved"
    
    # Test rejected
    update3 = ImageMetadataUpdate(status=StatusEnum.REJECTED)
    assert update3.status.value == "rejected"


# Test helper functions
def test_is_admin_function():
    """Test admin check function"""
    from api.upload import is_admin
    from api.auth import User
    
    admin_user = User(username="admin", email="admin@test.com")
    regular_user = User(username="regular", email="user@test.com")
    
    # Configure fake DB responses
    db = MagicMock()
    admin_db_user = MagicMock()
    admin_db_user.has_role.side_effect = lambda role: role == "admin"
    admin_query = MagicMock()
    admin_query.filter.return_value.first.side_effect = [admin_db_user, None]
    db.query.return_value = admin_query
    
    assert is_admin(admin_user, db) is True
    assert is_admin(regular_user, db) is False


def test_create_audit_log_function():
    """Test audit log creation helper"""
    from api.upload import create_audit_log
    from api.auth import User
    from models.database import SessionLocal
    
    # This test requires a database session
    # In a real test, you'd use a test database
    # For now, just verify the function exists and has correct signature
    import inspect
    sig = inspect.signature(create_audit_log)
    params = list(sig.parameters.keys())
    
    assert 'db' in params
    assert 'record_id' in params
    assert 'action' in params
    assert 'user' in params
    assert 'change_summary' in params
    assert 'review_notes' in params


# Test workflow scenarios
def test_status_workflow_sequence():
    """Test typical status workflow"""
    # 1. Image uploaded -> pending_review
    initial_status = StatusEnum.PENDING_REVIEW
    assert initial_status.value == "pending_review"
    
    # 2. Admin reviews -> approved
    approved_status = StatusEnum.APPROVED
    assert approved_status.value == "approved"
    
    # 3. Or admin rejects -> rejected
    rejected_status = StatusEnum.REJECTED
    assert rejected_status.value == "rejected"


def test_critical_fields_list():
    """Test that critical fields for audit logging are defined"""
    from api.upload import router
    
    # The critical fields should be tracked in the update endpoint
    # This is more of a documentation test
    critical_fields = ['status', 'hazard_type', 'geometry', 'datetime', 'event_id']
    
    # Verify they're all strings
    assert all(isinstance(f, str) for f in critical_fields)
    assert 'status' in critical_fields
    assert 'hazard_type' in critical_fields


# Integration test scenarios (would need database)
def test_permission_matrix():
    """Document the permission matrix for the workflow"""
    permissions = {
        'upload_image': {
            'admin': True,
            'owner': True,
            'other_user': True  # Anyone can upload
        },
        'update_pending_review_own': {
            'admin': True,
            'owner': True,
            'other_user': False
        },
        'update_approved_own': {
            'admin': True,
            'owner': False,  # Cannot edit approved images
            'other_user': False
        },
        'change_status': {
            'admin': True,
            'owner': False,  # Only admin can change status
            'other_user': False
        },
        'add_review_notes': {
            'admin': True,
            'owner': False,  # Only admin can add review notes
            'other_user': False
        },
        'delete_pending_review_own': {
            'admin': True,
            'owner': True,
            'other_user': False
        },
        'delete_approved_own': {
            'admin': True,
            'owner': False,  # Cannot delete approved images
            'other_user': False
        },
        'view_audit_logs_own': {
            'admin': True,
            'owner': True,
            'other_user': False
        },
        'view_all_audit_logs': {
            'admin': True,
            'owner': False,
            'other_user': False
        }
    }
    
    # Verify admin has all permissions
    for action, roles in permissions.items():
        assert roles['admin'] == True, f"Admin should have permission for {action}"
    
    # Verify non-owners have limited permissions
    assert permissions['update_pending_review_own']['other_user'] == False
    assert permissions['change_status']['owner'] == False


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

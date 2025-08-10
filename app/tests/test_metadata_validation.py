import os
import sys
from datetime import datetime

import pytest
from jsonschema import ValidationError

# Ensure app directory is in path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from api.services.metadata_validation import validate_metadata  # noqa: E402
from api.services.iso_vocabulary import HAZARD_TYPES  # noqa: E402


def test_validate_metadata_valid():
    metadata = {
        "filename": "image.jpg",
        "hazard_type": list(HAZARD_TYPES.keys())[0],
        "location": "Test Location",
        "timestamp": datetime.utcnow().isoformat(),
        "metadata_language": "eng",
    }
    validate_metadata(metadata)  # Should not raise


def test_validate_metadata_missing_field():
    metadata = {
        "filename": "image.jpg",
        "hazard_type": list(HAZARD_TYPES.keys())[0],
        "timestamp": datetime.utcnow().isoformat(),
        "metadata_language": "eng",
    }
    with pytest.raises(ValidationError):
        validate_metadata(metadata)


def test_validate_metadata_invalid_enum():
    metadata = {
        "filename": "image.jpg",
        "hazard_type": "invalid",
        "location": "Test Location",
        "timestamp": datetime.utcnow().isoformat(),
        "metadata_language": "eng",
    }
    with pytest.raises(ValidationError):
        validate_metadata(metadata)

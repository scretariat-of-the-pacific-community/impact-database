"""Metadata validation utilities using JSON Schema."""

import json
import os
from jsonschema import Draft202012Validator

from api.services.iso_vocabulary import (
    HAZARD_TYPES,
    STATUS_VALUES,
    MAINTENANCE_FREQUENCY,
    CAPTURE_METHODS,
    ACCESS_CONSTRAINTS,
    SECURITY_CLASSIFICATIONS,
)

# Path to metadata schema
_SCHEMA_PATH = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    "schemas",
    "metadata.schema.json",
)


_validator = None


def _load_schema() -> Draft202012Validator:
    """Load the JSON schema, populate enums and return a validator instance."""
    global _validator
    if _validator is None:
        with open(_SCHEMA_PATH, "r", encoding="utf-8") as f:
            schema = json.load(f)

        schema["properties"]["hazard_type"]["enum"] = list(HAZARD_TYPES.keys())
        schema["properties"]["status"]["enum"] = STATUS_VALUES
        schema["properties"]["maintenance_frequency"]["enum"] = MAINTENANCE_FREQUENCY
        schema["properties"]["capture_method"]["enum"] = CAPTURE_METHODS
        schema["properties"]["access_constraints"]["enum"] = ACCESS_CONSTRAINTS
        schema["properties"]["security_classification"]["enum"] = SECURITY_CLASSIFICATIONS

        _validator = Draft202012Validator(schema)

    return _validator


def validate_metadata(metadata: dict) -> None:
    """Validate metadata dictionary against the schema."""
    validator = _load_schema()
    validator.validate(metadata)

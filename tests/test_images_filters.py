import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
APP_ROOT = PROJECT_ROOT / "app"
for path in (PROJECT_ROOT, APP_ROOT):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

from app.api.images import _escape_ilike  # noqa: E402


def test_escape_ilike_escapes_special_characters():
    raw_value = r"50% off_\\sale"
    escaped = _escape_ilike(raw_value)
    assert escaped == r"50\% off\_\\\\sale"


def test_escape_ilike_passes_through_simple_text():
    assert _escape_ilike("plain text") == "plain text"


def test_escape_ilike_handles_none_gracefully():
    assert _escape_ilike(None) is None

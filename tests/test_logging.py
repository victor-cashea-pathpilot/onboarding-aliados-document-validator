"""Tests for structured logging helpers."""

import json
import logging

from backend.shared.logging import JsonFormatter, sanitize_url


def test_json_formatter_serializes_extra_fields() -> None:
    formatter = JsonFormatter()
    record = logging.LogRecord(
        name="test.logger",
        level=logging.INFO,
        pathname=__file__,
        lineno=10,
        msg="hello",
        args=(),
        exc_info=None,
    )
    record.event = "job.completed"
    record.job_id = "val_123"

    payload = json.loads(formatter.format(record))

    assert payload["message"] == "hello"
    assert payload["event"] == "job.completed"
    assert payload["job_id"] == "val_123"
    assert payload["severity"] == "INFO"


def test_sanitize_url_removes_query_string() -> None:
    url = "https://storage.googleapis.com/bucket/file.pdf?x-goog-signature=secret"

    assert sanitize_url(url) == "https://storage.googleapis.com/bucket/file.pdf"

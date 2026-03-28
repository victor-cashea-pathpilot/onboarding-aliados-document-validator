"""Logging utilities."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlsplit, urlunsplit

_BASE_RECORD_FIELDS = frozenset(logging.makeLogRecord({}).__dict__.keys())


class JsonFormatter(logging.Formatter):
    """Emit structured JSON logs for Cloud Logging."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "severity": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        for key, value in record.__dict__.items():
            if key in _BASE_RECORD_FIELDS or key.startswith("_"):
                continue
            payload[key] = value

        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)

        return json.dumps(payload, ensure_ascii=False, default=str)


def configure_logging(level: str) -> None:
    """Configure root logging once per process."""

    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        handlers=[handler],
        force=True,
    )


def get_logger(name: str) -> logging.Logger:
    """Return a named logger."""

    return logging.getLogger(name)


def log_event(
    logger: logging.Logger,
    event: str,
    *,
    level: int = logging.INFO,
    message: str | None = None,
    exc_info: Any | None = None,
    **fields: Any,
) -> None:
    """Log a structured event with free-form fields."""

    logger.log(
        level,
        message or event,
        extra={
            "event": event,
            **{key: value for key, value in fields.items() if value is not None},
        },
        exc_info=exc_info,
    )


def sanitize_url(url: str | None) -> str | None:
    """Remove query parameters from URLs before logging them."""

    if not url:
        return None

    parts = urlsplit(url)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))

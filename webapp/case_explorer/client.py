"""Client for calling the onboarding API from the internal webapp."""

from __future__ import annotations

import httpx
from google.auth.transport.requests import Request
from google.oauth2 import id_token

from webapp.case_explorer.config import get_settings


def fetch_case(job_id: str) -> dict:
    """Fetch a case payload from the onboarding API using service identity."""

    settings = get_settings()
    audience = settings.onboarding_api_audience or settings.onboarding_api_url.rstrip("/")
    bearer = id_token.fetch_id_token(Request(), audience)

    with httpx.Client(timeout=30.0) as client:
        response = client.get(
            f"{settings.onboarding_api_url.rstrip('/')}/internal/jobs/{job_id}",
            headers={"Authorization": f"Bearer {bearer}"},
        )
        response.raise_for_status()
        return response.json()


def fetch_cases(page: int = 1, page_size: int = 20, query: str | None = None) -> dict:
    """Fetch a paginated case list from the onboarding API using service identity."""

    settings = get_settings()
    audience = settings.onboarding_api_audience or settings.onboarding_api_url.rstrip("/")
    bearer = id_token.fetch_id_token(Request(), audience)

    with httpx.Client(timeout=30.0) as client:
        response = client.get(
            f"{settings.onboarding_api_url.rstrip('/')}/internal/jobs",
            headers={"Authorization": f"Bearer {bearer}"},
            params={"page": page, "page_size": page_size, "q": query or None},
        )
        response.raise_for_status()
        return response.json()

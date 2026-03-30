"""Google auth helpers for the internal case explorer."""

from __future__ import annotations

from google.auth.transport.requests import Request
from google.oauth2 import id_token

from webapp.case_explorer.config import WebappSettings


def verify_google_credential(credential: str, settings: WebappSettings) -> dict:
    """Verify a Google Identity credential and return the decoded payload."""

    if not settings.google_oauth_client_id:
        raise ValueError("GOOGLE_OAUTH_CLIENT_ID is not configured.")

    payload = id_token.verify_oauth2_token(
        credential,
        Request(),
        settings.google_oauth_client_id,
    )

    email = str(payload.get("email", "")).lower()
    domain = email.split("@", 1)[1] if "@" in email else ""

    allowed_emails = settings.allowed_emails()
    allowed_domains = settings.allowed_domains()

    if allowed_emails and email not in allowed_emails:
        raise PermissionError("This Google account is not authorized.")
    if allowed_domains and domain not in allowed_domains:
        raise PermissionError("This Google domain is not authorized.")

    return payload

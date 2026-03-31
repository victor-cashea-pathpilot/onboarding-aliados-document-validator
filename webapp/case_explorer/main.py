"""FastAPI internal case explorer webapp."""

from __future__ import annotations

import json
import logging
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware

from webapp.case_explorer.auth import verify_google_credential
from webapp.case_explorer.client import fetch_case, fetch_cases
from webapp.case_explorer.config import get_settings

settings = get_settings()
templates = Jinja2Templates(directory=str(Path(__file__).parent / "templates"))


def _case_summary(payload: dict) -> dict:
    """Extract a compact summary for the page header."""

    overall = payload.get("overall_result") or {}
    validation = payload.get("cross_validation") or {}
    return {
        "job_id": payload.get("job_id"),
        "merchant_id": payload.get("merchant_id"),
        "request_id": payload.get("request_id"),
        "status": payload.get("status"),
        "overall_status": overall.get("status"),
        "overall_summary": overall.get("summary"),
        "legal_mode": validation.get("legal_mode"),
        "updated_at": payload.get("updated_at"),
    }


def _is_authenticated(request: Request) -> bool:
    """Return whether the request already has a valid session."""

    if settings.auth_mode != "google":
        return True
    return bool(request.session.get("user"))


def _require_auth(request: Request) -> None:
    """Raise if the current request is not authenticated."""

    if _is_authenticated(request):
        return
    raise HTTPException(status_code=401, detail="Authentication required.")


def _base_context(request: Request) -> dict:
    """Common template context."""

    return {
        "request": request,
        "settings": settings,
        "user": request.session.get("user"),
        "auth_mode": settings.auth_mode,
    }


app = FastAPI(
    title=settings.app_title,
    version="0.1.0",
    description="Internal webapp for browsing onboarding validation jobs.",
)
app.add_middleware(SessionMiddleware, secret_key=settings.session_secret)
logging.basicConfig(level=getattr(logging, settings.log_level.upper(), logging.INFO))


@app.get("/health")
async def health() -> dict[str, str]:
    """Basic health endpoint."""

    return {"status": "healthy", "service": "case-explorer-webapp"}


@app.get("/", response_class=HTMLResponse)
async def home(request: Request) -> HTMLResponse:
    """Render the landing page with login or job lookup."""

    page = int(request.query_params.get("page", "1") or "1")
    page_size = int(request.query_params.get("page_size", "20") or "20")
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)
    jobs_payload = fetch_cases(page=page, page_size=page_size)

    return templates.TemplateResponse(
        request,
        "home.html",
        {
            **_base_context(request),
            "oauth_ready": bool(settings.google_oauth_client_id),
            "jobs_payload": jobs_payload,
            "jobs": jobs_payload.get("items", []),
            "page": page,
            "page_size": page_size,
            "prev_page": page - 1 if page > 1 else None,
            "next_page": page + 1 if jobs_payload.get("has_next") else None,
        },
    )


@app.post("/auth/google")
async def google_auth(request: Request) -> JSONResponse:
    """Accept a Google credential and establish a session."""

    if settings.auth_mode != "google":
        return JSONResponse({"ok": True, "next": "/"})

    payload = await request.json()
    credential = payload.get("credential")
    if not credential:
        raise HTTPException(status_code=400, detail="Missing credential.")

    try:
        decoded = verify_google_credential(credential, settings)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    request.session["user"] = {
        "email": decoded.get("email"),
        "name": decoded.get("name") or decoded.get("email"),
        "picture": decoded.get("picture"),
    }
    return JSONResponse({"ok": True, "next": "/"})


@app.post("/auth/logout")
async def logout(request: Request) -> RedirectResponse:
    """Clear the user session."""

    request.session.clear()
    return RedirectResponse(url="/", status_code=303)


@app.get("/jobs/{job_id}", response_class=HTMLResponse)
async def case_detail(request: Request, job_id: str) -> HTMLResponse:
    """Render the case detail page by fetching data from the onboarding API."""

    _require_auth(request)
    payload = fetch_case(job_id)
    return templates.TemplateResponse(
        request,
        "case_detail.html",
        {
            **_base_context(request),
            "job_id": job_id,
            "summary": _case_summary(payload),
            "case_payload": payload,
            "case_payload_pretty": json.dumps(payload, ensure_ascii=False, indent=2),
        },
    )


@app.get("/jobs/{job_id}/json")
async def case_detail_json(request: Request, job_id: str) -> JSONResponse:
    """Return the raw case JSON through the webapp session boundary."""

    _require_auth(request)
    return JSONResponse(fetch_case(job_id))

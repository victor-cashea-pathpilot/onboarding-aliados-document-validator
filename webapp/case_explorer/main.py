"""FastAPI internal case explorer webapp."""

from __future__ import annotations

import json
import logging
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware

from backend.shared.extraction.prompts import (
    build_acta_constitutiva_prompt,
    build_acta_mercantil_prompt,
    build_cedula_prompt,
    build_certificado_emprendimiento_prompt,
    build_rif_prompt,
)
from backend.shared.validation_prompts import (
    build_cross_validation_llm_prompt,
    build_legal_assessment_prompt,
)
from webapp.case_explorer.auth import verify_google_credential
from webapp.case_explorer.client import fetch_case, fetch_cases
from webapp.case_explorer.config import get_settings

settings = get_settings()
templates = Jinja2Templates(directory=str(Path(__file__).parent / "templates"))

EXTRACTION_PROMPTS = {
    "rif": build_rif_prompt,
    "cedula": build_cedula_prompt,
    "acta_constitutiva": build_acta_constitutiva_prompt,
    "acta_mercantil": build_acta_mercantil_prompt,
    "certificado_emprendimiento": build_certificado_emprendimiento_prompt,
}

SIMPLE_MODEL_TYPES = {"rif", "cedula"}
DEFAULT_GEMINI_MODEL_SIMPLE = "gemini-2.5-flash"
DEFAULT_GEMINI_MODEL_COMPLEX = "gemini-2.5-pro"

STAGE_ORDER = {
    "document_intake": 1,
    "document_extraction": 2,
    "document_normalization": 3,
    "cross_validation": 4,
    "completed": 5,
    "failed": 99,
}


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


def _cedula_policy_summary(payload: dict) -> dict:
    """Extract cédula expiration policy metadata for the case detail hero."""

    snapshot = payload.get("normalized_snapshot") or {}
    outcome = snapshot.get("primary_cedula_policy_outcome") or "unknown"
    outcome_labels = {
        "valid": "Vigente",
        "expired_within_10_years": "Vencida <= 10 años",
        "expired_over_10_years": "Vencida > 10 años",
        "unknown": "Sin dato suficiente",
    }
    return {
        "id_number": snapshot.get("primary_cedula_id") or "-",
        "expiration_date": snapshot.get("primary_cedula_expiration_date") or "-",
        "is_expired": snapshot.get("primary_cedula_is_expired"),
        "expiration_years": snapshot.get("primary_cedula_expiration_years"),
        "policy_outcome": outcome,
        "policy_label": outcome_labels.get(outcome, outcome),
    }


def _format_duration(seconds: float | None) -> str:
    """Format seconds into a compact duration label."""

    if seconds is None:
        return "-"
    if seconds < 60:
        return f"{seconds:.1f}s"
    minutes = int(seconds // 60)
    remainder = seconds - (minutes * 60)
    return f"{minutes}m {remainder:.0f}s"


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


def _status_for_stage(payload: dict, target_stage: str) -> str:
    """Infer a visual node status from the current job stage."""

    job_status = payload.get("status")
    current_stage = ((payload.get("progress") or {}).get("stage")) or ""

    if job_status == "FAILED":
        return "failed" if target_stage == current_stage else "completed"
    if job_status == "COMPLETED":
        return "completed"
    if not current_stage:
        return "pending"

    current_rank = STAGE_ORDER.get(current_stage, 0)
    target_rank = STAGE_ORDER.get(target_stage, 0)
    if current_rank > target_rank:
        return "completed"
    if current_rank == target_rank:
        return "active"
    return "pending"


def _document_references(request_payload: dict) -> list[dict]:
    """Flatten sanitized document references for explorer use."""

    documents = (request_payload or {}).get("documents") or {}
    refs: list[dict] = []
    for document_type, items in documents.items():
        for item in items or []:
            refs.append(
                {
                    "document_type": document_type,
                    "document_id": item.get("document_id"),
                    "url": item.get("url"),
                }
            )
    return refs


def _build_extraction_nodes(payload: dict) -> list[dict]:
    """Build one visual node per extracted document."""

    request_documents = (payload.get("request") or {}).get("documents") or {}
    documents_result = payload.get("documents") or {}
    nodes: list[dict] = []
    index = 0

    for document_type, prompt_builder in EXTRACTION_PROMPTS.items():
        request_bucket = request_documents.get(document_type) or []
        result_bucket = documents_result.get(document_type) or []
        max_len = max(len(request_bucket), len(result_bucket))
        for bucket_index in range(max_len):
            request_item = request_bucket[bucket_index] if bucket_index < len(request_bucket) else {}
            result_item = result_bucket[bucket_index] if bucket_index < len(result_bucket) else {}
            extracted_data = result_item.get("extracted_data") or {}
            extracted_fields = extracted_data.get("extracted_fields")
            extraction_status = extracted_data.get("extraction_status")
            output_payload = (
                extracted_fields
                if extracted_fields
                else {
                    "status": result_item.get("status"),
                    "errors": result_item.get("errors") or [],
                }
            )
            if extraction_status == "completed":
                node_status = "completed"
            elif payload.get("status") == "PROCESSING" and ((payload.get("progress") or {}).get("stage") == "document_extraction"):
                node_status = "active"
            elif payload.get("status") == "FAILED":
                node_status = "failed"
            else:
                node_status = "pending"

            model_name = (
                getattr(
                    settings,
                    "gemini_model_simple",
                    DEFAULT_GEMINI_MODEL_SIMPLE,
                )
                if document_type in SIMPLE_MODEL_TYPES
                else getattr(
                    settings,
                    "gemini_model_complex",
                    DEFAULT_GEMINI_MODEL_COMPLEX,
                )
            )
            document_id = request_item.get("document_id") or result_item.get("document_id")
            nodes.append(
                {
                    "id": f"extract-{document_type}-{bucket_index}",
                    "kind": "llm_extraction",
                    "title": f"Extraction · {document_type}",
                    "subtitle": document_id or f"{document_type}-{bucket_index + 1}",
                    "status": node_status,
                    "stage": "document_extraction",
                    "model": model_name,
                    "files": [
                        {
                            "document_type": document_type,
                            "document_id": document_id,
                            "url": request_item.get("url"),
                        }
                    ],
                    "input_payload": {
                        "document_type": document_type,
                        "document_id": document_id,
                        "source_url": request_item.get("url"),
                        "content_type": extracted_data.get("content_type"),
                        "content_length": extracted_data.get("content_length"),
                    },
                    "prompt": prompt_builder(),
                    "output_payload": output_payload,
                    "order": 20 + index,
                }
            )
            index += 1
    return nodes


def _build_workflow_nodes(payload: dict) -> list[dict]:
    """Build a visual workflow graph from the persisted case payload."""

    request_payload = payload.get("request") or {}
    progress = payload.get("progress") or {}
    documents_result = payload.get("documents") or {}
    snapshot = payload.get("normalized_snapshot") or {}
    cross_validation = payload.get("cross_validation") or {}
    checks = cross_validation.get("checks") or []
    legal_mode = (
        cross_validation.get("legal_mode")
        or snapshot.get("legal_mode")
        or "unknown"
    )
    files = _document_references(request_payload)

    nodes = [
        {
            "id": "request_received",
            "kind": "system",
            "title": "Submit Request",
            "subtitle": payload.get("job_id"),
            "status": "completed",
            "stage": "request_received",
            "model": None,
            "files": files,
            "input_payload": request_payload,
            "prompt": None,
            "output_payload": {
                "job_id": payload.get("job_id"),
                "merchant_id": payload.get("merchant_id"),
                "request_id": payload.get("request_id"),
                "status": payload.get("status"),
            },
            "order": 0,
        },
        {
            "id": "document_intake",
            "kind": "workflow_step",
            "title": "Document Intake",
            "subtitle": "Reachability, MIME, size and technical validation",
            "status": _status_for_stage(payload, "document_intake"),
            "stage": "document_intake",
            "model": None,
            "files": files,
            "input_payload": request_payload.get("documents") or {},
            "prompt": None,
            "output_payload": documents_result,
            "order": 10,
        },
    ]

    nodes.extend(_build_extraction_nodes(payload))

    nodes.extend(
        [
            {
                "id": "normalization",
                "kind": "workflow_step",
                "title": "Normalization",
                "subtitle": "Canonical snapshot consolidation",
                "status": "completed"
                if snapshot
                else _status_for_stage(payload, "document_normalization"),
                "stage": "document_normalization",
                "model": None,
                "files": files,
                "input_payload": documents_result,
                "prompt": None,
                "output_payload": snapshot or {"status": "pending"},
                "order": 100,
            },
            {
                "id": "deterministic_cross_validation",
                "kind": "workflow_step",
                "title": "Deterministic Cross Validation",
                "subtitle": "Rules over normalized data",
                "status": "completed"
                if checks
                else _status_for_stage(payload, "cross_validation"),
                "stage": "cross_validation",
                "model": None,
                "files": files,
                "input_payload": {
                    "snapshot": snapshot,
                },
                "prompt": None,
                "output_payload": {"checks": checks},
                "order": 110,
            },
            {
                "id": "llm_cross_validation",
                "kind": "llm_validation",
                "title": "LLM Cross Validation",
                "subtitle": "Contextual legal consistency review",
                "status": "completed"
                if cross_validation.get("llm_cross_validation")
                else _status_for_stage(payload, "cross_validation"),
                "stage": "cross_validation",
                "model": getattr(
                    settings,
                    "gemini_model_complex",
                    DEFAULT_GEMINI_MODEL_COMPLEX,
                ),
                "files": files,
                "input_payload": {
                    "snapshot": snapshot,
                    "checks": checks,
                    "legal_mode": legal_mode,
                },
                "prompt": build_cross_validation_llm_prompt(legal_mode),
                "output_payload": cross_validation.get("llm_cross_validation")
                or {"status": "pending"},
                "order": 120,
            },
            {
                "id": "llm_legal_assessment",
                "kind": "llm_validation",
                "title": "LLM Legal Assessment",
                "subtitle": "Final legal recommendation layer",
                "status": "completed"
                if cross_validation.get("llm_legal_assessment")
                else _status_for_stage(payload, "cross_validation"),
                "stage": "cross_validation",
                "model": getattr(
                    settings,
                    "gemini_model_complex",
                    DEFAULT_GEMINI_MODEL_COMPLEX,
                ),
                "files": files,
                "input_payload": {
                    "snapshot": snapshot,
                    "checks": checks,
                    "legal_mode": legal_mode,
                },
                "prompt": build_legal_assessment_prompt(legal_mode),
                "output_payload": cross_validation.get("llm_legal_assessment")
                or {"status": "pending"},
                "order": 130,
            },
            {
                "id": "final_verdict",
                "kind": "workflow_step",
                "title": "Final Verdict",
                "subtitle": "Overall result composition",
                "status": "completed"
                if payload.get("overall_result")
                else _status_for_stage(payload, "completed"),
                "stage": "completed",
                "model": None,
                "files": files,
                "input_payload": {
                    "checks": checks,
                    "llm_cross_validation": cross_validation.get("llm_cross_validation"),
                    "llm_legal_assessment": cross_validation.get("llm_legal_assessment"),
                },
                "prompt": None,
                "output_payload": payload.get("overall_result") or {"status": "pending"},
                "order": 140,
            },
        ]
    )

    return sorted(nodes, key=lambda item: item["order"])


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
    query = (request.query_params.get("q", "") or "").strip()
    auto_refresh = request.query_params.get("auto_refresh", "1") != "0"
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)
    jobs_payload = fetch_cases(page=page, page_size=page_size, query=query)
    jobs = jobs_payload.get("items", [])
    active_jobs = [item for item in jobs if item.get("status") in {"PENDING", "PROCESSING"}]
    recent_jobs = [item for item in jobs if item.get("status") not in {"PENDING", "PROCESSING"}]
    table_rows = active_jobs + recent_jobs
    stats = jobs_payload.get("stats", {})
    outcome_counts = stats.get("outcome_counts", {})
    total_outcomes = (
        outcome_counts.get("approved", 0)
        + outcome_counts.get("rejected", 0)
        + outcome_counts.get("requires_review", 0)
    )
    if total_outcomes > 0:
        approved_deg = outcome_counts.get("approved", 0) / total_outcomes * 360
        rejected_deg = outcome_counts.get("rejected", 0) / total_outcomes * 360
        chart_style = (
            "conic-gradient("
            f"#16a34a 0deg {approved_deg:.2f}deg, "
            f"#dc2626 {approved_deg:.2f}deg {(approved_deg + rejected_deg):.2f}deg, "
            f"#d97706 {(approved_deg + rejected_deg):.2f}deg 360deg)"
        )
    else:
        chart_style = "conic-gradient(#e2e8f0 0deg 360deg)"

    return templates.TemplateResponse(
        request,
        "home.html",
        {
            **_base_context(request),
            "oauth_ready": bool(settings.google_oauth_client_id),
            "jobs_payload": jobs_payload,
            "jobs": jobs,
            "active_jobs": active_jobs,
            "table_rows": table_rows,
            "page": page,
            "page_size": page_size,
            "query": query,
            "auto_refresh": auto_refresh,
            "prev_page": page - 1 if page > 1 else None,
            "next_page": page + 1 if jobs_payload.get("has_next") else None,
            "stats": stats,
            "chart_style": chart_style,
            "p50_duration_label": _format_duration(stats.get("p50_duration_seconds")),
            "p90_duration_label": _format_duration(stats.get("p90_duration_seconds")),
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
    workflow_nodes = _build_workflow_nodes(payload)
    return templates.TemplateResponse(
        request,
        "case_detail.html",
        {
            **_base_context(request),
            "job_id": job_id,
            "summary": _case_summary(payload),
            "cedula_policy": _cedula_policy_summary(payload),
            "case_payload": payload,
            "case_payload_pretty": json.dumps(payload, ensure_ascii=False, indent=2),
            "workflow_nodes": workflow_nodes,
            "workflow_nodes_json": json.dumps(workflow_nodes, ensure_ascii=False),
        },
    )


@app.get("/jobs/{job_id}/json")
async def case_detail_json(request: Request, job_id: str) -> JSONResponse:
    """Return the raw case JSON through the webapp session boundary."""

    _require_auth(request)
    return JSONResponse(fetch_case(job_id))

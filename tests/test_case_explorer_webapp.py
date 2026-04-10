"""Tests for the internal case explorer webapp."""

from fastapi.testclient import TestClient

from webapp.case_explorer import main as webapp_main


client = TestClient(webapp_main.app)


def test_home_page_renders_lookup_form() -> None:
    original_fetch_cases = webapp_main.fetch_cases
    webapp_main.fetch_cases = lambda page=1, page_size=20, query=None: {
        "page": page,
        "page_size": page_size,
        "has_next": False,
        "query": query,
        "total_items": 0,
        "stats": {
            "cases_last_24h": 0,
            "p50_duration_seconds": None,
            "p90_duration_seconds": None,
            "outcome_counts": {"approved": 0, "rejected": 0, "requires_review": 0},
        },
        "items": [],
    }
    try:
        response = client.get("/")
    finally:
        webapp_main.fetch_cases = original_fetch_cases

    assert response.status_code == 200
    assert "Case Explorer" in response.text
    assert "Search" in response.text
    assert "Casos en las últimas 24 horas" in response.text
    assert "Aprobados" in response.text
    assert 'http-equiv="refresh"' in response.text
    assert "Jobs recientes y en progreso" in response.text


def test_home_page_renders_job_list(monkeypatch) -> None:
    monkeypatch.setattr(
        webapp_main,
        "fetch_cases",
        lambda page=1, page_size=20, query=None: {
            "page": page,
            "page_size": page_size,
            "has_next": True,
            "query": query,
            "total_items": 2,
            "stats": {
                "cases_last_24h": 2,
                "p50_duration_seconds": 33.4,
                "p90_duration_seconds": 41.8,
                "outcome_counts": {"approved": 0, "rejected": 1, "requires_review": 1},
            },
            "items": [
                {
                    "job_id": "val_case124",
                    "merchant_id": "merchant-124",
                    "request_id": "req-124",
                    "status": "PROCESSING",
                    "overall_status": None,
                    "overall_summary": None,
                    "legal_mode": "sociedad_mercantil",
                    "stage": "document_extraction",
                    "progress_percentage": 42,
                    "progress_message": "Extracting documents",
                    "document_count": 4,
                    "duration_seconds": None,
                    "updated_at": "2026-03-30T00:00:05Z",
                },
                {
                    "job_id": "val_case123",
                    "merchant_id": "merchant-123",
                    "request_id": "req-123",
                    "status": "COMPLETED",
                    "overall_status": "REQUIRES_REVIEW",
                    "overall_summary": "Manual review required.",
                    "legal_mode": "sociedad_mercantil",
                    "stage": "cross_validation",
                    "progress_percentage": 100,
                    "progress_message": "Completed",
                    "document_count": 3,
                    "duration_seconds": 21.4,
                    "updated_at": "2026-03-30T00:00:00Z",
                }
            ],
        },
    )

    response = client.get("/")

    assert response.status_code == 200
    assert "val_case123" in response.text
    assert "val_case124" in response.text
    assert "merchant-123" in response.text
    assert "Manual review required." in response.text
    assert "Next" in response.text
    assert "status-processing" in response.text
    assert "42%" in response.text
    assert "Extracting documents" in response.text
    assert "onclick" in response.text
    assert "p50 de duración por job" in response.text


def test_case_detail_renders_with_mocked_case(monkeypatch) -> None:
    monkeypatch.setattr(
        webapp_main,
        "fetch_case",
        lambda job_id: {
            "job_id": job_id,
            "merchant_id": "merchant-123",
            "request_id": "req-123",
            "status": "COMPLETED",
            "overall_result": {
                "status": "REQUIRES_REVIEW",
                "summary": "Manual review required.",
            },
            "cross_validation": {"legal_mode": "sociedad_mercantil"},
            "progress": {
                "stage": "cross_validation",
                "percentage": 100,
                "message": "Completed",
            },
            "request": {"documents": {"rif": [{"url": "https://example.com/rif.pdf"}]}},
            "documents": {"rif": []},
            "normalized_snapshot": {
                "rif_number": "J123456789",
                "primary_cedula_id": "V-12345678",
                "primary_cedula_expiration_date": "31/12/2030",
                "primary_cedula_is_expired": False,
                "primary_cedula_expiration_years": 0,
                "primary_cedula_policy_outcome": "valid",
            },
            "updated_at": "2026-03-29T00:00:00Z",
        },
    )

    response = client.get("/jobs/val_case123")

    assert response.status_code == 200
    assert "merchant-123" in response.text
    assert "Manual review required." in response.text
    assert "Raw JSON" in response.text
    assert "Current progress" in response.text
    assert "100%" in response.text
    assert "Back" in response.text
    assert "Cedula Policy" in response.text
    assert "31/12/2030" in response.text
    assert "Vigente" in response.text


def test_case_detail_json_returns_payload(monkeypatch) -> None:
    monkeypatch.setattr(
        webapp_main,
        "fetch_case",
        lambda job_id: {"job_id": job_id, "status": "COMPLETED"},
    )

    response = client.get("/jobs/val_case123/json")

    assert response.status_code == 200
    assert response.json() == {"job_id": "val_case123", "status": "COMPLETED"}

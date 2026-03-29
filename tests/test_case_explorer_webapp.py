"""Tests for the internal case explorer webapp."""

from fastapi.testclient import TestClient

from webapp.case_explorer import main as webapp_main


client = TestClient(webapp_main.app)


def test_home_page_renders_lookup_form() -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert "Case Lookup" in response.text
    assert "Open Case" in response.text


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
            "request": {"documents": {"rif": [{"url": "https://example.com/rif.pdf"}]}},
            "documents": {"rif": []},
            "normalized_snapshot": {"rif_number": "J123456789"},
            "updated_at": "2026-03-29T00:00:00Z",
        },
    )

    response = client.get("/jobs/val_case123")

    assert response.status_code == 200
    assert "merchant-123" in response.text
    assert "Manual review required." in response.text
    assert "Raw JSON" in response.text


def test_case_detail_json_returns_payload(monkeypatch) -> None:
    monkeypatch.setattr(
        webapp_main,
        "fetch_case",
        lambda job_id: {"job_id": job_id, "status": "COMPLETED"},
    )

    response = client.get("/jobs/val_case123/json")

    assert response.status_code == 200
    assert response.json() == {"job_id": "val_case123", "status": "COMPLETED"}

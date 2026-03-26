"""Comprehensive evals that exercise the internal pipeline with synthetic inputs."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from backend.shared.models.contracts import SubmitValidationRequest
from backend.shared.models.jobs import JobRecord
from backend.shared.repositories.in_memory_job_repository import InMemoryJobRepository
from backend.shared.services.document_intake import IntakeResult
from backend.shared.services.job_processor import JobProcessor


FIXTURES_DIR = Path(__file__).parent / "fixtures" / "comprehensive_evals"


class FixtureExtractor:
    def __init__(self, document_type: str, outputs: dict[str, dict]) -> None:
        self.document_type = document_type
        self.outputs = outputs

    def mock_extract(self, *, document_id: str | None, source_url: str) -> dict:
        _ = document_id
        _ = source_url
        return self.outputs[self.document_type]


class FixtureRegistry:
    def __init__(self, outputs: dict[str, dict]) -> None:
        self.outputs = outputs

    def get(self, document_type: str):
        if document_type not in self.outputs:
            raise NotImplementedError(f"No fixture extraction for {document_type}")
        return FixtureExtractor(document_type, self.outputs)


def _fixture_paths() -> list[Path]:
    return sorted(FIXTURES_DIR.glob("*.json"))


@pytest.mark.parametrize("fixture_path", _fixture_paths(), ids=lambda path: path.stem)
def test_comprehensive_eval_fixture(fixture_path: Path, monkeypatch) -> None:
    fixture = json.loads(fixture_path.read_text())
    request = SubmitValidationRequest.model_validate(fixture["request"])

    repository = InMemoryJobRepository()
    record = JobRecord(
        job_id=f"job_{fixture['name']}",
        merchant_id=request.merchant_id,
        request_id=request.request_id,
        request=request,
    )
    repository.save(record)

    processor = JobProcessor(repository=repository, mock_mode=True)
    processor.document_extraction.registry = FixtureRegistry(fixture["mock_extraction"])

    def fake_validate_url(url: str) -> IntakeResult:
        data = fixture["intake"][url]
        if "error_code" in data:
            return IntakeResult(
                ok=False,
                url=url,
                error_code=data["error_code"],
                message=data["message"],
            )
        return IntakeResult(
            ok=True,
            url=url,
            content_type=data["content_type"],
            content_length=data["content_length"],
        )

    monkeypatch.setattr(processor.document_intake, "validate_url", fake_validate_url)

    processor.process(record.job_id)
    updated = repository.get(record.job_id)

    assert updated is not None
    assert updated.overall_result is not None
    assert updated.overall_result.status == fixture["expected"]["overall_status"]

    if "cross_validation" in fixture["expected"]:
        checks = {check.code: check.status for check in updated.cross_validation.checks}
        assert checks.items() >= fixture["expected"]["cross_validation"].items()

    if "error_codes" in fixture["expected"]:
        assert updated.overall_result.error_codes == fixture["expected"]["error_codes"]

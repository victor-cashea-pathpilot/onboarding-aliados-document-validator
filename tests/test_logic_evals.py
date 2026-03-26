"""Logic-level regression evals over sanitized fixtures."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from backend.shared.models.contracts import DocumentsResult
from backend.shared.services.cross_validation import CrossValidationService
from backend.shared.services.document_normalization import DocumentNormalizationService


FIXTURES_DIR = Path(__file__).parent / "fixtures" / "logic_evals"


def _fixture_paths() -> list[Path]:
    return sorted(FIXTURES_DIR.glob("*.json"))


@pytest.mark.parametrize(
    "fixture_path",
    _fixture_paths(),
    ids=lambda path: path.stem,
)
def test_logic_eval_fixture(fixture_path: Path) -> None:
    fixture = json.loads(fixture_path.read_text())
    documents = DocumentsResult.model_validate(fixture["documents"])

    snapshot = DocumentNormalizationService().normalize(
        merchant_id=fixture["merchant_id"],
        documents=documents,
    )
    checks = {
        check.code: check.status
        for check in CrossValidationService().validate(snapshot)
    }

    expected = fixture["expected"]

    assert snapshot.normalization_status == expected["normalization_status"]
    assert snapshot.legal_mode == expected["legal_mode"]
    assert snapshot.company_record.company_name == expected["company_name"]
    assert snapshot.company_record.source_document_type == expected["company_source_document_type"]
    assert snapshot.primary_cedula_id == expected["primary_cedula_id"]
    assert snapshot.rif_number == expected["rif_number"]
    assert len(snapshot.representatives) == expected["representatives_count"]
    assert checks == expected["check_statuses"]

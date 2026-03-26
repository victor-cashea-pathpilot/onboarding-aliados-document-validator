"""Run real extraction evals against approved local documents.

This script is intentionally local-only. It reads approved document paths from an
ignored cases file, calls the real extractors through Vertex AI Gemini, and can:

- record a golden baseline
- verify current outputs against that baseline
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import mimetypes
from pathlib import Path
import sys
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.shared.clients.gemini import get_gemini_client
from backend.shared.extraction.registry import ExtractorRegistry


def _load_json(path: Path) -> dict:
    return json.loads(path.read_text())


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False))


def _guess_mime_type(file_path: Path, declared: str | None) -> str:
    if declared:
        return declared
    guessed, _ = mimetypes.guess_type(str(file_path))
    return guessed or "application/octet-stream"


def _extract_case(case: dict, registry: ExtractorRegistry, client) -> dict:
    file_path = Path(case["file_path"])
    if not file_path.exists():
        raise FileNotFoundError(f"Missing file for case {case['name']}: {file_path}")

    extractor = registry.get(case["document_type"])
    mime_type = _guess_mime_type(file_path, case.get("mime_type"))
    return extractor.extract(
        client=client,
        file_bytes=file_path.read_bytes(),
        mime_type=mime_type,
    )


def _normalize_leaf(value):
    if isinstance(value, str):
        lowered = value.strip().lower()
        without_accents = "".join(
            ch
            for ch in unicodedata.normalize("NFKD", lowered)
            if not unicodedata.combining(ch)
        )
        return " ".join(without_accents.split())
    return value


def _normalize_structure(value):
    if isinstance(value, dict):
        return {key: _normalize_structure(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [_normalize_structure(item) for item in value]
    return _normalize_leaf(value)


def _diff(expected, actual, prefix: str = "") -> list[str]:
    if isinstance(expected, dict) and isinstance(actual, dict):
        diffs: list[str] = []
        keys = sorted(set(expected) | set(actual))
        for key in keys:
            child_prefix = f"{prefix}.{key}" if prefix else key
            if key not in expected:
                diffs.append(f"+ {child_prefix}: {actual[key]!r}")
                continue
            if key not in actual:
                diffs.append(f"- {child_prefix}: {expected[key]!r}")
                continue
            diffs.extend(_diff(expected[key], actual[key], child_prefix))
        return diffs
    if isinstance(expected, list) and isinstance(actual, list):
        if len(expected) != len(actual):
            return [f"~ {prefix}: expected {len(expected)} items, got {len(actual)}"]
        diffs: list[str] = []
        for index, (left, right) in enumerate(zip(expected, actual)):
            child_prefix = f"{prefix}[{index}]"
            diffs.extend(_diff(left, right, child_prefix))
        return diffs
    if _normalize_structure(expected) != _normalize_structure(actual):
        return [f"~ {prefix}: expected {expected!r}, got {actual!r}"]
    return []


def record_baseline(cases_path: Path, baseline_path: Path) -> int:
    payload = _load_json(cases_path)
    cases = payload["cases"]
    registry = ExtractorRegistry()
    client = get_gemini_client()

    results = []
    for case in cases:
        actual = _extract_case(case, registry, client)
        results.append(
            {
                "name": case["name"],
                "document_type": case["document_type"],
                "file_path": case["file_path"],
                "mime_type": _guess_mime_type(Path(case["file_path"]), case.get("mime_type")),
                "expected_output": actual,
            }
        )
        print(f"[recorded] {case['name']}")

    _write_json(
        baseline_path,
        {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "cases": results,
        },
    )
    print(f"\nBaseline written to {baseline_path}")
    return 0


def verify_baseline(cases_path: Path, baseline_path: Path) -> int:
    payload = _load_json(cases_path)
    cases = payload["cases"]
    baseline = _load_json(baseline_path)
    baseline_by_name = {case["name"]: case for case in baseline["cases"]}

    registry = ExtractorRegistry()
    client = get_gemini_client()
    failures = 0

    for case in cases:
        if case["name"] not in baseline_by_name:
            print(f"[missing-baseline] {case['name']}")
            failures += 1
            continue

        expected = baseline_by_name[case["name"]]["expected_output"]
        actual = _extract_case(case, registry, client)
        diffs = _diff(expected, actual)
        if diffs:
            failures += 1
            print(f"[failed] {case['name']}")
            for diff in diffs:
                print(f"  {diff}")
        else:
            print(f"[passed] {case['name']}")

    print(f"\nSummary: {len(cases) - failures} passed, {failures} failed")
    return 1 if failures else 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run real extraction evals.")
    parser.add_argument(
        "mode",
        choices=("record", "verify"),
        help="Record a baseline or verify against it.",
    )
    parser.add_argument(
        "--cases",
        default=str(ROOT / ".real_eval_cases" / "cases.json"),
        help="Path to the local cases file.",
    )
    parser.add_argument(
        "--baseline",
        default=str(ROOT / ".real_eval_cases" / "baseline.json"),
        help="Path to the local baseline file.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    cases_path = Path(args.cases)
    baseline_path = Path(args.baseline)
    if not cases_path.exists():
        print(f"Cases file not found: {cases_path}")
        return 1

    if args.mode == "record":
        return record_baseline(cases_path, baseline_path)
    return verify_baseline(cases_path, baseline_path)


if __name__ == "__main__":
    raise SystemExit(main())

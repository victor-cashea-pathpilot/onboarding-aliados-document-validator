#!/usr/bin/env python3
"""Compare current Python and TypeScript stacks with the same real-file cases.

This script:
- generates fresh signed URLs from the shared GCS bucket
- submits the same payload to the current Python API and the TypeScript API
- polls both stacks until completion
- fetches the internal case payload for both jobs
- prints and stores a compact parity report
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any


DEFAULT_BUCKET = "onboarding-agent-e2e-docs-491322"
DEFAULT_SIGNER = "onboarding-api-runtime@onboarding-agent-491322.iam.gserviceaccount.com"
DEFAULT_REGION = "us-central1"
DEFAULT_DURATION = "2h"
DEFAULT_PYTHON_API = "https://onboarding-api-tp6jp4gvaa-uc.a.run.app"
DEFAULT_TS_API = "https://onboarding-api-ts-dev-tp6jp4gvaa-uc.a.run.app"
DEFAULT_TIMEOUT_SECONDS = 420
DEFAULT_POLL_SECONDS = 5
DEFAULT_REQUEST_TIMEOUT_SECONDS = 60


@dataclass(frozen=True)
class CaseDefinition:
    name: str
    merchant_prefix: str
    request_prefix: str
    documents: dict[str, list[tuple[str, str]]]


CASES: dict[str, CaseDefinition] = {
    "sociedad_mercantil": CaseDefinition(
        name="sociedad_mercantil",
        merchant_prefix="stack-compare-sociedad",
        request_prefix="stack-compare-sociedad",
        documents={
            "rif": [("rif-1", "sociedad_mercantil/RIF STILOS.pdf")],
            "cedula": [("ced-1", "sociedad_mercantil/Cedula-1.pdf")],
            "acta_constitutiva": [("acta-1", "sociedad_mercantil/Acta Constitutiva.pdf")],
            "acta_mercantil": [("merc-1", "sociedad_mercantil/ACTA ASAMBLEA  FREDLOU.pdf")],
            "certificado_emprendimiento": [],
        },
    ),
    "emprendimiento": CaseDefinition(
        name="emprendimiento",
        merchant_prefix="stack-compare-empr",
        request_prefix="stack-compare-empr",
        documents={
            "rif": [("rif-1", "emprendimiento/RaulParraRIF.pdf")],
            "cedula": [("ced-1", "emprendimiento/Cedula-RaulPArra.jpeg")],
            "acta_constitutiva": [],
            "acta_mercantil": [],
            "certificado_emprendimiento": [
                ("empr-1", "emprendimiento/RegistroNacionalEmprendimientos.pdf")
            ],
        },
    ),
    "firma_personal": CaseDefinition(
        name="firma_personal",
        merchant_prefix="stack-compare-firma",
        request_prefix="stack-compare-firma",
        documents={
            "rif": [("rif-1", "firma_personal/imprimircertificado.do (3) (6).pdf")],
            "cedula": [("ced-1", "firma_personal/17743555536814585080119185328022.jpg")],
            "acta_constitutiva": [("acta-1", "firma_personal/20260324_082805.pdf")],
            "acta_mercantil": [],
            "certificado_emprendimiento": [],
        },
    ),
}


def run(cmd: list[str]) -> str:
    return subprocess.check_output(cmd, text=True).strip()


def identity_token() -> str:
    return run(["gcloud", "auth", "print-identity-token"])


def sign_url(bucket: str, relative_path: str, signer: str, region: str, duration: str) -> str:
    output = run(
        [
            "gcloud",
            "storage",
            "sign-url",
            f"--impersonate-service-account={signer}",
            f"--region={region}",
            f"--duration={duration}",
            f"gs://{bucket}/{relative_path}",
            "--format=get(signed_url)",
        ]
    )
    return output.splitlines()[-1]


def request_json(
    method: str,
    url: str,
    *,
    token: str,
    payload: dict[str, Any] | None = None,
    request_timeout_seconds: int = DEFAULT_REQUEST_TIMEOUT_SECONDS,
) -> Any:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(url, data=data, method=method)
    request.add_header("Authorization", f"Bearer {token}")
    if data is not None:
        request.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(request, timeout=request_timeout_seconds) as response:
        return json.loads(response.read().decode("utf-8"))


def build_payload(
    case: CaseDefinition,
    *,
    bucket: str,
    signer: str,
    region: str,
    duration: str,
) -> dict[str, Any]:
    timestamp = int(time.time())
    documents: dict[str, list[dict[str, str]]] = {}
    for bucket_name, items in case.documents.items():
        documents[bucket_name] = [
            {
                "document_id": document_id,
                "url": sign_url(bucket, relative_path, signer, region, duration),
            }
            for document_id, relative_path in items
        ]

    return {
        "merchant_id": f"{case.merchant_prefix}-{timestamp}",
        "request_id": f"{case.request_prefix}-{timestamp}",
        "documents": documents,
        "metadata": {},
    }


def poll_status(
    base_url: str,
    token: str,
    job_id: str,
    timeout_seconds: int,
    poll_seconds: int,
    request_timeout_seconds: int,
) -> dict[str, Any]:
    started = time.time()
    while True:
        status_items = request_json(
            "POST",
            f"{base_url}/v1/onboarding/status",
            token=token,
            payload={"job_ids": [job_id]},
            request_timeout_seconds=request_timeout_seconds,
        )
        item = status_items[0]
        if item["status"] in {"COMPLETED", "FAILED"}:
            return item
        if time.time() - started > timeout_seconds:
            raise TimeoutError(f"Timed out waiting for job {job_id} on {base_url}")
        time.sleep(poll_seconds)


def fetch_case(
    base_url: str,
    token: str,
    job_id: str,
    request_timeout_seconds: int,
) -> dict[str, Any]:
    return request_json(
        "GET",
        f"{base_url}/internal/jobs/{job_id}",
        token=token,
        request_timeout_seconds=request_timeout_seconds,
    )


def extract_check_map(payload: dict[str, Any]) -> dict[str, str]:
    checks = payload.get("cross_validation", {}).get("checks", []) or []
    result: dict[str, str] = {}
    for check in checks:
        code = check.get("code")
        status = check.get("status")
        if isinstance(code, str) and isinstance(status, str):
            result[code] = status
    return result


def summary_from_case(payload: dict[str, Any]) -> dict[str, Any]:
    overall = payload.get("overall_result") or {}
    normalized = payload.get("normalized_snapshot") or {}
    company = normalized.get("companyRecord") or {}
    return {
        "job_id": payload.get("job_id"),
        "status": payload.get("status"),
        "overall_status": overall.get("status"),
        "overall_summary": overall.get("summary"),
        "legal_mode": normalized.get("legalMode") or normalized.get("legal_mode"),
        "board_source_document_id": company.get("boardSourceDocumentId"),
        "signature_source_document_id": company.get("signatureSourceDocumentId"),
        "cedula_policy_outcome": normalized.get("primaryCedulaPolicyOutcome"),
        "checks": extract_check_map(payload),
    }


def compare_case(name: str, python_case: dict[str, Any], ts_case: dict[str, Any]) -> dict[str, Any]:
    python_summary = summary_from_case(python_case)
    ts_summary = summary_from_case(ts_case)
    all_checks = sorted(set(python_summary["checks"]) | set(ts_summary["checks"]))
    check_diffs = {
        code: {
            "python": python_summary["checks"].get(code),
            "typescript": ts_summary["checks"].get(code),
        }
        for code in all_checks
        if python_summary["checks"].get(code) != ts_summary["checks"].get(code)
    }
    return {
        "case": name,
        "python": python_summary,
        "typescript": ts_summary,
        "diff": {
            "overall_status_equal": python_summary["overall_status"] == ts_summary["overall_status"],
            "legal_mode_equal": python_summary["legal_mode"] == ts_summary["legal_mode"],
            "cedula_policy_equal": python_summary["cedula_policy_outcome"] == ts_summary["cedula_policy_outcome"],
            "check_differences": check_diffs,
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Compare Python and TS stacks with real cases.")
    parser.add_argument(
        "--cases",
        nargs="+",
        default=["sociedad_mercantil", "emprendimiento", "firma_personal"],
        choices=sorted(CASES.keys()),
    )
    parser.add_argument("--python-api", default=DEFAULT_PYTHON_API)
    parser.add_argument("--ts-api", default=DEFAULT_TS_API)
    parser.add_argument("--bucket", default=DEFAULT_BUCKET)
    parser.add_argument("--signer", default=DEFAULT_SIGNER)
    parser.add_argument("--region", default=DEFAULT_REGION)
    parser.add_argument("--duration", default=DEFAULT_DURATION)
    parser.add_argument("--timeout-seconds", type=int, default=DEFAULT_TIMEOUT_SECONDS)
    parser.add_argument("--poll-seconds", type=int, default=DEFAULT_POLL_SECONDS)
    parser.add_argument(
        "--request-timeout-seconds",
        type=int,
        default=DEFAULT_REQUEST_TIMEOUT_SECONDS,
    )
    parser.add_argument(
        "--output",
        default=f"/tmp/python_ts_stack_comparison_{int(time.time())}.json",
    )
    args = parser.parse_args()

    token = identity_token()
    report: dict[str, Any] = {
        "python_api": args.python_api,
        "typescript_api": args.ts_api,
        "cases": [],
    }

    for case_name in args.cases:
        case = CASES[case_name]
        payload = build_payload(
            case,
            bucket=args.bucket,
            signer=args.signer,
            region=args.region,
            duration=args.duration,
        )
        print(f"[submit] {case_name}")
        python_submit = request_json(
            "POST",
            f"{args.python_api}/v1/onboarding/validate",
            token=token,
            payload=payload,
            request_timeout_seconds=args.request_timeout_seconds,
        )
        ts_submit = request_json(
            "POST",
            f"{args.ts_api}/v1/onboarding/validate",
            token=token,
            payload=payload,
            request_timeout_seconds=args.request_timeout_seconds,
        )

        python_job_id = python_submit["job_id"]
        ts_job_id = ts_submit["job_id"]

        print(f"[poll] {case_name}: python={python_job_id} typescript={ts_job_id}")
        python_status = poll_status(
            args.python_api,
            token,
            python_job_id,
            args.timeout_seconds,
            args.poll_seconds,
            args.request_timeout_seconds,
        )
        ts_status = poll_status(
            args.ts_api,
            token,
            ts_job_id,
            args.timeout_seconds,
            args.poll_seconds,
            args.request_timeout_seconds,
        )

        python_case = fetch_case(
            args.python_api,
            token,
            python_job_id,
            args.request_timeout_seconds,
        )
        ts_case = fetch_case(
            args.ts_api,
            token,
            ts_job_id,
            args.request_timeout_seconds,
        )

        case_report = compare_case(case_name, python_case, ts_case)
        case_report["python_status"] = python_status
        case_report["typescript_status"] = ts_status
        report["cases"].append(case_report)

        print(
            json.dumps(
                {
                    "case": case_name,
                    "python_job_id": python_job_id,
                    "typescript_job_id": ts_job_id,
                    "python_overall_status": case_report["python"]["overall_status"],
                    "typescript_overall_status": case_report["typescript"]["overall_status"],
                    "check_differences": case_report["diff"]["check_differences"],
                },
                indent=2,
            )
        )

    output_path = Path(args.output)
    output_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"WROTE {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

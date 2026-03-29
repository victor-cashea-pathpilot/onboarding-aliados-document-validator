"""Internal job detail endpoints for case exploration."""

from __future__ import annotations

import html
import json

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import HTMLResponse

from backend.shared.logging import get_logger, log_event
from backend.shared.models.contracts import CaseExplorerResponse
from backend.shared.services.job_service import get_job_service

router = APIRouter(prefix="/internal/jobs", tags=["internal"])
logger = get_logger(__name__)


def _render_json(data) -> str:
    """Render JSON as escaped HTML."""

    return html.escape(json.dumps(data, ensure_ascii=False, indent=2))


def _render_case_html(response: CaseExplorerResponse) -> str:
    """Render a simple HTML view for a case explorer record."""

    summary_rows = [
        ("Job ID", response.job_id),
        ("Merchant ID", response.merchant_id),
        ("Request ID", response.request_id or "-"),
        ("Status", response.status),
        (
            "Overall Result",
            response.overall_result.status if response.overall_result is not None else "-",
        ),
        (
            "Summary",
            response.overall_result.summary if response.overall_result is not None else "-",
        ),
        (
            "Legal Mode",
            response.cross_validation.legal_mode
            if response.cross_validation is not None
            and response.cross_validation.legal_mode is not None
            else "-",
        ),
        (
            "Updated At",
            response.updated_at.isoformat(),
        ),
    ]
    summary_html = "".join(
        (
            "<tr>"
            f"<th>{html.escape(label)}</th>"
            f"<td>{html.escape(str(value))}</td>"
            "</tr>"
        )
        for label, value in summary_rows
    )

    def section(title: str, body: str) -> str:
        return (
            '<section class="card">'
            f"<h2>{html.escape(title)}</h2>"
            f"{body}"
            "</section>"
        )

    request_html = section(
        "Sanitized Request",
        f"<pre>{_render_json(response.request.model_dump(mode='json'))}</pre>",
    )
    documents_html = section(
        "Documents Result",
        f"<pre>{_render_json(response.documents.model_dump(mode='json') if response.documents else {})}</pre>",
    )
    snapshot_html = section(
        "Normalized Snapshot",
        f"<pre>{_render_json(response.normalized_snapshot or {})}</pre>",
    )
    validation_html = section(
        "Cross Validation",
        f"<pre>{_render_json(response.cross_validation.model_dump(mode='json') if response.cross_validation else {})}</pre>",
    )

    return f"""<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Case Explorer · {html.escape(response.job_id)}</title>
    <style>
      :root {{
        color-scheme: light;
        --bg: #f4f1ea;
        --paper: #fffdf8;
        --ink: #1f1b16;
        --muted: #6a6258;
        --line: #d9d0c4;
        --accent: #1d5c4d;
        --accent-soft: #dcece7;
      }}
      * {{ box-sizing: border-box; }}
      body {{
        margin: 0;
        font-family: Georgia, "Iowan Old Style", serif;
        background: linear-gradient(180deg, #efe9de 0%, var(--bg) 100%);
        color: var(--ink);
      }}
      .page {{
        max-width: 1200px;
        margin: 0 auto;
        padding: 32px 20px 48px;
      }}
      .hero {{
        background: var(--paper);
        border: 1px solid var(--line);
        border-radius: 20px;
        padding: 24px;
        box-shadow: 0 8px 30px rgba(31, 27, 22, 0.05);
        margin-bottom: 20px;
      }}
      .eyebrow {{
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 12px;
        margin-bottom: 8px;
      }}
      h1 {{
        margin: 0 0 12px;
        font-size: 34px;
        line-height: 1.1;
      }}
      .status-pill {{
        display: inline-block;
        padding: 8px 12px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        font-weight: 700;
        font-size: 13px;
      }}
      .summary-table {{
        width: 100%;
        border-collapse: collapse;
        margin-top: 20px;
      }}
      .summary-table th,
      .summary-table td {{
        border-top: 1px solid var(--line);
        padding: 12px 0;
        text-align: left;
        vertical-align: top;
      }}
      .summary-table th {{
        width: 180px;
        color: var(--muted);
        font-weight: 600;
      }}
      .grid {{
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
        gap: 20px;
      }}
      .card {{
        background: var(--paper);
        border: 1px solid var(--line);
        border-radius: 20px;
        padding: 20px;
        box-shadow: 0 8px 30px rgba(31, 27, 22, 0.04);
      }}
      .card h2 {{
        margin: 0 0 14px;
        font-size: 18px;
      }}
      pre {{
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        font-family: "SFMono-Regular", Menlo, monospace;
        font-size: 12px;
        line-height: 1.5;
        color: #203033;
      }}
      .links {{
        margin-top: 16px;
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }}
      .links a {{
        color: var(--accent);
        text-decoration: none;
        font-weight: 600;
      }}
      @media (max-width: 640px) {{
        .summary-table th {{
          width: 120px;
        }}
      }}
    </style>
  </head>
  <body>
    <main class="page">
      <section class="hero">
        <div class="eyebrow">Case Explorer</div>
        <h1>{html.escape(response.merchant_id)}</h1>
        <div class="status-pill">{html.escape(response.status)}</div>
        <table class="summary-table">
          <tbody>
            {summary_html}
          </tbody>
        </table>
        <div class="links">
          <a href="/internal/jobs/{html.escape(response.job_id)}">Raw JSON</a>
        </div>
      </section>
      <section class="grid">
        {request_html}
        {documents_html}
        {snapshot_html}
        {validation_html}
      </section>
    </main>
  </body>
</html>
"""


@router.get("/{job_id}", response_model=CaseExplorerResponse)
async def get_job_detail(job_id: str) -> CaseExplorerResponse:
    """Return a sanitized and expanded job view for internal exploration."""

    response = get_job_service().get_case(job_id)
    if response is None:
        log_event(
            logger,
            "api.internal.job_detail.missing",
            job_id=job_id,
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found.",
        )

    log_event(
        logger,
        "api.internal.job_detail.returned",
        job_id=response.job_id,
        merchant_id=response.merchant_id,
        status=response.status,
    )
    return response


@router.get("/{job_id}/view", response_class=HTMLResponse)
async def get_job_detail_view(job_id: str) -> HTMLResponse:
    """Render a basic HTML case explorer for browser use."""

    response = get_job_service().get_case(job_id)
    if response is None:
        log_event(
            logger,
            "api.internal.job_detail_view.missing",
            job_id=job_id,
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found.",
        )

    log_event(
        logger,
        "api.internal.job_detail_view.returned",
        job_id=response.job_id,
        merchant_id=response.merchant_id,
        status=response.status,
    )
    return HTMLResponse(content=_render_case_html(response))

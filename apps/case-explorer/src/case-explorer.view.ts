function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

import type {
  CaseExplorerListResponse,
  CaseExplorerResponse,
  OverallResult,
  ProgressState,
} from '@contracts';

function formatDate(raw?: string | null): string {
  if (!raw) {
    return '—';
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return raw;
  }
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { font-family: Inter, system-ui, sans-serif; margin: 0; background: #f6f8fb; color: #182230; }
      .page { max-width: 1180px; margin: 0 auto; padding: 32px 24px 56px; }
      h1 { margin: 0; font-size: 32px; }
      p { color: #526071; }
      .topbar { display:flex; justify-content: space-between; align-items: end; gap: 16px; margin-bottom: 24px; }
      .card { background:#fff; border:1px solid #e6ebf2; border-radius: 18px; box-shadow: 0 10px 32px rgba(18,30,52,.06); }
      .metrics { display:grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 16px; margin-bottom:24px; }
      .metric { padding:18px 20px; }
      .metric strong { display:block; font-size:24px; margin-top:8px; }
      table { width:100%; border-collapse: collapse; }
      th, td { text-align:left; padding: 14px 16px; border-bottom:1px solid #edf1f7; vertical-align:top; }
      th { color:#526071; font-size: 12px; text-transform: uppercase; letter-spacing:.04em; }
      tr:hover { background:#fafcff; }
      .status { display:inline-flex; align-items:center; gap:8px; font-weight:600; }
      .dot { width:10px; height:10px; border-radius:999px; display:inline-block; }
      .status-approved .dot { background:#1bbf6b; }
      .status-review .dot { background:#f5a524; }
      .status-rejected .dot { background:#e5484d; }
      .status-processing .dot { background:#3b82f6; }
      .status-pending .dot { background:#94a3b8; }
      .subtle { color:#6b7a8c; font-size: 13px; }
      .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size:12px; }
      .search { border:1px solid #d7dfea; border-radius:12px; padding:12px 14px; width:280px; background:white; }
      .table-card { overflow:hidden; }
      .job-link { color: inherit; text-decoration:none; display:block; }
      .section { margin-bottom:24px; }
      .detail-grid { display:grid; grid-template-columns: 1.2fr .8fr; gap: 20px; }
      .panel { padding: 20px; }
      pre { white-space: pre-wrap; word-break: break-word; background:#f7f9fc; border:1px solid #e8edf6; border-radius: 14px; padding:16px; font-size:12px; }
      .back { color:#2563eb; text-decoration:none; font-weight:600; }
      .pill { display:inline-flex; align-items:center; gap:8px; border:1px solid #e0e7f2; border-radius:999px; padding: 8px 12px; font-size:12px; color:#526071; background:#fff; }
      .hero { display:grid; grid-template-columns: 1fr auto; gap: 20px; align-items:center; margin-bottom:24px; }
      .hero-actions { display:flex; gap:12px; flex-wrap: wrap; justify-content:end; }
      @media (max-width: 900px) {
        .metrics, .detail-grid { grid-template-columns: 1fr; }
        .search { width: 100%; }
        .topbar { flex-direction: column; align-items: stretch; }
        .hero { grid-template-columns: 1fr; }
        .hero-actions { justify-content:start; }
      }
    </style>
  </head>
  <body><div class="page">${body}</div></body>
</html>`;
}

function statusClass(status?: string | null, overallStatus?: string | null): string {
  if (status === 'PROCESSING') return 'status-processing';
  if (status === 'PENDING') return 'status-pending';
  if (overallStatus === 'APPROVED') return 'status-approved';
  if (overallStatus === 'REJECTED') return 'status-rejected';
  return 'status-review';
}

export function renderJobsPage(payload: CaseExplorerListResponse, query?: string): string {
  const items = Array.isArray(payload.items) ? payload.items : [];
  const stats = payload.stats ?? { outcomeCounts: { approved: 0, rejected: 0, requiresReview: 0 } };
  const body = `
    <div class="topbar">
      <div>
        <h1>TypeScript Case Explorer</h1>
        <p>Parallel validation UI for the migrating TypeScript stack. This view reads live case state from the TypeScript API.</p>
      </div>
      <form method="GET" action="/">
        <input class="search" type="search" name="q" value="${escapeHtml(query ?? '')}" placeholder="Search by job, merchant, request" />
      </form>
    </div>

    <div class="card panel hero">
      <div>
        <div class="subtle">Migration validation</div>
        <strong>TypeScript Case Explorer</strong>
        <div class="subtle">Current focus: browse live jobs and inspect the API-backed case payload while Phase 6 is in progress.</div>
      </div>
      <div class="hero-actions">
        <span class="pill">API-backed jobs list</span>
        <span class="pill">Live detail pages</span>
        <span class="pill">TS migration stage: Phase 6</span>
      </div>
    </div>

    <div class="metrics">
      <div class="card metric"><div class="subtle">Visible jobs</div><strong>${escapeHtml(items.length)}</strong></div>
      <div class="card metric"><div class="subtle">Cases last 24h</div><strong>${escapeHtml(stats.casesLast24h ?? 0)}</strong></div>
      <div class="card metric"><div class="subtle">Approved</div><strong>${escapeHtml(stats.outcomeCounts?.approved ?? 0)}</strong></div>
      <div class="card metric"><div class="subtle">Requires review</div><strong>${escapeHtml(stats.outcomeCounts?.requiresReview ?? 0)}</strong></div>
    </div>

    <div class="card table-card">
      <table>
        <thead>
          <tr>
            <th>Job</th>
            <th>Status</th>
            <th>Stage</th>
            <th>Legal mode</th>
            <th>Summary</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map(
              (item) => `
                <tr>
                  <td><a class="job-link mono" href="/jobs/${escapeHtml(item.jobId)}">${escapeHtml(item.jobId)}</a></td>
                  <td><span class="status ${statusClass(item.status, item.overallStatus)}"><span class="dot"></span>${escapeHtml(item.overallStatus ?? item.status)}</span></td>
                  <td>${escapeHtml(item.stage ?? '—')}</td>
                  <td>${escapeHtml(item.legalMode ?? 'unknown')}</td>
                  <td class="subtle">${escapeHtml(item.overallSummary ?? item.progressMessage ?? '—')}</td>
                  <td class="subtle">${escapeHtml(formatDate(item.updatedAt))}</td>
                </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;

  return shell('TypeScript Case Explorer', body);
}

export function renderJobPage(job: CaseExplorerResponse): string {
  const overall: Partial<OverallResult> = job.overallResult ?? {};
  const progress: ProgressState = job.progress ?? {
    stage: 'pending',
    percentage: 0,
    message: '',
  };
  const body = `
    <div class="section"><a class="back" href="/">← Back to jobs</a></div>
    <div class="topbar">
      <div>
        <h1>${escapeHtml(job.jobId)}</h1>
        <p>${escapeHtml(job.merchantId ?? '—')} · ${escapeHtml(overall.status ?? job.status)}</p>
      </div>
    </div>
    <div class="detail-grid">
      <div class="card panel">
        <div class="section">
          <div class="subtle">Stage</div>
          <strong>${escapeHtml(progress.stage ?? '—')}</strong>
          <div class="subtle">${escapeHtml(progress.message ?? '')}</div>
        </div>
        <div class="section">
          <div class="subtle">Overall summary</div>
          <strong>${escapeHtml(overall.summary ?? '—')}</strong>
        </div>
        <div class="section">
          <div class="subtle">Cross validation</div>
          <pre>${escapeHtml(JSON.stringify(job.crossValidation ?? null, null, 2))}</pre>
        </div>
      </div>
      <div class="card panel">
        <div class="section">
          <div class="subtle">Created</div>
          <strong>${escapeHtml(formatDate(job.createdAt))}</strong>
        </div>
        <div class="section">
          <div class="subtle">Updated</div>
          <strong>${escapeHtml(formatDate(job.updatedAt))}</strong>
        </div>
        <div class="section">
          <div class="subtle">Request</div>
          <pre>${escapeHtml(JSON.stringify(job.request ?? null, null, 2))}</pre>
        </div>
      </div>
    </div>
  `;

  return shell(`Job ${String(job.jobId ?? '')}`, body);
}

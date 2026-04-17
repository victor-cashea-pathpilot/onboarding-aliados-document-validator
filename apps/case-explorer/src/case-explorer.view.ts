import type {
  CaseExplorerListItem,
  CaseExplorerListResponse,
  CaseExplorerResponse,
  CrossValidationCheck,
  CrossValidationFinding,
  OverallResult,
  ProgressState,
} from '@contracts';
import {
  buildActaConstitutivaPrompt,
  buildActaMercantilPrompt,
  buildCedulaPrompt,
  buildCertificadoEmprendimientoPrompt,
  buildCrossValidationLlmPrompt,
  buildLegalAssessmentPrompt,
  buildRifPrompt,
} from '@domain';

type WorkflowNode = {
  id: string;
  title: string;
  kind: string;
  subtitle: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  stage: string;
  model?: string | null;
  prompt?: string | null;
  files: Array<{ documentId: string; documentType: string; url?: string | null }>;
  inputPayload: unknown;
  outputPayload: unknown;
};

type DocumentBucketItem = {
  documentId: string;
  status: string;
  confidence: number | null;
  extractedData: Record<string, unknown>;
  errors: unknown[];
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        --bg: #f6f8fb;
        --panel: #ffffff;
        --panel-alt: #f8fafc;
        --ink: #111827;
        --muted: #64748b;
        --line: #e5e7eb;
        --accent: #0f766e;
        --accent-soft: #ccfbf1;
        --success: #16a34a;
        --warning: #d97706;
        --danger: #dc2626;
        --info: #2563eb;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: linear-gradient(180deg, #ffffff 0%, var(--bg) 100%);
        color: var(--ink);
      }
      a { color: var(--accent); text-decoration: none; }
      a:hover { text-decoration: underline; }
      .page {
        max-width: 1440px;
        margin: 0 auto;
        padding: 28px 20px 48px;
      }
      .hero, .card {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 24px;
        box-shadow: 0 14px 38px rgba(15, 23, 42, 0.05);
      }
      .hero {
        padding: 24px;
        margin-bottom: 18px;
      }
      .back-link {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 14px;
        color: var(--muted);
        font-weight: 700;
      }
      .back-link:hover { color: var(--ink); text-decoration: none; }
      .hero-top, .toolbar, .header-row, .column-top, .workflow-head, .hero-actions {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        flex-wrap: wrap;
      }
      .eyebrow {
        color: var(--muted);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        font-weight: 700;
      }
      h1 {
        margin: 6px 0 8px;
        font-size: 32px;
        line-height: 1.05;
      }
      h2 {
        margin: 8px 0 12px;
        font-size: 20px;
      }
      h3 {
        margin: 0;
        font-size: 16px;
        line-height: 1.3;
      }
      .hero-copy, .subtle, .summary-copy, .progress-message {
        color: var(--muted);
        line-height: 1.55;
      }
      .pill, .stage-badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border-radius: 999px;
        padding: 8px 12px;
        font-size: 13px;
        font-weight: 700;
      }
      .pill {
        background: var(--accent-soft);
        color: var(--accent);
      }
      .metrics-grid, .detail-grid, .section-grid, .columns, .header-grid, .output-grid {
        display: grid;
        gap: 18px;
      }
      .metrics-grid {
        grid-template-columns: 1.3fr 1fr;
        margin-top: 22px;
      }
      .stats-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
      }
      .stat-card, .summary-card, .policy-item, .mini-card {
        background: var(--panel-alt);
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 16px;
      }
      .stat-card strong, .summary-card strong, .policy-item strong, .mini-card strong {
        display: block;
        font-size: 22px;
        line-height: 1.1;
      }
      .stat-card span, .summary-card span, .policy-item span, .mini-card span {
        display: block;
        margin-top: 6px;
        color: var(--muted);
        font-size: 13px;
      }
      .chart-card {
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 16px;
        display: grid;
        grid-template-columns: 140px 1fr;
        gap: 16px;
        align-items: center;
        background: var(--panel-alt);
      }
      .pie {
        width: 140px;
        height: 140px;
        border-radius: 50%;
        position: relative;
        margin: 0 auto;
      }
      .pie::after {
        content: "";
        position: absolute;
        inset: 24px;
        border-radius: 50%;
        background: white;
        border: 1px solid var(--line);
      }
      .legend {
        display: grid;
        gap: 10px;
      }
      .legend-row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
        font-size: 14px;
      }
      .legend-key, .status, .status-pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      .swatch, .dot {
        width: 10px;
        height: 10px;
        border-radius: 999px;
      }
      .toolbar { margin: 18px 0 12px; }
      .toolbar h2 { margin: 0; font-size: 24px; }
      .table-tools, .search-form, .pager, .pager-links {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .search-form input {
        width: 280px;
        max-width: 100%;
        padding: 10px 12px;
        border: 1px solid var(--line);
        border-radius: 12px;
        font-size: 14px;
      }
      button, .ghost-button, .copy-button {
        padding: 10px 14px;
        border-radius: 12px;
        border: 1px solid var(--line);
        background: var(--panel);
        color: var(--ink);
        cursor: pointer;
        font-weight: 700;
      }
      .ghost-button { text-decoration: none; }
      .card { padding: 0; overflow: hidden; }
      .panel { padding: 22px; }
      .table-wrap { overflow-x: auto; }
      .jobs-table {
        width: 100%;
        border-collapse: collapse;
      }
      .jobs-table th, .jobs-table td {
        border-top: 1px solid var(--line);
        padding: 14px 12px;
        text-align: left;
        vertical-align: top;
        font-size: 14px;
      }
      .jobs-table thead th {
        border-top: 0;
        color: var(--muted);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        background: #fbfcfe;
        position: sticky;
        top: 0;
        z-index: 1;
      }
      .jobs-table tbody tr {
        cursor: pointer;
        transition: background 120ms ease;
      }
      .jobs-table tbody tr:hover, .jobs-table tbody tr.is-active {
        background: #f8fffd;
      }
      .job-title { font-weight: 700; }
      .job-link {
        color: inherit;
        text-decoration: none;
      }
      .job-link:hover { text-decoration: none; }
      .status-pill {
        padding: 7px 11px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 700;
      }
      .status-pending { background: #fef3c7; color: #92400e; }
      .status-processing { background: #dbeafe; color: #1d4ed8; }
      .status-completed, .status-approved { background: #dcfce7; color: #166534; }
      .status-review { background: #ffedd5; color: #9a3412; }
      .status-rejected, .status-failed { background: #fee2e2; color: #b91c1c; }
      .status-info { background: #e0f2fe; color: #0c4a6e; }
      .progress-track {
        height: 8px;
        background: #e2e8f0;
        border-radius: 999px;
        overflow: hidden;
        margin-top: 8px;
      }
      .progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #14b8a6 0%, #0f766e 100%);
      }
      .pager {
        justify-content: space-between;
        padding: 18px 22px 22px;
        border-top: 1px solid var(--line);
      }
      .detail-grid {
        grid-template-columns: 1.25fr 0.85fr;
        margin-bottom: 18px;
      }
      .header-grid {
        grid-template-columns: 1.4fr 1fr;
        margin-top: 18px;
      }
      .info-card {
        border: 1px solid var(--line);
        border-radius: 20px;
        background: var(--panel-alt);
        padding: 18px;
      }
      .info-card .header-row {
        align-items: center;
        margin-bottom: 14px;
      }
      .info-card .summary-copy {
        font-size: 14px;
      }
      .result-tag {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 8px 12px;
        font-size: 12px;
        font-weight: 800;
      }
      .tab-shell { margin-bottom: 18px; }
      .tab-strip {
        display: inline-flex;
        gap: 8px;
        padding: 6px;
        border: 1px solid var(--line);
        border-radius: 16px;
        background: var(--panel);
        margin-bottom: 18px;
      }
      .tab-button {
        border: 0;
        background: transparent;
        padding: 10px 14px;
        border-radius: 12px;
        font-size: 14px;
        font-weight: 700;
        color: var(--muted);
      }
      .tab-button.active {
        background: var(--accent-soft);
        color: var(--accent);
      }
      .tab-panel { display: block; }
      .tab-panel.hidden { display: none; }
      .output-grid {
        grid-template-columns: 1.1fr 0.9fr;
        margin-bottom: 18px;
      }
      .output-summary-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        margin-top: 16px;
      }
      .json-caption {
        color: var(--muted);
        font-size: 13px;
        margin-bottom: 10px;
      }
      .section-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        margin-bottom: 18px;
      }
      .columns {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .workflow-card, .section-card { margin-bottom: 18px; }
      .node-rail {
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: minmax(240px, 280px);
        gap: 14px;
        overflow-x: auto;
        padding: 18px 22px 22px;
      }
      .node-button {
        border: 1px solid var(--line);
        border-radius: 20px;
        background: var(--panel-alt);
        padding: 16px;
        text-align: left;
        cursor: pointer;
        min-height: 172px;
      }
      .node-button.active {
        border-color: var(--accent);
        box-shadow: 0 0 0 2px rgba(15, 118, 110, 0.14);
      }
      .node-button h3 {
        margin: 10px 0 8px;
        font-size: 18px;
        line-height: 1.25;
      }
      .node-copy {
        color: var(--muted);
        font-size: 13px;
        line-height: 1.5;
      }
      .node-meta {
        display: grid;
        gap: 6px;
        margin-top: 12px;
        color: var(--muted);
        font-size: 12px;
      }
      .node-kind {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: var(--accent-soft);
        color: var(--accent);
        border-radius: 999px;
        padding: 6px 10px;
        font-size: 11px;
        font-weight: 700;
      }
      .column-top { margin-bottom: 12px; }
      .column-actions {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      .copy-button:hover {
        border-color: var(--accent);
        color: var(--accent);
      }
      .copy-feedback {
        color: var(--muted);
        font-size: 12px;
        min-width: 54px;
        text-align: right;
      }
      .json-shell {
        background: var(--panel-alt);
        border: 1px solid var(--line);
        border-radius: 16px;
        padding: 16px;
        max-height: 640px;
        overflow: auto;
      }
      pre {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        font-family: "SFMono-Regular", Menlo, monospace;
        font-size: 12px;
        line-height: 1.55;
        color: #1e293b;
      }
      .kv-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .kv-item {
        border: 1px solid var(--line);
        border-radius: 16px;
        background: var(--panel-alt);
        padding: 14px 16px;
      }
      .kv-item strong {
        display: block;
        font-size: 18px;
        line-height: 1.2;
      }
      .kv-item span {
        display: block;
        color: var(--muted);
        font-size: 12px;
        margin-top: 4px;
      }
      .document-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .document-card {
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 16px;
        background: var(--panel-alt);
      }
      .document-card h3 {
        margin: 0 0 6px;
        font-size: 18px;
      }
      .document-card ul, .findings-list, .checks-list {
        margin: 10px 0 0;
        padding-left: 18px;
      }
      .document-card li, .findings-list li, .checks-list li {
        margin: 6px 0;
        color: var(--muted);
      }
      .findings-list strong, .checks-list strong { color: var(--ink); }
      .file-list {
        display: grid;
        gap: 10px;
        margin-top: 14px;
      }
      .file-item {
        border: 1px solid var(--line);
        background: var(--panel-alt);
        border-radius: 14px;
        padding: 12px;
      }
      .file-item strong { display: block; }
      .empty { color: var(--muted); }
      .raw-link, .download-link {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      @media (max-width: 1180px) {
        .metrics-grid, .detail-grid, .columns, .section-grid, .document-grid, .header-grid, .output-grid { grid-template-columns: 1fr; }
        .stats-grid { grid-template-columns: 1fr; }
        .chart-card { grid-template-columns: 1fr; }
        .tab-strip { width: 100%; justify-content: stretch; }
        .tab-button { flex: 1; }
      }
    </style>
  </head>
  <body><main class="page">${body}</main></body>
</html>`;
}

function formatDate(raw?: string | null): string {
  if (!raw) return '—';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat('es-VE', {
    timeZone: 'America/Caracas',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatDuration(seconds?: number | null): string {
  if (seconds == null || Number.isNaN(seconds)) return '—';
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${minutes}m ${remaining}s`;
}

function statusClass(status?: string | null, overallStatus?: string | null): string {
  if (status === 'PROCESSING') return 'status-processing';
  if (status === 'PENDING') return 'status-pending';
  if (status === 'FAILED') return 'status-failed';
  if (overallStatus === 'APPROVED') return 'status-approved';
  if (overallStatus === 'REJECTED') return 'status-rejected';
  if (overallStatus === 'REQUIRES_REVIEW') return 'status-review';
  return 'status-info';
}

function pieChartStyle(
  approved: number,
  rejected: number,
  requiresReview: number,
): string {
  const total = approved + rejected + requiresReview;
  if (total <= 0) {
    return 'conic-gradient(#e2e8f0 0deg 360deg)';
  }
  const approvedPct = (approved / total) * 360;
  const rejectedPct = (rejected / total) * 360;
  return `conic-gradient(#16a34a 0deg ${approvedPct}deg, #dc2626 ${approvedPct}deg ${
    approvedPct + rejectedPct
  }deg, #d97706 ${approvedPct + rejectedPct}deg 360deg)`;
}

function getBucket(
  documents: Record<string, unknown> | null | undefined,
  ...keys: string[]
): DocumentBucketItem[] {
  for (const key of keys) {
    const bucket = documents?.[key];
    if (Array.isArray(bucket)) {
      return bucket.map((item) => {
        const object = asObject(item) ?? {};
        return {
          documentId: asString(object.document_id) ?? asString(object.documentId) ?? 'unknown',
          status: asString(object.status) ?? 'UNKNOWN',
          confidence: asNumber(object.confidence),
          extractedData:
            asObject(object.extracted_data) ?? asObject(object.extractedData) ?? {},
          errors: asArray(object.errors),
        };
      });
    }
  }
  return [];
}

function summarizeDocumentBucket(
  title: string,
  items: DocumentBucketItem[],
): {
  title: string;
  count: number;
  status: string;
  confidenceLabel: string;
  bulletPoints: string[];
} {
  if (items.length === 0) {
    return {
      title,
      count: 0,
      status: 'Not provided',
      confidenceLabel: '—',
      bulletPoints: ['No documents in this bucket.'],
    };
  }

  const status =
    items.find((item) => item.status !== 'APPROVED')?.status ?? 'APPROVED';
  const confidence = items[0]?.confidence ?? null;
  const extractedFields =
    asObject(items[0]?.extractedData?.extracted_fields) ??
    asObject(items[0]?.extractedData?.extractedFields) ??
    {};
  const bullets = Object.entries(extractedFields)
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${typeof value === 'object' ? '[object]' : String(value)}`);

  return {
    title,
    count: items.length,
    status,
    confidenceLabel: confidence == null ? '—' : `${confidence}%`,
    bulletPoints: bullets.length > 0 ? bullets : ['Structured extraction available in node output.'],
  };
}

function buildWorkflowNodes(job: CaseExplorerResponse): WorkflowNode[] {
  const requestDocuments = asObject(job.request?.documents as unknown) ?? {};
  const documents = asObject(job.documents as unknown) ?? {};
  const extractionPromptBuilders: Record<string, () => string> = {
    rif: buildRifPrompt,
    cedula: buildCedulaPrompt,
    acta_constitutiva: buildActaConstitutivaPrompt,
    acta_mercantil: buildActaMercantilPrompt,
    certificado_emprendimiento: buildCertificadoEmprendimientoPrompt,
  };
  const nodes: WorkflowNode[] = [
    {
      id: 'request',
      title: 'Case submission',
      kind: 'Request',
      subtitle: 'Original sanitized payload received by the API.',
      status: job.status === 'PENDING' ? 'processing' : 'completed',
      stage: 'submit',
      model: null,
      prompt: 'No LLM prompt. This node represents the request as received by the API.',
      files: [],
      inputPayload: job.request,
      outputPayload: {
        status: job.status,
        progress: job.progress ?? null,
      },
    },
  ];

  const bucketMappings: Array<{
    title: string;
    documentType: string;
    requestKeys: string[];
    resultKeys: string[];
    model: string;
  }> = [
    { title: 'RIF extraction', documentType: 'rif', requestKeys: ['rif'], resultKeys: ['rif'], model: 'Gemini 2.5 Flash' },
    { title: 'Cédula extraction', documentType: 'cedula', requestKeys: ['cedula'], resultKeys: ['cedula'], model: 'Gemini 2.5 Flash' },
    {
      title: 'Acta constitutiva extraction',
      documentType: 'acta_constitutiva',
      requestKeys: ['acta_constitutiva'],
      resultKeys: ['actaConstitutiva', 'acta_constitutiva'],
      model: 'Gemini 2.5 Pro',
    },
    {
      title: 'Acta mercantil extraction',
      documentType: 'acta_mercantil',
      requestKeys: ['acta_mercantil'],
      resultKeys: ['actaMercantil', 'acta_mercantil'],
      model: 'Gemini 2.5 Pro',
    },
    {
      title: 'Emprendimiento extraction',
      documentType: 'certificado_emprendimiento',
      requestKeys: ['certificado_emprendimiento'],
      resultKeys: ['certificadoEmprendimiento', 'certificado_emprendimiento'],
      model: 'Gemini 2.5 Pro',
    },
  ];

  for (const mapping of bucketMappings) {
    const requestFiles = mapping.requestKeys.flatMap((key) =>
      asArray(requestDocuments[key]).map((item) => {
        const object = asObject(item) ?? {};
        return {
          documentId:
            asString(object.document_id) ?? asString(object.documentId) ?? 'unknown',
          documentType: mapping.documentType,
          url: asString(object.url),
        };
      }),
    );
    const results = getBucket(documents, ...mapping.resultKeys);
    if (requestFiles.length === 0 && results.length === 0) {
      continue;
    }
    nodes.push({
      id: `extract-${mapping.documentType}`,
      title: mapping.title,
      kind: 'Extraction',
      subtitle:
        requestFiles.length > 0
          ? `${requestFiles.length} file(s) routed through ${mapping.model}.`
          : 'No files found in the request bucket.',
      status:
        job.progress?.stage === 'document_extraction' && requestFiles.length > 0
          ? 'processing'
          : results.some((item) => item.status === 'REJECTED')
            ? 'failed'
            : 'completed',
      stage: 'document_extraction',
      model: mapping.model,
      prompt: extractionPromptBuilders[mapping.documentType]?.() ?? null,
      files: requestFiles,
      inputPayload: { files: requestFiles, bucket: mapping.documentType },
      outputPayload: results,
    });
  }

  nodes.push({
    id: 'normalize',
    title: 'Normalization',
    kind: 'Transform',
    subtitle: 'Canonical merchant snapshot assembled from extracted evidence.',
    status:
      job.progress?.stage === 'document_normalization'
        ? 'processing'
        : job.normalizedSnapshot
          ? 'completed'
          : 'pending',
    stage: 'document_normalization',
    model: null,
    prompt: 'No LLM prompt. This node applies deterministic merge and precedence rules.',
    files: [],
    inputPayload: job.documents ?? {},
    outputPayload: job.normalizedSnapshot ?? {},
  });

  const crossValidation = asObject(job.crossValidation as unknown) ?? {};
  const legalMode =
    asString(crossValidation.legalMode) ??
    asString(asObject(job.normalizedSnapshot)?.legalMode) ??
    'unknown';
  nodes.push({
    id: 'rules',
    title: 'Deterministic cross-validation',
    kind: 'Rules',
    subtitle: 'Structured checks run against the normalized snapshot.',
    status:
      job.progress?.stage === 'cross_validation'
        ? 'processing'
        : Array.isArray(crossValidation.checks)
          ? 'completed'
          : 'pending',
    stage: 'cross_validation',
    model: null,
    prompt: 'No LLM prompt. These are deterministic policy checks and validation rules.',
    files: [],
    inputPayload: job.normalizedSnapshot ?? {},
    outputPayload: { checks: crossValidation.checks ?? [], findings: crossValidation.findings ?? [] },
  });

  nodes.push({
    id: 'llm-cross-validation',
    title: 'LLM cross-validation',
    kind: 'LLM',
    subtitle: 'Contextual review over normalized evidence.',
    status: crossValidation.llmCrossValidation ? 'completed' : 'pending',
    stage: 'cross_validation',
    model: 'Gemini 2.5 Pro',
    prompt: buildCrossValidationLlmPrompt(legalMode),
    files: [],
    inputPayload: {
      snapshot: job.normalizedSnapshot ?? {},
      checks: crossValidation.checks ?? [],
      legal_mode: legalMode,
    },
    outputPayload: crossValidation.llmCrossValidation ?? {},
  });

  nodes.push({
    id: 'llm-legal-assessment',
    title: 'LLM legal assessment',
    kind: 'LLM',
    subtitle: 'Final legal recommendation over the case snapshot.',
    status: crossValidation.llmLegalAssessment ? 'completed' : 'pending',
    stage: 'cross_validation',
    model: 'Gemini 2.5 Pro',
    prompt: buildLegalAssessmentPrompt(legalMode),
    files: [],
    inputPayload: {
      snapshot: job.normalizedSnapshot ?? {},
      checks: crossValidation.checks ?? [],
      legal_mode: legalMode,
    },
    outputPayload: crossValidation.llmLegalAssessment ?? {},
  });

  nodes.push({
    id: 'final-verdict',
    title: 'Final verdict',
    kind: 'Decision',
    subtitle: 'Overall recommendation stored in Firestore and returned by the API.',
    status:
      job.status === 'FAILED'
        ? 'failed'
        : job.status === 'COMPLETED'
          ? 'completed'
          : 'pending',
    stage: 'completed',
    model: null,
    prompt: 'No LLM prompt. This is the final persisted result after worker processing.',
    files: [],
    inputPayload: {
      normalizedSnapshot: job.normalizedSnapshot ?? {},
      crossValidation: job.crossValidation ?? {},
    },
    outputPayload: job.overallResult ?? {},
  });

  return nodes;
}

function buildCedulaPolicy(snapshot: Record<string, unknown> | null | undefined) {
  const source = snapshot ?? {};
  const outcome = asString(source.primaryCedulaPolicyOutcome) ?? 'unknown';
  const labels: Record<string, string> = {
    valid: 'Valid or within tolerance',
    expired_within_10_years: 'Expired within 10 years',
    expired_over_10_years: 'Expired over 10 years',
    unknown: 'Unknown / not extracted',
  };
  return {
    idNumber: asString(source.primaryCedulaId) ?? '—',
    expirationDate: asString(source.primaryCedulaExpirationDate) ?? '—',
    isExpired:
      typeof source.primaryCedulaIsExpired === 'boolean'
        ? source.primaryCedulaIsExpired
        : null,
    expirationYears: asNumber(source.primaryCedulaExpirationYears),
    policyOutcome: outcome,
    policyLabel: labels[outcome] ?? outcome,
  };
}

function renderChecks(checks: CrossValidationCheck[]): string {
  if (!checks.length) {
    return '<p class="subtle">No deterministic checks recorded.</p>';
  }
  return `<ul class="checks-list">
    ${checks
      .map(
        (check) => `<li><strong>${escapeHtml(check.code)}</strong> · ${escapeHtml(
          check.status,
        )} — ${escapeHtml(check.message)}</li>`,
      )
      .join('')}
  </ul>`;
}

function renderFindings(findings: CrossValidationFinding[]): string {
  if (!findings.length) {
    return '<p class="subtle">No findings recorded.</p>';
  }
  return `<ul class="findings-list">
    ${findings
      .map(
        (finding) => `<li><strong>${escapeHtml(finding.code)}</strong> · ${escapeHtml(
          finding.severity,
        )} — ${escapeHtml(finding.message)}</li>`,
      )
      .join('')}
  </ul>`;
}

function renderJobsPage(payload: CaseExplorerListResponse, query = ''): string {
  const items = Array.isArray(payload.items) ? payload.items : [];
  const stats = payload.stats ?? {
    casesLast24h: 0,
    p50DurationSeconds: null,
    p90DurationSeconds: null,
    outcomeCounts: { approved: 0, rejected: 0, requiresReview: 0 },
  };
  const chartStyle = pieChartStyle(
    stats.outcomeCounts.approved,
    stats.outcomeCounts.rejected,
    stats.outcomeCounts.requiresReview,
  );

  const body = `
    <section class="hero">
      <div class="hero-top">
        <div>
          <div class="eyebrow">Onboarding Case Explorer</div>
          <h1>Cases</h1>
          <p class="hero-copy">
            Navega jobs recientes, inspecciona la evidencia extraída y revisa cómo avanza cada caso por etapa.
          </p>
        </div>
      </div>

      <div class="metrics-grid">
        <div class="stats-grid">
          <article class="stat-card">
            <strong>${escapeHtml(stats.casesLast24h ?? 0)}</strong>
            <span>Cases last 24h</span>
          </article>
          <article class="stat-card">
            <strong>${escapeHtml(formatDuration(stats.p50DurationSeconds))}</strong>
            <span>p50 job duration</span>
          </article>
          <article class="stat-card">
            <strong>${escapeHtml(formatDuration(stats.p90DurationSeconds))}</strong>
            <span>p90 job duration</span>
          </article>
        </div>
        <article class="chart-card">
          <div class="pie" style="background: ${chartStyle};" aria-label="Outcome distribution pie chart"></div>
          <div class="legend">
            <div class="legend-row">
              <span class="legend-key"><span class="swatch" style="background:#16a34a;"></span>Approved</span>
              <strong>${escapeHtml(stats.outcomeCounts.approved)}</strong>
            </div>
            <div class="legend-row">
              <span class="legend-key"><span class="swatch" style="background:#dc2626;"></span>Rejected</span>
              <strong>${escapeHtml(stats.outcomeCounts.rejected)}</strong>
            </div>
            <div class="legend-row">
              <span class="legend-key"><span class="swatch" style="background:#d97706;"></span>Requires review</span>
              <strong>${escapeHtml(stats.outcomeCounts.requiresReview)}</strong>
            </div>
          </div>
        </article>
      </div>
    </section>

    <div class="toolbar">
      <div>
        <div class="eyebrow">Case Explorer</div>
        <h2>Recent jobs</h2>
      </div>
      <div class="table-tools">
        <form class="search-form" method="GET" action="/">
          <input type="search" name="q" value="${escapeHtml(query)}" placeholder="Search job, merchant, request or legal mode" />
          <button type="submit">Search</button>
        </form>
      </div>
    </div>

    <section class="card">
      <div class="table-wrap">
        <table class="jobs-table">
          <thead>
            <tr>
              <th>Job</th>
              <th>Status</th>
              <th>Progress / Stage</th>
              <th>Merchant</th>
              <th>Overall</th>
              <th>Legal mode</th>
              <th>Docs</th>
              <th>Duration</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            ${
              items.length === 0
                ? `<tr><td colspan="9" class="subtle">No jobs found.</td></tr>`
                : items
                    .map((item: CaseExplorerListItem) => {
                      const active = item.status === 'PENDING' || item.status === 'PROCESSING';
                      return `
                        <tr class="${active ? 'is-active' : ''}" role="link" tabindex="0"
                          onclick="window.location.href='/jobs/${escapeHtml(item.jobId)}'"
                          onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.location.href='/jobs/${escapeHtml(
                            item.jobId,
                          )}'}">
                          <td>
                            <div class="job-title"><a class="job-link" href="/jobs/${escapeHtml(
                              item.jobId,
                            )}">${escapeHtml(item.jobId)}</a></div>
                            <div class="subtle">${escapeHtml(item.requestId ?? '—')}</div>
                          </td>
                          <td>
                            <span class="status-pill ${statusClass(item.status, item.overallStatus)}">${escapeHtml(
                              item.status,
                            )}</span>
                          </td>
                          <td>
                            <div><strong>${escapeHtml(
                              item.progressPercentage == null ? '—' : `${item.progressPercentage}%`,
                            )}</strong></div>
                            <div class="subtle">${escapeHtml(item.stage ?? '—')}</div>
                            ${
                              active
                                ? `<div class="progress-track"><div class="progress-fill" style="width:${
                                    item.progressPercentage ?? 0
                                  }%;"></div></div>`
                                : ''
                            }
                            <div class="summary-copy">${escapeHtml(item.progressMessage ?? '—')}</div>
                          </td>
                          <td>${escapeHtml(item.merchantId)}</td>
                          <td>
                            <strong>${escapeHtml(item.overallStatus ?? '—')}</strong>
                            <div class="summary-copy">${escapeHtml(item.overallSummary ?? '—')}</div>
                          </td>
                          <td>${escapeHtml(item.legalMode ?? 'unknown')}</td>
                          <td>${escapeHtml(item.documentCount)}</td>
                          <td>${escapeHtml(formatDuration(item.durationSeconds))}</td>
                          <td>${escapeHtml(formatDate(item.updatedAt))}</td>
                        </tr>`;
                    })
                    .join('')
            }
          </tbody>
        </table>
      </div>
      <div class="pager">
        <div class="subtle">${escapeHtml(payload.totalItems)} matching jobs · page ${escapeHtml(
          payload.page,
        )}</div>
        <div class="pager-links">
          ${
            payload.page > 1
              ? `<a href="/?page=${payload.page - 1}&q=${encodeURIComponent(query)}">Previous</a>`
              : ''
          }
          ${
            payload.hasNext
              ? `<a href="/?page=${payload.page + 1}&q=${encodeURIComponent(query)}">Next</a>`
              : ''
          }
        </div>
      </div>
    </section>
  `;

  return shell('Onboarding Case Explorer', body);
}

function renderJobPage(job: CaseExplorerResponse, requestedTab?: string): string {
  const activeTab =
    requestedTab === 'explorer' || requestedTab === 'extras' ? requestedTab : 'output';
  const overall: Partial<OverallResult> = job.overallResult ?? {};
  const progress: ProgressState = job.progress ?? {
    stage: 'pending',
    percentage: 0,
    message: '',
  };
  const normalizedSnapshot = asObject(job.normalizedSnapshot as unknown) ?? {};
  const crossValidation = asObject(job.crossValidation as unknown) ?? {};
  const checks = asArray(crossValidation.checks) as CrossValidationCheck[];
  const findings = asArray(crossValidation.findings) as CrossValidationFinding[];
  const llmCrossValidation = asObject(crossValidation.llmCrossValidation);
  const llmLegalAssessment = asObject(crossValidation.llmLegalAssessment);
  const workflowNodes = buildWorkflowNodes(job);
  const workflowNodesJson = escapeHtml(JSON.stringify(workflowNodes));
  const cedulaPolicy = buildCedulaPolicy(normalizedSnapshot);
  const documents = asObject(job.documents as unknown) ?? {};
  const documentSummaries = [
    summarizeDocumentBucket('RIF', getBucket(documents, 'rif')),
    summarizeDocumentBucket('Cédula', getBucket(documents, 'cedula')),
    summarizeDocumentBucket(
      'Acta constitutiva',
      getBucket(documents, 'actaConstitutiva', 'acta_constitutiva'),
    ),
    summarizeDocumentBucket(
      'Acta mercantil',
      getBucket(documents, 'actaMercantil', 'acta_mercantil'),
    ),
    summarizeDocumentBucket(
      'Certificado de emprendimiento',
      getBucket(documents, 'certificadoEmprendimiento', 'certificado_emprendimiento'),
    ),
  ];
  const outputJson = {
    overallResult: job.overallResult ?? {},
    normalizedSnapshot: job.normalizedSnapshot ?? {},
    crossValidation: job.crossValidation ?? {},
  };
  const decisionTagClass = statusClass(undefined, overall.status);

  const body = `
    <section class="hero">
      <a class="back-link" href="/">← Back to cases</a>
      <div class="hero-top">
        <div>
          <div class="eyebrow">Onboarding Case Explorer</div>
          <h1>${escapeHtml(job.merchantId)}</h1>
          <div class="progress-message">${escapeHtml(job.jobId)} · ${escapeHtml(
            job.requestId ?? '—',
          )}</div>
        </div>
      </div>

      <div class="header-grid">
        <section class="info-card">
          <div class="header-row">
            <div>
              <div class="eyebrow">Merchant</div>
              <h2>Merchant information</h2>
            </div>
            <span class="result-tag ${decisionTagClass}">${escapeHtml(overall.status ?? job.status)}</span>
          </div>
          <div class="kv-grid">
            <article class="kv-item">
              <strong>${escapeHtml(job.merchantId)}</strong>
              <span>Merchant ID</span>
            </article>
            <article class="kv-item">
              <strong>${escapeHtml(job.requestId ?? '—')}</strong>
              <span>Request ID</span>
            </article>
            <article class="kv-item">
              <strong>${escapeHtml(asString(normalizedSnapshot.legalMode) ?? '—')}</strong>
              <span>Legal mode</span>
            </article>
            <article class="kv-item">
              <strong>${escapeHtml(String(documentSummaries.reduce((sum, item) => sum + item.count, 0)))}</strong>
              <span>Documents</span>
            </article>
          </div>
          <div class="hero-copy" style="margin-top:14px;">${escapeHtml(
            overall.summary ?? 'No overall summary available yet.',
          )}</div>
        </section>

        <section class="info-card">
          <div class="header-row">
            <div>
              <div class="eyebrow">Process</div>
              <h2>Process information</h2>
            </div>
            <span class="status-pill ${statusClass(job.status, overall.status)}">${escapeHtml(job.status)}</span>
          </div>
          <div class="kv-grid">
            <article class="kv-item">
              <strong>${escapeHtml(`${progress.percentage ?? 0}%`)}</strong>
              <span>Progress</span>
            </article>
            <article class="kv-item">
              <strong>${escapeHtml(progress.stage ?? '—')}</strong>
              <span>Current stage</span>
            </article>
            <article class="kv-item">
              <strong>${escapeHtml(formatDate(job.createdAt))}</strong>
              <span>Created</span>
            </article>
            <article class="kv-item">
              <strong>${escapeHtml(formatDate(job.updatedAt))}</strong>
              <span>Updated</span>
            </article>
          </div>
          <div class="progress-track" style="margin-top:14px;"><div class="progress-fill" style="width:${
            progress.percentage ?? 0
          }%;"></div></div>
          <div class="progress-message" style="margin-top:10px;">${escapeHtml(progress.message ?? 'No progress metadata available.')}</div>
        </section>
      </div>
    </section>

    <section class="tab-shell">
      <div class="tab-strip" role="tablist" aria-label="Case detail sections">
        <a class="tab-button ${activeTab === 'output' ? 'active' : ''}" href="/jobs/${escapeHtml(
          job.jobId,
        )}?tab=output" data-tab="output" aria-selected="${activeTab === 'output'}">Output</a>
        <a class="tab-button ${activeTab === 'explorer' ? 'active' : ''}" href="/jobs/${escapeHtml(
          job.jobId,
        )}?tab=explorer" data-tab="explorer" aria-selected="${activeTab === 'explorer'}">Explorer</a>
        <a class="tab-button ${activeTab === 'extras' ? 'active' : ''}" href="/jobs/${escapeHtml(
          job.jobId,
        )}?tab=extras" data-tab="extras" aria-selected="${activeTab === 'extras'}">Extras</a>
      </div>

      <section class="tab-panel ${activeTab !== 'output' ? 'hidden' : ''}" data-panel="output">
        <section class="output-grid">
          <section class="card section-card"><div class="panel">
            <div class="header-row">
              <div>
                <div class="eyebrow">Decision</div>
                <h2>Result</h2>
              </div>
              <span class="result-tag ${decisionTagClass}">${escapeHtml(overall.status ?? job.status)}</span>
            </div>
            <div class="hero-copy">${escapeHtml(
              overall.summary ?? 'No overall summary available yet.',
            )}</div>
            <div class="output-summary-grid">
              <article class="summary-card">
                <strong>${escapeHtml(asString(normalizedSnapshot.legalMode) ?? '—')}</strong>
                <span>Legal mode</span>
              </article>
              <article class="summary-card">
                <strong>${escapeHtml(`${progress.percentage ?? 0}%`)}</strong>
                <span>Progress</span>
              </article>
              <article class="summary-card">
                <strong>${escapeHtml(String(checks.length))}</strong>
                <span>Checks</span>
              </article>
              <article class="summary-card">
                <strong>${escapeHtml(String(findings.length))}</strong>
                <span>Findings</span>
              </article>
            </div>
          </div></section>

          <section class="card section-card"><div class="panel">
            <div class="header-row">
              <div>
                <div class="eyebrow">Output</div>
                <h2>Structured result</h2>
              </div>
              <a class="ghost-button raw-link" href="/jobs/${escapeHtml(job.jobId)}/json">Download API JSON</a>
            </div>
            <div class="json-caption">This is the final structured payload returned by the processing pipeline.</div>
            <div class="json-shell"><pre>${escapeHtml(
              JSON.stringify(outputJson, null, 2),
            )}</pre></div>
          </div></section>
        </section>

        <section class="section-grid">
          <section class="card section-card"><div class="panel">
            <div class="eyebrow">Validation summary</div>
            <h2>Decision checks</h2>
            ${renderChecks(checks)}
            <h2 style="margin-top:18px;">Findings</h2>
            ${renderFindings(findings)}
          </div></section>

          <section class="card section-card"><div class="panel">
            <div class="header-row">
              <div>
                <div class="eyebrow">Final analysis</div>
                <h2>Cross-validation</h2>
              </div>
              <span class="status-pill ${statusClass(undefined, asString(llmCrossValidation?.recommendation))}">${escapeHtml(
                asString(llmCrossValidation?.recommendation) ?? '—',
              )}</span>
            </div>
            <div class="json-shell"><pre>${escapeHtml(
              JSON.stringify(llmCrossValidation ?? {}, null, 2),
            )}</pre></div>
          </div></section>
        </section>
      </section>

      <section class="tab-panel ${activeTab !== 'explorer' ? 'hidden' : ''}" data-panel="explorer">
        <section class="card workflow-card">
          <div class="panel">
            <div class="workflow-head">
              <div>
                <div class="eyebrow">Monitor</div>
                <h2>Workflow explorer</h2>
              </div>
              <div class="progress-message">Select a node to inspect input, prompt and output.</div>
            </div>
          </div>
          <div class="node-rail">
            ${workflowNodes
              .map(
                (node, index) => `
                <button class="node-button ${index === 0 ? 'active' : ''}" type="button" data-node-id="${escapeHtml(
                  node.id,
                )}">
                  <span class="node-kind">${escapeHtml(node.kind)}</span>
                  <h3>${escapeHtml(node.title)}</h3>
                  <span class="status-pill ${statusClass(
                    node.status === 'processing'
                      ? 'PROCESSING'
                      : node.status === 'pending'
                        ? 'PENDING'
                        : node.status === 'failed'
                          ? 'FAILED'
                          : 'COMPLETED',
                  )}">${escapeHtml(node.status)}</span>
                  <div class="node-copy">${escapeHtml(node.subtitle)}</div>
                  <div class="node-meta">
                    <span><strong>Stage:</strong> ${escapeHtml(node.stage)}</span>
                    <span><strong>Model:</strong> ${escapeHtml(node.model ?? '—')}</span>
                    <span><strong>Files:</strong> ${escapeHtml(node.files.length)}</span>
                  </div>
                </button>`,
              )
              .join('')}
          </div>
        </section>

        <section class="columns">
          <section class="card"><div class="panel">
            <div class="column-top">
              <div>
                <div class="eyebrow">Node Input</div>
                <h2 id="input-title">Input</h2>
              </div>
              <div class="column-actions">
                <button type="button" class="copy-button" data-copy-target="input-json">⧉ Copy</button>
                <span id="input-copy-feedback" class="copy-feedback"></span>
              </div>
            </div>
            <div id="file-list" class="file-list"></div>
            <div class="json-shell"><pre id="input-json"></pre></div>
          </div></section>

          <section class="card"><div class="panel">
            <div class="column-top">
              <div>
                <div class="eyebrow">Prompt</div>
                <h2 id="prompt-title">Prompt</h2>
              </div>
              <div class="column-actions">
                <button type="button" class="copy-button" data-copy-target="prompt-text">⧉ Copy</button>
                <span id="prompt-copy-feedback" class="copy-feedback"></span>
              </div>
            </div>
            <div class="json-shell"><pre id="prompt-text"></pre></div>
          </div></section>

          <section class="card"><div class="panel">
            <div class="column-top">
              <div>
                <div class="eyebrow">Node Output</div>
                <h2 id="output-title">Output</h2>
              </div>
              <div class="column-actions">
                <button type="button" class="copy-button" data-copy-target="output-json">⧉ Copy</button>
                <span id="output-copy-feedback" class="copy-feedback"></span>
              </div>
            </div>
            <div class="json-shell"><pre id="output-json"></pre></div>
          </div></section>
        </section>
      </section>

      <section class="tab-panel ${activeTab !== 'extras' ? 'hidden' : ''}" data-panel="extras">
        <section class="section-grid">
          <section class="card section-card"><div class="panel">
            <div class="header-row">
              <div>
                <div class="eyebrow">Cedula Policy</div>
                <h2>Cédula policy</h2>
              </div>
              <span class="status-pill ${cedulaPolicy.policyOutcome === 'expired_over_10_years' ? 'status-failed' : cedulaPolicy.policyOutcome === 'unknown' ? 'status-pending' : 'status-approved'}">${escapeHtml(
                cedulaPolicy.policyLabel,
              )}</span>
            </div>
            <div class="kv-grid">
              <article class="kv-item"><strong>${escapeHtml(cedulaPolicy.idNumber)}</strong><span>Cédula</span></article>
              <article class="kv-item"><strong>${escapeHtml(cedulaPolicy.expirationDate)}</strong><span>Expiration date</span></article>
              <article class="kv-item"><strong>${escapeHtml(
                cedulaPolicy.isExpired == null ? '—' : cedulaPolicy.isExpired ? 'Sí' : 'No',
              )}</strong><span>Is expired</span></article>
              <article class="kv-item"><strong>${escapeHtml(
                cedulaPolicy.expirationYears == null ? '—' : cedulaPolicy.expirationYears,
              )}</strong><span>Years since expiration</span></article>
            </div>
          </div></section>

          <section class="card section-card"><div class="panel">
            <div class="eyebrow">Metadata</div>
            <h2>Process metadata</h2>
            <div class="kv-grid">
              <article class="kv-item"><strong>${escapeHtml(formatDate(job.createdAt))}</strong><span>Created</span></article>
              <article class="kv-item"><strong>${escapeHtml(formatDate(job.updatedAt))}</strong><span>Updated</span></article>
              <article class="kv-item"><strong>${escapeHtml(job.jobId)}</strong><span>Job ID</span></article>
              <article class="kv-item"><strong>${escapeHtml(job.status)}</strong><span>Status</span></article>
            </div>
          </div></section>
        </section>

        <section class="card section-card"><div class="panel">
          <div class="header-row">
            <div>
              <div class="eyebrow">Document evidence</div>
              <h2>Documents</h2>
            </div>
            <div class="pill">${escapeHtml(
              `${documentSummaries.reduce((sum, item) => sum + item.count, 0)} document(s)`,
            )}</div>
          </div>
          <div class="document-grid">
            ${documentSummaries
              .map(
                (summary) => `
                <article class="document-card">
                  <div class="header-row">
                    <h3>${escapeHtml(summary.title)}</h3>
                    <span class="status-pill ${summary.status === 'APPROVED' ? 'status-approved' : summary.status === 'REJECTED' ? 'status-failed' : summary.status === 'REQUIRES_REVIEW' ? 'status-review' : 'status-pending'}">${escapeHtml(
                      summary.status,
                    )}</span>
                  </div>
                  <div class="subtle">${escapeHtml(summary.count)} file(s) · confidence ${escapeHtml(
                    summary.confidenceLabel,
                  )}</div>
                  <ul>
                    ${summary.bulletPoints
                      .map((bullet) => `<li>${escapeHtml(bullet)}</li>`)
                      .join('')}
                  </ul>
                </article>`,
              )
              .join('')}
          </div>
        </div></section>
      </section>
    </section>
  `;

  return shell(`Job ${String(job.jobId ?? '')}`, body + `<script>
    const nodes = ${workflowNodesJson};
    function formatJson(value) {
      return JSON.stringify(value ?? {}, null, 2);
    }
    function renderFiles(files) {
      if (!files || files.length === 0) {
        return '<div class="file-item empty">No files attached to this node.</div>';
      }
      return files.map((file) => \`
        <article class="file-item">
          <strong>\${file.documentType || 'document'}</strong>
          <div>\${file.documentId || '-'}</div>
          <div class="progress-message">\${file.url || '-'}</div>
        </article>\`).join('');
    }
    function selectNode(nodeId) {
      const node = nodes.find((item) => item.id === nodeId) || nodes[0];
      if (!node) return;
      for (const button of document.querySelectorAll('.node-button')) {
        button.classList.toggle('active', button.dataset.nodeId === node.id);
      }
      document.getElementById('input-title').textContent = node.title;
      document.getElementById('prompt-title').textContent = node.title;
      document.getElementById('output-title').textContent = node.title;
      document.getElementById('file-list').innerHTML = renderFiles(node.files);
      document.getElementById('input-json').textContent = formatJson(node.inputPayload);
      document.getElementById('prompt-text').textContent = node.prompt || 'No prompt captured for this node.';
      document.getElementById('output-json').textContent = formatJson(node.outputPayload);
    }
    async function copyBlock(targetId) {
      const element = document.getElementById(targetId);
      const feedback = document.getElementById(\`\${targetId.split('-')[0]}-copy-feedback\`);
      if (!element) return;
      try {
        await navigator.clipboard.writeText(element.textContent || '');
        if (feedback) feedback.textContent = 'Copied';
      } catch {
        if (feedback) feedback.textContent = 'Failed';
      }
      setTimeout(() => {
        if (feedback) feedback.textContent = '';
      }, 1200);
    }
    for (const button of document.querySelectorAll('.node-button')) {
      button.addEventListener('click', () => selectNode(button.dataset.nodeId));
    }
    for (const button of document.querySelectorAll('.tab-button')) {
      button.addEventListener('click', () => {
        const tab = button.dataset.tab;
        for (const item of document.querySelectorAll('.tab-button')) {
          item.classList.toggle('active', item.dataset.tab === tab);
          item.setAttribute('aria-selected', String(item.dataset.tab === tab));
        }
        for (const panel of document.querySelectorAll('.tab-panel')) {
          panel.classList.toggle('hidden', panel.dataset.panel !== tab);
        }
      });
    }
    for (const button of document.querySelectorAll('.copy-button')) {
      button.addEventListener('click', () => copyBlock(button.dataset.copyTarget));
    }
    if (nodes.length > 0) {
      selectNode(nodes[0].id);
    }
  </script>`);
}

export { renderJobPage, renderJobsPage };

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  renderJobsPage,
  renderJobPage,
} = require('../../../dist/apps/case-explorer/apps/case-explorer/src/case-explorer.view.js');

test('renderJobsPage includes live job rows', () => {
  const html = renderJobsPage(
    {
      page: 1,
      pageSize: 20,
      hasNext: false,
      query: null,
      totalItems: 1,
      stats: {
        casesLast24h: 5,
        p50DurationSeconds: 12,
        p90DurationSeconds: 24,
        outcomeCounts: {
          approved: 1,
          rejected: 1,
          requiresReview: 3,
        },
      },
      items: [
        {
          jobId: 'val_123',
          merchantId: 'merchant-1',
          requestId: 'req-1',
          status: 'PROCESSING',
          overallStatus: null,
          overallSummary: null,
          legalMode: 'sociedad_mercantil',
          stage: 'document_extraction',
          progressPercentage: 65,
          progressMessage: 'Extracting docs',
          documentCount: 3,
          durationSeconds: null,
          createdAt: '2026-04-16T10:00:00Z',
          updatedAt: '2026-04-16T10:01:00Z',
        },
      ],
    },
    '',
  );

  assert.match(html, /Onboarding Case Explorer/);
  assert.match(html, /val_123/);
  assert.match(html, /document_extraction/);
  assert.match(html, /role="link"/);
  assert.match(html, /Recent jobs/);
  assert.match(html, /Cases last 24h/);
});

test('renderJobPage includes workflow monitor and document evidence panels', () => {
  const html = renderJobPage({
    jobId: 'val_abc',
    merchantId: 'merchant-1',
    requestId: 'req-1',
    status: 'COMPLETED',
    request: {
      merchantId: 'merchant-1',
      metadata: {},
      documents: {
        rif: [{ document_id: 'rif-1', url: 'https://example.com/rif.pdf' }],
        cedula: [],
        certificado_emprendimiento: [],
        acta_constitutiva: [],
        acta_mercantil: [],
      },
    },
    progress: { stage: 'completed', percentage: 100, message: 'Done' },
    overallResult: { status: 'APPROVED', summary: 'Approved' },
    documents: {
      rif: [
        {
          document_id: 'rif-1',
          status: 'APPROVED',
          confidence: 90,
          extracted_data: {
            extraction_prompt: 'RUNTIME RIF PROMPT',
            extracted_fields: {
              rif_number: 'J123',
              company_name: 'Merchant 1',
            },
          },
          errors: [],
        },
      ],
      cedula: [],
      certificado_emprendimiento: [],
      acta_constitutiva: [],
      acta_mercantil: [],
    },
    normalizedSnapshot: {
      legalMode: 'sociedad_mercantil',
      primaryCedulaPolicyOutcome: 'valid',
      primaryCedulaId: 'V-123',
    },
    crossValidation: {
      checks: [{ code: 'HAS_RIF', status: 'PASSED', message: 'RIF found' }],
      findings: [],
      llm_cross_validation: {
        recommendation: 'APPROVED',
        confidence: 0.9,
        summary: 'Looks good',
        prompt: 'RUNTIME CROSS VALIDATION PROMPT',
        findings: [],
      },
      llm_legal_assessment: {
        recommendation: 'APPROVED',
        confidence: 0.8,
        summary: 'Legal ok',
        prompt: 'RUNTIME LEGAL PROMPT',
        findings: [],
      },
    },
    monitoring: {
      queue_wait_ms: 800,
      processing_duration_ms: 59200,
      total_duration_ms: 60000,
      spans: [
        {
          id: 'queue_wait',
          label: 'Queue wait',
          kind: 'queue',
          started_at: '2026-04-16T10:00:00Z',
          ended_at: '2026-04-16T10:00:00.800Z',
          duration_ms: 800,
        },
        {
          id: 'document_extraction',
          label: 'Document extraction',
          kind: 'stage',
          started_at: '2026-04-16T10:00:01Z',
          ended_at: '2026-04-16T10:00:41Z',
          duration_ms: 40000,
        },
        {
          id: 'extraction:rif',
          label: 'RIF extraction',
          kind: 'document',
          parent_id: 'document_extraction',
          parallel_group: 'document_extraction',
          started_at: '2026-04-16T10:00:01Z',
          ended_at: '2026-04-16T10:00:05Z',
          duration_ms: 4000,
          metadata: { model: 'gemini-2.5-flash' },
        },
        {
          id: 'extraction:acta',
          label: 'Acta constitutiva extraction',
          kind: 'document',
          parent_id: 'document_extraction',
          parallel_group: 'document_extraction',
          started_at: '2026-04-16T10:00:01Z',
          ended_at: '2026-04-16T10:00:39Z',
          duration_ms: 38000,
          metadata: { model: 'gemini-2.5-pro' },
        },
      ],
    },
    createdAt: '2026-04-16T10:00:00Z',
    updatedAt: '2026-04-16T10:01:00Z',
  }, 'monitoring');

  assert.match(html, /Back to cases/);
  assert.match(html, /Approved/);
  assert.match(html, /Workflow/);
  assert.match(html, /Documents/);
  assert.match(html, /Final analysis/);
  assert.match(html, /Cédula policy/);
  assert.match(html, /Case submission/);
  assert.match(html, /RUNTIME RIF PROMPT/);
  assert.match(html, /RUNTIME CROSS VALIDATION PROMPT/);
  assert.match(html, /RUNTIME LEGAL PROMPT/);
  assert.match(html, /Execution timeline/);
  assert.match(html, /Timeline/);
  assert.match(html, /Pipeline stages/);
  assert.match(html, /Slowest extraction/);
  assert.match(html, /Acta constitutiva extraction/);
  assert.match(html, /Queue wait/);
  assert.match(html, /Span details/);
  assert.match(html, /const nodes = \[\{"id":"request"/);
  assert.doesNotMatch(html, /Prompt capture is not yet persisted/);
});

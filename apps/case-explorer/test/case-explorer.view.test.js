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

  assert.match(html, /TypeScript Case Explorer/);
  assert.match(html, /val_123/);
  assert.match(html, /document_extraction/);
  assert.match(html, /role="link"/);
  assert.match(html, /Open/);
});

test('renderJobPage includes request and cross-validation panels', () => {
  const html = renderJobPage({
    jobId: 'val_abc',
    merchantId: 'merchant-1',
    requestId: 'req-1',
    status: 'COMPLETED',
    request: { merchantId: 'merchant-1', metadata: {}, documents: {} },
    progress: { stage: 'completed', percentage: 100, message: 'Done' },
    overallResult: { status: 'APPROVED', summary: 'Approved' },
    documents: null,
    normalizedSnapshot: null,
    crossValidation: { checks: [] },
    createdAt: '2026-04-16T10:00:00Z',
    updatedAt: '2026-04-16T10:01:00Z',
  });

  assert.match(html, /Back to jobs/);
  assert.match(html, /Approved/);
  assert.match(html, /Cross validation/);
  assert.match(html, /Request/);
});

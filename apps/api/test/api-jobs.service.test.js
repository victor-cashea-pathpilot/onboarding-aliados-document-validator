const test = require('node:test');
const assert = require('node:assert/strict');

const { ApiJobsService } = require('../../../dist/apps/api/apps/api/src/api-jobs.service.js');
const { ValidationController } = require('../../../dist/apps/api/apps/api/src/validation.controller.js');

test('ApiJobsService.submit creates and dispatches a pending job', async () => {
  const saved = [];
  const dispatched = [];
  const repository = {
    async save(job) {
      saved.push(job);
      return job;
    },
    async get() {
      return null;
    },
    async update(job) {
      return job;
    },
    async listPage() {
      return { records: [], hasNext: false };
    },
  };
  const dispatcher = {
    async dispatch(job) {
      dispatched.push(job);
    },
  };

  const service = new ApiJobsService(repository, dispatcher);
  const response = await service.submit({
    merchant_id: 'merchant-1',
    request_id: 'request-1',
    metadata: {},
    documents: {
      rif: [{ url: 'https://example.com/rif.pdf', document_id: 'rif-1' }],
      cedula: [],
      certificado_emprendimiento: [],
      acta_constitutiva: [],
      acta_mercantil: [],
    },
  });

  assert.equal(response.status, 'PENDING');
  assert.equal(response.merchant_id, 'merchant-1');
  assert.equal(saved.length, 1);
  assert.equal(dispatched.length, 1);
  assert.equal(saved[0].jobId, response.job_id);
  assert.equal(dispatched[0].jobId, response.job_id);
});

test('ApiJobsService.getStatus returns pending placeholder for missing jobs', async () => {
  const repository = {
    async save(job) {
      return job;
    },
    async get() {
      return null;
    },
    async update(job) {
      return job;
    },
    async listPage() {
      return { records: [], hasNext: false };
    },
  };
  const dispatcher = {
    async dispatch() {},
  };

  const service = new ApiJobsService(repository, dispatcher);
  const result = await service.getStatus({
    job_ids: ['job-missing'],
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].job_id, 'job-missing');
  assert.equal(result[0].status, 'PENDING');
});

test('ApiJobsService.getCase sanitizes signed URLs', async () => {
  const repository = {
    async save(job) {
      return job;
    },
    async get() {
      return {
        jobId: 'job-1',
        merchantId: 'merchant-1',
        requestId: 'request-1',
        status: 'COMPLETED',
        pollCount: 0,
        request: {
          merchant_id: 'merchant-1',
          request_id: 'request-1',
          metadata: {},
          documents: {
            rif: [
              {
                url: 'https://example.com/file.pdf?X-Amz-Signature=secret&foo=bar',
                document_id: 'rif-1',
              },
            ],
            cedula: [],
            certificado_emprendimiento: [],
            acta_constitutiva: [],
            acta_mercantil: [],
          },
        },
        monitoring: {
          total_duration_ms: 1200,
          spans: [],
        },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:01:00.000Z',
      };
    },
    async update(job) {
      return job;
    },
    async listPage() {
      return { records: [], hasNext: false };
    },
  };
  const dispatcher = { async dispatch() {} };

  const service = new ApiJobsService(repository, dispatcher);
  const result = await service.getCase('job-1');

  assert.equal(
    result.request.documents.rif[0].url,
    'https://example.com/file.pdf',
  );
  assert.equal(result.monitoring.total_duration_ms, 1200);
});

test('ApiJobsService.listCases computes stats, legal mode fallback, and filtering', async () => {
  const repository = {
    async save(job) {
      return job;
    },
    async get() {
      return null;
    },
    async update(job) {
      return job;
    },
    async listPage(page, pageSize) {
      assert.equal(page, 1);
      assert.equal(pageSize, 500);
      return {
        hasNext: false,
        records: [
          {
            jobId: 'job-approved',
            merchantId: 'merchant-approved',
            requestId: 'request-approved',
            status: 'COMPLETED',
            pollCount: 0,
            request: {
              documents: {
                rif: [{}],
                cedula: [{}],
                certificado_emprendimiento: [],
                acta_constitutiva: [],
                acta_mercantil: [],
              },
            },
            progress: null,
            overallResult: { status: 'APPROVED', summary: 'ok' },
            normalizedSnapshot: { legalMode: 'sociedad_mercantil' },
            createdAt: '2026-04-16T09:00:00.000Z',
            updatedAt: '2026-04-16T09:00:20.000Z',
          },
          {
            jobId: 'job-review',
            merchantId: 'merchant-review',
            requestId: 'request-review',
            status: 'COMPLETED',
            pollCount: 0,
            request: {
              documents: {
                rif: [{}],
                cedula: [],
                certificado_emprendimiento: [],
                acta_constitutiva: [],
                acta_mercantil: [{}],
              },
            },
            progress: null,
            crossValidation: { legal_mode: 'firma_personal' },
            overallResult: { status: 'REQUIRES_REVIEW', summary: 'check' },
            createdAt: '2026-04-16T10:00:00.000Z',
            updatedAt: '2026-04-16T10:01:00.000Z',
          },
          {
            jobId: 'job-rejected',
            merchantId: 'merchant-rejected',
            requestId: 'request-rejected',
            status: 'FAILED',
            pollCount: 0,
            request: {
              documents: {
                rif: [],
                cedula: [{}],
                certificado_emprendimiento: [],
                acta_constitutiva: [],
                acta_mercantil: [],
              },
            },
            progress: null,
            overallResult: { status: 'REJECTED', summary: 'bad' },
            normalizedSnapshot: { legal_mode: 'emprendimiento' },
            createdAt: '2026-04-16T11:00:00.000Z',
            updatedAt: '2026-04-16T11:02:00.000Z',
          },
        ],
      };
    },
  };
  const dispatcher = { async dispatch() {} };
  const realNow = Date.now;
  Date.now = () => new Date('2026-04-16T12:00:00.000Z').getTime();

  try {
    const service = new ApiJobsService(repository, dispatcher);
    const result = await service.listCases(1, 10, 'firma_personal');

    assert.equal(result.total_items, 1);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].job_id, 'job-review');
    assert.equal(result.items[0].legal_mode, 'firma_personal');
    assert.equal(result.items[0].document_count, 2);
    assert.deepEqual(result.stats.outcome_counts, {
      approved: 1,
      rejected: 1,
      requires_review: 1,
    });
    assert.equal(result.stats.cases_last_24h, 3);
    assert.equal(result.stats.p50_duration_seconds, 60);
    assert.equal(result.stats.p90_duration_seconds, 120);
  } finally {
    Date.now = realNow;
  }
});

test('ValidationController.getJob raises not found when the case does not exist', async () => {
  const controller = new ValidationController({
    async getCase() {
      return null;
    },
  });

  await assert.rejects(
    controller.getJob('missing-job'),
    /missing-job/,
  );
});

const test = require('node:test');
const assert = require('node:assert/strict');

const { ApiJobsService } = require('../../../dist/apps/api/api-jobs.service.js');

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

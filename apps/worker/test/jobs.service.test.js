const test = require('node:test');
const assert = require('node:assert/strict');

const { ForbiddenException, NotFoundException } = require('@nestjs/common');
const {
  JobsService,
} = require('../../../dist/apps/worker/apps/worker/src/jobs.service.js');

function createLogger() {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
}

test('JobsService rejects invalid worker token when one is configured', async () => {
  const service = new JobsService(
    {
      async get() {
        throw new Error('should not load job');
      },
    },
    'expected-token',
    createLogger(),
  );

  await assert.rejects(
    () => service.processJob('job-1', 'wrong-token'),
    ForbiddenException,
  );
});

test('JobsService raises not found when the job is missing', async () => {
  const service = new JobsService(
    {
      async get() {
        return null;
      },
    },
    null,
    createLogger(),
  );

  await assert.rejects(() => service.processJob('missing-job', null), NotFoundException);
});

test('JobsService marks pending jobs as processing with initial progress', async () => {
  let updatedRecord = null;
  const repository = {
    async get() {
      return {
        jobId: 'job-123',
        merchantId: 'merchant-1',
        requestId: 'request-1',
        status: 'PENDING',
        pollCount: 0,
        request: {},
        createdAt: '2026-04-16T21:00:00.000Z',
        updatedAt: '2026-04-16T21:00:00.000Z',
      };
    },
    async update(record) {
      updatedRecord = record;
      return record;
    },
  };

  const service = new JobsService(repository, 'expected-token', createLogger());
  const response = await service.processJob('job-123', 'expected-token');

  assert.deepEqual(response, {
    job_id: 'job-123',
    status: 'accepted',
    message: 'TypeScript worker accepted the job and updated the initial processing state.',
  });

  assert.equal(updatedRecord.status, 'PROCESSING');
  assert.equal(updatedRecord.progress.stage, 'document_intake');
  assert.equal(updatedRecord.progress.percentage, 10);
});

test('JobsService leaves non-pending jobs unchanged', async () => {
  let updateCalled = false;
  const existing = {
    jobId: 'job-234',
    merchantId: 'merchant-2',
    requestId: null,
    status: 'PROCESSING',
    pollCount: 0,
    request: {},
    progress: {
      stage: 'document_extraction',
      percentage: 65,
      message: 'Already running.',
    },
    createdAt: '2026-04-16T21:00:00.000Z',
    updatedAt: '2026-04-16T21:01:00.000Z',
  };

  const repository = {
    async get() {
      return existing;
    },
    async update() {
      updateCalled = true;
      throw new Error('should not update');
    },
  };

  const service = new JobsService(repository, null, createLogger());
  const response = await service.processJob('job-234', null);

  assert.equal(updateCalled, false);
  assert.deepEqual(response, {
    job_id: 'job-234',
    status: 'accepted',
    message: 'TypeScript worker accepted the job and updated the initial processing state.',
  });
});

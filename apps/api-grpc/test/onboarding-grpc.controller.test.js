const test = require('node:test');
const assert = require('node:assert/strict');

const {
  OnboardingGrpcController,
} = require('../../../dist/apps/api-grpc/apps/api-grpc/src/onboarding-grpc.controller.js');

test('OnboardingGrpcController.getHealth returns service status', () => {
  const controller = new OnboardingGrpcController({
    async submit() {
      throw new Error('not used');
    },
    async getStatus() {
      throw new Error('not used');
    },
  });

  assert.deepEqual(controller.getHealth({}, undefined), {
    service: 'api-grpc',
    status: 'ok',
    phase: 'grpc-validation-api',
  });
});

test('OnboardingGrpcController.submitValidation forwards normalized payload to the jobs service', async () => {
  let seenPayload = null;
  const controller = new OnboardingGrpcController({
    async submit(payload) {
      seenPayload = payload;
      return {
        job_id: 'job-1',
        status: 'PENDING',
        merchant_id: payload.merchant_id,
        request_id: payload.request_id,
        created_at: '2026-04-30T00:00:00.000Z',
      };
    },
    async getStatus() {
      throw new Error('not used');
    },
  });

  const response = await controller.submitValidation({
    merchant_id: 'merchant-1',
    request_id: 'request-1',
    documents: {
      rif: [{ url: 'https://example.com/rif.pdf', document_id: 'rif-1' }],
    },
    metadata: {
      source: 'grpc-client',
    },
  });

  assert.equal(response.job_id, 'job-1');
  assert.equal(seenPayload.merchant_id, 'merchant-1');
  assert.equal(seenPayload.documents.rif.length, 1);
  assert.deepEqual(seenPayload.metadata, { source: 'grpc-client' });
});

test('OnboardingGrpcController.submitValidation rejects empty document submissions', async () => {
  const controller = new OnboardingGrpcController({
    async submit() {
      throw new Error('not used');
    },
    async getStatus() {
      throw new Error('not used');
    },
  });

  await assert.rejects(
    () =>
      controller.submitValidation({
        merchant_id: 'merchant-1',
        documents: {},
      }),
    /At least one document must be provided/,
  );
});

test('OnboardingGrpcController.getStatus wraps items in the gRPC response envelope', async () => {
  const controller = new OnboardingGrpcController({
    async submit() {
      throw new Error('not used');
    },
    async getStatus(payload) {
      assert.deepEqual(payload, { job_ids: ['job-1', 'job-2'] });
      return [
        {
          job_id: 'job-1',
          status: 'PENDING',
          merchant_id: 'merchant-1',
          has_progress: false,
          progress: {
            stage: '',
            percentage: 0,
            message: '',
          },
          has_overall_result: false,
          overall_result: {
            status: '',
            confidence: 0,
            summary: '',
            error_codes: [],
          },
          documents_json: '',
          cross_validation_json: '',
          created_at: '2026-04-30T00:00:00.000Z',
          updated_at: '2026-04-30T00:00:00.000Z',
        },
      ];
    },
  });

  const response = await controller.getStatus({ job_ids: ['job-1', 'job-2'] });

  assert.equal(response.items.length, 1);
  assert.equal(response.items[0].job_id, 'job-1');
});

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CloudTasksJobDispatcher,
} = require('../../../dist/packages/infrastructure/dispatchers/cloud-tasks-job-dispatcher.js');

function withEnv(values, run) {
  const previous = new Map();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }

  return Promise.resolve(run()).finally(() => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

test('CloudTasksJobDispatcher creates OIDC task payload', async () => {
  const createdTasks = [];
  const fakeClient = {
    queuePath(project, region, queueId) {
      return `projects/${project}/locations/${region}/queues/${queueId}`;
    },
    async createTask(request) {
      createdTasks.push(request);
      return [{}];
    },
  };

  const job = {
    jobId: 'job-123',
    merchantId: 'merchant-1',
    requestId: 'request-1',
    status: 'PENDING',
    pollCount: 0,
    request: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  await withEnv(
    {
      GCP_PROJECT_ID: 'demo-project',
      GCP_REGION: 'us-central1',
      CLOUD_TASKS_QUEUE_ID: 'onboarding-jobs',
      WORKER_BASE_URL: 'https://worker.example.com',
      CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL: 'tasks@example.com',
      WORKER_AUDIENCE: 'https://worker-audience.example.com',
      WORKER_AUTH_TOKEN: 'secret-token',
    },
    async () => {
      const dispatcher = new CloudTasksJobDispatcher(fakeClient);
      await dispatcher.dispatch(job);
    },
  );

  assert.equal(createdTasks.length, 1);
  const request = createdTasks[0];
  assert.equal(
    request.parent,
    'projects/demo-project/locations/us-central1/queues/onboarding-jobs',
  );

  const task = request.task;
  assert.equal(task.httpRequest.url, 'https://worker.example.com/internal/process-job');
  assert.equal(task.httpRequest.headers['Content-Type'], 'application/json');
  assert.equal(task.httpRequest.headers['X-Worker-Token'], 'secret-token');
  assert.equal(task.httpRequest.oidcToken.serviceAccountEmail, 'tasks@example.com');
  assert.equal(task.httpRequest.oidcToken.audience, 'https://worker-audience.example.com');

  const body = Buffer.from(task.httpRequest.body ?? '', 'base64').toString('utf8');
  assert.deepEqual(JSON.parse(body), { job_id: 'job-123' });
});

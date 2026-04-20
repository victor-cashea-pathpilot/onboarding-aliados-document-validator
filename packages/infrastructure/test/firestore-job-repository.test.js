const test = require('node:test');
const assert = require('node:assert/strict');

const {
  FirestoreJobRepository,
} = require('../../../dist/packages/infrastructure/infrastructure/src/repositories/firestore-job-repository.js');

function createFakeFirestore(seed = {}) {
  const store = new Map(Object.entries(seed));

  const collection = {
    doc(id) {
      return {
        async set(value) {
          store.set(id, value);
        },
        async get() {
          const value = store.get(id);
          return {
            exists: value !== undefined,
            data: () => value,
          };
        },
      };
    },
    orderBy() {
      return {
        offset(offset) {
          return {
            limit(limit) {
              return {
                async get() {
                  const docs = [...store.values()]
                    .sort((left, right) =>
                      String(right.updated_at ?? right.updatedAt).localeCompare(
                        String(left.updated_at ?? left.updatedAt),
                      ),
                    )
                    .slice(offset, offset + limit)
                    .map((value) => ({
                      data: () => value,
                    }));
                  return { docs };
                },
              };
            },
          };
        },
      };
    },
  };

  return {
    collection: () => collection,
  };
}

test('FirestoreJobRepository saves and loads jobs', async () => {
  const firestore = createFakeFirestore();
  const repository = new FirestoreJobRepository(firestore);

  const job = {
    jobId: 'job-1',
    merchantId: 'merchant-1',
    requestId: 'request-1',
    status: 'PENDING',
    pollCount: 0,
    request: { merchantId: 'merchant-1' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  await repository.save(job);
  assert.deepEqual(await storeValue(firestore, 'job-1'), {
    job_id: 'job-1',
    merchant_id: 'merchant-1',
    request_id: 'request-1',
    status: 'PENDING',
    poll_count: 0,
    request: { merchantId: 'merchant-1' },
    progress: null,
    overall_result: null,
    documents: null,
    normalized_snapshot: null,
    cross_validation: null,
    monitoring: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  });
  const loaded = await repository.get('job-1');

  assert.deepEqual(loaded, {
    ...job,
    progress: null,
    overallResult: null,
    documents: null,
    normalizedSnapshot: null,
    crossValidation: null,
    monitoring: null,
  });
});

test('FirestoreJobRepository paginates jobs ordered by updatedAt desc', async () => {
  const firestore = createFakeFirestore({
    'job-1': {
      job_id: 'job-1',
      merchant_id: 'merchant-1',
      status: 'COMPLETED',
      poll_count: 0,
      request: {},
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-03T00:00:00.000Z',
    },
    'job-2': {
      job_id: 'job-2',
      merchant_id: 'merchant-2',
      status: 'COMPLETED',
      poll_count: 0,
      request: {},
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-02T00:00:00.000Z',
    },
    'job-3': {
      job_id: 'job-3',
      merchant_id: 'merchant-3',
      status: 'COMPLETED',
      poll_count: 0,
      request: {},
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
  });

  const repository = new FirestoreJobRepository(firestore);
  const page = await repository.listPage(1, 2);

  assert.equal(page.records.length, 2);
  assert.equal(page.records[0].jobId, 'job-1');
  assert.equal(page.records[1].jobId, 'job-2');
  assert.equal(page.hasNext, true);
});

function storeValue(firestore, id) {
  return firestore.collection().doc(id).get().then((snapshot) => snapshot.data());
}

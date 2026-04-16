import { Firestore, Timestamp } from '@google-cloud/firestore';
import type { JobRecord } from '@domain';
import { getInfrastructureSettings } from '../config/settings';
import type { JobRepository } from './job-repository';

function parseDate(value: unknown): string | undefined {
  if (!value) {
    return undefined;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate: unknown }).toDate === 'function'
  ) {
    const timestampLike = value as { toDate: () => Date };
    return timestampLike.toDate().toISOString();
  }

  return undefined;
}

export class FirestoreJobRepository implements JobRepository {
  private readonly firestore: Firestore;
  private readonly collectionName: string;

  constructor(firestore?: Firestore) {
    const settings = getInfrastructureSettings();
    this.firestore =
      firestore ??
      new Firestore({
        projectId: settings.gcpProjectId,
        databaseId: settings.firestoreDatabase,
      });
    this.collectionName = settings.firestoreCollection;
  }

  async save(job: JobRecord): Promise<JobRecord> {
    await this.collection().doc(job.jobId).set(this.serialize(job));
    return job;
  }

  async get(jobId: string): Promise<JobRecord | null> {
    const snapshot = await this.collection().doc(jobId).get();
    if (!snapshot.exists) {
      return null;
    }

    return this.deserialize(snapshot.data() ?? {});
  }

  async update(job: JobRecord): Promise<JobRecord> {
    await this.collection().doc(job.jobId).set(this.serialize(job));
    return job;
  }

  async listPage(page: number, pageSize: number): Promise<{ records: JobRecord[]; hasNext: boolean }> {
    const offset = Math.max(page - 1, 0) * pageSize;
    const snapshots = await this.collection()
      .orderBy('updated_at', 'desc')
      .offset(offset)
      .limit(pageSize + 1)
      .get();

    const records = snapshots.docs.map((document) => this.deserialize(document.data() ?? {}));
    return {
      records: records.slice(0, pageSize),
      hasNext: records.length > pageSize,
    };
  }

  private collection() {
    return this.firestore.collection(this.collectionName);
  }

  private serialize(job: JobRecord): Record<string, unknown> {
    return {
      job_id: job.jobId,
      merchant_id: job.merchantId,
      request_id: job.requestId ?? null,
      status: job.status,
      poll_count: job.pollCount,
      request: job.request,
      progress: job.progress ?? null,
      overall_result: job.overallResult ?? null,
      documents: job.documents ?? null,
      normalized_snapshot: job.normalizedSnapshot ?? null,
      cross_validation: job.crossValidation ?? null,
      created_at: job.createdAt,
      updated_at: job.updatedAt,
    };
  }

  private deserialize(data: Record<string, unknown>): JobRecord {
    const jobId = data.job_id ?? data.jobId;
    const merchantId = data.merchant_id ?? data.merchantId;
    const requestId = data.request_id ?? data.requestId;
    const pollCount = data.poll_count ?? data.pollCount ?? 0;
    const overallResult = data.overall_result ?? data.overallResult ?? null;
    const normalizedSnapshot = data.normalized_snapshot ?? data.normalizedSnapshot ?? null;
    const crossValidation = data.cross_validation ?? data.crossValidation ?? null;
    const createdAt = data.created_at ?? data.createdAt;
    const updatedAt = data.updated_at ?? data.updatedAt;

    return {
      jobId: String(jobId),
      merchantId: String(merchantId),
      status: data.status as JobRecord['status'],
      pollCount: Number(pollCount),
      request: (data.request ?? {}) as Record<string, unknown>,
      requestId: (requestId as string | null | undefined) ?? null,
      progress: (data.progress as JobRecord['progress']) ?? null,
      overallResult: (overallResult as JobRecord['overallResult']) ?? null,
      documents: (data.documents as JobRecord['documents']) ?? null,
      normalizedSnapshot: (normalizedSnapshot as JobRecord['normalizedSnapshot']) ?? null,
      crossValidation: (crossValidation as JobRecord['crossValidation']) ?? null,
      createdAt: parseDate(createdAt) ?? new Date().toISOString(),
      updatedAt: parseDate(updatedAt) ?? new Date().toISOString(),
    };
  }
}

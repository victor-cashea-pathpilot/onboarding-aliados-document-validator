import { Firestore, Timestamp } from '@google-cloud/firestore';
import type { JobRecord } from '@domain/job';
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
      .orderBy('updatedAt', 'desc')
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
      ...job,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }

  private deserialize(data: Record<string, unknown>): JobRecord {
    return {
      ...data,
      jobId: String(data.jobId),
      merchantId: String(data.merchantId),
      status: data.status as JobRecord['status'],
      pollCount: Number(data.pollCount ?? 0),
      request: (data.request ?? {}) as Record<string, unknown>,
      requestId: (data.requestId as string | null | undefined) ?? null,
      progress: (data.progress as JobRecord['progress']) ?? null,
      overallResult: (data.overallResult as JobRecord['overallResult']) ?? null,
      documents: (data.documents as JobRecord['documents']) ?? null,
      normalizedSnapshot:
        (data.normalizedSnapshot as JobRecord['normalizedSnapshot']) ?? null,
      crossValidation: (data.crossValidation as JobRecord['crossValidation']) ?? null,
      createdAt: parseDate(data.createdAt) ?? new Date().toISOString(),
      updatedAt: parseDate(data.updatedAt) ?? new Date().toISOString(),
    };
  }
}

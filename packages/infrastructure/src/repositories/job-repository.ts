import type { JobRecord } from '@domain/job';

export interface JobRepository {
  save(job: JobRecord): Promise<JobRecord>;
  get(jobId: string): Promise<JobRecord | null>;
  update(job: JobRecord): Promise<JobRecord>;
  listPage(page: number, pageSize: number): Promise<{
    records: JobRecord[];
    hasNext: boolean;
  }>;
}

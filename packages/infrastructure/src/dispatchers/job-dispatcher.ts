import type { JobRecord } from '@domain/job';

export interface JobDispatcher {
  dispatch(job: JobRecord): Promise<void>;
}

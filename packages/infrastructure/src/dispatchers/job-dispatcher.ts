import type { JobRecord } from '@domain';

export interface JobDispatcher {
  dispatch(job: JobRecord): Promise<void>;
}

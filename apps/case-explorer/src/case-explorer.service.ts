import { Injectable } from '@nestjs/common';
import type { CaseExplorerListResponse, CaseExplorerResponse } from '@contracts';
import { CaseExplorerClient } from './case-explorer.client';

@Injectable()
export class CaseExplorerService {
  constructor(private readonly client: CaseExplorerClient) {}

  listJobs(query?: string): Promise<CaseExplorerListResponse> {
    return this.client.listJobs(query);
  }

  getJob(jobId: string): Promise<CaseExplorerResponse> {
    return this.client.getJob(jobId);
  }
}

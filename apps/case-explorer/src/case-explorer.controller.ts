import { Controller, Get, NotFoundException, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CaseExplorerService } from './case-explorer.service';
import { renderJobPage, renderJobsPage } from './case-explorer.view';

@Controller()
export class CaseExplorerController {
  constructor(private readonly caseExplorerService: CaseExplorerService) {}

  @Get()
  async getHome(@Query('q') query: string | undefined, @Res() response: Response) {
    const payload = await this.caseExplorerService.listJobs(query);
    response.type('html').send(renderJobsPage(payload, query));
  }

  @Get('/jobs/:jobId')
  async getJob(@Param('jobId') jobId: string, @Res() response: Response) {
    try {
      const job = await this.caseExplorerService.getJob(jobId);
      response.type('html').send(renderJobPage(job));
    } catch (error) {
      if (error instanceof Error && error.message.includes(': 404')) {
        throw new NotFoundException(`Job '${jobId}' was not found.`);
      }
      throw error;
    }
  }

  @Get('/jobs/:jobId/json')
  async getJobJson(@Param('jobId') jobId: string, @Res() response: Response) {
    try {
      const job = await this.caseExplorerService.getJob(jobId);
      response.type('application/json').send(job);
    } catch (error) {
      if (error instanceof Error && error.message.includes(': 404')) {
        throw new NotFoundException(`Job '${jobId}' was not found.`);
      }
      throw error;
    }
  }
}

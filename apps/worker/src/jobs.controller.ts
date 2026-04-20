import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ProcessJobDto } from './dto/process-job.dto';
import { JobsService } from './jobs.service';

@Controller('internal')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post('process-job')
  processJob(
    @Body() body: ProcessJobDto,
    @Headers('x-worker-token') workerToken?: string,
  ) {
    return this.jobsService.processJob(body.job_id, workerToken ?? null);
  }
}

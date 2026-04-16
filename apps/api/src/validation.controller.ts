import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiJobsService } from './api-jobs.service';
import {
  StatusRequestDto,
  SubmitValidationRequestDto,
} from './dto/validation.dto';

@Controller()
export class ValidationController {
  constructor(private readonly jobsService: ApiJobsService) {}

  @Post('/v1/onboarding/validate')
  @HttpCode(HttpStatus.ACCEPTED)
  async submitValidation(@Body() payload: SubmitValidationRequestDto) {
    const total =
      payload.documents.rif.length +
      payload.documents.cedula.length +
      payload.documents.certificado_emprendimiento.length +
      payload.documents.acta_constitutiva.length +
      payload.documents.acta_mercantil.length;

    if (total === 0) {
      throw new BadRequestException('At least one document must be provided.');
    }

    return this.jobsService.submit(payload);
  }

  @Post('/v1/onboarding/status')
  async getStatus(@Body() payload: StatusRequestDto) {
    return this.jobsService.getStatus(payload);
  }

  @Get('/internal/jobs/:jobId')
  async getJob(@Param('jobId') jobId: string) {
    return this.jobsService.getCase(jobId);
  }

  @Get('/internal/jobs')
  async listJobs(
    @Query('page') page?: string,
    @Query('page_size') pageSize?: string,
    @Query('q') query?: string,
  ) {
    const parsedPage = Number(page ?? '1');
    const parsedPageSize = Number(pageSize ?? '20');
    return this.jobsService.listCases(parsedPage, parsedPageSize, query);
  }
}

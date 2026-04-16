import { IsString } from 'class-validator';

export class ProcessJobDto {
  @IsString()
  job_id!: string;
}

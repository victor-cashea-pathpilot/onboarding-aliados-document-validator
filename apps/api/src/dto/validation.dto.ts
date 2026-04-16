import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class DocumentReferenceDto {
  @IsUrl({ require_tld: false })
  url!: string;

  @IsOptional()
  @IsString()
  document_id?: string | null;
}

export class DocumentsPayloadDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DocumentReferenceDto)
  rif: DocumentReferenceDto[] = [];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DocumentReferenceDto)
  cedula: DocumentReferenceDto[] = [];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DocumentReferenceDto)
  certificado_emprendimiento: DocumentReferenceDto[] = [];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DocumentReferenceDto)
  acta_constitutiva: DocumentReferenceDto[] = [];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DocumentReferenceDto)
  acta_mercantil: DocumentReferenceDto[] = [];
}

export class SubmitValidationRequestDto {
  @IsString()
  merchant_id!: string;

  @IsOptional()
  @IsString()
  request_id?: string | null;

  @ValidateNested()
  @Type(() => DocumentsPayloadDto)
  documents!: DocumentsPayloadDto;

  @IsObject()
  metadata: Record<string, string> = {};
}

export class StatusRequestDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  job_ids!: string[];
}

export class ProgressInfoDto {
  @IsString()
  stage!: string;

  @IsInt()
  @Min(0)
  percentage!: number;

  @IsString()
  message!: string;
}

export class StatusResponseItemDto {
  @IsString()
  job_id!: string;

  @IsIn(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'])
  status!: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

  @IsOptional()
  @IsString()
  merchant_id?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProgressInfoDto)
  progress?: ProgressInfoDto | null;

  @IsOptional()
  overall_result?: Record<string, unknown> | null;

  @IsOptional()
  documents?: Record<string, unknown> | null;

  @IsOptional()
  cross_validation?: Record<string, unknown> | null;

  @IsString()
  created_at!: string;

  @IsString()
  updated_at!: string;
}

export class SubmitValidationResponseDto {
  @IsString()
  job_id!: string;

  @IsIn(['PENDING'])
  status!: 'PENDING';

  @IsString()
  merchant_id!: string;

  @IsOptional()
  @IsString()
  request_id?: string | null;

  @IsString()
  created_at!: string;
}

export class InternalCaseListItemDto {
  @IsString()
  job_id!: string;

  @IsString()
  merchant_id!: string;

  @IsOptional()
  @IsString()
  request_id?: string | null;

  @IsIn(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'])
  status!: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

  @IsOptional()
  @IsString()
  overall_status?: 'APPROVED' | 'REJECTED' | 'REQUIRES_REVIEW' | null;

  @IsOptional()
  @IsString()
  overall_summary?: string | null;

  @IsOptional()
  @IsString()
  legal_mode?: string | null;

  @IsOptional()
  @IsString()
  stage?: string | null;

  @IsOptional()
  @IsInt()
  progress_percentage?: number | null;

  @IsOptional()
  @IsString()
  progress_message?: string | null;

  @IsInt()
  document_count!: number;

  @IsOptional()
  @IsNumber()
  duration_seconds?: number | null;

  @IsString()
  created_at!: string;

  @IsString()
  updated_at!: string;
}

export class InternalCaseListResponseDto {
  @IsInt()
  page!: number;

  @IsInt()
  page_size!: number;

  has_next!: boolean;
  query?: string | null;
  total_items!: number;
  stats!: Record<string, unknown>;
  items!: InternalCaseListItemDto[];
}

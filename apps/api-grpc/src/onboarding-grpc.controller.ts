import { Controller } from '@nestjs/common';
import { RpcException, GrpcMethod } from '@nestjs/microservices';
import { status as GrpcStatus, Metadata } from '@grpc/grpc-js';
import { GrpcJobsService, type StatusRequestMessage } from './grpc-jobs.service';

type HealthResponse = {
  service: string;
  status: string;
  phase: string;
};

type SubmitValidationRequestMessage = {
  merchant_id?: string;
  request_id?: string;
  documents?: Record<string, Array<{ url?: string; document_id?: string }>>;
  metadata?: Record<string, string>;
};

type StatusResponse = {
  items: Awaited<ReturnType<GrpcJobsService['getStatus']>>;
};

function rpcError(code: number, message: string): RpcException {
  return new RpcException({ code, message });
}

function normalizeMetadata(
  value: Record<string, string> | undefined,
): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, String(item)]),
  );
}

function normalizeBucket(
  documents: SubmitValidationRequestMessage['documents'],
  key: string,
): Array<{ url: string; document_id?: string }> {
  const bucket = documents?.[key];
  if (!Array.isArray(bucket)) {
    return [];
  }

  return bucket.map((item) => ({
    url: typeof item?.url === 'string' ? item.url : '',
    document_id:
      typeof item?.document_id === 'string' && item.document_id.length > 0
        ? item.document_id
        : undefined,
  }));
}

function countDocuments(documents: {
  rif: Array<unknown>;
  cedula: Array<unknown>;
  certificado_emprendimiento: Array<unknown>;
  acta_constitutiva: Array<unknown>;
  acta_mercantil: Array<unknown>;
}): number {
  return (
    documents.rif.length +
    documents.cedula.length +
    documents.certificado_emprendimiento.length +
    documents.acta_constitutiva.length +
    documents.acta_mercantil.length
  );
}

@Controller()
export class OnboardingGrpcController {
  constructor(private readonly jobsService: GrpcJobsService) {}

  @GrpcMethod('OnboardingService', 'GetHealth')
  getHealth(_payload: Record<string, never>, _metadata?: Metadata): HealthResponse {
    return {
      service: 'api-grpc',
      status: 'ok',
      phase: 'grpc-validation-api',
    };
  }

  @GrpcMethod('OnboardingService', 'SubmitValidation')
  async submitValidation(
    payload: SubmitValidationRequestMessage,
    _metadata?: Metadata,
  ) {
    const merchantId = payload?.merchant_id?.trim() ?? '';
    if (!merchantId) {
      throw rpcError(GrpcStatus.INVALID_ARGUMENT, 'merchant_id is required.');
    }

    const documents = {
      rif: normalizeBucket(payload.documents, 'rif'),
      cedula: normalizeBucket(payload.documents, 'cedula'),
      certificado_emprendimiento: normalizeBucket(
        payload.documents,
        'certificado_emprendimiento',
      ),
      acta_constitutiva: normalizeBucket(payload.documents, 'acta_constitutiva'),
      acta_mercantil: normalizeBucket(payload.documents, 'acta_mercantil'),
    };

    if (countDocuments(documents) === 0) {
      throw rpcError(
        GrpcStatus.INVALID_ARGUMENT,
        'At least one document must be provided.',
      );
    }

    for (const [bucketName, bucket] of Object.entries(documents)) {
      for (const reference of bucket) {
        if (!reference.url) {
          throw rpcError(
            GrpcStatus.INVALID_ARGUMENT,
            `Document URL is required in bucket '${bucketName}'.`,
          );
        }
      }
    }

    return this.jobsService.submit({
      merchant_id: merchantId,
      request_id: payload.request_id ?? '',
      documents,
      metadata: normalizeMetadata(payload.metadata),
    });
  }

  @GrpcMethod('OnboardingService', 'GetStatus')
  async getStatus(payload: StatusRequestMessage, _metadata?: Metadata): Promise<StatusResponse> {
    if (!payload || !Array.isArray(payload.job_ids) || payload.job_ids.length === 0) {
      throw rpcError(
        GrpcStatus.INVALID_ARGUMENT,
        'job_ids must contain at least one value.',
      );
    }

    const jobIds = payload.job_ids
      .map((value) => String(value).trim())
      .filter((value) => value.length > 0);

    if (jobIds.length === 0) {
      throw rpcError(
        GrpcStatus.INVALID_ARGUMENT,
        'job_ids must contain at least one non-empty value.',
      );
    }

    return {
      items: await this.jobsService.getStatus({ job_ids: jobIds }),
    };
  }
}

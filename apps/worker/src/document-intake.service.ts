import { Injectable } from '@nestjs/common';
import {
  HttpDocumentDownloader,
  createLogger,
  sanitizeUrl,
} from '@infrastructure';
import type { JobRecord } from '@domain';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

type DocumentBucketName =
  | 'rif'
  | 'cedula'
  | 'certificado_emprendimiento'
  | 'acta_constitutiva'
  | 'acta_mercantil';

interface RawDocumentReference {
  url: string;
  document_id?: string | null;
}

interface DocumentIntakeResult {
  ok: boolean;
  contentType: string | null;
  contentLength: number | null;
  errorCode?: string;
  message?: string;
}

@Injectable()
export class DocumentIntakeService {
  private readonly logger = createLogger('TypeScriptDocumentIntakeService');

  constructor(
    private readonly downloader: HttpDocumentDownloader = new HttpDocumentDownloader(),
  ) {}

  async buildDocumentsResult(record: JobRecord): Promise<Record<string, unknown>> {
    const documents = this.readDocumentBuckets(record.request);

    return {
      rif: await this.buildBucket(documents.rif, 'rif', record),
      cedula: await this.buildBucket(documents.cedula, 'cedula', record),
      certificado_emprendimiento: await this.buildBucket(
        documents.certificado_emprendimiento,
        'certificado_emprendimiento',
        record,
      ),
      acta_constitutiva: await this.buildBucket(
        documents.acta_constitutiva,
        'acta_constitutiva',
        record,
      ),
      acta_mercantil: await this.buildBucket(
        documents.acta_mercantil,
        'acta_mercantil',
        record,
      ),
    };
  }

  private readDocumentBuckets(
    request: Record<string, unknown>,
  ): Record<DocumentBucketName, RawDocumentReference[]> {
    const documents = this.asObject(request.documents);

    return {
      rif: this.asDocumentArray(documents?.rif),
      cedula: this.asDocumentArray(documents?.cedula),
      certificado_emprendimiento: this.asDocumentArray(documents?.certificado_emprendimiento),
      acta_constitutiva: this.asDocumentArray(documents?.acta_constitutiva),
      acta_mercantil: this.asDocumentArray(documents?.acta_mercantil),
    };
  }

  private async buildBucket(
    documents: RawDocumentReference[],
    documentType: DocumentBucketName,
    record: JobRecord,
  ): Promise<Record<string, unknown>[]> {
    const results: Record<string, unknown>[] = [];
    for (const document of documents) {
      results.push(await this.buildDocumentResult(document, documentType, record));
    }
    return results;
  }

  private async buildDocumentResult(
    document: RawDocumentReference,
    documentType: DocumentBucketName,
    record: JobRecord,
  ): Promise<Record<string, unknown>> {
    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();
    const intake = await this.validateUrl(document.url);
    const completedAtMs = Date.now();
    const completedAt = new Date(completedAtMs).toISOString();
    const baseExtractedData = {
      document_type: documentType,
      source_url: document.url,
      mock: false,
      content_type: intake.contentType,
      content_length: intake.contentLength,
      intake_started_at: startedAt,
      intake_completed_at: completedAt,
      intake_duration_ms: completedAtMs - startedAtMs,
    };

    if (!intake.ok) {
      this.logger.warn('document.intake.failed', {
        event: 'document.intake.failed',
        jobId: record.jobId,
        merchantId: record.merchantId,
        requestId: record.requestId ?? null,
        documentType,
        documentId: document.document_id ?? null,
        sourceUrl: sanitizeUrl(document.url),
        errorCode: intake.errorCode,
        contentType: intake.contentType,
        contentLength: intake.contentLength,
      });

      return {
        document_id: document.document_id ?? null,
        status: 'REJECTED',
        confidence: 100,
        extracted_data: baseExtractedData,
        errors: [
          {
            error_code: intake.errorCode ?? 'DOCUMENT_VALIDATION_FAILED',
            message: intake.message ?? 'Document validation failed.',
          },
        ],
      };
    }

    this.logger.info('document.intake.approved', {
      event: 'document.intake.approved',
      jobId: record.jobId,
      merchantId: record.merchantId,
      requestId: record.requestId ?? null,
      documentType,
      documentId: document.document_id ?? null,
      sourceUrl: sanitizeUrl(document.url),
      contentType: intake.contentType,
      contentLength: intake.contentLength,
    });

    return {
      document_id: document.document_id ?? null,
      status: 'APPROVED',
      confidence: 90,
      extracted_data: baseExtractedData,
      errors: [],
    };
  }

  private async validateUrl(url: string): Promise<DocumentIntakeResult> {
    if (!this.isSupportedScheme(url)) {
      return {
        ok: false,
        contentType: null,
        contentLength: null,
        errorCode: 'DOCUMENT_URL_INVALID',
        message: 'Only http and https URLs are supported.',
      };
    }

    try {
      const downloaded = await this.downloader.download(url);
      if (!downloaded.mimeType || !ALLOWED_MIME_TYPES.has(downloaded.mimeType)) {
        return {
          ok: false,
          contentType: downloaded.mimeType ?? null,
          contentLength: downloaded.contentLength ?? null,
          errorCode: 'DOCUMENT_CONTENT_TYPE_INVALID',
          message: `Document content type is not supported. Received: ${downloaded.mimeType ?? 'unknown'}.`,
        };
      }

      return {
        ok: true,
        contentType: downloaded.mimeType ?? null,
        contentLength: downloaded.contentLength ?? downloaded.bytes.byteLength,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        contentType: null,
        contentLength: null,
        errorCode: this.mapErrorCode(message),
        message,
      };
    }
  }

  private mapErrorCode(message: string): string {
    if (message.includes('HTTP 4') || message.includes('HTTP 5')) {
      return 'DOCUMENT_URL_UNREACHABLE';
    }
    if (message.includes('max size')) {
      return 'DOCUMENT_TOO_LARGE';
    }
    if (message.includes('timed out') || message.includes('aborted')) {
      return 'DOCUMENT_DOWNLOAD_TIMEOUT';
    }
    return 'DOCUMENT_DOWNLOAD_FAILED';
  }

  private isSupportedScheme(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private asObject(value: unknown): Record<string, unknown> | null {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return null;
  }

  private asDocumentArray(value: unknown): RawDocumentReference[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.flatMap((item) => {
      const object = this.asObject(item);
      const url = typeof object?.url === 'string' ? object.url : null;
      if (!url) {
        return [];
      }

      return [
        {
          url,
          document_id:
            object && typeof object.document_id === 'string'
              ? object.document_id
              : null,
        },
      ];
    });
  }
}

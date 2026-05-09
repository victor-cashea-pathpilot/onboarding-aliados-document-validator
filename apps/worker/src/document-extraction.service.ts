import { Injectable } from '@nestjs/common';
import {
  HttpDocumentDownloader,
  type GeminiClient,
  VertexGeminiClient,
  createLogger,
  getInfrastructureSettings,
  sanitizeUrl,
} from '@infrastructure';
import type { JobRecord } from '@domain';
import {
  buildActaConstitutivaPrompt,
  buildActaMercantilPrompt,
  buildCedulaPrompt,
  buildCertificadoEmprendimientoPrompt,
  buildRifPrompt,
} from './extraction-prompts';

type DocumentType =
  | 'rif'
  | 'cedula'
  | 'certificado_emprendimiento'
  | 'acta_constitutiva'
  | 'acta_mercantil';

interface DocumentResultItem {
  document_id?: string | null;
  status: 'APPROVED' | 'REJECTED' | 'REQUIRES_REVIEW';
  confidence: number;
  extracted_data: Record<string, unknown>;
  errors: Array<{ error_code: string; message: string }>;
}

interface ExtractorDefinition {
  model: string;
  prompt: string;
  mockExtract: (sourceUrl: string, documentId?: string | null) => Record<string, unknown>;
}

const logger = createLogger('TypeScriptDocumentExtractionService');

@Injectable()
export class DocumentExtractionService {
  private readonly settings = getInfrastructureSettings();
  private readonly maxConcurrency: number;

  constructor(
    private readonly downloader: HttpDocumentDownloader = new HttpDocumentDownloader(),
    private readonly geminiClient: GeminiClient = new VertexGeminiClient(),
  ) {
    this.maxConcurrency = Math.max(1, this.settings.maxExtractionConcurrency);
  }

  async extractDocuments(
    documents: Record<string, unknown>,
    record: JobRecord,
  ): Promise<Record<string, unknown>> {
    const tasks = this.collectTasks(documents);
    if (tasks.length === 0) {
      return documents;
    }

    logger.info('document.extraction.batch.started', {
      event: 'document.extraction.batch.started',
      jobId: record.jobId,
      merchantId: record.merchantId,
      requestId: record.requestId ?? null,
      taskCount: tasks.length,
      maxWorkers: Math.min(this.maxConcurrency, tasks.length),
    });

    for (let index = 0; index < tasks.length; index += this.maxConcurrency) {
      const batch = tasks.slice(index, index + this.maxConcurrency);
      await Promise.all(
        batch.map(async (task) => {
          const updatedItem = await this.extractSingle(task.documentType, task.item, record);
          task.bucket[task.index] = updatedItem;
        }),
      );
    }

    logger.info('document.extraction.batch.completed', {
      event: 'document.extraction.batch.completed',
      jobId: record.jobId,
      merchantId: record.merchantId,
      requestId: record.requestId ?? null,
      taskCount: tasks.length,
    });

    return documents;
  }

  private collectTasks(documents: Record<string, unknown>) {
    const buckets: Array<{ type: DocumentType; key: string }> = [
      { type: 'rif', key: 'rif' },
      { type: 'cedula', key: 'cedula' },
      { type: 'certificado_emprendimiento', key: 'certificado_emprendimiento' },
      { type: 'acta_constitutiva', key: 'acta_constitutiva' },
      { type: 'acta_mercantil', key: 'acta_mercantil' },
    ];

    return buckets.flatMap(({ type, key }) => {
      const bucket = this.asDocumentArray(documents[key]);
      return bucket.flatMap((item, index) =>
        item.status === 'APPROVED' ? [{ documentType: type, bucket, index, item }] : [],
      );
    });
  }

  private async extractSingle(
    documentType: DocumentType,
    item: DocumentResultItem,
    record: JobRecord,
  ): Promise<DocumentResultItem> {
    const definition = this.getExtractor(documentType);
    const sourceUrl = this.readString(item.extracted_data.source_url);
    const mimeType = this.readString(item.extracted_data.content_type) || 'application/pdf';
    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();

    logger.info('document.extraction.started', {
      event: 'document.extraction.started',
      jobId: record.jobId,
      merchantId: record.merchantId,
      requestId: record.requestId ?? null,
      documentType,
      documentId: item.document_id ?? null,
      model: definition.model,
      sourceUrl: sanitizeUrl(sourceUrl),
    });

    try {
      const extractedFields = this.settings.mockMode
        ? definition.mockExtract(sourceUrl, item.document_id ?? null)
        : await this.extractWithGemini(definition, sourceUrl, mimeType);

      logger.info('document.extraction.completed', {
        event: 'document.extraction.completed',
        jobId: record.jobId,
        merchantId: record.merchantId,
        requestId: record.requestId ?? null,
        documentType,
        documentId: item.document_id ?? null,
        model: definition.model,
        sourceUrl: sanitizeUrl(sourceUrl),
        durationMs: Date.now() - startedAtMs,
      });

      const completedAtMs = Date.now();
      const documentQuality = this.extractDocumentQuality(extractedFields);

      return {
        ...item,
        confidence: this.settings.mockMode ? 90 : item.confidence,
        extracted_data: {
          ...item.extracted_data,
          extraction_model: definition.model,
          extraction_prompt: definition.prompt,
          extraction_status: 'completed',
          extraction_started_at: startedAt,
          extraction_completed_at: new Date(completedAtMs).toISOString(),
          extraction_duration_ms: completedAtMs - startedAtMs,
          extracted_fields: extractedFields,
          document_quality: documentQuality,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('document.extraction.failed', {
        event: 'document.extraction.failed',
        jobId: record.jobId,
        merchantId: record.merchantId,
        requestId: record.requestId ?? null,
        documentType,
        documentId: item.document_id ?? null,
        model: definition.model,
        sourceUrl: sanitizeUrl(sourceUrl),
        durationMs: Date.now() - startedAtMs,
        error: message,
      });

      const completedAtMs = Date.now();

      return {
        ...item,
        status: 'REQUIRES_REVIEW',
        extracted_data: {
          ...item.extracted_data,
          extraction_started_at: startedAt,
          extraction_completed_at: new Date(completedAtMs).toISOString(),
          extraction_duration_ms: completedAtMs - startedAtMs,
          extraction_status: 'failed',
        },
        errors: [
          ...item.errors,
          {
            error_code: 'EXTRACTION_FAILED',
            message: `Extraction failed: ${message}`,
          },
        ],
      };
    }
  }

  private async extractWithGemini(
    definition: ExtractorDefinition,
    sourceUrl: string,
    mimeType: string,
  ): Promise<Record<string, unknown>> {
    const downloaded = await this.downloader.download(sourceUrl);
    return this.geminiClient.extractJson({
      model: definition.model,
      prompt: definition.prompt,
      fileBytes: downloaded.bytes,
      mimeType: downloaded.mimeType ?? mimeType,
    });
  }

  private getExtractor(documentType: DocumentType): ExtractorDefinition {
    switch (documentType) {
      case 'rif':
        return {
          model: this.settings.geminiModelSimple,
          prompt: buildRifPrompt(),
          mockExtract: (sourceUrl, documentId) => ({
            rif_number: 'J-12345678-0',
            company_name: 'ALIADO MOCK RIF',
            fiscal_address: 'Direccion fiscal mock',
            expiration_date: '2026-12-31',
            mock_source_url: sourceUrl,
            mock_document_id: documentId,
          }),
        };
      case 'cedula':
        return {
          model: this.settings.geminiModelSimple,
          prompt: buildCedulaPrompt(),
          mockExtract: (sourceUrl, documentId) => ({
            id_number: 'V-12345678',
            first_name: 'NOMBRE',
            last_name: 'APELLIDO',
            expiration_date: '31/12/2030',
            mock_source_url: sourceUrl,
            mock_document_id: documentId,
          }),
        };
      case 'acta_constitutiva':
        return {
          model: this.settings.geminiModelComplex,
          prompt: buildActaConstitutivaPrompt(),
          mockExtract: (sourceUrl, documentId) => ({
            document_type: 'acta_constitutiva',
            razon_social: 'FREDLOU STILO Y BELLEZA, C.A.',
            registro_mercantil: {
              nombre_registro: 'Registro Mercantil Primero',
              estado_registro: 'Distrito Capital',
              numero: '12',
              tomo: '45-A',
              fecha_registro: '05/03/2018',
            },
            mock_source_url: sourceUrl,
            mock_document_id: documentId,
          }),
        };
      case 'acta_mercantil':
        return {
          model: this.settings.geminiModelComplex,
          prompt: buildActaMercantilPrompt(),
          mockExtract: (sourceUrl, documentId) => ({
            document_type: 'acta_mercantil',
            razon_social: 'FREDLOU STILO Y BELLEZA, C.A.',
            registro_mercantil: {
              nombre_registro: 'Registro Mercantil Segundo',
              estado_registro: 'Distrito Capital',
              numero: '23',
              tomo: '88-A',
              fecha_registro: '12/06/2024',
            },
            corporate_structure: {
              legal_representative: {
                representation_clause_modified: 'YES',
                signature_clause_status: 'EXPLICIT',
                signature_type: 'SEPARADA',
              },
            },
            mock_source_url: sourceUrl,
            mock_document_id: documentId,
          }),
        };
      case 'certificado_emprendimiento':
        return {
          model: this.settings.geminiModelComplex,
          prompt: buildCertificadoEmprendimientoPrompt(),
          mockExtract: (sourceUrl, documentId) => ({
            document_type: 'certificado_emprendimiento',
            razon_social: 'EMPRENDIMIENTO MOCK',
            registro_mercantil: {
              nombre_registro: 'Registro Nacional de Emprendimientos',
              numero: 'RNE-001',
              fecha_registro: '10/01/2025',
            },
            mock_source_url: sourceUrl,
            mock_document_id: documentId,
          }),
        };
      default:
        throw new Error(`Unsupported document type: ${documentType satisfies never}`);
    }
  }

  /**
   * Extracts the document_quality block from the raw Gemini response fields.
   * Returns a normalized quality object with legibility_score (0-1),
   * completeness_score (0-1), and optional notes.
   * Defaults to null if the model did not report quality (e.g. older prompts or mock mode).
   */
  private extractDocumentQuality(
    extractedFields: Record<string, unknown>,
  ): { legibility_score: number; completeness_score: number; notes: string } | null {
    const raw = extractedFields['document_quality'];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return null;
    }
    const q = raw as Record<string, unknown>;
    const legibility = this.clampScore(q['legibility_score']);
    const completeness = this.clampScore(q['completeness_score']);
    if (legibility === null && completeness === null) {
      return null;
    }
    return {
      legibility_score: legibility ?? 1.0,
      completeness_score: completeness ?? 1.0,
      notes: typeof q['notes'] === 'string' ? q['notes'].slice(0, 200) : '',
    };
  }

  private clampScore(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null;
    }
    return Math.min(1, Math.max(0, value));
  }

  private asDocumentArray(value: unknown): DocumentResultItem[] {
    return Array.isArray(value) ? (value as DocumentResultItem[]) : [];
  }

  private readString(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }
}

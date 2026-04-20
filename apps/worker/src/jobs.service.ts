import type {
  CrossValidationCheck,
  CrossValidationFinding,
  LLMValidationReview,
} from '@contracts';
import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { JobRecord } from '@domain';
import type { JobRepository, LoggerLike } from '@infrastructure';
import { formatUnknownError } from '@infrastructure';
import { DocumentExtractionService } from './document-extraction.service';
import { DocumentIntakeService } from './document-intake.service';
import { DocumentNormalizationService } from './document-normalization.service';
import { CrossValidationService } from './cross-validation.service';
import { CrossValidationLlmService } from './cross-validation-llm.service';
import { LegalAssessmentLlmService } from './legal-assessment-llm.service';
import { JOB_REPOSITORY, WORKER_AUTH_TOKEN } from './worker.tokens';

interface TimedOperation<T> {
  result: T;
  startedAt: string;
  endedAt: string;
  durationMs: number;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

@Injectable()
export class JobsService {
  constructor(
    @Inject(JOB_REPOSITORY) private readonly repository: JobRepository,
    @Inject(WORKER_AUTH_TOKEN) private readonly workerAuthToken: string | null,
    @Inject('WORKER_LOGGER') private readonly logger: LoggerLike,
    private readonly documentIntake: DocumentIntakeService,
    private readonly documentExtraction: DocumentExtractionService,
    private readonly documentNormalization: DocumentNormalizationService,
    private readonly crossValidation: CrossValidationService,
    private readonly crossValidationLlm: CrossValidationLlmService,
    private readonly legalAssessmentLlm: LegalAssessmentLlmService,
  ) {}

  async processJob(jobId: string, providedWorkerToken?: string | null) {
    this.assertWorkerToken(providedWorkerToken);

    const record = await this.repository.get(jobId);
    if (!record) {
      throw new NotFoundException(`Job ${jobId} not found.`);
    }

    this.logger.info('worker.job.received', {
      event: 'worker.job.received',
      jobId: record.jobId,
      merchantId: record.merchantId,
      requestId: record.requestId ?? null,
      queueWaitMs: this.getQueueWaitMs(record),
      jobStatus: record.status,
    });

    try {
      const updatedRecord = await this.markInitialProcessingState(record);

      this.logger.info('worker.job.accepted', {
        event: 'worker.job.accepted',
        jobId: updatedRecord.jobId,
        merchantId: updatedRecord.merchantId,
        requestId: updatedRecord.requestId ?? null,
        stage: updatedRecord.progress?.stage ?? null,
        progressPercentage: updatedRecord.progress?.percentage ?? null,
      });

      return {
        job_id: updatedRecord.jobId,
        status: 'accepted',
        message:
          'TypeScript worker accepted the job and updated the initial processing state.',
      };
    } catch (error) {
      this.logger.error('worker.job.failed', {
        event: 'worker.job.failed',
        jobId: record.jobId,
        merchantId: record.merchantId,
        requestId: record.requestId ?? null,
        error: formatUnknownError(error),
      });
      throw error;
    }
  }

  private assertWorkerToken(providedWorkerToken?: string | null) {
    if (this.workerAuthToken && providedWorkerToken !== this.workerAuthToken) {
      throw new ForbiddenException('Invalid worker token.');
    }
  }

  private async markInitialProcessingState(record: JobRecord): Promise<JobRecord> {
    if (record.status === 'PENDING') {
      const processingStartedMs = Date.now();
      const processingStartedAt = new Date(processingStartedMs).toISOString();
      const queueWaitMs = Math.max(
        Math.round(processingStartedMs - new Date(record.createdAt).getTime()),
        0,
      );
      const intakeRecord: JobRecord = {
        ...record,
        status: 'PROCESSING',
        progress: {
          stage: 'document_intake',
          percentage: 25,
          message: 'Validando acceso y formato de documentos.',
        },
        updatedAt: processingStartedAt,
      };
      await this.repository.update(intakeRecord);

      const intakeTiming = await this.measureAsync(() =>
        this.documentIntake.buildDocumentsResult(intakeRecord),
      );
      const intakeDocuments = intakeTiming.result;
      const extractionPendingRecord: JobRecord = {
        ...intakeRecord,
        progress: {
          stage: 'document_extraction',
          percentage: 65,
          message: 'Extrayendo datos de documentos en paralelo.',
        },
        documents: intakeDocuments,
        updatedAt: intakeTiming.endedAt,
      };
      await this.repository.update(extractionPendingRecord);

      const extractionTiming = await this.measureAsync(() =>
        this.documentExtraction.extractDocuments(intakeDocuments, extractionPendingRecord),
      );
      const extractedDocuments = extractionTiming.result;

      const normalizationRecord: JobRecord = {
        ...extractionPendingRecord,
        progress: {
          stage: 'document_normalization',
          percentage: 80,
          message: 'Normalizando datos extraídos y consolidando snapshot canónico.',
        },
        documents: extractedDocuments,
        updatedAt: extractionTiming.endedAt,
      };
      await this.repository.update(normalizationRecord);

      const normalizationTiming = this.measureSync(() =>
        this.documentNormalization.normalize(
          normalizationRecord.merchantId,
          extractedDocuments,
        ),
      );
      const normalizedSnapshot = normalizationTiming.result;

      const crossValidationRecord: JobRecord = {
        ...normalizationRecord,
        progress: {
          stage: 'cross_validation',
          percentage: 90,
          message: 'Ejecutando validaciones cruzadas sobre datos normalizados.',
        },
        documents: extractedDocuments,
        normalizedSnapshot,
        updatedAt: normalizationTiming.endedAt,
      };
      await this.repository.update(crossValidationRecord);

      const rulesTiming = this.measureSync(() =>
        this.crossValidation.validate(normalizedSnapshot),
      );
      const checks = rulesTiming.result;
      const llmBatchStartedMs = Date.now();
      const llmBatchStartedAt = new Date(llmBatchStartedMs).toISOString();
      const [rawLlmCrossValidation, rawLlmLegalAssessment] = await Promise.all([
        this.measureAsync(() =>
          this.crossValidationLlm.review({
            snapshot: normalizedSnapshot,
            checks,
          }),
        ),
        this.measureAsync(() =>
          this.legalAssessmentLlm.assess({
            snapshot: normalizedSnapshot,
            checks,
          }),
        ),
      ]);
      const llmBatchEndedMs = Date.now();
      const llmBatchEndedAt = new Date(llmBatchEndedMs).toISOString();
      const llmCrossValidation = this.alignLlmReviewForParity({
        snapshot: normalizedSnapshot,
        checks,
        review: rawLlmCrossValidation.result,
      });
      const llmLegalAssessment = this.alignLlmReviewForParity({
        snapshot: normalizedSnapshot,
        checks,
        review: rawLlmLegalAssessment.result,
      });

      const failedChecks = checks.filter((check) => check.status === 'FAILED');
      const overallResult = this.composeCrossValidationResult({
        failedChecks,
        llmCrossValidation,
        llmLegalAssessment,
      });
      const completedAt = new Date().toISOString();

      const updatedRecord: JobRecord = {
        ...crossValidationRecord,
        status: 'COMPLETED',
        progress: {
          stage: 'completed',
          percentage: 100,
          message: 'Job completado.',
        },
        documents: extractedDocuments,
        normalizedSnapshot,
        crossValidation: {
          legal_mode: normalizedSnapshot.legalMode,
          checks,
          findings: [
            ...this.buildRuleFindings(checks),
            ...llmCrossValidation.findings,
            ...llmLegalAssessment.findings,
          ],
          llm_cross_validation: llmCrossValidation,
          llm_legal_assessment: llmLegalAssessment,
        },
        overallResult,
        monitoring: this.buildMonitoring({
          record,
          processingStartedAt,
          completedAt,
          queueWaitMs,
          intakeTiming,
          extractionTiming,
          normalizationTiming,
          rulesTiming,
          llmBatch: {
            startedAt: llmBatchStartedAt,
            endedAt: llmBatchEndedAt,
            durationMs: llmBatchEndedMs - llmBatchStartedMs,
          },
          llmCrossValidationTiming: rawLlmCrossValidation,
          llmLegalAssessmentTiming: rawLlmLegalAssessment,
          documents: extractedDocuments,
        }),
        updatedAt: completedAt,
      };

      return this.repository.update(updatedRecord);
    }

    return record;
  }

  private getQueueWaitMs(record: JobRecord): number {
    return Math.max(
      Math.round(new Date().getTime() - new Date(record.createdAt).getTime()),
      0,
    );
  }

  private async measureAsync<T>(operation: () => Promise<T>): Promise<TimedOperation<T>> {
    const startedAtMs = Date.now();
    const result = await operation();
    const endedAtMs = Date.now();
    return {
      result,
      startedAt: new Date(startedAtMs).toISOString(),
      endedAt: new Date(endedAtMs).toISOString(),
      durationMs: endedAtMs - startedAtMs,
    };
  }

  private measureSync<T>(operation: () => T): TimedOperation<T> {
    const startedAtMs = Date.now();
    const result = operation();
    const endedAtMs = Date.now();
    return {
      result,
      startedAt: new Date(startedAtMs).toISOString(),
      endedAt: new Date(endedAtMs).toISOString(),
      durationMs: endedAtMs - startedAtMs,
    };
  }

  private buildMonitoring(input: {
    record: JobRecord;
    processingStartedAt: string;
    completedAt: string;
    queueWaitMs: number;
    intakeTiming: TimedOperation<Record<string, unknown>>;
    extractionTiming: TimedOperation<Record<string, unknown>>;
    normalizationTiming: TimedOperation<unknown>;
    rulesTiming: TimedOperation<CrossValidationCheck[]>;
    llmBatch: { startedAt: string; endedAt: string; durationMs: number };
    llmCrossValidationTiming: TimedOperation<LLMValidationReview>;
    llmLegalAssessmentTiming: TimedOperation<LLMValidationReview>;
    documents: Record<string, unknown>;
  }): Record<string, unknown> {
    const spans: Record<string, unknown>[] = [
      {
        id: 'queue_wait',
        label: 'Queue wait',
        kind: 'queue',
        started_at: input.record.createdAt,
        ended_at: input.processingStartedAt,
        duration_ms: input.queueWaitMs,
      },
      {
        id: 'document_intake',
        label: 'Document intake',
        kind: 'stage',
        started_at: input.intakeTiming.startedAt,
        ended_at: input.intakeTiming.endedAt,
        duration_ms: input.intakeTiming.durationMs,
      },
      ...this.buildDocumentSpans({
        documents: input.documents,
        phase: 'intake',
        parentId: 'document_intake',
        parallelGroup: null,
      }),
      {
        id: 'document_extraction',
        label: 'Document extraction',
        kind: 'stage',
        started_at: input.extractionTiming.startedAt,
        ended_at: input.extractionTiming.endedAt,
        duration_ms: input.extractionTiming.durationMs,
      },
      ...this.buildDocumentSpans({
        documents: input.documents,
        phase: 'extraction',
        parentId: 'document_extraction',
        parallelGroup: 'document_extraction',
      }),
      {
        id: 'document_normalization',
        label: 'Document normalization',
        kind: 'stage',
        started_at: input.normalizationTiming.startedAt,
        ended_at: input.normalizationTiming.endedAt,
        duration_ms: input.normalizationTiming.durationMs,
      },
      {
        id: 'deterministic_checks',
        label: 'Deterministic checks',
        kind: 'rules',
        started_at: input.rulesTiming.startedAt,
        ended_at: input.rulesTiming.endedAt,
        duration_ms: input.rulesTiming.durationMs,
        metadata: {
          check_count: input.rulesTiming.result.length,
        },
      },
      {
        id: 'llm_reviews',
        label: 'LLM reviews',
        kind: 'stage',
        started_at: input.llmBatch.startedAt,
        ended_at: input.llmBatch.endedAt,
        duration_ms: input.llmBatch.durationMs,
      },
      {
        id: 'llm_cross_validation',
        label: 'LLM cross-validation',
        kind: 'llm',
        parent_id: 'llm_reviews',
        parallel_group: 'llm_reviews',
        started_at: input.llmCrossValidationTiming.startedAt,
        ended_at: input.llmCrossValidationTiming.endedAt,
        duration_ms: input.llmCrossValidationTiming.durationMs,
        metadata: {
          recommendation: input.llmCrossValidationTiming.result.recommendation,
        },
      },
      {
        id: 'llm_legal_assessment',
        label: 'LLM legal assessment',
        kind: 'llm',
        parent_id: 'llm_reviews',
        parallel_group: 'llm_reviews',
        started_at: input.llmLegalAssessmentTiming.startedAt,
        ended_at: input.llmLegalAssessmentTiming.endedAt,
        duration_ms: input.llmLegalAssessmentTiming.durationMs,
        metadata: {
          recommendation: input.llmLegalAssessmentTiming.result.recommendation,
        },
      },
    ];

    return {
      queue_wait_ms: input.queueWaitMs,
      processing_duration_ms:
        new Date(input.completedAt).getTime() - new Date(input.processingStartedAt).getTime(),
      total_duration_ms:
        new Date(input.completedAt).getTime() - new Date(input.record.createdAt).getTime(),
      spans,
    };
  }

  private buildDocumentSpans(input: {
    documents: Record<string, unknown>;
    phase: 'intake' | 'extraction';
    parentId: string;
    parallelGroup: string | null;
  }): Record<string, unknown>[] {
    const spans: Record<string, unknown>[] = [];
    for (const item of this.flattenDocumentItems(input.documents)) {
      const data = asObject(item.extracted_data) ?? {};
      const startedAt = asString(data[`${input.phase}_started_at`]);
      const endedAt = asString(data[`${input.phase}_completed_at`]);
      const durationMs = asNumber(data[`${input.phase}_duration_ms`]);
      if (!startedAt || !endedAt || durationMs === null) {
        continue;
      }

      const documentType = asString(data.document_type) ?? 'document';
      const documentId = asString(item.document_id) ?? 'unknown';
      const metadata: Record<string, unknown> = {
        document_type: documentType,
        document_id: documentId,
      };
      if (input.phase === 'extraction') {
        metadata.model = asString(data.extraction_model);
      }

      spans.push({
        id: `${input.phase}:${documentType}:${documentId}`,
        label: `${this.documentTypeLabel(documentType)} ${input.phase === 'intake' ? 'intake' : 'extraction'}`,
        kind: 'document',
        parent_id: input.parentId,
        parallel_group: input.parallelGroup,
        started_at: startedAt,
        ended_at: endedAt,
        duration_ms: durationMs,
        metadata,
      });
    }
    return spans;
  }

  private flattenDocumentItems(documents: Record<string, unknown>): Array<Record<string, unknown>> {
    return [
      'rif',
      'cedula',
      'certificado_emprendimiento',
      'acta_constitutiva',
      'acta_mercantil',
    ].flatMap((key) => asArray(documents[key]).map((item) => asObject(item) ?? {}));
  }

  private documentTypeLabel(documentType: string): string {
    switch (documentType) {
      case 'rif':
        return 'RIF';
      case 'cedula':
        return 'Cédula';
      case 'acta_constitutiva':
        return 'Acta constitutiva';
      case 'acta_mercantil':
        return 'Acta mercantil';
      case 'certificado_emprendimiento':
        return 'Certificado de emprendimiento';
      default:
        return documentType;
    }
  }

  private composeCrossValidationResult(input: {
    failedChecks: CrossValidationCheck[];
    llmCrossValidation: LLMValidationReview;
    llmLegalAssessment: LLMValidationReview;
  }) {
    const failedCodes = input.failedChecks.map((check) => check.code);
    const baseResult =
      input.failedChecks.length > 0
        ? {
            status: 'REQUIRES_REVIEW',
            confidence: 78,
            summary: input.failedChecks.some((check) =>
              ['HAS_RIF', 'HAS_CEDULA', 'HAS_CONSTITUTIVE_DOC'].includes(check.code),
            )
              ? 'El caso requiere revisión manual porque faltan documentos obligatorios.'
              : 'El caso requiere revisión manual porque una o más validaciones cruzadas fallaron.',
            error_codes: failedCodes,
          }
        : {
            status: 'APPROVED',
            confidence: 91,
            summary:
              'El caso pasó las validaciones técnicas, de extracción y las validaciones cruzadas actuales.',
            error_codes: [],
          };

    const candidates = [
      ['rules', baseResult.status, baseResult.confidence, baseResult.summary] as const,
      [
        'llm_cross_validation',
        input.llmCrossValidation.recommendation,
        input.llmCrossValidation.confidence,
        input.llmCrossValidation.summary,
      ] as const,
      [
        'llm_legal_assessment',
        input.llmLegalAssessment.recommendation,
        input.llmLegalAssessment.confidence,
        input.llmLegalAssessment.summary,
      ] as const,
    ];

    const severityOrder = {
      APPROVED: 0,
      REQUIRES_REVIEW: 1,
      REJECTED: 2,
    } as const;

    const [dominantSource, dominantStatus, dominantConfidence, dominantSummary] = candidates.reduce(
      (best, current) => {
        const bestRank = severityOrder[best[1]];
        const currentRank = severityOrder[current[1]];
        if (currentRank > bestRank) {
          return current;
        }
        if (currentRank === bestRank && current[2] > best[2]) {
          return current;
        }
        return best;
      },
    );

    if (dominantSource === 'rules') {
      return baseResult;
    }

    const combinedErrorCodes = [...baseResult.error_codes];
    for (const review of [input.llmCrossValidation, input.llmLegalAssessment]) {
      for (const finding of review.findings) {
        for (const relatedCheck of finding.relatedChecks) {
          if (!combinedErrorCodes.includes(relatedCheck)) {
            combinedErrorCodes.push(relatedCheck);
          }
        }
      }
    }

    return {
      status: dominantStatus,
      confidence: dominantConfidence,
      summary: dominantSummary,
      error_codes: combinedErrorCodes,
    };
  }

  private alignLlmReviewForParity(input: {
    snapshot: JobRecord['normalizedSnapshot'];
    checks: CrossValidationCheck[];
    review: LLMValidationReview;
  }): LLMValidationReview {
    const snapshot = input.snapshot;
    if (!snapshot) {
      return input.review;
    }

    const failedChecks = input.checks.filter((check) => check.status === 'FAILED');
    if (failedChecks.length > 0) {
      return input.review;
    }

    const findingCodes = new Set(input.review.findings.map((finding) => finding.code));
    const addressFindingCodes = new Set([
      'FISCAL_ADDRESS_MISMATCH',
      'ADDRESS_MISMATCH',
      'ADDRESS_DISCREPANCY_MINOR',
      'INCONSISTENT_ADDRESS_MINOR',
      'FISCAL_ADDRESS_INCONSISTENCY',
    ]);
    const cedulaMetadataFindingCodes = new Set([
      'INCOMPLETE_ID_DATA',
      'INCOMPLETE_IDENTITY_DATA',
      'INCOMPLETE_IDENTITY_DOCUMENT_METADATA',
      'CEDULA_EXPIRATION_UNKNOWN',
      'CEDULA_EXPIRATION_MISSING',
    ]);

    const hasOnlyAddressMismatch =
      findingCodes.size > 0 && [...findingCodes].every((code) => addressFindingCodes.has(code));
    if (input.review.recommendation === 'REJECTED' && hasOnlyAddressMismatch) {
      return {
        ...input.review,
        recommendation: 'REQUIRES_REVIEW',
      };
    }

    const hasRepresentativeMatch = input.checks.some(
      (check) =>
        check.code === 'CEDULA_MATCHES_LEGAL_REPRESENTATIVE' && check.status === 'PASSED',
    );
    const hasRifValidity = input.checks.some(
      (check) => check.code === 'RIF_VALIDITY' && check.status === 'PASSED',
    );
    const hasCedulaPolicySkipped = input.checks.some(
      (check) => check.code === 'CEDULA_VALIDITY_POLICY' && check.status === 'SKIPPED',
    );
    const hasOnlyBenignFirmaPersonalSignals =
      snapshot.legalMode === 'firma_personal' &&
      hasRepresentativeMatch &&
      hasRifValidity &&
      findingCodes.size > 0 &&
      [...findingCodes].every(
        (code) => addressFindingCodes.has(code) || cedulaMetadataFindingCodes.has(code),
      );

    if (
      input.review.recommendation === 'REQUIRES_REVIEW' &&
      hasCedulaPolicySkipped &&
      hasOnlyBenignFirmaPersonalSignals
    ) {
      return {
        ...input.review,
        recommendation: 'APPROVED',
        summary:
          'El expediente es consistente y los hallazgos restantes son menores o informativos para firma personal.',
      };
    }

    return input.review;
  }

  private buildRuleFindings(checks: CrossValidationCheck[]): CrossValidationFinding[] {
    return checks
      .filter((check) => check.status !== 'PASSED')
      .map((check) => ({
        source: 'rules',
        severity: check.status === 'FAILED' ? 'CRITICAL' : 'WARNING',
        code: check.code,
        message: check.message,
        relatedChecks: [check.code],
      }));
  }
}

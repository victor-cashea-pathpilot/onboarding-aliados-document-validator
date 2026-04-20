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
      const intakeRecord: JobRecord = {
        ...record,
        status: 'PROCESSING',
        progress: {
          stage: 'document_intake',
          percentage: 25,
          message: 'Validando acceso y formato de documentos.',
        },
        updatedAt: new Date().toISOString(),
      };
      await this.repository.update(intakeRecord);

      const intakeDocuments = await this.documentIntake.buildDocumentsResult(intakeRecord);
      const extractionPendingRecord: JobRecord = {
        ...intakeRecord,
        progress: {
          stage: 'document_extraction',
          percentage: 65,
          message: 'Extrayendo datos de documentos en paralelo.',
        },
        documents: intakeDocuments,
        updatedAt: new Date().toISOString(),
      };
      await this.repository.update(extractionPendingRecord);

      const extractedDocuments = await this.documentExtraction.extractDocuments(
        intakeDocuments,
        extractionPendingRecord,
      );

      const normalizationRecord: JobRecord = {
        ...extractionPendingRecord,
        progress: {
          stage: 'document_normalization',
          percentage: 80,
          message: 'Normalizando datos extraídos y consolidando snapshot canónico.',
        },
        documents: extractedDocuments,
        updatedAt: new Date().toISOString(),
      };
      await this.repository.update(normalizationRecord);

      const normalizedSnapshot = this.documentNormalization.normalize(
        normalizationRecord.merchantId,
        extractedDocuments,
      );

      const crossValidationRecord: JobRecord = {
        ...normalizationRecord,
        progress: {
          stage: 'cross_validation',
          percentage: 90,
          message: 'Ejecutando validaciones cruzadas sobre datos normalizados.',
        },
        documents: extractedDocuments,
        normalizedSnapshot,
        updatedAt: new Date().toISOString(),
      };
      await this.repository.update(crossValidationRecord);

      const checks = this.crossValidation.validate(normalizedSnapshot);
      const [rawLlmCrossValidation, rawLlmLegalAssessment] = await Promise.all([
        this.crossValidationLlm.review({
          snapshot: normalizedSnapshot,
          checks,
        }),
        this.legalAssessmentLlm.assess({
          snapshot: normalizedSnapshot,
          checks,
        }),
      ]);
      const llmCrossValidation = this.alignLlmReviewForParity({
        snapshot: normalizedSnapshot,
        checks,
        review: rawLlmCrossValidation,
      });
      const llmLegalAssessment = this.alignLlmReviewForParity({
        snapshot: normalizedSnapshot,
        checks,
        review: rawLlmLegalAssessment,
      });

      const failedChecks = checks.filter((check) => check.status === 'FAILED');
      const overallResult = this.composeCrossValidationResult({
        failedChecks,
        llmCrossValidation,
        llmLegalAssessment,
      });

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
        updatedAt: new Date().toISOString(),
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

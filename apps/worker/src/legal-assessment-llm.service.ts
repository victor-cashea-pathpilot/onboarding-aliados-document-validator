import { Injectable } from '@nestjs/common';
import type {
  CrossValidationCheck,
  CrossValidationFinding,
  LLMValidationReview,
} from '@contracts';
import type { CanonicalMerchantSnapshot } from '@domain';
import type { GeminiClient, LoggerLike } from '@infrastructure';
import { getInfrastructureSettings } from '@infrastructure';
import { buildLegalAssessmentPrompt } from './validation-prompts';

@Injectable()
export class LegalAssessmentLlmService {
  private readonly settings = getInfrastructureSettings();
  private readonly modelName = this.settings.geminiModelComplex;

  constructor(
    private readonly geminiClient: GeminiClient,
    private readonly logger: LoggerLike,
  ) {}

  async assess(input: {
    snapshot: CanonicalMerchantSnapshot;
    checks: CrossValidationCheck[];
  }): Promise<LLMValidationReview> {
    const startedAt = Date.now();
    const prompt = buildLegalAssessmentPrompt(input.snapshot.legalMode);

    if (!this.settings.enableLlmLegalAssessment) {
      return {
        recommendation: 'APPROVED',
        confidence: 0,
        summary: 'La evaluación legal asistida por LLM está deshabilitada.',
        findings: [],
        prompt,
        model: this.modelName,
      };
    }

    if (this.settings.mockMode) {
      const review = this.mockAssessment(input, prompt);
      this.logger.info('legal_assessment.llm.completed', {
        event: 'legal_assessment.llm.completed',
        mode: 'mock',
        durationMs: Date.now() - startedAt,
        legalMode: input.snapshot.legalMode,
        recommendation: review.recommendation,
        confidence: review.confidence,
      });
      return review;
    }

    const response = await this.geminiClient.analyzeJson({
      model: this.modelName,
      prompt,
      payload: {
        snapshot: input.snapshot as unknown as Record<string, unknown>,
        checks: input.checks as unknown as Record<string, unknown>,
      },
    });
    const review = this.parseResponse(response, 'llm_legal_assessment', prompt);
    this.logger.info('legal_assessment.llm.completed', {
      event: 'legal_assessment.llm.completed',
      mode: 'vertex_ai',
      model: this.modelName,
      durationMs: Date.now() - startedAt,
      legalMode: input.snapshot.legalMode,
      recommendation: review.recommendation,
      confidence: review.confidence,
    });
    return review;
  }

  private mockAssessment(input: {
    snapshot: CanonicalMerchantSnapshot;
    checks: CrossValidationCheck[];
  }, prompt: string): LLMValidationReview {
    const failedCodes = new Set(
      input.checks.filter((check) => check.status === 'FAILED').map((check) => check.code),
    );

    if (failedCodes.has('RIF_VALIDITY') || failedCodes.has('CEDULA_VALIDITY_POLICY')) {
      return {
        recommendation: 'REJECTED',
        confidence: 90,
        summary:
          'La evaluación legal recomienda rechazo por evidencia de invalidez fiscal o de identificación.',
        findings: [
          {
            source: 'llm_legal_assessment',
            severity: 'CRITICAL',
            code: 'LEGAL_IDENTITY_OR_FISCAL_INVALID',
            message:
              'Existe una condición material que impide sostener una aprobación operativa.',
            relatedChecks: [...failedCodes].filter((code) =>
              ['RIF_VALIDITY', 'CEDULA_VALIDITY_POLICY'].includes(code),
            ),
          },
        ],
        prompt,
        model: this.modelName,
      };
    }

    if (input.snapshot.legalMode === 'unknown' || failedCodes.size > 0) {
      return {
        recommendation: 'REQUIRES_REVIEW',
        confidence: 80,
        summary:
          'La evaluación legal recomienda revisión manual por ambigüedad o contradicciones pendientes.',
        findings: [
          {
            source: 'llm_legal_assessment',
            severity: 'WARNING',
            code: 'LEGAL_REVIEW_REQUIRED',
            message:
              'El expediente requiere criterio humano para validar representación, vigencia o consistencia material.',
            relatedChecks:
              failedCodes.size > 0 ? [...failedCodes].sort() : ['LEGAL_MODE_DETECTED'],
          },
        ],
        prompt,
        model: this.modelName,
      };
    }

    return {
      recommendation: 'APPROVED',
      confidence: 89,
      summary:
        'La evaluación legal considera suficiente la evidencia para continuar con el onboarding.',
      findings: [
        {
          source: 'llm_legal_assessment',
          severity: 'INFO',
          code: 'LEGAL_SUFFICIENCY_OK',
          message:
            'La evidencia legal disponible es consistente con una aprobación inicial.',
          relatedChecks: [],
        },
      ],
      prompt,
      model: this.modelName,
    };
  }

  private parseResponse(
    response: Record<string, unknown>,
    source: CrossValidationFinding['source'],
    prompt: string,
  ): LLMValidationReview {
    const items = Array.isArray(response.findings) ? response.findings : [];
    const findings: CrossValidationFinding[] = items.map((item) => {
      const row = (item ?? {}) as Record<string, unknown>;
      return {
        source,
        severity: (row.severity as CrossValidationFinding['severity']) ?? 'WARNING',
        code: String(row.code ?? 'LLM_LEGAL_NOTE'),
        message: String(row.message ?? ''),
        relatedChecks: Array.isArray(row.related_checks)
          ? row.related_checks.map((value) => String(value))
          : [],
      };
    });

    return {
      recommendation:
        (response.recommendation as LLMValidationReview['recommendation']) ??
        'REQUIRES_REVIEW',
      confidence: Number(response.confidence ?? 0),
      summary: String(response.summary ?? '').trim(),
      findings,
      prompt,
      model: this.modelName,
    };
  }
}

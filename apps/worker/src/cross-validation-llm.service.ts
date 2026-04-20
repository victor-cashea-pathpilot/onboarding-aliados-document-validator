import { Injectable } from '@nestjs/common';
import type {
  CrossValidationCheck,
  CrossValidationFinding,
  LLMValidationReview,
} from '@contracts';
import type { CanonicalMerchantSnapshot } from '@domain';
import type { GeminiClient, LoggerLike } from '@infrastructure';
import { getInfrastructureSettings } from '@infrastructure';
import { buildCrossValidationLlmPrompt } from './validation-prompts';

@Injectable()
export class CrossValidationLlmService {
  private readonly settings = getInfrastructureSettings();
  private readonly modelName = this.settings.geminiModelComplex;

  constructor(
    private readonly geminiClient: GeminiClient,
    private readonly logger: LoggerLike,
  ) {}

  async review(input: {
    snapshot: CanonicalMerchantSnapshot;
    checks: CrossValidationCheck[];
  }): Promise<LLMValidationReview> {
    const startedAt = Date.now();
    const prompt = buildCrossValidationLlmPrompt(input.snapshot.legalMode);

    if (!this.settings.enableLlmCrossValidation) {
      return {
        recommendation: 'APPROVED',
        confidence: 0,
        summary: 'La validación cruzada asistida por LLM está deshabilitada.',
        findings: [],
        prompt,
        model: this.modelName,
      };
    }

    if (this.settings.mockMode) {
      const review = this.mockReview(input, prompt);
      this.logger.info('cross_validation.llm.completed', {
        event: 'cross_validation.llm.completed',
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
    const review = this.parseResponse(response, 'llm_cross_validation', prompt);
    this.logger.info('cross_validation.llm.completed', {
      event: 'cross_validation.llm.completed',
      mode: 'vertex_ai',
      model: this.modelName,
      durationMs: Date.now() - startedAt,
      legalMode: input.snapshot.legalMode,
      recommendation: review.recommendation,
      confidence: review.confidence,
    });
    return review;
  }

  private mockReview(input: {
    snapshot: CanonicalMerchantSnapshot;
    checks: CrossValidationCheck[];
  }, prompt: string): LLMValidationReview {
    const failedCodes = new Set(
      input.checks.filter((check) => check.status === 'FAILED').map((check) => check.code),
    );
    const findings: CrossValidationFinding[] = [];

    if (input.snapshot.legalMode === 'unknown') {
      findings.push({
        source: 'llm_cross_validation',
        severity: 'WARNING',
        code: 'LEGAL_MODE_UNCLEAR',
        message: 'El expediente no permite inferir con claridad el modo legal.',
        relatedChecks: ['LEGAL_MODE_DETECTED'],
      });
    }

    if (failedCodes.has('COMPANY_NAME_MATCH')) {
      findings.push({
        source: 'llm_cross_validation',
        severity: 'CRITICAL',
        code: 'MATERIAL_IDENTITY_MISMATCH',
        message:
          'La identidad comercial o del titular no coincide materialmente entre documentos.',
        relatedChecks: ['COMPANY_NAME_MATCH'],
      });
    }

    if (failedCodes.has('SIGNATURE_SCHEME_SUPPORTED')) {
      findings.push({
        source: 'llm_cross_validation',
        severity: 'CRITICAL',
        code: 'SIGNATURE_SUPPORT_GAP',
        message:
          'El esquema de firma declarado no queda suficientemente soportado por la representación vigente.',
        relatedChecks: ['SIGNATURE_SCHEME_SUPPORTED'],
      });
    }

    if (failedCodes.has('CEDULA_MATCHES_LEGAL_REPRESENTATIVE')) {
      findings.push({
        source: 'llm_cross_validation',
        severity: 'WARNING',
        code: 'REPRESENTATIVE_ID_MISMATCH',
        message:
          'La cédula principal no coincide con la representación vigente que surge del expediente.',
        relatedChecks: ['CEDULA_MATCHES_LEGAL_REPRESENTATIVE'],
      });
    }

    if (failedCodes.size > 0 && findings.length === 0) {
      findings.push({
        source: 'llm_cross_validation',
        severity: 'WARNING',
        code: 'CROSS_VALIDATION_INCONSISTENCY',
        message:
          'Existen hallazgos determinísticos que requieren una revisión contextual adicional.',
        relatedChecks: [...failedCodes].sort(),
      });
    }

    if (findings.length > 0) {
      return {
        recommendation: 'REQUIRES_REVIEW',
        confidence: 78,
        summary:
          'La revisión contextual detectó inconsistencias materiales o vacíos de soporte jurídico.',
        findings,
        prompt,
        model: this.modelName,
      };
    }

    return {
      recommendation: 'APPROVED',
      confidence: 88,
      summary:
        'La revisión contextual no detectó contradicciones materiales adicionales a las reglas duras.',
      findings: [
        {
          source: 'llm_cross_validation',
          severity: 'INFO',
          code: 'CONTEXTUAL_REVIEW_OK',
          message:
            'El snapshot y los checks determinísticos son coherentes para el modo legal detectado.',
          relatedChecks: ['LEGAL_MODE_DETECTED'],
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
        code: String(row.code ?? 'LLM_VALIDATION_NOTE'),
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

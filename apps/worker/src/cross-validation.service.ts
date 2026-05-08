import { Injectable } from '@nestjs/common';
import type { CanonicalMerchantSnapshot, CanonicalRepresentative } from '@domain';

interface CrossValidationCheck {
  code: string;
  status: 'PASSED' | 'FAILED' | 'SKIPPED';
  message: string;
}

@Injectable()
export class CrossValidationService {
  validate(snapshot: CanonicalMerchantSnapshot): CrossValidationCheck[] {
    return [
      this.legalModeDetected(snapshot),
      this.checkPresence(
        'HAS_RIF',
        snapshot.presence.rif,
        'Se recibió al menos un RIF.',
        'No se recibió RIF.',
      ),
      this.checkPresence(
        'HAS_CEDULA',
        snapshot.presence.cedula,
        'Se recibió al menos una cédula.',
        'No se recibió cédula.',
      ),
      this.cedulaValidityPolicy(snapshot),
      this.rifNatureAllowed(snapshot),
      this.checkPresence(
        'HAS_CONSTITUTIVE_DOC',
        snapshot.presence.acta_constitutiva ||
          snapshot.presence.acta_mercantil ||
          snapshot.presence.certificado_emprendimiento,
        'Se recibió al menos un documento constitutivo.',
        'No se recibió documento constitutivo o certificado de emprendimiento.',
      ),
      this.corporateDocumentPrecedence(snapshot),
      this.companyNameMatch(snapshot),
      this.cedulaMatchesLegalRepresentative(snapshot),
      this.companyValidity(snapshot),
      this.boardValidity(snapshot),
      this.rifValidity(snapshot),
      this.businessActivityAllowed(snapshot),
      this.signatureAuthority(snapshot),
      this.signatureSchemeSupported(snapshot),
    ];
  }

  private checkPresence(
    code: string,
    condition: boolean,
    okMessage: string,
    failMessage: string,
  ): CrossValidationCheck {
    return {
      code,
      status: condition ? 'PASSED' : 'FAILED',
      message: condition ? okMessage : failMessage,
    };
  }

  private legalModeDetected(snapshot: CanonicalMerchantSnapshot): CrossValidationCheck {
    const legalMode = snapshot.legalMode;
    if (legalMode === 'unknown') {
      return {
        code: 'LEGAL_MODE_DETECTED',
        status: 'FAILED',
        message: 'No fue posible inferir el modo legal del expediente.',
      };
    }
    return {
      code: 'LEGAL_MODE_DETECTED',
      status: 'PASSED',
      message: `Se detectó modo legal ${legalMode}.`,
    };
  }

  private corporateDocumentPrecedence(snapshot: CanonicalMerchantSnapshot): CrossValidationCheck {
    if (snapshot.legalMode === 'emprendimiento') {
      return {
        code: 'CORPORATE_DOCUMENT_PRECEDENCE',
        status: 'SKIPPED',
        message: 'La precedencia corporativa no aplica a certificados de emprendimiento.',
      };
    }

    if (!snapshot.presence.acta_constitutiva && !snapshot.presence.acta_mercantil) {
      return {
        code: 'CORPORATE_DOCUMENT_PRECEDENCE',
        status: 'SKIPPED',
        message: 'No hay suficientes documentos corporativos para evaluar precedencia.',
      };
    }

    const sourceType = snapshot.companyRecord.sourceDocumentType;
    const sourceDate = this.parseOptionalDate(snapshot.companyRecord.sourceDocumentDate);
    if (!sourceType) {
      return {
        code: 'CORPORATE_DOCUMENT_PRECEDENCE',
        status: 'FAILED',
        message: 'No fue posible determinar el documento corporativo vigente.',
      };
    }

    if (
      snapshot.presence.acta_mercantil &&
      snapshot.presence.acta_constitutiva &&
      sourceType === 'acta_constitutiva'
    ) {
      const latestMercRepresentativeDate = snapshot.representatives
        .filter((rep) => rep.sourceDocumentType === 'acta_mercantil')
        .map((rep) => this.parseOptionalDate(rep.sourceDocumentDate))
        .filter((value): value is Date => value instanceof Date)
        .sort((left, right) => right.getTime() - left.getTime())[0];

      if (
        latestMercRepresentativeDate &&
        sourceDate &&
        latestMercRepresentativeDate.getTime() > sourceDate.getTime()
      ) {
        return {
          code: 'CORPORATE_DOCUMENT_PRECEDENCE',
          status: 'FAILED',
          message: 'Existe evidencia mercantil posterior que no quedó como fuente vigente.',
        };
      }
    }

    return {
      code: 'CORPORATE_DOCUMENT_PRECEDENCE',
      status: 'PASSED',
      message: 'La fuente corporativa vigente fue consolidada con la precedencia esperada.',
    };
  }

  private companyNameMatch(snapshot: CanonicalMerchantSnapshot): CrossValidationCheck {
    const rifName = this.normalizeText(snapshot.rifCompanyName);
    const legalName = this.normalizeText(snapshot.companyRecord.companyName);
    if (!rifName || !legalName) {
      return {
        code: 'COMPANY_NAME_MATCH',
        status: 'SKIPPED',
        message:
          'No hay suficientes datos para comparar la razón social entre RIF y documentos legales.',
      };
    }

    const namesMatch = this.namesMatch(snapshot, rifName, legalName);
    return {
      code: 'COMPANY_NAME_MATCH',
      status: namesMatch ? 'PASSED' : 'FAILED',
      message: namesMatch
        ? 'La razón social del RIF coincide con la de los documentos legales.'
        : 'La razón social del RIF no coincide con la de los documentos legales.',
    };
  }

  // NOTE: FISCAL_ADDRESS_MATCH intentionally removed.
  // The legal team does not validate fiscal address consistency — the merchant's
  // preferred address is what they register in their store information.
  // Comparing RIF address against corporate document address was producing
  // false CRITICAL findings for addresses that are the same location written
  // differently across document types (e.g. RIF uses bureaucratic long form,
  // notarial docs use a shorter form).

  private cedulaMatchesLegalRepresentative(
    snapshot: CanonicalMerchantSnapshot,
  ): CrossValidationCheck {
    const cedula = this.normalizeId(snapshot.primaryCedulaId);
    const legalIds = new Set(
      this.activeRepresentatives(snapshot)
        .map((rep) => this.normalizeId(rep.idNumber))
        .filter(Boolean),
    );
    if (!cedula || legalIds.size === 0) {
      return {
        code: 'CEDULA_MATCHES_LEGAL_REPRESENTATIVE',
        status: 'SKIPPED',
        message:
          'No hay suficientes datos para comparar la cédula con representantes legales.',
      };
    }
    return {
      code: 'CEDULA_MATCHES_LEGAL_REPRESENTATIVE',
      status: legalIds.has(cedula) ? 'PASSED' : 'FAILED',
      message: legalIds.has(cedula)
        ? 'La cédula coincide con al menos un representante legal vigente.'
        : 'La cédula no coincide con ningún representante legal vigente.',
    };
  }

  private cedulaValidityPolicy(snapshot: CanonicalMerchantSnapshot): CrossValidationCheck {
    const expiration = this.parseOptionalDate(snapshot.primaryCedulaExpirationDate);
    if (!expiration) {
      return {
        code: 'CEDULA_VALIDITY_POLICY',
        status: 'SKIPPED',
        message: 'No hay fecha suficiente para evaluar la política de vigencia de la cédula.',
      };
    }

    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    if (expiration.getTime() >= today.getTime()) {
      return {
        code: 'CEDULA_VALIDITY_POLICY',
        status: 'PASSED',
        message: 'La cédula figura vigente según la fecha extraída.',
      };
    }

    if (this.addYears(expiration, 10).getTime() < today.getTime()) {
      return {
        code: 'CEDULA_VALIDITY_POLICY',
        status: 'FAILED',
        message: 'La cédula figura vencida por más de 10 años y debe rechazarse por política.',
      };
    }

    return {
      code: 'CEDULA_VALIDITY_POLICY',
      status: 'PASSED',
      message: 'La cédula figura vencida, pero dentro del umbral permitido de hasta 10 años.',
    };
  }

  private rifNatureAllowed(snapshot: CanonicalMerchantSnapshot): CrossValidationCheck {
    const prefix = this.rifPrefix(snapshot.rifNumber);
    if (!prefix) {
      return {
        code: 'RIF_NATURE_ALLOWED',
        status: 'SKIPPED',
        message: 'No hay número de RIF suficiente para evaluar la naturaleza permitida.',
      };
    }

    const allowedPrefixes =
      snapshot.legalMode === 'sociedad_mercantil'
        ? ['J']
        : snapshot.legalMode === 'firma_personal' || snapshot.legalMode === 'emprendimiento'
          ? ['V']
          : ['J', 'V'];

    const valid = allowedPrefixes.includes(prefix);
    return {
      code: 'RIF_NATURE_ALLOWED',
      status: valid ? 'PASSED' : 'FAILED',
      message: valid
        ? `El prefijo ${prefix}- del RIF es compatible con el modo legal detectado.`
        : `El prefijo ${prefix}- del RIF no es compatible con el modo legal detectado.`,
    };
  }

  private companyValidity(snapshot: CanonicalMerchantSnapshot): CrossValidationCheck {
    if (snapshot.legalMode === 'firma_personal') {
      return {
        code: 'COMPANY_VALIDITY',
        status: 'PASSED',
        message: 'La vigencia societaria no aplica como control separado para firma personal.',
      };
    }

    const status = this.normalizeText(snapshot.companyRecord.companyStatus);
    const expiration = this.parseOptionalDate(snapshot.companyRecord.companyExpirationDate);

    if (!status && !expiration) {
      return {
        code: 'COMPANY_VALIDITY',
        status: 'SKIPPED',
        message: 'No hay datos suficientes para evaluar la vigencia de la compañía.',
      };
    }

    if (status.includes('vencida') || status.includes('expirada')) {
      return {
        code: 'COMPANY_VALIDITY',
        status: 'FAILED',
        message: 'La compañía figura como vencida o expirada en el expediente.',
      };
    }

    if (expiration) {
      const today = this.todayUtc();
      if (expiration.getTime() < today.getTime()) {
        return {
          code: 'COMPANY_VALIDITY',
          status: 'FAILED',
          message: 'La compañía figura vencida según la fecha de duración societaria.',
        };
      }
    }

    return {
      code: 'COMPANY_VALIDITY',
      status: 'PASSED',
      message: 'La compañía figura vigente según la evidencia societaria disponible.',
    };
  }

  private boardValidity(snapshot: CanonicalMerchantSnapshot): CrossValidationCheck {
    if (snapshot.legalMode === 'firma_personal') {
      return {
        code: 'BOARD_VALIDITY',
        status: 'PASSED',
        message: 'La vigencia de junta no aplica para firma personal.',
      };
    }
    const boardStatus = this.normalizeText(snapshot.companyRecord.boardStatus);
    if (!boardStatus) {
      return {
        code: 'BOARD_VALIDITY',
        status: 'SKIPPED',
        message: 'No hay datos suficientes para evaluar vigencia de junta directiva.',
      };
    }

    const evaluation = this.evaluateBoardValidity(snapshot);
    if (!evaluation) {
      return {
        code: 'BOARD_VALIDITY',
        status: 'SKIPPED',
        message: 'No hay datos suficientes para evaluar vigencia de junta directiva.',
      };
    }

    if (evaluation.status === 'PASSED') {
      return {
        code: 'BOARD_VALIDITY',
        status: 'PASSED',
        message: evaluation.message,
      };
    }
    return {
      code: 'BOARD_VALIDITY',
      status: 'FAILED',
      message: evaluation.message,
    };
  }

  private rifValidity(snapshot: CanonicalMerchantSnapshot): CrossValidationCheck {
    const expiration = this.parseOptionalDate(snapshot.rifExpirationDate);
    if (!expiration) {
      return {
        code: 'RIF_VALIDITY',
        status: 'SKIPPED',
        message: 'No hay fecha suficiente para evaluar vigencia del RIF.',
      };
    }
    const today = this.todayUtc();
    const valid = expiration.getTime() >= today.getTime();
    if (valid) {
      return {
        code: 'RIF_VALIDITY',
        status: 'PASSED',
        message: 'El RIF figura vigente.',
      };
    }

    const withinGrace = this.addMonths(expiration, 6).getTime() >= today.getTime();
    return {
      code: 'RIF_VALIDITY',
      status: withinGrace ? 'SKIPPED' : 'FAILED',
      message: withinGrace
        ? 'El RIF figura vencido, pero todavía está dentro de la ventana de tolerancia de hasta 6 meses.'
        : 'El RIF figura vencido por más de 6 meses.',
    };
  }

  private businessActivityAllowed(snapshot: CanonicalMerchantSnapshot): CrossValidationCheck {
    const businessSummary = this.normalizeComparableText(snapshot.companyRecord.businessSummary);
    const companyName = this.normalizeComparableText(snapshot.companyRecord.companyName);
    const candidateText = [businessSummary, companyName].filter(Boolean).join(' ');
    if (!candidateText) {
      return {
        code: 'BUSINESS_ACTIVITY_ALLOWED',
        status: 'SKIPPED',
        message: 'No hay descripción suficiente del giro comercial para evaluar exclusiones.',
      };
    }

    const matchedRule = this.excludedActivityRule(candidateText);
    if (!matchedRule) {
      return {
        code: 'BUSINESS_ACTIVITY_ALLOWED',
        status: 'PASSED',
        message: 'El giro comercial no cae en una categoría excluida por política.',
      };
    }

    return {
      code: 'BUSINESS_ACTIVITY_ALLOWED',
      status: 'FAILED',
      message: `El giro comercial coincide con una categoría excluida: ${matchedRule.label}.`,
    };
  }

  private signatureAuthority(snapshot: CanonicalMerchantSnapshot): CrossValidationCheck {
    const representatives = this.activeRepresentatives(snapshot).filter(
      (rep) => rep.signatureType || rep.authorityDetails || rep.role,
    );
    if (representatives.length === 0) {
      return {
        code: 'SIGNATURE_AUTHORITY_PRESENT',
        status: 'SKIPPED',
        message: 'No hay suficientes datos para validar facultad de firma.',
      };
    }

    let valid = false;
    if (snapshot.legalMode === 'firma_personal') {
      valid =
        representatives.some(
          (rep) =>
            this.normalizeId(rep.idNumber) === this.normalizeId(snapshot.primaryCedulaId),
        ) || representatives.some((rep) => Boolean(rep.authorityDetails));
    } else {
      valid = representatives.some((rep) => {
        const signatureType = this.normalizeText(rep.signatureType);
        return (
          signatureType === 'separada' ||
          signatureType === 'conjunta' ||
          Boolean(rep.authorityDetails)
        );
      });
    }

    return {
      code: 'SIGNATURE_AUTHORITY_PRESENT',
      status: valid ? 'PASSED' : 'FAILED',
      message: valid
        ? 'Se encontró información suficiente de facultad de firma.'
        : 'No se encontró información suficiente de facultad de firma.',
    };
  }

  private signatureSchemeSupported(snapshot: CanonicalMerchantSnapshot): CrossValidationCheck {
    const representatives = this.activeRepresentatives(snapshot);
    if (representatives.length === 0) {
      return {
        code: 'SIGNATURE_SCHEME_SUPPORTED',
        status: 'SKIPPED',
        message:
          'No hay suficientes representantes vigentes para validar el esquema de firma.',
      };
    }

    const signatureType = this.normalizeText(representatives[0].signatureType);
    if (!signatureType) {
      return {
        code: 'SIGNATURE_SCHEME_SUPPORTED',
        status: 'SKIPPED',
        message: 'No hay tipo de firma explícito para validar el esquema de firma.',
      };
    }

    const supportedRepresentatives = representatives.filter(
      (rep) => this.signatureProbability(rep.signatureValidityProbability) >= 70 || !!rep.idNumber,
    );

    if (signatureType === 'conjunta') {
      const valid = supportedRepresentatives.length >= 2;
      return {
        code: 'SIGNATURE_SCHEME_SUPPORTED',
        status: valid ? 'PASSED' : 'FAILED',
        message: valid
          ? 'La firma conjunta está soportada por al menos dos representantes vigentes.'
          : 'La firma conjunta no queda soportada por suficientes representantes vigentes.',
      };
    }

    if (signatureType === 'separada') {
      const valid = supportedRepresentatives.length >= 1;
      return {
        code: 'SIGNATURE_SCHEME_SUPPORTED',
        status: valid ? 'PASSED' : 'FAILED',
        message: valid
          ? 'La firma separada está soportada por representación vigente.'
          : 'La firma separada no tiene soporte suficiente en la representación vigente.',
      };
    }

    return {
      code: 'SIGNATURE_SCHEME_SUPPORTED',
      status: 'SKIPPED',
      message: 'El tipo de firma no fue reconocido para validar soporte.',
    };
  }

  private activeRepresentatives(snapshot: CanonicalMerchantSnapshot): CanonicalRepresentative[] {
    const boardIsEffectivelyValid = this.evaluateBoardValidity(snapshot)?.status === 'PASSED';
    return snapshot.representatives.filter((rep) => {
      const boardStatus = this.normalizeText(rep.boardStatus);
      if (!boardStatus) {
        return true;
      }
      if (!boardStatus.includes('vencida') && !boardStatus.includes('vencido')) {
        return true;
      }
      return boardIsEffectivelyValid;
    });
  }

  private evaluateBoardValidity(
    snapshot: CanonicalMerchantSnapshot,
  ): Pick<CrossValidationCheck, 'status' | 'message'> | null {
    const boardStatus = this.normalizeText(snapshot.companyRecord.boardStatus);
    if (!boardStatus) {
      return null;
    }

    const failed = boardStatus.includes('vencida') || boardStatus.includes('vencido');
    if (!failed) {
      return {
        status: 'PASSED',
        message: 'La junta directiva figura como vigente o no aplica.',
      };
    }

    const expiration = this.parseOptionalDate(snapshot.companyRecord.boardExpirationDate);
    if (!expiration) {
      return {
        status: 'FAILED',
        message:
          'La junta figura vencida, pero no hay fecha suficiente para aplicar una excepción de vigencia.',
      };
    }

    const holdover = this.normalizeYesNoUnknown(snapshot.companyRecord.boardHoldoverUntilReplaced);
    const statutoryTermYears = this.parseYears(snapshot.companyRecord.boardStatutoryTerm);
    const today = this.todayUtc();

    if (holdover === 'YES') {
      if (!statutoryTermYears) {
        return {
          status: 'FAILED',
          message:
            'La junta invoca continuidad hasta ser sustituida, pero falta el plazo estatutario para validar la gracia.',
        };
      }
      if (statutoryTermYears > 20) {
        return {
          status: 'FAILED',
          message:
            'La junta vencida supera un plazo estatutario de 20 años y requeriría certificación adicional fuera del alcance automático.',
        };
      }

      const graceExpiration = this.addYears(expiration, statutoryTermYears);
      const valid = graceExpiration.getTime() >= today.getTime();
      return {
        status: valid ? 'PASSED' : 'FAILED',
        message: valid
          ? 'La junta vencida conserva vigencia por cláusula de continuidad hasta ser sustituida dentro del plazo estatutario.'
          : 'La junta vencida ya agotó la gracia derivada de la cláusula de continuidad estatutaria.',
      };
    }

    const graceExpiration = this.addYears(expiration, 5);
    const valid = graceExpiration.getTime() >= today.getTime();
    return {
      status: valid ? 'PASSED' : 'FAILED',
      message: valid
        ? 'La junta vencida queda dentro de la gracia general de 5 años al no existir cláusula expresa de continuidad.'
        : 'La junta directiva figura vencida y fuera de la gracia general de 5 años.',
    };
  }

  private namesMatch(
    snapshot: CanonicalMerchantSnapshot,
    rifName: string,
    legalName: string,
  ): boolean {
    if (rifName === legalName) {
      return true;
    }

    if (snapshot.legalMode === 'emprendimiento' || snapshot.legalMode === 'firma_personal') {
      const rifTokens = this.tokenSet(rifName);
      const representativeTokens = new Set(
        snapshot.representatives
          .flatMap((rep) => [...this.tokenSet(this.normalizeText(rep.fullName))])
          .filter(Boolean),
      );
      if (rifTokens.size > 0 && representativeTokens.size > 0) {
        return this.setsEqual(rifTokens, representativeTokens);
      }
    }

    return false;
  }

  private rifPrefix(value: string): string {
    const normalized = value.trim().toUpperCase();
    const match = normalized.match(/^([A-Z])\s*-/);
    return match?.[1] ?? '';
  }

  private parseOptionalDate(value: string): Date | null {
    const cleaned = (value ?? '').trim();
    if (!cleaned || cleaned.toUpperCase() === 'NO_ENCONTRADO') {
      return null;
    }
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(cleaned)) {
      const [day, month, year] = cleaned.split('/').map(Number);
      return new Date(Date.UTC(year, month - 1, day));
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
      return new Date(`${cleaned}T00:00:00.000Z`);
    }
    return null;
  }

  private addYears(value: Date, years: number): Date {
    const result = new Date(value.getTime());
    result.setUTCFullYear(result.getUTCFullYear() + years);
    if (result.getUTCMonth() !== value.getUTCMonth()) {
      return new Date(Date.UTC(value.getUTCFullYear() + years, 1, 28));
    }
    return result;
  }

  private addMonths(value: Date, months: number): Date {
    const result = new Date(value.getTime());
    result.setUTCMonth(result.getUTCMonth() + months);
    if (result.getUTCDate() !== value.getUTCDate()) {
      return new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0));
    }
    return result;
  }

  private todayUtc(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  private normalizeComparableText(value: string): string {
    return this.normalizeText(value)
      .replace(/\bca\b/g, 'c a')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private normalizeText(value: string): string {
    return (value ?? '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .join(' ');
  }

  private tokenSet(value: string): Set<string> {
    return new Set(this.normalizeText(value).split(' ').filter(Boolean));
  }

  private setsEqual(left: Set<string>, right: Set<string>): boolean {
    if (left.size !== right.size) {
      return false;
    }

    for (const value of left) {
      if (!right.has(value)) {
        return false;
      }
    }

    return true;
  }

  private normalizeId(value: string): string {
    return value.replace(/[.\s-]/g, '').toUpperCase();
  }

  private signatureProbability(value: string): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private normalizeYesNoUnknown(value: string): 'YES' | 'NO' | 'UNKNOWN' {
    const normalized = this.normalizeText(value);
    if (normalized === 'yes' || normalized === 'si') {
      return 'YES';
    }
    if (normalized === 'no') {
      return 'NO';
    }
    return 'UNKNOWN';
  }

  private parseYears(value: string): number | null {
    const normalized = this.normalizeText(value);
    if (!normalized) {
      return null;
    }

    const directNumber = normalized.match(/\b(\d{1,2})\b/);
    if (directNumber) {
      return Number(directNumber[1]);
    }

    const spelledNumbers = new Map([
      ['un', 1],
      ['uno', 1],
      ['dos', 2],
      ['tres', 3],
      ['cuatro', 4],
      ['cinco', 5],
      ['seis', 6],
      ['siete', 7],
      ['ocho', 8],
      ['nueve', 9],
      ['diez', 10],
      ['once', 11],
      ['doce', 12],
      ['trece', 13],
      ['catorce', 14],
      ['quince', 15],
      ['dieciseis', 16],
      ['diecisiete', 17],
      ['dieciocho', 18],
      ['diecinueve', 19],
      ['veinte', 20],
    ]);

    for (const [token, years] of spelledNumbers) {
      if (normalized.includes(token)) {
        return years;
      }
    }

    return null;
  }

  private excludedActivityRule(value: string): { label: string } | null {
    const rules = [
      { label: 'modelo B2B o mayorista', pattern: /\b(b2b|mayorista|wholesale|empresa a empresa)\b/ },
      { label: 'servicios financieros o seguros', pattern: /\b(seguro|seguros|aseguradora|financier|prestamo|credito|corretaje|medicina prepagada|punto de venta)\b/ },
      { label: 'tabaco o vapers', pattern: /\b(tabaco|cigarrillo|cigarro|vape|vaper)\b/ },
      { label: 'juegos de azar o apuestas', pattern: /\b(apuesta|apuestas|casino|casinos|loteria|bingo|juego de azar)\b/ },
      { label: 'armas o municiones', pattern: /\b(arma|armas|municion|municiones)\b/ },
      { label: 'pirotecnia, explosivos o materiales inflamables', pattern: /\b(pirotecnia|explosivo|explosivos|inflamable|inflamables)\b/ },
      { label: 'sustancias controladas', pattern: /\b(sustancia controlada|estupefaciente|narcotico|droga|drogas)\b/ },
      { label: 'materiales estratégicos o chatarra', pattern: /\b(chatarra|radioactivo|radioactivos|reactivo quimico|reactivos quimicos|material estrategico)\b/ },
      { label: 'seguridad industrial restringida', pattern: /\b(extintor|extintores)\b/ },
      { label: 'casa de empeño o tienda prendaria', pattern: /\b(empeno|prendaria|pawn)\b/ },
      { label: 'contenido para adultos', pattern: /\b(adulto|adultos|sex shop|contenido adulto|erotico)\b/ },
      { label: 'bares o clubes nocturnos', pattern: /\b(bar|bares|discoteca|club nocturno|night club)\b/ },
    ];

    return rules.find((rule) => rule.pattern.test(value)) ?? null;
  }
}

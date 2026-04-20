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
      this.boardValidity(snapshot),
      this.rifValidity(snapshot),
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

    const failed = boardStatus.includes('vencida') || boardStatus.includes('vencido');
    return {
      code: 'BOARD_VALIDITY',
      status: failed ? 'FAILED' : 'PASSED',
      message: failed
        ? 'La junta directiva figura como vencida o no vigente para operar.'
        : 'La junta directiva figura como vigente o no aplica.',
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
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const valid = expiration.getTime() >= today.getTime();
    return {
      code: 'RIF_VALIDITY',
      status: valid ? 'PASSED' : 'FAILED',
      message: valid ? 'El RIF figura vigente.' : 'El RIF figura vencido.',
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
    return snapshot.representatives.filter((rep) => {
      const boardStatus = this.normalizeText(rep.boardStatus);
      return !boardStatus || (!boardStatus.includes('vencida') && !boardStatus.includes('vencido'));
    });
  }

  private namesMatch(
    snapshot: CanonicalMerchantSnapshot,
    rifName: string,
    legalName: string,
  ): boolean {
    if (rifName === legalName) {
      return true;
    }

    const rifTokens = this.tokenSet(rifName);
    const legalTokens = this.tokenSet(legalName);
    if (rifTokens.size > 0 && this.setsEqual(rifTokens, legalTokens)) {
      return true;
    }

    if (snapshot.legalMode === 'emprendimiento' || snapshot.legalMode === 'firma_personal') {
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

  private normalizeText(value: string): string {
    return (value ?? '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[,.\-\/()]/g, ' ')
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
}

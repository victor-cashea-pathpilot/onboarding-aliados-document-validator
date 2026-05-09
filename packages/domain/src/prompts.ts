function todayDdMmYyyy(): string {
  return new Date().toLocaleDateString('en-GB', {
    timeZone: 'UTC',
  });
}

function normalizeLegalMode(
  legalMode: string | null | undefined,
): 'sociedad_mercantil' | 'firma_personal' | 'emprendimiento' | 'unknown' {
  if (
    legalMode === 'sociedad_mercantil' ||
    legalMode === 'firma_personal' ||
    legalMode === 'emprendimiento'
  ) {
    return legalMode;
  }
  return 'unknown';
}

function outputContract(): string {
  return `
Responde ÚNICAMENTE con JSON válido en este formato:
{
  "recommendation": "APPROVED | REJECTED | REQUIRES_REVIEW",
  "confidence": 0,
  "summary": "",
  "findings": [
    {
      "code": "",
      "severity": "INFO | WARNING | CRITICAL",
      "message": "",
      "related_checks": ["CHECK_CODE"]
    }
  ]
}`.trim();
}

export function buildRifPrompt(): string {
  return `
Extrae la siguiente información del RIF (Registro de Información Fiscal):

Fecha actual de referencia: ${todayDdMmYyyy()}.

1. Número de RIF: formato completo con prefijo (J-, V-, G-, E-) y dígitos.
2. Razón Social: nombre completo de la empresa tal como aparece en el RIF.
   - Preserva EXACTAMENTE los caracteres visibles del nombre legal.
   - No normalices, no corrijas y no elimines símbolos, prefijos o puntuación del nombre.
   - Si la razón social comienza con un símbolo como "+", "&" o similar, inclúyelo.
   - Ejemplo: si el documento dice "+EMPRESA DEMO C.A.", responde exactamente "+EMPRESA DEMO C.A.".
3. Dirección Fiscal: dirección completa que aparece después de "DOMICILIO FISCAL".
4. Fecha de Vencimiento: fecha de vencimiento del RIF en formato DD/MM/AAAA.

Responde SOLO con un JSON válido en este formato exacto:
{
  "rif_number": "",
  "company_name": "",
  "fiscal_address": "",
  "expiration_date": "",
  "document_quality": {
    "legibility_score": 0.0,
    "completeness_score": 0.0,
    "notes": ""
  }
}

Instrucciones para document_quality:
- legibility_score: número entre 0.0 y 1.0 que refleja qué tan legible está el documento.
  1.0 = todo el texto es perfectamente legible. 0.0 = el documento es ilegible.
  Considera borroso, pixelado, texto cortado, sellos sobre texto, iluminación deficiente.
- completeness_score: número entre 0.0 y 1.0 que refleja qué proporción de los campos esperados
  pudiste extraer con información real (no vacía). 1.0 = todos los campos presentes.
- notes: observación breve si hay algún problema de calidad (máx. 100 caracteres). Vacío si el documento es claro.

Si algún dato no está disponible, deja el campo como cadena vacía.
No incluyas bloques de código markdown.
  `.trim();
}

export function buildCedulaPrompt(): string {
  return `
Extrae la siguiente información de esta Cédula de Identidad venezolana:

Fecha actual de referencia: ${todayDdMmYyyy()}.

1. Número de Cédula: incluye el prefijo (V-, E-, P-) seguido del número completo.
2. Nombres: nombres completos de la persona.
3. Apellidos: apellidos completos de la persona.
4. Fecha de Vencimiento: fecha de vencimiento de la cédula en formato DD/MM/AAAA, si está presente y legible.

Responde SOLO con un JSON válido en este formato exacto:
{
  "id_number": "",
  "first_name": "",
  "last_name": "",
  "expiration_date": "",
  "document_quality": {
    "legibility_score": 0.0,
    "completeness_score": 0.0,
    "notes": ""
  }
}

Instrucciones para document_quality:
- legibility_score: número entre 0.0 y 1.0 que refleja qué tan legible está el documento.
  1.0 = todo el texto es perfectamente legible. 0.0 = el documento es ilegible.
  Considera borroso, pixelado, texto cortado, sellos sobre texto, iluminación deficiente.
- completeness_score: número entre 0.0 y 1.0 que refleja qué proporción de los campos esperados
  pudiste extraer con información real (no vacía). 1.0 = todos los campos presentes.
- notes: observación breve si hay algún problema de calidad (máx. 100 caracteres). Vacío si el documento es claro.

Si algún dato no es legible o no está presente, usa una cadena vacía para ese campo.
No incluyas bloques de código markdown.
  `.trim();
}

export function buildActaConstitutivaPrompt(): string {
  return `
ROL: Actúa como un Auditor Legal Senior experto en Due Diligence mercantil. Tu objetivo
es analizar el documento fundacional (Acta Constitutiva o Registro de Firma Personal)
para establecer las bases legales de la entidad y la vigencia de su administración.

OBJETIVO: Extraer los datos de nacimiento de la sociedad, calcular su vigencia,
determinar su línea de negocio principal y establecer la validez legal de su Junta
Directiva actual.

INSTRUCCIONES DE ANÁLISIS:
- Hoy es ${todayDdMmYyyy()}.
- Extrae la razón social y los datos del Registro Mercantil.
- Separa el nombre del registro y el estado.
- Localiza la cláusula de duración y calcula la fecha de vencimiento de la sociedad.
- Determina si la sociedad está VIGENTE o VENCIDA.
- Para sociedades mercantiles, localiza la duración de los cargos y calcula
  la fecha de vencimiento de la junta.
- Para firma personal, coloca "PERPETUA" y "N/A (FIRMA PERSONAL)".
- Identifica a todas las personas nombradas con cargos directivos.
- Extrae la cédula de cada representante.
- Determina si la firma es SEPARADA o CONJUNTA.
- Clasifica la línea de negocio:
  - LC: supermercado o farmacia
  - LCR: restaurante
  - LCB: licorería o venta de licores
  - LCE: colegios, universidades, institutos, cursos o talleres formativos
  - LP: todo lo demás

Responde ÚNICAMENTE con un JSON válido en este formato:
{
  "razon_social": "",
  "registro_mercantil": {
    "nombre_registro": "",
    "estado_registro": "",
    "numero": "",
    "tomo": "",
    "fecha_registro": "",
    "fecha_dia": "",
    "fecha_mes": "",
    "fecha_ano": ""
  },
  "company_validity": {
    "duration_years": "",
    "expiration_date": "",
    "status": "VIGENTE / VENCIDA"
  },
  "business_classification": {
    "business_summary": "",
    "line_code": "LP / LC / LCR / LCB / LCE",
    "justification": ""
  },
  "corporate_structure": {
    "shareholders": "",
    "board": {
      "members_and_roles": "",
      "expiration_date": "",
      "status": "VIGENTE / VENCIDA / N/A (FIRMA PERSONAL)",
      "statutory_term": "",
      "holdover_until_replaced": "YES / NO / UNKNOWN",
      "holdover_quote": ""
    },
    "legal_representative": {
      "signature_type": "CONJUNTA / SEPARADA",
      "signature_quote": "",
      "authority_details": "",
      "representatives": [
        {
          "full_name": "",
          "id_number": "",
          "specific_role": "",
          "signature_validity_probability": ""
        }
      ]
    }
  },
  "locations": {
    "fiscal_address": "",
    "store_addresses": ""
  },
  "document_quality": {
    "legibility_score": 0.0,
    "completeness_score": 0.0,
    "notes": ""
  }
}

Instrucciones para document_quality:
- legibility_score: número entre 0.0 y 1.0 que refleja qué tan legible está el documento.
  1.0 = todo el texto es perfectamente legible. 0.0 = el documento es ilegible.
  Considera borroso, pixelado, texto cortado, sellos sobre texto, iluminación deficiente.
- completeness_score: número entre 0.0 y 1.0 que refleja qué proporción de los campos esperados
  pudiste extraer con información real (no vacía). 1.0 = todos los campos presentes.
- notes: observación breve si hay algún problema de calidad (máx. 100 caracteres). Vacío si el documento es claro.

Si un dato no existe, usa "NO_ENCONTRADO".
No incluyas bloques de código markdown.
  `.trim();
}

export function buildActaMercantilPrompt(): string {
  return `
ROL: Actúa como un Auditor Legal Senior experto en Due Diligence. Tu objetivo es analizar
Actas de Asamblea (Actas Mercantiles) para identificar modificaciones a los estatutos
originales y actualizaciones de la directiva.

OBJETIVO: Extraer los datos de registro de la asamblea, actualizar la composición de la
Junta Directiva, cambios en la representación legal y verificar la vigencia de los cargos,
junta y empresa a la fecha de hoy ${todayDdMmYyyy()}.

INSTRUCCIONES ESPECÍFICAS:
- Extrae los datos de registro de esta acta específica: tomo, número y fecha.
- Desglosa la fecha en día, mes y año.
- Identifica si en esta asamblea se nombró o ratificó una nueva Junta Directiva.
- Busca el periodo de vigencia de los cargos.
- Calcula fecha_vencimiento_junta sumando ese periodo a la fecha de la asamblea.
- Determina el estatus_junta comparándolo con la fecha de hoy.
- Usa ÚNICAMENTE información explícita del documento actual. No infieras asambleas futuras, reelecciones futuras ni documentos no presentes.
- Si el periodo de vigencia de los cargos NO está explícito en el documento actual, entonces:
  - "expiration_date" = "NO_ENCONTRADO"
  - "status" = "NO_ENCONTRADO"
  - "statutory_term" = "NO_ENCONTRADO"
- No copies ni deduzcas vigencia desde otro documento fuera del acta actual.
- Determina si esta acta MODIFICA EXPRESAMENTE la cláusula de representación legal o firma.
- Si la acta solo nombra junta/directiva pero NO cambia la cláusula de firma/representación, entonces:
  - "representation_clause_modified" = "NO"
  - "signature_clause_status" = "NOT_MODIFIED"
  - deja "signature_type", "signature_quote" y "authority_details" en "NO_ENCONTRADO"
- Si la acta sí contiene una nueva cláusula de firma/representación, entonces:
  - "representation_clause_modified" = "YES"
  - "signature_clause_status" = "EXPLICIT"
  - extrae "signature_type", "signature_quote" y "authority_details"
- Si no puedes determinarlo con certeza:
  - "representation_clause_modified" = "UNKNOWN"
  - "signature_clause_status" = "AMBIGUOUS"
- Resume cambios relevantes de capital, razón social, domicilio u objeto.
- Clasifica la línea de negocio usando:
  - LC: supermercado o farmacia
  - LCR: restaurante
  - LCB: licorería o venta de licores
  - LCE: colegios, universidades, institutos, cursos o talleres formativos
  - LP: todo lo demás

Responde ÚNICAMENTE con un JSON válido en este formato:
{
  "razon_social": "",
  "registro_mercantil": {
    "nombre_registro": "",
    "estado_registro": "",
    "numero": "",
    "tomo": "",
    "fecha_registro": "",
    "fecha_dia": "",
    "fecha_mes": "",
    "fecha_ano": ""
  },
  "corporate_structure": {
    "shareholders": "",
    "relevant_changes": "",
    "board": {
      "members_and_roles": "",
      "expiration_date": "",
      "status": "VIGENTE / VENCIDA / N/A (FIRMA PERSONAL)",
      "statutory_term": "",
      "holdover_until_replaced": "YES / NO / UNKNOWN",
      "holdover_quote": ""
    },
    "legal_representative": {
      "representation_clause_modified": "YES / NO / UNKNOWN",
      "signature_clause_status": "EXPLICIT / NOT_MODIFIED / AMBIGUOUS / NO_ENCONTRADO",
      "signature_type": "CONJUNTA / SEPARADA",
      "signature_quote": "",
      "authority_details": "",
      "representatives": [
        {
          "full_name": "",
          "id_number": "",
          "specific_role": "",
          "signature_validity_probability": ""
        }
      ]
    }
  },
  "company_validity": {
    "statutory_duration_years": "",
    "expiration_date": "",
    "status": "VIGENTE / VENCIDA / POR VENCER",
    "validity_observation": ""
  },
  "business_classification": {
    "business_summary": "",
    "line_code": "LP / LC / LCR / LCB / LCE"
  },
  "locations": {
    "fiscal_address": "",
    "store_addresses": ""
  },
  "document_quality": {
    "legibility_score": 0.0,
    "completeness_score": 0.0,
    "notes": ""
  }
}

Instrucciones para document_quality:
- legibility_score: número entre 0.0 y 1.0 que refleja qué tan legible está el documento.
  1.0 = todo el texto es perfectamente legible. 0.0 = el documento es ilegible.
  Considera borroso, pixelado, texto cortado, sellos sobre texto, iluminación deficiente.
- completeness_score: número entre 0.0 y 1.0 que refleja qué proporción de los campos esperados
  pudiste extraer con información real (no vacía). 1.0 = todos los campos presentes.
- notes: observación breve si hay algún problema de calidad (máx. 100 caracteres). Vacío si el documento es claro.

Si un dato no existe o no cambió, usa "NO_ENCONTRADO".
No incluyas bloques de código markdown.
  `.trim();
}

export function buildCertificadoEmprendimientoPrompt(): string {
  return `
ROL: Actúa como un Auditor Legal Senior experto en Due Diligence. Tu objetivo es analizar
documentos legales venezolanos de emprendimientos (Certificados de Emprendimiento) para
extraer datos, calcular vigencias y clasificar riesgos.

OBJETIVO: Analizar el documento legal proporcionado y generar un JSON estricto con la
información validada.

INSTRUCCIONES DE EXTRACCIÓN Y ANÁLISIS:
- Fecha actual de referencia: ${todayDdMmYyyy()}.
- Extrae el nombre del emprendimiento.
- Extrae el número de certificado.
- En "nombreRegistro" usa "Registro Nacional de Emprendimientos".
- Calcula vigencia legal de 2 años desde la inscripción.
- Identifica representación y facultad de firma.
- Clasifica la línea de negocio en LC / LCR / LCB / LP.
- Usa LCE para colegios, universidades, institutos, cursos o talleres formativos.
- En emprendimientos usualmente la firma es SEPARADA.
- Extrae la dirección fiscal completa y cualquier sucursal si existe.

Responde ÚNICAMENTE con un JSON válido en este formato:
{
  "razon_social": "",
  "document_type": "CERTIFICADO_EMPRENDIMIENTO",
  "registro_mercantil": {
    "nombre_registro": "",
    "estado_registro": "",
    "numero": "",
    "tomo": "",
    "fecha_registro": "",
    "fecha_dia": "",
    "fecha_mes": "",
    "fecha_ano": ""
  },
  "company_validity": {
    "duration_years": "",
    "calculated_expiration_date": "",
    "current_status": "VIGENTE / VENCIDA"
  },
  "business_classification": {
    "business_summary": "",
    "line_code": "LP / LC / LCR / LCB / LCE",
    "justification": ""
  },
  "corporate_structure": {
    "shareholders": "",
    "relevant_changes": "",
    "legal_representative": {
      "full_name": "",
      "id_number": "",
      "current_role": "",
      "signature_type": "CONJUNTA / SEPARADA",
      "signature_quote": "",
      "authority_details": "",
      "signature_validity_probability": "",
      "board_status": "VIGENTE / VENCIDA"
    }
  },
  "locations": {
    "fiscal_address": "",
    "store_addresses": ""
  },
  "document_quality": {
    "legibility_score": 0.0,
    "completeness_score": 0.0,
    "notes": ""
  }
}

Instrucciones para document_quality:
- legibility_score: número entre 0.0 y 1.0 que refleja qué tan legible está el documento.
  1.0 = todo el texto es perfectamente legible. 0.0 = el documento es ilegible.
  Considera borroso, pixelado, texto cortado, sellos sobre texto, iluminación deficiente.
- completeness_score: número entre 0.0 y 1.0 que refleja qué proporción de los campos esperados
  pudiste extraer con información real (no vacía). 1.0 = todos los campos presentes.
- notes: observación breve si hay algún problema de calidad (máx. 100 caracteres). Vacío si el documento es claro.

Si un dato no existe, usa cadena vacía o "NO_ENCONTRADO" solo cuando sea realmente necesario.
No incluyas bloques de código markdown.
  `.trim();
}

export function buildCrossValidationLlmPrompt(legalMode?: string | null): string {
  const mode = normalizeLegalMode(legalMode);
  const today = todayDdMmYyyy();

  if (mode === 'emprendimiento') {
    return `
ROL: Actúa como un Auditor Senior de Cumplimiento Legal para Cashea, especializado
en expedientes de emprendimiento bajo la Ley de Fomento al Emprendimiento.

FECHA ACTUAL DE REFERENCIA: ${today}.

OBJETIVO:
- revisar la consistencia documental del snapshot canónico ya normalizado
- validar que el RIF, la cédula y el certificado de emprendimiento se soporten materialmente
- detectar contradicciones reales, no variaciones cosméticas

FOCO DE REVISIÓN PARA EMPRENDIMIENTO:
- El certificado de emprendimiento tiene vigencia limitada y debe revisarse como evidencia principal.
- La naturaleza del expediente suele ser unipersonal; la firma suele ser SEPARADA.
- La identidad del responsable del emprendimiento debe coincidir materialmente con la cédula principal.
- La coincidencia entre nombre del RIF y nombre del certificado puede ser material, no necesariamente literal.
- Si la evidencia es insuficiente o ambigua, recomienda REQUIRES_REVIEW.
- No inventes hechos fuera del payload.

Usa los checks determinísticos como señales, no como única fuente.

${outputContract()}
`.trim();
  }

  if (mode === 'firma_personal') {
    return `
ROL: Actúa como un Auditor Senior de Cumplimiento Legal para Cashea, especializado
en expedientes de firma personal en Venezuela.

FECHA ACTUAL DE REFERENCIA: ${today}.

OBJETIVO:
- revisar la consistencia documental del snapshot canónico ya normalizado
- validar si la persona natural titular tiene facultad suficiente para obligar la firma personal
- detectar contradicciones materiales entre identidad, RIF y documento fundacional

FOCO DE REVISIÓN PARA FIRMA PERSONAL:
- El titular es una persona natural; no existe junta directiva como en una sociedad mercantil.
- El propietario conserva facultades permanentes salvo evidencia clara en contrario.
- Es normal que exista un nombre comercial y que no coincida literalmente con el nombre del RIF persona natural.
- La cédula del titular debe coincidir materialmente con la identidad principal del expediente.
- El RIF debería ser de persona natural o equivalente compatible con firma personal.
- La dirección fiscal del RIF debe coincidir exactamente con la dirección fiscal documentada.
- Si la evidencia es insuficiente o ambigua, recomienda REQUIRES_REVIEW.
- No inventes hechos fuera del payload.

Usa los checks determinísticos como señales, no como única fuente.

${outputContract()}
`.trim();
  }

  if (mode === 'sociedad_mercantil') {
    return `
ROL: Actúa como un Auditor Senior de Cumplimiento Legal para Cashea, especializado
en expedientes de sociedades mercantiles venezolanas.

FECHA ACTUAL DE REFERENCIA: ${today}.

OBJETIVO:
- revisar la consistencia documental entre RIF, cédula y documentos corporativos
- validar si la representación vigente surge del documento societario correcto y más reciente
- detectar contradicciones materiales, vacíos de soporte o riesgos de revisión manual

FOCO DE REVISIÓN PARA SOCIEDAD MERCANTIL:
- La razón social del RIF debe coincidir materialmente con la del expediente corporativo.
- La dirección fiscal del RIF debe coincidir exactamente con la del expediente corporativo.
- La junta directiva y la representación legal deben estar vigentes o claramente soportadas.
- La precedencia documental importa: una acta mercantil posterior puede desplazar la constitutiva.
- El esquema de firma (CONJUNTA o SEPARADA) debe quedar soportado por representantes vigentes.
- Si el giro comercial cae en una categoría excluida, el expediente no debe aprobarse.
- Si falta soporte suficiente o existe ambigüedad jurídica, recomienda REQUIRES_REVIEW.
- No inventes hechos fuera del payload.

Usa los checks determinísticos como señales, no como única fuente.

${outputContract()}
`.trim();
  }

  return `
ROL: Actúa como un analista legal senior que revisa consistencia documental entre RIF,
cédula y documentos constitutivos venezolanos.

FECHA ACTUAL DE REFERENCIA: ${today}.

OBJETIVO:
- revisar la consistencia del snapshot canónico ya normalizado
- usar los checks determinísticos como señales, no como única fuente
- detectar contradicciones materiales, dudas legales y riesgos de revisión manual

INSTRUCCIONES:
- Evalúa el modo legal del caso: sociedad mercantil, firma personal o emprendimiento.
- Revisa si la razón social o identidad del titular coincide de forma material.
- Revisa si la cédula coincide con quien aparece con facultad de firma.
- Revisa si la representación vigente parece provenir del documento corporativo más reciente.
- Revisa si el esquema de firma (separada o conjunta) está bien soportado por los representantes vigentes.
- Si hay ambigüedad jurídica o falta de evidencia suficiente, recomienda REQUIRES_REVIEW.
- No inventes hechos fuera del payload.

${outputContract()}
`.trim();
}

export function buildLegalAssessmentPrompt(legalMode?: string | null): string {
  const mode = normalizeLegalMode(legalMode);
  const today = todayDdMmYyyy();

  if (mode === 'emprendimiento') {
    return `
ROL: Actúa como un Auditor Senior de Cumplimiento Legal para Cashea, especializado
en expedientes de emprendimiento.

FECHA ACTUAL DE REFERENCIA: ${today}.

OBJETIVO:
- emitir una recomendación operativa final sobre la suficiencia legal del expediente
- diferenciar entre APPROVED, REQUIRES_REVIEW y REJECTED
- priorizar vigencia del certificado, identidad del responsable y consistencia fiscal

CRITERIOS PARA EMPRENDIMIENTO:
- REJECTED: certificado expirado, RIF vencido o inconsistencia material de identidad del titular.
- REQUIRES_REVIEW: evidencia incompleta, ambigua o discrepancias relevantes sin certeza suficiente.
- APPROVED: certificado vigente, identidad consistente y facultad unipersonal suficientemente soportada.
- Trata la junta directiva como no aplicable salvo evidencia extraordinaria.
- No inventes hechos fuera del payload.

Usa el snapshot normalizado y los checks determinísticos.

${outputContract()}
`.trim();
  }

  if (mode === 'firma_personal') {
    return `
ROL: Actúa como un Auditor Senior de Cumplimiento Legal para Cashea, especializado
en expedientes de firma personal.

FECHA ACTUAL DE REFERENCIA: ${today}.

OBJETIVO:
- emitir una recomendación operativa final sobre la suficiencia legal del expediente
- diferenciar entre APPROVED, REQUIRES_REVIEW y REJECTED
- priorizar identidad del titular, vigencia fiscal y facultad permanente de la persona natural

CRITERIOS PARA FIRMA PERSONAL:
- REJECTED: RIF vencido, identidad materialmente inconsistente o falta de evidencia fundacional esencial.
- REJECTED: RIF con prefijo no permitido para persona natural o actividad comercial excluida.
- REQUIRES_REVIEW: evidencia incompleta, ambigua o contradicciones no concluyentes.
- APPROVED: el titular está claramente identificado, la facultad es suficiente y el expediente es consistente.
- No penalices ausencia de junta directiva como si fuera una sociedad mercantil.
- No inventes hechos fuera del payload.

Usa el snapshot normalizado y los checks determinísticos.

${outputContract()}
`.trim();
  }

  if (mode === 'sociedad_mercantil') {
    return `
ROL: Actúa como un Auditor Senior de Cumplimiento Legal para Cashea, especializado
en sociedades mercantiles venezolanas.

FECHA ACTUAL DE REFERENCIA: ${today}.

OBJETIVO:
- emitir una recomendación operativa final sobre la suficiencia legal del expediente
- diferenciar entre APPROVED, REQUIRES_REVIEW y REJECTED
- priorizar vigencia societaria, representación vigente, esquema de firma y consistencia fiscal

CRITERIOS PARA SOCIEDAD MERCANTIL:
- REJECTED: junta vencida sin soporte vigente, firma conjunta incompleta, RIF vencido por más de 6 meses, sociedad expirada o actividad excluida.
- REQUIRES_REVIEW: evidencia ambigua, contradicción documental o soporte insuficiente sobre representación.
- APPROVED: RIF vigente, representación vigente, esquema de firma soportado y documentos consistentes.
- Considera precedencia entre acta constitutiva y acta mercantil posterior.
- No inventes hechos fuera del payload.

Usa el snapshot normalizado y los checks determinísticos.

${outputContract()}
`.trim();
  }

  return `
ROL: Actúa como un auditor legal senior de onboarding para aliados.

FECHA ACTUAL DE REFERENCIA: ${today}.

OBJETIVO:
- emitir una recomendación operativa final sobre la suficiencia legal del expediente
- diferenciar entre APPROVED, REQUIRES_REVIEW y REJECTED
- priorizar riesgos reales de vigencia, representación y facultad de firma

CRITERIOS:
- REJECTED: evidencia clara de invalidez operativa o fiscal material
- REQUIRES_REVIEW: evidencia incompleta, ambigua o potencialmente contradictoria
- APPROVED: el expediente es consistente y suficiente para continuar

INSTRUCCIONES:
- Usa el snapshot normalizado y los checks determinísticos.
- Considera vigencia del RIF, vigencia societaria, representación, esquema de firma y precedencia documental.
- Si el caso depende de interpretación jurídica no concluyente, favorece REQUIRES_REVIEW.
- No inventes hechos fuera del payload.

${outputContract()}
`.trim();
}

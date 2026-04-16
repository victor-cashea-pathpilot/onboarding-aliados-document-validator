function todayDdMmYyyy(): string {
  return new Date().toLocaleDateString('en-GB', {
    timeZone: 'UTC',
  });
}

export function buildRifPrompt(): string {
  return `
Extrae la siguiente información del RIF (Registro de Información Fiscal):

Fecha actual de referencia: ${todayDdMmYyyy()}.

1. Número de RIF: formato completo con prefijo (J-, V-, G-, E-) y dígitos.
2. Razón Social: nombre completo de la empresa tal como aparece en el RIF.
3. Dirección Fiscal: dirección completa que aparece después de "DOMICILIO FISCAL".
4. Fecha de Vencimiento: fecha de vencimiento del RIF en formato DD/MM/AAAA.

Responde SOLO con un JSON válido en este formato exacto:
{
  "rif_number": "",
  "company_name": "",
  "fiscal_address": "",
  "expiration_date": ""
}

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
  "expiration_date": ""
}

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
  - LC: supermercado, farmacia o educación
  - LCR: restaurante
  - LCB: licorería o venta de licores
  - LP: todo lo demás

Responde ÚNICAMENTE con un JSON válido. No incluyas markdown.
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

Responde ÚNICAMENTE con un JSON válido. No incluyas markdown.
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

Responde ÚNICAMENTE con un JSON válido. No incluyas markdown.
  `.trim();
}

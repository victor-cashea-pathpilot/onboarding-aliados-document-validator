"""Prompt builders reused from the original workflow and adapted to this backend."""

from datetime import datetime, timezone


def _today_ddmmyyyy() -> str:
    return datetime.now(timezone.utc).strftime("%d/%m/%Y")


def build_rif_prompt() -> str:
    return f"""
Extrae la siguiente información del RIF (Registro de Información Fiscal):

Fecha actual de referencia: {_today_ddmmyyyy()}.

1. Número de RIF: formato completo con prefijo (J-, V-, G-, E-) y dígitos.
2. Razón Social: nombre completo de la empresa tal como aparece en el RIF.
3. Dirección Fiscal: dirección completa que aparece después de "DOMICILIO FISCAL".
4. Fecha de Vencimiento: fecha de vencimiento del RIF en formato DD/MM/AAAA.

Responde SOLO con un JSON válido en este formato exacto:
{{
  "rif_number": "",
  "company_name": "",
  "fiscal_address": "",
  "expiration_date": ""
}}

Si algún dato no está disponible, deja el campo como cadena vacía.
No incluyas bloques de código markdown.
""".strip()


def build_cedula_prompt() -> str:
    return f"""
Extrae la siguiente información de esta Cédula de Identidad venezolana:

Fecha actual de referencia: {_today_ddmmyyyy()}.

1. Número de Cédula: incluye el prefijo (V-, E-, P-) seguido del número completo.
2. Nombres: nombres completos de la persona.
3. Apellidos: apellidos completos de la persona.

Responde SOLO con un JSON válido en este formato exacto:
{{
  "id_number": "",
  "first_name": "",
  "last_name": ""
}}

Si algún dato no es legible o no está presente, usa una cadena vacía para ese campo.
No incluyas bloques de código markdown.
""".strip()


def build_certificado_emprendimiento_prompt() -> str:
    return f"""
ROL: Actúa como un Auditor Legal Senior experto en Due Diligence. Tu objetivo es analizar
documentos legales venezolanos de emprendimientos (Certificados de Emprendimiento) para
extraer datos, calcular vigencias y clasificar riesgos.

OBJETIVO: Analizar el documento legal proporcionado y generar un JSON estricto con la
información validada.

INSTRUCCIONES DE EXTRACCIÓN Y ANÁLISIS:

Datos de Registro:
- Extrae el nombre del emprendimiento.
- Extrae el número de certificado y colócalo en "numero".
- En "nombreRegistro" coloca "Registro Nacional de Emprendimientos".
- Deja "tomo" vacío o "N/A".

Cálculo de Vigencia:
- La duración legal es de 2 años desde su inscripción.
- Suma 2 años a la fecha de registro para obtener la fecha_vencimiento_calculada.
- Determina si está VIGENTE o VENCIDA comparando con la fecha actual { _today_ddmmyyyy() }.

Clasificación de Línea de Negocio:
- LC si es supermercado, farmacia o educación.
- LCR si es restaurante.
- LCB si es licorería o venta de licores.
- LP para todo lo demás.

Representación y Firma:
- Identifica si la firma es SEPARADA o CONJUNTA.
- En emprendimientos usualmente es SEPARADA.
- Identifica al responsable.
- Extrae la cita textual que valide la facultad de firma.
- Asigna probabilidad_firma_valida de 0 a 100.

Ubicación:
- Extrae la dirección fiscal completa y cualquier dirección de sucursal mencionada.

Responde ÚNICAMENTE con un JSON válido en este formato:
{{
  "razon_social": "",
  "document_type": "CERTIFICADO_EMPRENDIMIENTO",
  "registro_mercantil": {{
    "nombre_registro": "",
    "estado_registro": "",
    "numero": "",
    "tomo": "",
    "fecha_registro": "",
    "fecha_dia": "",
    "fecha_mes": "",
    "fecha_ano": ""
  }},
  "company_validity": {{
    "duration_years": "",
    "calculated_expiration_date": "",
    "current_status": "VIGENTE / VENCIDA"
  }},
  "business_classification": {{
    "business_summary": "",
    "line_code": "LP / LC / LCR / LCB",
    "justification": ""
  }},
  "corporate_structure": {{
    "shareholders": "",
    "relevant_changes": "",
    "legal_representative": {{
      "full_name": "",
      "id_number": "",
      "current_role": "",
      "signature_type": "CONJUNTA / SEPARADA",
      "signature_quote": "",
      "authority_details": "",
      "signature_validity_probability": "",
      "board_status": "VIGENTE / VENCIDA"
    }}
  }},
  "locations": {{
    "fiscal_address": "",
    "store_addresses": ""
  }}
}}

Si un dato no existe, usa cadena vacía o "NO_ENCONTRADO" solo cuando sea realmente necesario.
No incluyas bloques de código markdown.
""".strip()


def build_acta_mercantil_prompt() -> str:
    return f"""
ROL: Actúa como un Auditor Legal Senior experto en Due Diligence. Tu objetivo es analizar
Actas de Asamblea (Actas Mercantiles) para identificar modificaciones a los estatutos
originales y actualizaciones de la directiva.

OBJETIVO: Extraer los datos de registro de la asamblea, actualizar la composición de la
Junta Directiva, cambios en la representación legal y verificar la vigencia de los cargos,
junta y empresa a la fecha de hoy { _today_ddmmyyyy() }.

INSTRUCCIONES ESPECÍFICAS:
- Extrae los datos de registro de esta acta específica: tomo, número y fecha.
- Desglosa la fecha en día, mes y año.
- Identifica si en esta asamblea se nombró o ratificó una nueva Junta Directiva.
- Busca el periodo de vigencia de los cargos.
- Calcula fecha_vencimiento_junta sumando ese periodo a la fecha de la asamblea.
- Determina el estatus_junta comparándolo con la fecha de hoy.
- Determina si la firma es CONJUNTA o SEPARADA.
- Extrae la cita textual exacta de la cláusula de firma.
- Resume cambios relevantes de capital, razón social, domicilio u objeto.

Responde ÚNICAMENTE con un JSON válido en este formato:
{{
  "razon_social": "",
  "registro_mercantil": {{
    "nombre_registro": "",
    "estado_registro": "",
    "numero": "",
    "tomo": "",
    "fecha_registro": "",
    "fecha_dia": "",
    "fecha_mes": "",
    "fecha_ano": ""
  }},
  "corporate_structure": {{
    "shareholders": "",
    "relevant_changes": "",
    "board": {{
      "members_and_roles": "",
      "expiration_date": "",
      "status": "VIGENTE / VENCIDA / N/A (FIRMA PERSONAL)",
      "statutory_term": ""
    }},
    "legal_representative": {{
      "signature_type": "CONJUNTA / SEPARADA",
      "signature_quote": "",
      "authority_details": "",
      "representatives": [
        {{
          "full_name": "",
          "id_number": "",
          "specific_role": "",
          "signature_validity_probability": ""
        }}
      ]
    }}
  }},
  "company_validity": {{
    "statutory_duration_years": "",
    "expiration_date": "",
    "status": "VIGENTE / VENCIDA / POR VENCER",
    "validity_observation": ""
  }},
  "business_classification": {{
    "business_summary": "",
    "line_code": "LP / LC / LCR / LCB"
  }},
  "locations": {{
    "fiscal_address": "",
    "store_addresses": ""
  }}
}}

Si un dato no existe o no cambió, usa "NO_ENCONTRADO".
No incluyas bloques de código markdown.
""".strip()


def build_acta_constitutiva_prompt() -> str:
    return f"""
ROL: Actúa como un Auditor Legal Senior experto en Due Diligence mercantil. Tu objetivo
es analizar el documento fundacional (Acta Constitutiva o Registro de Firma Personal)
para establecer las bases legales de la entidad y la vigencia de su administración.

OBJETIVO: Extraer los datos de nacimiento de la sociedad, calcular su vigencia,
determinar su línea de negocio principal y establecer la validez legal de su Junta
Directiva actual.

INSTRUCCIONES DE ANÁLISIS:
- Hoy es { _today_ddmmyyyy() }.
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

Responde ÚNICAMENTE con un JSON válido en este formato:
{{
  "razon_social": "",
  "registro_mercantil": {{
    "nombre_registro": "",
    "estado_registro": "",
    "numero": "",
    "tomo": "",
    "fecha_registro": "",
    "fecha_dia": "",
    "fecha_mes": "",
    "fecha_ano": ""
  }},
  "company_validity": {{
    "duration_years": "",
    "expiration_date": "",
    "status": "VIGENTE / VENCIDA"
  }},
  "business_classification": {{
    "business_summary": "",
    "line_code": "LP / LC / LCR / LCB",
    "justification": ""
  }},
  "corporate_structure": {{
    "shareholders": "",
    "board": {{
      "members_and_roles": "",
      "expiration_date": "",
      "status": "VIGENTE / VENCIDA / N/A (FIRMA PERSONAL)",
      "statutory_term": ""
    }},
    "legal_representative": {{
      "signature_type": "CONJUNTA / SEPARADA",
      "signature_quote": "",
      "authority_details": "",
      "representatives": [
        {{
          "full_name": "",
          "id_number": "",
          "specific_role": "",
          "signature_validity_probability": ""
        }}
      ]
    }}
  }},
  "locations": {{
    "fiscal_address": "",
    "store_addresses": ""
  }}
}}

Si un dato no existe, usa "NO_ENCONTRADO".
No incluyas bloques de código markdown.
""".strip()

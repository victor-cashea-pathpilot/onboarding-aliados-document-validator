"""Prompt builders for LLM-assisted cross-validation and legal assessment."""


def build_cross_validation_llm_prompt() -> str:
    return """
ROL: Actúa como un analista legal senior que revisa consistencia documental entre RIF,
cédula y documentos constitutivos venezolanos.

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
}
""".strip()


def build_legal_assessment_prompt() -> str:
    return """
ROL: Actúa como un auditor legal senior de onboarding para aliados.

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
}
""".strip()

# Evals Lógicos v1

## Objetivo

Definir una capa de evaluación y regresión que corra en CI/CD sin depender de:

- documentos reales
- llamadas a Gemini
- infraestructura async en GCP

La idea es proteger la lógica del backend con fixtures sanitizados que representen salidas ya extraídas.

## Qué cubren estos evals

- normalización de documentos extraídos a snapshot canónico
- checks de validación cruzada
- regresión de reglas para:
  - `sociedad mercantil`
  - `emprendimiento`
  - `firma personal`
  - casos negativos controlados

## Qué no cubren todavía

- calidad de extracción del modelo
- latencia o comportamiento async
- Firestore
- Cloud Tasks
- despliegue en staging

## Ubicación

- fixtures: `tests/fixtures/logic_evals/`
- runner: `tests/test_logic_evals.py`

## Formato del fixture

Cada fixture define:

- `merchant_id`
- `documents`
  - buckets tipados con documentos ya extraídos
- `expected`
  - estado esperado de normalización
  - campos canónicos clave
  - estado esperado de cada check

## Ejecución

Local:

```bash
pytest -q tests/test_logic_evals.py
```

CI:

- corre dentro del workflow de tests en GitHub Actions
- no requiere secretos
- no requiere Vertex AI

## Regla de datos

Estos evals deben seguir usando fixtures sanitizados y sintéticos.

Los documentos reales y sus salidas no deben versionarse como fixtures de CI sin aprobación explícita.

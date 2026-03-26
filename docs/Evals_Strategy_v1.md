# Evals Strategy v1

## Objetivo

Definir una estrategia de evaluación por capas para este backend, separando:

- lógica interna
- extracción documental
- flujo integral del pipeline

La meta es poder proteger cambios en CI/CD sin depender todavía de:

- documentos reales versionados
- credenciales en GitHub Actions
- Vertex AI en cada PR
- infraestructura async final en GCP

## Capas de eval

## 1. Logic Evals

### Qué validan

- normalización a snapshot canónico
- checks de validación cruzada
- expected outputs de reglas

### Input

- fixtures sanitizados con `DocumentsResult` ya extraído

### Beneficio

- protegen reglas de negocio
- son rápidos y estables
- corren en cada PR

### Ubicación

- fixtures: `tests/fixtures/logic_evals/`
- runner: `tests/test_logic_evals.py`

## 2. Extraction Evals

### Qué validan

- contrato de cada extractor
- selección del modelo simple vs complejo
- wiring entre prompt, extractor y cliente Gemini
- estabilidad básica del schema esperado

### Input

- fixtures sanitizados por tipo documental
- cliente Gemini fake

### Beneficio

- detectan roturas de prompts y extractores
- no requieren llamar al modelo real
- corren en CI sin secretos

### Ubicación

- fixtures: `tests/fixtures/extraction_evals/`
- runner: `tests/test_extraction_evals.py`

### Variante con documentos reales aprobados

Además de los extraction evals sanitizados para CI, existe una variante local/manual con:

- documentos reales aprobados
- llamadas reales a Vertex AI Gemini
- baseline local fuera de git

Esta capa sirve para regresión real del extractor, pero no debe correr en cada PR.

## 3. Comprehensive Evals

### Qué validan

- orquestación end-to-end interna del pipeline
- intake técnico
- extracción mock por tipo
- normalización
- cross-validation
- veredicto final

### Input

- request sintético
- resultados de intake controlados
- salidas de extracción controladas

### Beneficio

- cubren el flujo completo del software sin depender de red ni Vertex AI
- sirven como regresión amplia antes de movernos a Firestore y Cloud Tasks

### Ubicación

- fixtures: `tests/fixtures/comprehensive_evals/`
- runner: `tests/test_comprehensive_evals.py`

## Qué no cubren todavía

- extracción real con Vertex AI en CI
- latencia y costos de modelo
- Firestore real
- Cloud Tasks real
- despliegue en staging

Eso debe vivir después en una capa adicional de integration/staging evals.

## Real Extraction Evals locales

Para documentos reales aprobados, el repo incluye un runner local:

- script: `scripts/run_real_extraction_evals.py`
- cases locales: `.real_eval_cases/cases.json`
- baseline local: `.real_eval_cases/baseline.json`

Flujo:

1. reautenticar ADC si hace falta
2. grabar baseline una vez
3. verificar regresión contra ese baseline

Ejemplo:

```bash
python scripts/run_real_extraction_evals.py record
python scripts/run_real_extraction_evals.py verify
```

## Política de datos

Estos evals deben seguir usando datos sintéticos o sanitizados.

Los documentos reales:

- no deben commitearse
- no deben entrar a CI
- no deben usarse como fixtures oficiales sin aprobación explícita

## Ejecución

Local:

```bash
pytest -q tests/test_logic_evals.py
pytest -q tests/test_extraction_evals.py
pytest -q tests/test_comprehensive_evals.py
```

CI:

- estos tres grupos corren dentro de `pytest -q tests`
- GitHub Actions los ejecuta en cada PR hacia `develop` o `main`
- GitHub Actions los ejecuta en cada push a `develop` o `main`, incluyendo merges
- no requieren secretos
- no requieren Vertex AI

## Siguiente paso recomendado

Ampliar cobertura de fixtures con:

- casos ambiguos que deben terminar en `REQUIRES_REVIEW`
- precedencia entre acta constitutiva y acta mercantil
- casos de firma conjunta
- casos de expiración de junta con firmante válido o inválido

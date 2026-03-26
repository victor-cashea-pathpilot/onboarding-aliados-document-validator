# Real Extraction Evals v1

## Objetivo

Correr regresión de extracción usando documentos reales aprobados, sin meter esos archivos ni sus baselines al repositorio.

## Componentes

- runner local: `scripts/run_real_extraction_evals.py`
- casos locales: `eval_cases/cases.json`
- baseline local: `eval_cases/baseline.json`
- plantilla CI: `eval_cases/ci_cases.example.json`

La carpeta `eval_cases/` sí puede versionarse.
El archivo `eval_cases/baseline.json` se mantiene fuera de git para no commitear salidas generadas automáticamente por accidente.

## Requisitos

- documentos reales aprobados disponibles localmente
- `backend/.env` configurado para Vertex AI
- autenticación ADC válida

## Reautenticación

Si el runner falla con `RefreshError`, vuelve a autenticar:

```bash
gcloud auth application-default login
```

## Modos

### 1. Record

Graba el baseline actual a partir de la salida real de Gemini:

```bash
python scripts/run_real_extraction_evals.py record
```

### 2. Verify

Vuelve a correr extracción real y compara contra el baseline:

```bash
python scripts/run_real_extraction_evals.py verify
```

## GitHub Actions

Existe un workflow manual:

- `.github/workflows/real-extraction-evals.yml`

Este workflow no corre en cada PR ni merge por default.

Está pensado para `workflow_dispatch` porque:

- usa Vertex AI real
- consume costo
- depende de acceso a documentos

## Requisitos para GitHub

Para que el workflow de GitHub funcione, necesitas:

1. Un archivo `eval_cases/ci_cases.json` con `source_url` accesibles desde GitHub Actions.
2. Un archivo `eval_cases/ci_baseline.json` commiteado o generado por tu flujo de actualización de baseline.
3. El secret:
   - `GCP_VERTEX_AI_SERVICE_ACCOUNT_KEY`
4. Los repository variables:
   - `GCP_PROJECT_ID`
   - `GEMINI_LOCATION`
   - `GEMINI_MODEL_SIMPLE`
   - `GEMINI_MODEL_COMPLEX`

Si los documentos no están disponibles por URL para el runner de GitHub, el workflow no podrá ejecutarse.

## Uso recomendado

- usar `record` solo cuando quieras aceptar un nuevo baseline
- usar `verify` para detectar drift del extractor o del modelo
- no correr esto en cada PR

## Estado actual

El runner ya está preparado para los 3 grupos de documentos aprobados:

- sociedad mercantil
- emprendimiento
- firma personal

La ejecución real depende de que la sesión local de ADC esté vigente.

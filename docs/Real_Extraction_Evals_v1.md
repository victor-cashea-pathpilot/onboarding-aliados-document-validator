# Real Extraction Evals v1

## Objetivo

Correr regresión de extracción usando documentos reales aprobados, sin meter esos archivos ni sus baselines al repositorio.

## Componentes

- runner local: `scripts/run_real_extraction_evals.py`
- casos locales: `.real_eval_cases/cases.json`
- baseline local: `.real_eval_cases/baseline.json`

La carpeta `.real_eval_cases/` está ignorada por git.

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

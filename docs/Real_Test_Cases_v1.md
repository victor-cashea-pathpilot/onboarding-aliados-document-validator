# Casos Reales de Prueba

## Objetivo

Documentar cómo correr localmente los casos reales de prueba que ya se validaron en este repo, sin subir los archivos al repositorio.

Este documento también deja explícito que estos archivos contienen información real y no deben reutilizarse como dataset de evaluación sin aprobación previa.

## Política de uso de documentos reales

- Los documentos reales no deben guardarse dentro del repositorio.
- Los documentos reales deben seguir viviendo fuera del repo, por ejemplo en `Downloads/`.
- El repo solo debe referenciar esos archivos mediante symlinks en `.local_test_docs/`.
- `.local_test_docs/` está ignorado por git y no debe versionarse.
- Estos documentos no deben usarse para evals, benchmarks o datasets persistentes sin aprobación explícita de uso de datos.
- Si se aprueba su uso para evals, conviene moverlos a un flujo controlado y documentado por separado.

## Estructura local recomendada

1. Guardar los archivos reales fuera del repo.
2. Crear symlinks dentro de `.local_test_docs/`.
3. Levantar un file server local solo para pruebas.
4. Ejecutar la API local con `JOB_QUEUE_MODE=inline`.

## Requisitos previos

- backend corriendo localmente
- autenticación local de GCP válida
- `Vertex AI` habilitado
- billing habilitado en el proyecto GCP
- `.env` configurado con `MOCK_MODE=false`

## Comandos base

### Levantar file server local

```bash
cd /Users/vitupro14/Documents/Projects/PathPilot/Cashea/onboarding_agent/.local_test_docs
python3 -m http.server 9000
```

### Levantar API local

Puerto recomendado para este backend:

```bash
uvicorn backend.api.main:app --reload --port 8002
```

### Healthcheck

```bash
curl http://127.0.0.1:8002/health
```

## Caso 1: Sociedad Mercantil

### Documentos

- `RIF STILOS.pdf`
- `Cedula-1.pdf`
- `Acta Constitutiva.pdf`
- `ACTA ASAMBLEA  FREDLOU.pdf`

### Payload

```bash
curl -X POST http://127.0.0.1:8002/v1/onboarding/validate \
  -H "Content-Type: application/json" \
  -d '{
    "merchant_id": "stil01",
    "request_id": "real-sociedad-001",
    "documents": {
      "rif": [
        {
          "url": "http://127.0.0.1:9000/RIF%20STILOS.pdf",
          "document_id": "rif-1"
        }
      ],
      "cedula": [
        {
          "url": "http://127.0.0.1:9000/Cedula-1.pdf",
          "document_id": "ced-1"
        }
      ],
      "certificado_emprendimiento": [],
      "acta_constitutiva": [
        {
          "url": "http://127.0.0.1:9000/Acta%20Constitutiva.pdf",
          "document_id": "acta-1"
        }
      ],
      "acta_mercantil": [
        {
          "url": "http://127.0.0.1:9000/ACTA%20ASAMBLEA%20%20FREDLOU.pdf",
          "document_id": "merc-1"
        }
      ]
    }
  }'
```

### Resultado esperado

- extracción real de `rif`
- extracción real de `cedula`
- extracción real de `acta_constitutiva`
- extracción real de `acta_mercantil`
- normalización canónica
- validaciones cruzadas base

## Caso 2: Emprendimiento

### Documentos

- `RaulParraRIF.pdf`
- `Cedula-RaulPArra.jpeg`
- `RegistroNacionalEmprendimientos.pdf`

### Payload

```bash
curl -X POST http://127.0.0.1:8002/v1/onboarding/validate \
  -H "Content-Type: application/json" \
  -d '{
    "merchant_id": "raul01",
    "request_id": "real-emprendimiento-001",
    "documents": {
      "rif": [
        {
          "url": "http://127.0.0.1:9000/RaulParraRIF.pdf",
          "document_id": "rif-raul-1"
        }
      ],
      "cedula": [
        {
          "url": "http://127.0.0.1:9000/Cedula-RaulPArra.jpeg",
          "document_id": "ced-raul-1"
        }
      ],
      "certificado_emprendimiento": [
        {
          "url": "http://127.0.0.1:9000/RegistroNacionalEmprendimientos.pdf",
          "document_id": "rne-1"
        }
      ],
      "acta_constitutiva": [],
      "acta_mercantil": []
    }
  }'
```

### Resultado esperado

- extracción real de `rif`
- extracción real de `cedula`
- extracción real de `certificado_emprendimiento`
- normalización canónica
- validaciones cruzadas base
- caso aprobado con la lógica actual de emprendimiento

## Caso 3: Firma Personal

### Documentos

- `FirmaPersonal-RIF.pdf`
- `FirmaPersonal-Cedula.jpg`
- `FirmaPersonal-Acta.pdf`

### Payload

```bash
curl -X POST http://127.0.0.1:8002/v1/onboarding/validate \
  -H "Content-Type: application/json" \
  -d '{
    "merchant_id": "firma-personal-001",
    "request_id": "real-firma-personal-001",
    "documents": {
      "rif": [
        {
          "url": "http://127.0.0.1:9000/FirmaPersonal-RIF.pdf",
          "document_id": "fp-rif-1"
        }
      ],
      "cedula": [
        {
          "url": "http://127.0.0.1:9000/FirmaPersonal-Cedula.jpg",
          "document_id": "fp-ced-1"
        }
      ],
      "certificado_emprendimiento": [],
      "acta_constitutiva": [
        {
          "url": "http://127.0.0.1:9000/FirmaPersonal-Acta.pdf",
          "document_id": "fp-acta-1"
        }
      ],
      "acta_mercantil": []
    }
  }'
```

### Resultado esperado

- extracción real de `rif`
- extracción real de `cedula`
- extracción real de `acta_constitutiva` como `firma personal`
- normalización canónica
- validaciones cruzadas base
- caso aprobado con lógica de identidad para `firma personal`

## Consultar status

Usa el `job_id` devuelto por `validate`:

```bash
curl -X POST http://127.0.0.1:8002/v1/onboarding/status \
  -H "Content-Type: application/json" \
  -d '{"job_ids":["val_REPLACE_ME"]}'
```

## Estado actual de cobertura real

Casos reales ya probados:

- `sociedad mercantil`
- `emprendimiento`
- `firma personal`

## Próximo uso para evals

Cuando se apruebe el uso de datos reales para evaluación, este documento puede servir como base para:

- definir casos de regresión
- separar casos por tipo jurídico
- documentar expected outputs
- versionar prompts y reglas asociadas

Pero ese paso debe ocurrir solo después de aprobación explícita de uso de estos documentos.

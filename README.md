# Onboarding Aliados Document Validator

Servicio asíncrono en Google Cloud con Gemini para validar documentos legales de onboarding y cruzar información de aliados para Cashea.

## Resumen

Este repositorio define el MVP de un validador documental para onboarding de aliados. El sistema recibe URLs de documentos ya tipados por Cashea, extrae información estructurada según el tipo de documento, normaliza los datos y ejecuta validaciones cruzadas para determinar si el caso puede aprobarse, rechazarse o requiere revisión manual.

El diseño actual parte de una arquitectura Google-native y elimina dependencias del prototipo que ya no aplican al MVP, como la integración con HubSpot y la clasificación automática del tipo de documento.

## Objetivo del MVP

- recibir documentos legales mediante una API asíncrona
- descargar y validar archivos desde URLs provistas por Cashea
- extraer datos con Gemini según el tipo documental
- normalizar campos legales y fiscales a un modelo interno común
- cruzar la información entre documentos
- retornar un veredicto con evidencia y motivos claros

## Documentación

- Plan por etapas: [docs/Stages_Plan_v1.md](docs/Stages_Plan_v1.md)
- Especificación de API: [docs/API_Spec_v2.md](docs/API_Spec_v2.md)
- Arquitectura MVP: [docs/Architecture_v2.md](docs/Architecture_v2.md)
- Guía de setup de GitHub para esta cuenta/repositorio: [docs/GitHub_Setup_Cashea.md](docs/GitHub_Setup_Cashea.md)

## Alcance actual

Incluido:

- API asíncrona para crear jobs y consultar estado
- extracción por tipo de documento
- normalización de datos
- validación cruzada entre documentos
- despliegue sobre Google Cloud

Excluido del MVP:

- integración con HubSpot
- clasificación automática de documentos
- generación de contratos
- backoffice de revisión manual

## Flujo propuesto

1. Cashea envía un `merchant_id` y un conjunto de documentos tipados.
2. La API crea un `job` y lo encola para procesamiento.
3. Un worker descarga los archivos y ejecuta extracción estructurada con Gemini.
4. Los resultados se normalizan a un esquema interno canónico.
5. El motor de validación cruzada compara identidad, RIF, razón social, vigencia y facultades.
6. El sistema persiste el resultado y lo expone a través del endpoint de estado.

## Estado del repositorio

Actualmente este repositorio contiene la documentación saneada del proyecto y la base para iniciar la implementación del MVP.

## Probar localmente

### API pública

1. Instala dependencias:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

2. Configura entorno local:

```bash
cp backend/.env.example backend/.env
```

Para prueba local simple, usa:

```bash
JOB_REPOSITORY_MODE=inmemory
JOB_QUEUE_MODE=inline
MOCK_MODE=true
```

3. Levanta la API:

```bash
uvicorn backend.api.main:app --reload
```

4. Verifica healthcheck:

```bash
curl http://127.0.0.1:8000/health
```

5. Crea un job mock:

```bash
curl -X POST http://127.0.0.1:8000/v1/onboarding/validate \
  -H "Content-Type: application/json" \
  -d '{
    "merchant_id": "98765",
    "request_id": "local-test-001",
    "documents": {
      "rif": [{"url": "https://example.com/rif.pdf", "document_id": "rif-1"}],
      "cedula": [{"url": "https://example.com/cedula.jpg", "document_id": "ced-1"}],
      "certificado_emprendimiento": [],
      "acta_constitutiva": [{"url": "https://example.com/acta.pdf", "document_id": "acta-1"}],
      "acta_mercantil": []
    }
  }'
```

6. Consulta status:

Primera llamada:

```bash
curl -X POST http://127.0.0.1:8000/v1/onboarding/status \
  -H "Content-Type: application/json" \
  -d '{"job_ids":["val_REPLACE_ME"]}'
```

Segunda llamada:

```bash
curl -X POST http://127.0.0.1:8000/v1/onboarding/status \
  -H "Content-Type: application/json" \
  -d '{"job_ids":["val_REPLACE_ME"]}'
```

En `mock mode`, la primera llamada devuelve `PROCESSING` y la segunda devuelve `COMPLETED` con una estructura mock del resultado final.
Con `JOB_QUEUE_MODE=inline`, el worker se ejecuta dentro del mismo proceso y el job usualmente aparecerá como `COMPLETED` en el primer status poll.

### Worker

Si quieres levantar el worker localmente:

```bash
uvicorn backend.worker.main:app --reload --port 8001
```

### Estado actual del mock

Por ahora el API:

- crea jobs mock
- puede despachar inline para prueba local
- valida técnicamente URLs y tipos de archivo antes de seguir
- devuelve resultado mock consistente con el contrato base

Todavía no hace:

- persistencia real en `Firestore`
- procesamiento real con `Cloud Tasks` en un entorno GCP configurado
- extracción real con Gemini en entorno con credenciales configuradas
- validación legal real
- validación cruzada real

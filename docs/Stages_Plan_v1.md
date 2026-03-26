# Plan por Etapas

## Objetivo

Ordenar la implementación del MVP en etapas verificables, manteniendo una separación clara entre:

- contrato externo para Cashea
- lógica documental y reglas de negocio
- infraestructura async en GCP
- evaluación y regresión en CI/CD

Este documento es la fuente de verdad del plan actual del proyecto.

## Alcance del MVP

Incluido:

- API asíncrona para submit y status
- routing directo por tipo documental enviado por Cashea
- extracción estructurada con Gemini por tipo de documento
- normalización a un modelo interno canónico
- validación cruzada entre documentos
- evals lógicos y regresión en CI/CD
- despliegue en Google Cloud

Fuera de alcance del MVP:

- integración con HubSpot
- clasificación automática de documentos
- generación de contratos
- backoffice de revisión manual

## Principios

1. El contrato externo de Cashea manda.
2. El tipo documental del payload es la fuente de verdad.
3. API y worker se despliegan como componentes separados.
4. Extracción y validación son capas distintas.
5. Las reglas de negocio corren sobre datos normalizados.
6. Los casos ambiguos deben terminar en `REQUIRES_REVIEW`, no en rechazos forzados.
7. Los evals de lógica deben correr en CI/CD antes de depender de staging o infraestructura real.

## Stack y arquitectura acordados

- `Python 3.11`
- `FastAPI`
- `Pydantic`
- `Cloud Run` para API y worker
- `Cloud Tasks` como opción recomendada para el MVP
- `Firestore` para estado de jobs
- `Cloud Storage` opcional para staging temporal
- `Vertex AI Gemini` para extracción y razonamiento documental
- `GitHub Actions` para tests y evals lógicos de regresión

## Etapa 1: Base desplegable

### Objetivo

Dejar la estructura del proyecto lista para desplegar en Google Cloud.

### Incluye

- estructura de carpetas para `api`, `worker` y código compartido
- configuración centralizada por variables de entorno
- Dockerfiles para `Cloud Run`
- endpoints mínimos de healthcheck
- contrato base para submit y status

### Resultado esperado

- la API y el worker pueden desplegarse por separado
- el proyecto queda listo para empezar integración real

### Estado

- completada

## Etapa 2: Jobs y ejecución local

### Objetivo

Conectar el contrato HTTP con un ciclo funcional de jobs para desarrollo local.

### Incluye

- creación de jobs
- lectura de status
- repositorio en memoria
- dispatcher inline
- procesamiento dentro del mismo proceso para pruebas rápidas

### Resultado esperado

- el sistema recibe un request y genera un job trazable
- el flujo `validate -> status` funciona localmente

### Estado

- completada

## Etapa 3: Descarga y validación técnica de archivos

### Objetivo

Garantizar que los documentos puedan ser procesados correctamente antes de usar Gemini.

### Incluye

- descarga desde URLs
- validación de tipo MIME
- validación de tamaño
- manejo de errores de acceso
- staging opcional en `Cloud Storage`

### Resultado esperado

- los documentos válidos pasan a extracción
- los inválidos fallan con errores claros

### Estado

- completada

## Etapa 4: Extracción por tipo documental

### Objetivo

Extraer datos estructurados de cada documento según el tipo ya enviado por Cashea.

### Incluye

- extractor de `rif`
- extractor de `cedula`
- extractor de `acta_constitutiva`
- extractor de `acta_mercantil`
- extractor de `certificado_emprendimiento`
- paralelización por documento
- prompts reutilizados y adaptados desde el workflow original de `n8n`

### Resultado esperado

- cada documento genera una salida JSON consistente
- no existe dependencia de clasificación automática
- múltiples documentos pueden extraerse en paralelo

### Estado

- completada

## Etapa 5: Normalización de datos

### Objetivo

Unificar toda la información extraída en un modelo interno canónico.

### Incluye

- normalización de nombres
- normalización de RIF y cédulas
- normalización de fechas
- consolidación de representantes
- consolidación de vigencia y firma
- derivación de snapshot canónico por aliado

### Resultado esperado

- las reglas de negocio operan sobre un solo modelo interno

### Estado

- completada

## Etapa 6: Validación cruzada base

### Objetivo

Comparar la información entre documentos y construir un veredicto inicial del caso.

### Incluye

- checks de presencia documental
- checks de vigencia
- checks de coincidencia de razón social
- checks de coincidencia del representante
- checks de junta directiva
- checks de facultad de firma
- soporte base para:
  - `sociedad mercantil`
  - `emprendimiento`
  - `firma personal`

### Resultado esperado

- el sistema emite `APPROVED`, `REJECTED` o `REQUIRES_REVIEW`
- cada decisión tiene evidencia verificable

### Estado

- completada a nivel base

## Etapa 7: Evals por capas y regresión en CI/CD

### Objetivo

Evitar regresiones en extracción, normalización, validación cruzada y orquestación interna sin depender todavía de la infraestructura final en GCP.

### Incluye

- suite de unit tests para servicios y reglas
- logic evals sobre fixtures controlados
- extraction evals por tipo documental
- comprehensive evals sobre el pipeline interno
- validación de expected outputs por tipo documental y por flujo
- regresión de reglas de cross-validation
- ejecución automática en `GitHub Actions` cuando cambien archivos relevantes

### Resultado esperado

- los cambios de lógica y orquestación interna quedan protegidos por CI/CD
- el equipo puede evolucionar prompts y reglas con menor riesgo

### Estado

- iniciada
- `GitHub Actions` ya corre tests y evals sanitizados
- ya existe un framework base con:
  - logic evals
  - extraction evals
  - comprehensive evals
- falta ampliar cobertura de fixtures y casos de regresión

## Etapa 8: Profundización de reglas y semántica del resultado

### Objetivo

Mejorar la calidad del veredicto antes de mover el flujo a infraestructura async real.

### Incluye

- derivación explícita de modo legal:
  - `sociedad_mercantil`
  - `firma_personal`
  - `emprendimiento`
- reglas más fuertes de facultad de firma
- precedencia entre acta constitutiva y actas mercantiles posteriores
- mejor diferenciación entre `REJECTED` y `REQUIRES_REVIEW`
- taxonomía más estable de reasons y error codes para Cashea

### Resultado esperado

- mayor precisión legal y operativa en la respuesta final

### Estado

- siguiente etapa recomendada

## Etapa 9: Infraestructura async real en GCP

### Objetivo

Reemplazar el modo local `inmemory + inline` por un flujo compartido y desplegable.

### Incluye

- `FirestoreJobRepository`
- `Cloud Tasks` como dispatcher real
- worker separado leyendo y escribiendo el mismo estado de job
- configuración por ambientes
- soporte opcional para `Firestore Emulator` local

### Resultado esperado

- API y worker operan como servicios desacoplados
- el estado del job sobrevive fuera del proceso local

### Estado

- preparada en código, no activada como path principal

## Etapa 10: Staging, observabilidad y piloto

### Objetivo

Cerrar el flujo operativo para pruebas en ambiente real y piloto controlado.

### Incluye

- despliegue en `Cloud Run` para API y worker
- `Firestore` y `Cloud Tasks` conectados en staging
- logging estructurado y métricas mínimas
- smoke tests de integración
- revisión de latencia y costo
- piloto controlado

### Resultado esperado

- MVP listo para tráfico de prueba fuera del entorno local

### Estado

- pendiente

## Orden recomendado

1. Etapas 1 a 6 ya cerradas a nivel base
2. Etapa 7
3. Etapa 8
4. Etapa 9
5. Etapa 10

## Estado actual

Ya están validados localmente con extracción real por Vertex AI Gemini:

- `sociedad mercantil`
- `emprendimiento`
- `firma personal`

El proyecto ya tiene:

- API funcional de submit y status
- intake técnico de documentos
- extracción paralela por documento
- normalización canónica
- validación cruzada base
- tests unitarios corriendo en CI

Lo siguiente es formalizar los evals lógicos en CI/CD y profundizar las reglas antes de cerrar la infraestructura async real.

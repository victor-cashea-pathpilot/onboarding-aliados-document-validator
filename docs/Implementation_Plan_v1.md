# Plan de Implementación por Partes

## Objetivo

Implementar el MVP del validador documental de onboarding para Cashea como un servicio asíncrono en Google Cloud, con extracción estructurada usando Gemini y un motor de validación cruzada entre documentos.

Este plan está orientado a ejecución incremental. La prioridad es tener una primera versión funcional de punta a punta antes de optimizar costo, performance o sofisticación operativa.

## Principios de implementación

1. El contrato externo manda.
2. El tipo documental viene dado por el payload y no se infiere.
3. Extracción y validación son módulos separados.
4. Las reglas de negocio se ejecutan sobre datos normalizados.
5. Cada fase debe dejar algo usable o verificable.

## Estrategia general

La implementación se divide en bloques acumulativos:

1. base técnica mínima
2. intake y jobs asíncronos
3. extracción por tipo documental
4. normalización
5. validación cruzada
6. hardening operativo

## Fase 1: Base del proyecto

### Objetivo

Dejar listo el esqueleto del servicio para que el equipo pueda trabajar en paralelo.

### Alcance

- estructura inicial del repositorio
- servicio API
- servicio worker
- configuración por ambiente
- logging estructurado
- manejo de secretos
- modelo inicial de `job`

### Entregables

- carpeta base del proyecto
- bootstrap de API y worker
- configuración local y cloud
- definición inicial de modelos compartidos

### Criterio de salida

- el proyecto levanta localmente
- existe un endpoint de healthcheck
- se puede crear un job dummy y persistir su estado

## Fase 2: Intake y orquestación asíncrona

### Objetivo

Recibir solicitudes reales de Cashea y procesarlas como jobs.

### Alcance

- `POST /v1/onboarding/validate`
- `POST /v1/onboarding/status`
- persistencia de jobs en Firestore
- encolado asíncrono con `Cloud Tasks` o `Pub/Sub`
- trazabilidad por `job_id`

### Entregables

- endpoints base del contrato
- creación de jobs con estado `PENDING`
- transición a `PROCESSING`
- respuesta de polling con progreso básico

### Criterio de salida

- Cashea puede crear un job
- el worker recibe el job
- el estado del job cambia correctamente durante el procesamiento

## Fase 3: Descarga y validación técnica de archivos

### Objetivo

Asegurar que los archivos recibidos puedan ser procesados de forma confiable.

### Alcance

- descarga desde URLs provistas
- validación de reachability
- validación de tamaño y tipo MIME
- manejo de timeouts y errores de red
- staging opcional en Cloud Storage

### Entregables

- módulo de descarga de documentos
- módulo de validación técnica
- catálogo de errores de archivo

### Criterio de salida

- un job con documentos válidos llega a la capa de extracción
- un job con archivos inválidos falla con errores claros y recuperables

## Fase 4: Extracción estructurada por tipo documental

### Objetivo

Extraer datos legales y fiscales con prompts específicos por documento.

### Tipos soportados

- `rif`
- `cedula`
- `acta_constitutiva`
- `acta_mercantil`
- `certificado_emprendimiento`

### Alcance

- prompts por tipo
- respuestas estrictas en JSON
- parseo y validación de esquema
- score de confianza por documento

### Entregables

- extractor de RIF
- extractor de cédula
- extractor de acta constitutiva
- extractor de acta mercantil
- extractor de certificado de emprendimiento

### Criterio de salida

- cada documento produce una estructura consistente
- los errores de extracción quedan explicitados
- ya no hay dependencia de la lógica de clasificación del prototipo

## Fase 5: Normalización a modelo canónico

### Objetivo

Separar por completo el shape interno de los prompts del shape sobre el que corren las reglas de negocio.

### Alcance

- normalización de nombres
- normalización de cédulas y RIF
- normalización de fechas
- consolidación de representantes legales
- consolidación de vigencia de compañía y junta
- derivación de tipo de entidad

### Entregables

- esquema canónico interno
- módulo de normalización
- utilidades de parsing y canonicalización

### Criterio de salida

- las reglas posteriores consumen solo el modelo canónico
- cambios de prompt no rompen la lógica de validación

## Fase 6: Motor de validación cruzada

### Objetivo

Determinar si el caso procede, no procede o requiere revisión.

### Validaciones mínimas

- presencia de documentos requeridos
- vigencia del RIF
- coincidencia de razón social
- coincidencia de identidad del representante
- vigencia de junta directiva cuando aplique
- consistencia del tipo de firma
- autoridad suficiente para firmar
- consistencia entre acta constitutiva y actas mercantiles posteriores

### Entregables

- motor de reglas determinísticas
- salida de checks con evidencia
- veredicto global del caso

### Criterio de salida

- cada veredicto puede explicarse a partir de checks explícitos
- existe soporte para `APPROVED`, `REJECTED` y `REQUIRES_REVIEW`

## Fase 7: Respuesta final y observabilidad

### Objetivo

Dejar el servicio listo para consumo inicial y troubleshooting.

### Alcance

- respuesta completa del status endpoint
- resultados por documento
- checks de validación cruzada
- logs estructurados
- métricas básicas
- trazabilidad por `job_id`

### Entregables

- payload final de resultados
- catálogo de errores de negocio y técnicos
- dashboards o métricas mínimas

### Criterio de salida

- Cashea puede interpretar resultados sin depender del equipo técnico
- el equipo puede depurar un caso con logs y estado persistido

## Fase 8: Evaluación y hardening

### Objetivo

Reducir riesgo antes de abrir tráfico real.

### Alcance

- dataset inicial etiquetado
- casos borde por tipo documental
- pruebas de regresión
- tuning de prompts
- tuning de reglas
- validación de latencia y costo

### Entregables

- set de pruebas representativo
- métricas de precisión y revisión manual
- backlog de mejoras post-MVP

### Criterio de salida

- el sistema tiene comportamiento estable sobre documentos reales
- el nivel de ambigüedad es aceptable para piloto

## Orden recomendado de ejecución

### Bloque A

- Fase 1
- Fase 2

Resultado:

- API y jobs corriendo de punta a punta sin lógica real

### Bloque B

- Fase 3
- Fase 4

Resultado:

- documentos válidos producen extracción estructurada

### Bloque C

- Fase 5
- Fase 6

Resultado:

- existe decisión legal y de negocio sobre datos canónicos

### Bloque D

- Fase 7
- Fase 8

Resultado:

- el servicio está listo para piloto

## Trabajo en paralelo recomendado

### Track 1: Plataforma

- API
- cola
- persistencia
- observabilidad
- despliegue

### Track 2: IA y extracción

- prompts
- esquemas
- parsing
- normalización

### Track 3: Reglas y calidad

- motor de validación
- casos borde
- dataset de evaluación
- regresión

## Riesgos principales

### Variabilidad del modelo

Mitigación:

- JSON estricto
- validación de esquema
- normalización
- fixtures de regresión

### Ambigüedad legal

Mitigación:

- salida `REQUIRES_REVIEW`
- checks con evidencia
- no forzar rechazos cuando no hay certeza suficiente

### Calidad documental

Mitigación:

- validación técnica
- errores explícitos
- thresholds de confianza

## Primer backlog sugerido

1. Definir stack y estructura del proyecto.
2. Implementar API mínima en Cloud Run.
3. Implementar modelo de job en Firestore.
4. Implementar worker asíncrono.
5. Implementar downloader de archivos.
6. Implementar extractor de RIF.
7. Implementar extractor de cédula.
8. Implementar esquema canónico.
9. Implementar primeros checks de validación cruzada.
10. Exponer respuesta completa en endpoint de status.

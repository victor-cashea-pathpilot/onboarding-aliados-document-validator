# Plan por Etapas

## Objetivo

Ordenar la implementación del MVP en etapas claras, cada una con un resultado verificable y una dependencia mínima respecto a la siguiente.

Este documento complementa el plan de implementación detallado y funciona como roadmap ejecutivo del proyecto.

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

## Etapa 2: Jobs y orquestación asíncrona

### Objetivo

Conectar el contrato HTTP con un ciclo real de jobs.

### Incluye

- creación de jobs
- persistencia de estado
- transición de estados
- integración con `Cloud Tasks` o `Pub/Sub`
- endpoint de polling funcional

### Resultado esperado

- el sistema recibe un request y genera un job trazable
- existe una ruta clara entre API y worker

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

## Etapa 4: Extracción por tipo documental

### Objetivo

Extraer datos estructurados de cada documento según el tipo ya enviado por Cashea.

### Incluye

- extractor de `rif`
- extractor de `cedula`
- extractor de `acta_constitutiva`
- extractor de `acta_mercantil`
- extractor de `certificado_emprendimiento`

### Resultado esperado

- cada documento genera una salida JSON consistente
- no existe dependencia de clasificación automática

## Etapa 5: Normalización de datos

### Objetivo

Unificar toda la información extraída en un modelo interno canónico.

### Incluye

- normalización de nombres
- normalización de RIF y cédulas
- normalización de fechas
- consolidación de representantes
- consolidación de vigencia y firma

### Resultado esperado

- las reglas de negocio operan sobre un solo modelo interno

## Etapa 6: Validación cruzada

### Objetivo

Comparar la información entre documentos y construir el veredicto del caso.

### Incluye

- checks de presencia documental
- checks de vigencia
- checks de coincidencia de razón social
- checks de coincidencia del representante
- checks de junta directiva
- checks de facultad de firma

### Resultado esperado

- el sistema emite `APPROVED`, `REJECTED` o `REQUIRES_REVIEW`
- cada decisión tiene evidencia verificable

## Etapa 7: Resultado final y observabilidad

### Objetivo

Exponer una respuesta final útil para Cashea y operable para el equipo técnico.

### Incluye

- response final del endpoint de status
- resultado por documento
- checks de validación cruzada
- logging estructurado
- métricas mínimas

### Resultado esperado

- Cashea puede consumir el resultado de forma estable
- el equipo puede depurar el flujo con trazabilidad

## Etapa 8: Evaluación y piloto

### Objetivo

Medir calidad antes de abrir tráfico real.

### Incluye

- dataset inicial de documentos
- pruebas de regresión
- tuning de prompts
- tuning de reglas
- revisión de latencia y costo

### Resultado esperado

- MVP listo para piloto controlado

## Orden recomendado

1. Etapa 1
2. Etapa 2
3. Etapa 3
4. Etapa 4
5. Etapa 5
6. Etapa 6
7. Etapa 7
8. Etapa 8

## Estado actual

La Etapa 1 ya tiene base iniciada en el branch `develop` con la estructura inicial del backend y los servicios mínimos de API y worker.

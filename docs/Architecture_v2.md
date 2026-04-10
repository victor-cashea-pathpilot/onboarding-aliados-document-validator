# Componentes y Requerimientos de Despliegue

## Objetivo

Este documento enumera únicamente los componentes **internos** de la solución que el equipo de infraestructura necesita desplegar y operar, junto con el modelo de seguridad actual.

No incluye sistemas externos consumidores del API.

## Componentes internos y requerimientos

### 1. Cloud Run — API Service

Responsabilidad:

- recibir requests de validación
- crear `job_id`
- persistir el job inicial
- encolar procesamiento asíncrono
- exponer consulta de estado y endpoints internos para operación

Endpoints principales:

- `POST /validate`
- `POST /status`
- `GET /internal/jobs/{job_id}`
- `GET /internal/jobs`

Requerimientos de infraestructura:

- servicio desplegado en `Cloud Run`
- variables de entorno por ambiente
- healthcheck estable
- timeout para requests cortos
- logs por `stdout/stderr`

Dependencias:

- `Firestore`
- `Cloud Tasks`

Permisos mínimos requeridos:

- lectura/escritura en `Firestore`
- creación de tasks en `Cloud Tasks`

### 2. Firestore

Responsabilidad:

- fuente de verdad del job

Persistencia actual:

- request original
- estado del job
- progreso
- resultados por documento
- snapshot normalizado
- validación cruzada
- resultado final

Requerimientos de infraestructura:

- `Firestore` en modo nativo
- colección de jobs por ambiente
- índices para paginación/consulta del `Case Explorer`

Permisos mínimos requeridos:

- acceso restringido a service accounts del API y worker

### 3. Cloud Tasks

Responsabilidad:

- ejecutar el procesamiento asíncrono del job
- aplicar retries y rate limiting
- invocar el worker autenticadamente

Requerimientos de infraestructura:

- una cola dedicada por ambiente
- configuración explícita de:
  - `max dispatches`
  - `max concurrent dispatches`
  - retries
  - backoff

Permisos mínimos requeridos:

- invocación del worker con `OIDC`
- service account dedicada para invocar el worker

### 4. Cloud Run — Worker Service

Responsabilidad:

- procesar un job completo
- validar y descargar documentos
- ejecutar extracción en paralelo por documento
- normalizar datos
- ejecutar validación cruzada
- persistir resultado final

Requerimientos de infraestructura:

- servicio desplegado en `Cloud Run`
- acceso privado / autenticado
- CPU y memoria suficientes para documentos largos
- timeout suficiente para llamadas LLM
- `containerConcurrency` ajustada al throughput esperado

Dependencias:

- `Firestore`
- `Vertex AI`
- acceso saliente a URLs de documentos

Permisos mínimos requeridos:

- lectura/escritura en `Firestore`
- acceso a `Vertex AI`

### 5. Vertex AI (Gemini)

Responsabilidad:

- extracción estructurada por documento
- validación cruzada contextual
- assessment legal final

Uso actual:

- `Gemini 2.5 Flash`
  - `RIF`
  - `Cédula`
  - documentos simples

- `Gemini 2.5 Pro`
  - `Acta Constitutiva`
  - `Acta Mercantil`
  - `Certificado de Emprendimiento`
  - validación final

Requerimientos de infraestructura:

- `Vertex AI API` habilitada
- proyecto/región configurados
- cuotas suficientes para el throughput esperado

Permisos mínimos requeridos:

- acceso vía IAM / service account del worker

### 6. Cloud Logging / Monitoring

Responsabilidad:

- trazabilidad operativa
- diagnóstico de fallos
- dashboards y métricas

Estado actual:

- logs JSON estructurados
- métricas derivadas de logs
- dashboard operativo en `Cloud Monitoring`

Requerimientos de infraestructura:

- `Cloud Logging`
- `Cloud Monitoring`
- creación de métricas basadas en logs
- creación de dashboard por ambiente

### 7. Cloud Run — Case Explorer

Responsabilidad:

- inspección interna de casos
- visualización de prompts, inputs, outputs y progreso del workflow

Requerimientos de infraestructura:

- servicio desplegado en `Cloud Run`
- usa el API como backend
- protegido con `IAP`

Dependencias:

- `Cloud Run — API Service`

Permisos mínimos requeridos:

- service account con permiso de invocar el API interno

## Seguridad actual

### Acceso a servicios

- `API Service`: acceso autenticado
- `Worker Service`: acceso privado, invocado por `Cloud Tasks` con `OIDC`
- `Case Explorer`: acceso protegido con `IAP / Google login`

### Identidades de servicio

Se usan service accounts separadas para:

- `API`
- `Worker`
- `Cloud Tasks` caller
- `Case Explorer`

### Firestore

- no se expone a clientes externos
- acceso restringido a componentes internos autorizados

### Vertex AI

- acceso por IAM
- no se usan API keys públicas en runtime

### Documentos

- el sistema consume documentos vía:
  - URLs externas
  - signed URLs
- no se deben loggear tokens completos ni query params sensibles

### Webapp interna

- `Case Explorer` usa `IAP` para control de acceso
- el acceso se otorga por usuario o grupo

## Resumen de despliegue

Para desplegar la arquitectura actual se necesitan estos componentes:

- `Cloud Run — API Service`
- `Firestore`
- `Cloud Tasks`
- `Cloud Run — Worker Service`
- `Vertex AI`
- `Cloud Logging / Monitoring`
- `Cloud Run — Case Explorer`
- `IAP`

## Capacidad objetivo del MVP

Volumen objetivo inicial:

- `100` casos por día
- picos de `10` casos simultáneos

Los puntos más sensibles para capacity son:

- concurrencia del worker
- throughput de `Cloud Tasks`
- cuotas de `Vertex AI Gemini`

# Guía de Integración — Servicio de Validación de Documentos

## Índice

1. [Resumen del servicio](#1-resumen-del-servicio)
2. [Modelo asíncrono](#2-modelo-asíncrono)
3. [Autenticación](#3-autenticación)
4. [Integración vía REST (HTTP/JSON)](#4-integración-vía-rest-httpjson)
   - [Enviar solicitud de validación](#41-enviar-solicitud-de-validación)
   - [Consultar estado](#42-consultar-estado)
   - [Interpretar el resultado](#43-interpretar-el-resultado)
5. [Integración vía gRPC](#5-integración-vía-grpc)
   - [Configuración del cliente](#51-configuración-del-cliente)
   - [Enviar solicitud de validación](#52-enviar-solicitud-de-validación)
   - [Consultar estado](#53-consultar-estado)
   - [Manejo de errores gRPC](#54-manejo-de-errores-grpc)
6. [Tipos de documentos](#6-tipos-de-documentos)
7. [Estados y progreso](#7-estados-y-progreso)
8. [Interpretación del resultado final](#8-interpretación-del-resultado-final)
   - [Veredicto](#81-veredicto)
   - [Puntaje de confianza](#82-puntaje-de-confianza)
   - [Códigos de error](#83-códigos-de-error)
9. [Flujo de integración recomendado](#9-flujo-de-integración-recomendado)
10. [Ejemplos de código](#10-ejemplos-de-código)

---

## 1. Resumen del servicio

El servicio de validación de documentos recibe URLs de documentos legales venezolanos (RIF, cédula, actas), los extrae mediante visión por computadora, los cruza entre sí y emite un veredicto final (`APPROVED`, `REJECTED`, `REQUIRES_REVIEW`) junto con un puntaje de confianza.

El procesamiento es **asíncrono**: el cliente envía los documentos, recibe un `job_id` inmediatamente y luego consulta el estado hasta que el trabajo esté completo.

---

## 2. Modelo asíncrono

```
Cliente                          Servicio
  │                                 │
  │── POST /validate ─────────────▶ │  Recibe documentos
  │◀─ 202 Accepted { job_id } ───── │  Encola trabajo
  │                                 │
  │    (procesamiento ~10-60s)      │
  │                                 │
  │── POST /status { job_ids } ───▶ │
  │◀─ [{ status: "PROCESSING" }] ── │
  │                                 │
  │── POST /status { job_ids } ───▶ │
  │◀─ [{ status: "COMPLETED",       │
  │      overall_result: {...} }] ─ │
```

**Tiempo de procesamiento estimado:** 15–60 segundos según el número y tipo de documentos.

**Recomendación de polling:** consultar cada 5 segundos hasta obtener `COMPLETED` o `FAILED`.

---

## 3. Autenticación

### REST (HTTP)

Todas las solicitudes deben incluir el header:

```http
X-API-Key: <tu-api-key>
```

Contactar al equipo de Cashea para obtener la API key del entorno correspondiente.

### gRPC

El servicio gRPC corre en Cloud Run con `allow_unauthenticated: false` e ingress `internal-and-cloud-load-balancing`. **No usa `x-api-key`** — la autenticación es a nivel de infraestructura mediante **Google OIDC**.

El cliente necesita:
1. Una **service account de GCP** con el rol `roles/run.invoker` sobre el servicio gRPC.
2. Generar un **OIDC token** para esa service account con la URL del servicio como `audience`.
3. Enviar el token como metadata `Authorization: Bearer <token>` en cada llamada.

```js
const { GoogleAuth } = require('google-auth-library');

const auth = new GoogleAuth();
const client = await auth.getIdTokenClient(GRPC_SERVICE_URL);
const token = await client.idTokenProvider.fetchIdToken(GRPC_SERVICE_URL);

const metadata = new grpc.Metadata();
metadata.set('authorization', `Bearer ${token}`);
```

Coordinar con el equipo de Cashea para que se les provisione la service account y los permisos de acceso al entorno.

---

## 4. Integración vía REST (HTTP/JSON)

### 4.1 Enviar solicitud de validación

**`POST /v1/onboarding/validate`**

Headers:
```http
Content-Type: application/json
X-API-Key: <api-key>
```

Body:
```json
{
  "merchant_id": "98765",
  "request_id": "cashea-req-001",
  "documents": {
    "rif": [
      { "url": "https://storage.example.com/rif.pdf", "document_id": "rif-1" }
    ],
    "cedula": [
      { "url": "https://storage.example.com/cedula.jpg", "document_id": "cedula-1" }
    ],
    "acta_constitutiva": [
      { "url": "https://storage.example.com/acta-constitutiva.pdf", "document_id": "acta-1" }
    ],
    "acta_mercantil": [
      { "url": "https://storage.example.com/acta-mercantil.pdf", "document_id": "acta-2" }
    ],
    "certificado_emprendimiento": []
  },
  "metadata": {
    "submitted_by": "cashea-onboarding",
    "source_system": "cashea-backoffice"
  }
}
```

**Campos:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `merchant_id` | string | Sí | Identificador único del aliado en Cashea |
| `request_id` | string | No | Identificador de la solicitud para idempotencia |
| `documents` | object | Sí | URLs por tipo de documento. Al menos un documento. |
| `documents.*.url` | string | Sí | URL pública o firmada del archivo |
| `documents.*.document_id` | string | No | Referencia interna del documento |
| `metadata` | object | No | Pares clave-valor para trazabilidad |

**Respuesta `202 Accepted`:**
```json
{
  "job_id": "val_789abc",
  "status": "PENDING",
  "merchant_id": "98765",
  "request_id": "cashea-req-001",
  "created_at": "2026-05-09T18:00:00Z"
}
```

> Guardar el `job_id` para consultar el estado.

---

### 4.2 Consultar estado

**`POST /v1/onboarding/status`**

Permite consultar múltiples trabajos en una sola solicitud.

Body:
```json
{
  "job_ids": ["val_789abc", "val_456def"]
}
```

**Respuesta `200 OK` — trabajo en progreso:**
```json
[
  {
    "job_id": "val_789abc",
    "merchant_id": "98765",
    "status": "PROCESSING",
    "progress": {
      "stage": "cross_validation",
      "percentage": 70,
      "message": "Validando consistencia entre documentos."
    },
    "created_at": "2026-05-09T18:00:00Z",
    "updated_at": "2026-05-09T18:00:45Z"
  }
]
```

**Respuesta `200 OK` — trabajo completado:**
```json
[
  {
    "job_id": "val_789abc",
    "merchant_id": "98765",
    "status": "COMPLETED",
    "overall_result": {
      "status": "REJECTED",
      "confidence": 92,
      "summary": "El caso fue rechazado porque el representante declarado en la cédula no coincide con el registrado en el acta constitutiva.",
      "error_codes": ["NO_COINCIDE_REPRESENTANTE"],
      "confidence_breakdown": {
        "llm_assessment": 95,
        "document_quality": 97,
        "composite": 92
      }
    },
    "documents": {
      "rif": [
        {
          "document_id": "rif-1",
          "status": "APPROVED",
          "confidence": 96,
          "extracted_data": {
            "rif_number": "J-30000001-5",
            "company_name": "COMERCIAL DEMO C.A.",
            "expiration_date": "2027-03-15"
          },
          "errors": []
        }
      ],
      "cedula": [
        {
          "document_id": "cedula-1",
          "status": "APPROVED",
          "confidence": 93,
          "extracted_data": {
            "id_number": "V-15000001",
            "full_name": "CARLOS ALBERTO MENDOZA PEREZ",
            "expiration_date": "2028-06-30"
          },
          "errors": []
        }
      ],
      "acta_constitutiva": [
        {
          "document_id": "acta-1",
          "status": "REJECTED",
          "confidence": 88,
          "extracted_data": {
            "company_name": "COMERCIAL DEMO C.A.",
            "legal_representatives": [
              { "full_name": "PEDRO GONZALEZ", "id_number": "V-99887766", "role": "Presidente" }
            ]
          },
          "errors": [
            {
              "error_code": "NO_COINCIDE_REPRESENTANTE",
              "message": "El representante en el acta no coincide con la cédula presentada."
            }
          ]
        }
      ],
      "acta_mercantil": [],
      "certificado_emprendimiento": []
    },
    "cross_validation": {
      "legal_mode": "sociedad_mercantil",
      "checks": [
        { "code": "MATCH_COMPANY_NAME", "status": "PASSED", "message": "Razón social consistente en RIF y acta." },
        { "code": "MATCH_REPRESENTATIVE_ID", "status": "FAILED", "message": "Cédula no coincide con representante en acta constitutiva." },
        { "code": "RIF_VALIDITY", "status": "PASSED", "message": "RIF vigente." }
      ]
    },
    "created_at": "2026-05-09T18:00:00Z",
    "updated_at": "2026-05-09T18:01:15Z"
  }
]
```

---

### 4.3 Interpretar el resultado

Ver sección [8 — Interpretación del resultado final](#8-interpretación-del-resultado-final).

---

## 5. Integración vía gRPC

El servicio expone la misma funcionalidad a través de gRPC (`onboarding.v1.OnboardingService`).

### 5.1 Configuración del cliente

**Proto file:** solicitar al equipo de Cashea el archivo `onboarding/v1/onboarding.proto`.

**Parámetros de conexión:**

| Parámetro | Valor |
|---|---|
| Paquete | `onboarding.v1` |
| Servicio | `OnboardingService` |
| Protocolo | gRPC sobre HTTP/2 |
| Host/Puerto | Provisto por el equipo de Cashea por entorno |
| Auth | OIDC Bearer token — ver sección 3 (gRPC) |

**Opciones del proto loader recomendadas:**
```js
{
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
}
```

---

### 5.2 Enviar solicitud de validación

**RPC:** `SubmitValidation`

Request message `SubmitValidationRequest`:
```protobuf
message SubmitValidationRequest {
  string merchant_id = 1;
  string request_id = 2;
  DocumentsPayload documents = 3;
  map<string, string> metadata = 4;
}

message DocumentsPayload {
  repeated DocumentReference rif = 1;
  repeated DocumentReference cedula = 2;
  repeated DocumentReference certificado_emprendimiento = 3;
  repeated DocumentReference acta_constitutiva = 4;
  repeated DocumentReference acta_mercantil = 5;
}

message DocumentReference {
  string url = 1;
  string document_id = 2;
}
```

Response message `SubmitValidationResponse`:
```protobuf
message SubmitValidationResponse {
  string job_id = 1;
  string status = 2;
  string merchant_id = 3;
  string request_id = 4;
  string created_at = 5;
}
```

**Ejemplo en Node.js:**
```js
const response = await client.submitValidation({
  merchant_id: '98765',
  request_id: 'cashea-req-001',
  documents: {
    rif: [{ url: 'https://storage.example.com/rif.pdf', document_id: 'rif-1' }],
    cedula: [{ url: 'https://storage.example.com/cedula.jpg', document_id: 'cedula-1' }],
    acta_constitutiva: [{ url: 'https://storage.example.com/acta.pdf', document_id: 'acta-1' }],
    acta_mercantil: [],
    certificado_emprendimiento: [],
  },
  metadata: { source_system: 'cashea-backoffice' },
});

const jobId = response.job_id; // "val_789abc"
```

---

### 5.3 Consultar estado

**RPC:** `GetStatus`

Request message `StatusRequest`:
```protobuf
message StatusRequest {
  repeated string job_ids = 1;
}
```

Response message `StatusResponse`:
```protobuf
message StatusResponse {
  repeated StatusResponseItem items = 1;
}

message StatusResponseItem {
  string job_id = 1;
  string status = 2;
  string merchant_id = 3;
  bool has_progress = 4;
  ProgressInfo progress = 5;
  bool has_overall_result = 6;
  OverallResult overall_result = 7;
  string documents_json = 8;         // JSON serializado
  string cross_validation_json = 9;  // JSON serializado
  string created_at = 10;
  string updated_at = 11;
}
```

> **Nota:** `documents_json` y `cross_validation_json` contienen el mismo detalle que en la respuesta REST, pero serializados como string JSON. Parsear con `JSON.parse()`.

**Ejemplo en Node.js:**
```js
const response = await client.getStatus({ job_ids: ['val_789abc'] });

for (const item of response.items) {
  if (item.status === 'COMPLETED' && item.has_overall_result) {
    const result = item.overall_result;
    console.log(result.status, result.confidence, result.summary);

    const documents = JSON.parse(item.documents_json);
    const crossValidation = JSON.parse(item.cross_validation_json);
  }
}
```

---

### 5.4 Manejo de errores gRPC

| Código gRPC | Nombre | Causa |
|---|---|---|
| `3` | `INVALID_ARGUMENT` | `merchant_id` vacío, sin documentos, URLs faltantes, `job_ids` vacío |
| `5` | `NOT_FOUND` | `job_id` no existe |
| `13` | `INTERNAL` | Error interno del servicio |

**Ejemplo en Node.js:**
```js
try {
  const response = await client.submitValidation(request);
} catch (err) {
  if (err.code === 3) {
    // INVALID_ARGUMENT — revisar campos de la solicitud
    console.error('Solicitud inválida:', err.details);
  }
}
```

---

## 6. Tipos de documentos

| Clave | Documento | Obligatorio para sociedad mercantil | Obligatorio para emprendimiento |
|---|---|---|---|
| `rif` | RIF (Registro de Información Fiscal) | Sí | Sí |
| `cedula` | Cédula de identidad del representante | Sí | Sí |
| `acta_constitutiva` | Acta constitutiva | Sí | No |
| `acta_mercantil` | Acta mercantil (última asamblea) | Recomendado | No |
| `certificado_emprendimiento` | Certificado de emprendimiento | No | Sí |

> Los tipos no aplicables deben enviarse como arreglo vacío `[]`.

---

## 7. Estados y progreso

### Estados del trabajo (`status`)

| Valor | Descripción |
|---|---|
| `PENDING` | Solicitud aceptada y en cola |
| `PROCESSING` | Extracción y validación en curso |
| `COMPLETED` | Procesamiento exitoso — resultado disponible |
| `FAILED` | Error técnico — el trabajo no pudo completarse |

### Etapas de progreso (`progress.stage`)

| Etapa | % aproximado | Descripción |
|---|---|---|
| `document_intake` | 10% | Verificación y descarga de URLs |
| `document_extraction` | 30% | Extracción de campos con Gemini |
| `document_normalization` | 50% | Normalización al formato canónico |
| `cross_validation` | 70% | Validación cruzada entre documentos |
| `completed` | 100% | Procesamiento finalizado |

---

## 8. Interpretación del resultado final

### 8.1 Veredicto

El campo `overall_result.status` indica la decisión del sistema:

| Veredicto | Significado | Acción recomendada |
|---|---|---|
| `APPROVED` | Todos los documentos son válidos y consistentes | Continuar el proceso de onboarding |
| `REJECTED` | Se encontró una inconsistencia crítica o documento inválido | Solicitar corrección al aliado |
| `REQUIRES_REVIEW` | El sistema no tiene suficiente certeza para decidir automáticamente | Escalar a revisión manual |

---

### 8.2 Puntaje de confianza

`overall_result.confidence` es un valor de 0 a 100 que refleja la certeza del sistema sobre su decisión.

Está compuesto por dos factores accesibles en `confidence_breakdown`:

| Campo | Descripción |
|---|---|
| `llm_assessment` | Confianza del modelo de lenguaje en su veredicto legal (0–100) |
| `document_quality` | Legibilidad promedio de los documentos enviados (0–100) |
| `composite` | Puntaje final: `llm_assessment × (document_quality / 100)` |

**Ejemplo:** si el modelo tiene `llm_assessment: 95` pero los documentos son de baja calidad (`document_quality: 70`), el puntaje compuesto baja a `66`, señalando que la decisión es menos confiable aunque el modelo esté seguro.

**Guía de interpretación:**

| Rango | Interpretación |
|---|---|
| 85–100 | Alta confianza — apto para decisión automática |
| 60–84 | Confianza media — considerar revisión manual si el veredicto es `REQUIRES_REVIEW` |
| < 60 | Baja confianza — escalar a revisión manual independientemente del veredicto |

---

### 8.3 Códigos de error

Los `error_codes` en `overall_result` y los errores en documentos individuales explican el motivo del rechazo:

| Código | Descripción |
|---|---|
| `NO_COINCIDE_REPRESENTANTE` | El representante en la cédula no coincide con el acta constitutiva |
| `NO_COINCIDE_RAZON_SOCIAL` | La razón social no es consistente entre documentos |
| `NO_COINCIDE_RIF` | El número de RIF no coincide entre documentos |
| `DOCUMENTO_VENCIDO` | Un documento expirado (RIF, cédula) |
| `JUNTA_DIRECTIVA_VENCIDA` | La junta directiva en el acta mercantil está vencida |
| `DOCUMENTO_ILEGIBLE` | El documento no pudo ser procesado por baja calidad de imagen |
| `DOCUMENTO_INCOMPLETO` | El documento está incompleto o le faltan páginas |
| `DOCUMENTO_INCORRECTO` | El archivo no corresponde al tipo de documento declarado |
| `FIRMA_CONJUNTA_INCOMPLETA` | La firma conjunta no está satisfecha con los documentos presentados |
| `CALIDAD_INSUFICIENTE` | La calidad general del documento es insuficiente para validación |
| `BAJA_CONFIANZA` | El puntaje de confianza es demasiado bajo para emitir decisión automática |

---

## 9. Flujo de integración recomendado

```
1. Recibir documentos del aliado en el sistema de onboarding de Cashea
        │
2. Enviar POST /v1/onboarding/validate con las URLs de los documentos
        │
3. Almacenar el job_id asociado al merchant_id
        │
4. Consultar POST /v1/onboarding/status cada 5 segundos
        │
5. Mientras status == "PROCESSING":
   │  - Mostrar etapa de progreso al aliado si se desea
   └─ Continuar polling
        │
6. Cuando status == "COMPLETED":
   ├─ overall_result.status == "APPROVED"         → Continuar onboarding
   ├─ overall_result.status == "REJECTED"         → Notificar al aliado con error_codes
   └─ overall_result.status == "REQUIRES_REVIEW"  → Escalar a equipo de revisión
        │
7. Cuando status == "FAILED":
        └─ Reintentar la solicitud o escalar como error técnico
```

---

## 10. Ejemplos de código

### REST — Node.js / TypeScript

```typescript
const BASE_URL = 'https://api.cashea.app'; // reemplazar con URL de entorno
const API_KEY = process.env.CASHEA_API_KEY;

async function validateMerchant(merchantId: string, documents: Record<string, { url: string; document_id: string }[]>) {
  // 1. Enviar solicitud
  const submitRes = await fetch(`${BASE_URL}/v1/onboarding/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
    body: JSON.stringify({ merchant_id: merchantId, documents }),
  });
  const { job_id } = await submitRes.json();

  // 2. Polling
  while (true) {
    await new Promise(r => setTimeout(r, 5000));

    const statusRes = await fetch(`${BASE_URL}/v1/onboarding/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
      body: JSON.stringify({ job_ids: [job_id] }),
    });
    const [item] = await statusRes.json();

    if (item.status === 'COMPLETED') return item.overall_result;
    if (item.status === 'FAILED') throw new Error(`Validation failed for job ${job_id}`);
  }
}
```

### gRPC — Node.js

```js
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const packageDef = protoLoader.loadSync('onboarding/v1/onboarding.proto', {
  keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
});
const proto = grpc.loadPackageDefinition(packageDef).onboarding.v1;

const client = new proto.OnboardingService(
  'api-grpc.cashea.app:443', // reemplazar con host de entorno
  grpc.credentials.createSsl(),
  { 'grpc.default_authority': 'api-grpc.cashea.app' }
);

// Auth: OIDC token para Cloud Run (no x-api-key)
const { GoogleAuth } = require('google-auth-library');
const auth = new GoogleAuth();
const idClient = await auth.getIdTokenClient(GRPC_SERVICE_URL);
const token = await idClient.idTokenProvider.fetchIdToken(GRPC_SERVICE_URL);

const metadata = new grpc.Metadata();
metadata.set('authorization', `Bearer ${token}`);

// Enviar solicitud
client.submitValidation({ merchant_id: '98765', documents: { ... } }, metadata, (err, response) => {
  if (err) return console.error(err);
  console.log('job_id:', response.job_id);
});
```

---

*Versión del documento: 1.0 — Mayo 2026*  
*Contacto técnico: equipo de Pathpilot / Cashea Engineering*

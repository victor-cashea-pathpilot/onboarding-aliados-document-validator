# Cashea Onboarding Validation API Spec v2

## Purpose

This document defines the integration contract for Cashea's onboarding document validation service.

The service is asynchronous. The caller submits a validation job with typed document URLs, receives a `job_id`, and later retrieves the result by polling a status endpoint.

---

## Transport options

| Transport | Intended for | Auth |
|---|---|---|
| **gRPC** | Production integrations (Cashea team) | Google identity token via Cloud Run IAM |
| **HTTP REST** | Internal testing, smoke tests, CI | `X-Api-Key` static key |

> **The Cashea integration team should use gRPC.** The HTTP API exists for testing and tooling — it is not the primary integration surface.

---

## gRPC (primary)

### Connection

- **Package**: `onboarding.v1`
- **Service**: `OnboardingService`
- **Proto file**: `packages/contracts/proto/onboarding/v1/onboarding.proto`

### Authentication

Auth is enforced by Cloud Run at the infrastructure level. Every gRPC call must carry a valid Google identity token in the `Authorization` metadata header:

```
Authorization: Bearer <google-identity-token>
```

Callers should use a Google service account with the `roles/run.invoker` IAM role on the gRPC Cloud Run service. The token can be obtained via:

```bash
gcloud auth print-identity-token --audiences=<grpc-service-url>
```

Or programmatically via the Google Auth Library (`google-auth-library`, `google.golang.org/grpc/credentials`, etc.).

### RPC methods

#### `SubmitValidation`

Submits a new validation job. Returns immediately with a `job_id`.

**Request: `SubmitValidationRequest`**

```proto
message SubmitValidationRequest {
  string merchant_id = 1;       // Required
  string request_id  = 2;       // Optional — idempotency key
  DocumentsPayload documents = 3;
  map<string, string> metadata = 4;  // Optional custom metadata
}

message DocumentsPayload {
  repeated DocumentReference rif                        = 1;
  repeated DocumentReference cedula                     = 2;
  repeated DocumentReference certificado_emprendimiento = 3;
  repeated DocumentReference acta_constitutiva          = 4;
  repeated DocumentReference acta_mercantil             = 5;
}

message DocumentReference {
  string url         = 1;  // Required — publicly reachable HTTPS URL
  string document_id = 2;  // Optional — caller-assigned identifier
}
```

**Response: `SubmitValidationResponse`**

```proto
message SubmitValidationResponse {
  string job_id      = 1;  // e.g. "val_789abc"
  string status      = 2;  // Always "PENDING" on acceptance
  string merchant_id = 3;
  string request_id  = 4;
  string created_at  = 5;  // ISO 8601
}
```

---

#### `GetStatus`

Polls status for one or more jobs. Safe to call repeatedly.

**Request: `StatusRequest`**

```proto
message StatusRequest {
  repeated string job_ids = 1;
}
```

**Response: `StatusResponse`**

```proto
message StatusResponse {
  repeated StatusResponseItem items = 1;
}

message StatusResponseItem {
  string job_id      = 1;
  string status      = 2;  // PENDING | PROCESSING | COMPLETED | FAILED
  string merchant_id = 3;

  bool         has_progress    = 4;
  ProgressInfo progress        = 5;  // Present when status != PENDING

  bool          has_overall_result = 6;
  OverallResult overall_result     = 7;  // Present when status == COMPLETED

  string documents_json        = 8;   // JSON-encoded document results
  string cross_validation_json = 9;   // JSON-encoded cross-validation detail

  string created_at = 10;
  string updated_at = 11;
}

message ProgressInfo {
  string stage      = 1;  // See Job Stages below
  int32  percentage = 2;  // 0–100
  string message    = 3;
}

message OverallResult {
  string status     = 1;  // APPROVED | REJECTED | REQUIRES_REVIEW
  double confidence = 2;  // 0–100 composite score
  string summary    = 3;  // Human-readable decision rationale
  repeated string error_codes = 4;
}
```

> **Note:** `documents_json` and `cross_validation_json` are serialised JSON strings. Parse them as JSON after receiving to access the full document-level results and cross-validation detail. See the HTTP response examples below for their structure.

---

#### `GetHealth`

Liveness check. Returns immediately.

```proto
// Request:  HealthRequest  {}
// Response: HealthResponse { service, status, phase }
```

---

## HTTP REST (testing / internal)

### Authentication

All protected endpoints require an API key passed as a header:

```http
X-Api-Key: <api-key>
```

> This key is stored in GCP Secret Manager (`cashea-dev-ldv-api-key`). It is intended for test scripts and CI — **not** for production integrations.

`Authorization: Bearer <token>` is also accepted for Google OIDC tokens and backward compatibility.

### Endpoints

#### `POST /v1/onboarding/validate` — Submit job

```http
POST /v1/onboarding/validate
Content-Type: application/json
X-Api-Key: <api-key>
```

**Body:**

```json
{
  "merchant_id": "98765",
  "request_id": "cashea-req-001",
  "documents": {
    "rif":                        [{ "url": "https://storage.example/rif.pdf",       "document_id": "rif-1"  }],
    "cedula":                     [{ "url": "https://storage.example/cedula.jpg",     "document_id": "ced-1"  }],
    "acta_constitutiva":          [{ "url": "https://storage.example/acta.pdf",       "document_id": "acta-1" }],
    "acta_mercantil":             [{ "url": "https://storage.example/mercantil.pdf",  "document_id": "merc-1" }],
    "certificado_emprendimiento": []
  },
  "metadata": {
    "submitted_by": "cashea-onboarding"
  }
}
```

**Response `202 Accepted`:**

```json
{
  "job_id": "val_789abc",
  "status": "PENDING",
  "merchant_id": "98765",
  "request_id": "cashea-req-001",
  "created_at": "2026-03-25T18:00:00Z"
}
```

**Request rules:**
- `merchant_id` is required.
- At least one document must be provided.
- Each document entry must include a reachable `url`.
- Empty arrays are allowed for unused document types.

---

#### `POST /v1/onboarding/status` — Poll status

```http
POST /v1/onboarding/status
Content-Type: application/json
X-Api-Key: <api-key>
```

**Body:**

```json
{ "job_ids": ["val_789abc", "val_456def"] }
```

**Response `200 OK` — job in progress:**

```json
[
  {
    "job_id": "val_789abc",
    "merchant_id": "98765",
    "status": "PROCESSING",
    "progress": {
      "stage": "cross_validation",
      "percentage": 70,
      "message": "Cross-validating extracted legal data."
    },
    "created_at": "2026-03-25T18:00:00Z",
    "updated_at": "2026-03-25T18:01:10Z"
  }
]
```

**Response `200 OK` — job completed:**

```json
[
  {
    "job_id": "val_456def",
    "merchant_id": "98766",
    "status": "COMPLETED",
    "overall_result": {
      "status": "REJECTED",
      "confidence": 92,
      "summary": "The case was rejected because the representative identity does not match the constitutive documentation.",
      "error_codes": ["NO_COINCIDE_REPRESENTANTE"],
      "confidence_breakdown": {
        "llm_assessment": 95,
        "document_quality": 97,
        "composite": 92
      }
    },
    "documents": {
      "rif": [{
        "document_id": "rif-1",
        "status": "APPROVED",
        "confidence": 96,
        "extracted_data": {
          "rif_number": "J-12345678-0",
          "company_name": "Comercial Ejemplo C.A.",
          "expiration_date": "2026-12-31"
        },
        "errors": []
      }],
      "cedula": [{
        "document_id": "ced-1",
        "status": "APPROVED",
        "confidence": 93,
        "extracted_data": {
          "id_number": "V-12345678",
          "first_name": "Ana",
          "last_name": "Perez"
        },
        "errors": []
      }],
      "acta_constitutiva": [{
        "document_id": "acta-1",
        "status": "REJECTED",
        "confidence": 88,
        "extracted_data": {
          "company_name": "Comercial Ejemplo C.A.",
          "legal_representatives": [
            { "full_name": "Carlos Perez", "id_number": "V-99887766", "role": "Presidente" }
          ],
          "signature_mode": "SEPARADA"
        },
        "errors": [
          { "error_code": "NO_COINCIDE_REPRESENTANTE", "message": "The identity document does not match a valid legal representative in the constitutive documents." }
        ]
      }],
      "acta_mercantil": [],
      "certificado_emprendimiento": []
    },
    "cross_validation": {
      "checks": [
        { "code": "MATCH_COMPANY_NAME",    "status": "PASSED", "message": "Company name is consistent across RIF and constitutive documentation." },
        { "code": "MATCH_REPRESENTATIVE_ID","status": "FAILED", "message": "Identity card does not match the legal representative declared in the constitutive documentation." },
        { "code": "RIF_VALIDITY",           "status": "PASSED", "message": "RIF is valid and not expired." }
      ]
    },
    "created_at": "2026-03-25T17:55:00Z",
    "updated_at": "2026-03-25T17:57:40Z"
  }
]
```

---

## Reference

### Job statuses

| Status | Meaning |
|---|---|
| `PENDING` | Request accepted and queued |
| `PROCESSING` | Extraction and validation in progress |
| `COMPLETED` | Processing finished — `overall_result` is populated |
| `FAILED` | Technical failure — retry or escalate |

### Job stages (`progress.stage`)

| Stage | Description |
|---|---|
| `document_intake` | Validating document URLs and downloading files |
| `document_extraction` | Extracting structured fields via Gemini |
| `document_normalization` | Building canonical merchant snapshot |
| `cross_validation` | Rule-based + LLM cross-validation |
| `completed` | All stages done |

### Decision statuses

| Status | Meaning |
|---|---|
| `APPROVED` | All checks passed |
| `REJECTED` | One or more critical checks failed |
| `REQUIRES_REVIEW` | Ambiguous result — manual review needed |

### Confidence score

`overall_result.confidence` is a 0–100 composite score reflecting both legal certainty and document quality.

| Field | Description |
|---|---|
| `confidence_breakdown.llm_assessment` | Legal assessment model confidence (0–100) |
| `confidence_breakdown.document_quality` | Average legibility of submitted documents (0–100) |
| `confidence_breakdown.composite` | `llm_assessment × (document_quality / 100)` — final score |

A high `llm_assessment` with low `document_quality` means the model is uncertain due to poor document scans, not legal issues.

### Error / finding codes

| Code | Meaning |
|---|---|
| `NO_COINCIDE_RIF` | RIF number mismatch across documents |
| `NO_COINCIDE_REPRESENTANTE` | Legal representative identity mismatch |
| `NO_COINCIDE_RAZON_SOCIAL` | Company name mismatch |
| `JUNTA_DIRECTIVA_VENCIDA` | Board of directors term expired |
| `FIRMA_CONJUNTA_INCOMPLETA` | Joint signature requirement not met |
| `DOCUMENTO_VENCIDO` | Document is expired |
| `DOCUMENTO_ILEGIBLE` | Document could not be read |
| `DOCUMENTO_INCOMPLETO` | Document is missing required sections |
| `CALIDAD_INSUFICIENTE` | Document quality too low for reliable extraction |
| `BAJA_CONFIANZA` | Confidence below acceptable threshold |

### Request-level errors (HTTP only)

| Code | HTTP status |
|---|---|
| `INVALID_REQUEST` | 400 |
| `DOCUMENT_URL_UNREACHABLE` | 400 |
| `DOCUMENT_TOO_LARGE` | 400 |
| `DOCUMENT_CONTENT_TYPE_INVALID` | 400 |

### Canonical validation checks

The service validates:
- Required document presence for the merchant's legal mode
- Document readability and extractability
- Expiration dates (RIF, cédula, acta constitutiva board term)
- RIF-to-company name consistency
- Representative identity consistency across cédula and acta constitutiva
- Signature rule compliance (individual vs. joint)

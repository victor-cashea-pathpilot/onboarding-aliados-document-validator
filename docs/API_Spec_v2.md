# Cashea Onboarding Validation API Spec v2

## Purpose

This document defines the customer-facing API contract for Cashea's onboarding document validation service.

The service is asynchronous. Cashea submits a validation job with typed document URLs, receives a `job_id`, and later retrieves the result by polling a status endpoint.

## Design Decisions

- The request already provides the type of each document.
- The API does not classify document types.
- The service validates files, extracts structured fields, cross-validates them, and returns a final verdict.
- The contract is independent from internal implementation details such as workflow engines or prompt structure.

## Authentication

MVP recommendation:

- `X-API-Key` header

Future options:

- service-to-service auth through Google-native identity or API gateway controls

## Async Model

### Job Status Values

- `PENDING`: request accepted and queued
- `PROCESSING`: extraction and validation in progress
- `COMPLETED`: processing finished successfully
- `FAILED`: technical failure prevented completion

### Document Result Values

- `APPROVED`
- `REJECTED`
- `REQUIRES_REVIEW`

## Endpoint 1: Submit Validation Job

### Request

`POST /v1/onboarding/validate`

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
      {
        "url": "https://storage.example/rif.pdf",
        "document_id": "rif-1"
      }
    ],
    "cedula": [
      {
        "url": "https://storage.example/cedula-frente.jpg",
        "document_id": "cedula-1"
      }
    ],
    "certificado_emprendimiento": [],
    "acta_constitutiva": [
      {
        "url": "https://storage.example/acta-constitutiva.pdf",
        "document_id": "acta-1"
      }
    ],
    "acta_mercantil": [
      {
        "url": "https://storage.example/acta-mercantil.pdf",
        "document_id": "acta-2"
      }
    ]
  },
  "metadata": {
    "submitted_by": "cashea-onboarding",
    "source_system": "cashea-backoffice"
  }
}
```

### Request Rules

- `merchant_id` is required.
- At least one document must be provided.
- Each document entry must include a reachable `url`.
- Document routing is based on the key under `documents`.
- Empty arrays are allowed for non-submitted document types.

### Success Response

`202 Accepted`

```json
{
  "job_id": "val_789abc",
  "status": "PENDING",
  "merchant_id": "98765",
  "request_id": "cashea-req-001",
  "created_at": "2026-03-25T18:00:00Z"
}
```

### Error Response

`400 Bad Request`

```json
{
  "error_code": "INVALID_REQUEST",
  "message": "The request body is malformed or missing required fields.",
  "details": [
    {
      "field": "documents.rif[0].url",
      "message": "URL is required."
    }
  ]
}
```

## Endpoint 2: Get Validation Status

### Recommended MVP Shape

`POST /v1/onboarding/status`

Body:

```json
{
  "job_ids": ["val_789abc", "val_456def"]
}
```

This keeps parity with Cashea's expected bulk polling model.

### Optional Convenience Endpoint

Internal or future external use:

`GET /v1/onboarding/jobs/{job_id}`

## Status Response

`200 OK`

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
  },
  {
    "job_id": "val_456def",
    "merchant_id": "98766",
    "status": "COMPLETED",
    "overall_result": {
      "status": "REJECTED",
      "confidence": 92,
      "summary": "The case was rejected because the representative identity does not match the constitutive documentation.",
      "error_codes": ["NO_COINCIDE_REPRESENTANTE"]
    },
    "documents": {
      "rif": [
        {
          "document_id": "rif-1",
          "status": "APPROVED",
          "confidence": 96,
          "extracted_data": {
            "rif_number": "J-12345678-0",
            "company_name": "Comercial Ejemplo C.A.",
            "expiration_date": "2026-12-31"
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
            "id_number": "V-12345678",
            "first_name": "Ana",
            "last_name": "Perez"
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
            "company_name": "Comercial Ejemplo C.A.",
            "legal_representatives": [
              {
                "full_name": "Carlos Perez",
                "id_number": "V-99887766",
                "role": "Presidente"
              }
            ],
            "signature_mode": "SEPARADA"
          },
          "errors": [
            {
              "error_code": "NO_COINCIDE_REPRESENTANTE",
              "message": "The identity document does not match a valid legal representative in the constitutive documents."
            }
          ]
        }
      ],
      "acta_mercantil": [],
      "certificado_emprendimiento": []
    },
    "cross_validation": {
      "checks": [
        {
          "code": "MATCH_COMPANY_NAME",
          "status": "PASSED",
          "message": "Company name is consistent across RIF and constitutive documentation."
        },
        {
          "code": "MATCH_REPRESENTATIVE_ID",
          "status": "FAILED",
          "message": "Identity card does not match the legal representative declared in the constitutive documentation."
        },
        {
          "code": "RIF_VALIDITY",
          "status": "PASSED",
          "message": "RIF is valid and not expired."
        }
      ]
    },
    "created_at": "2026-03-25T17:55:00Z",
    "updated_at": "2026-03-25T17:57:40Z"
  }
]
```

## Error Taxonomy

### Request-Level Errors

- `INVALID_REQUEST`
- `UNSUPPORTED_DOCUMENT_TYPE`
- `DOCUMENT_URL_UNREACHABLE`
- `DOCUMENT_DOWNLOAD_FAILED`
- `DOCUMENT_TOO_LARGE`
- `DOCUMENT_CONTENT_TYPE_INVALID`

### Processing-Level Errors

- `EXTRACTION_FAILED`
- `NORMALIZATION_FAILED`
- `CROSS_VALIDATION_FAILED`
- `MODEL_TIMEOUT`
- `INTERNAL_PROCESSING_ERROR`

### Document-Level Rejection or Alert Codes

- `CALIDAD_INSUFICIENTE`
- `DOCUMENTO_ILEGIBLE`
- `DOCUMENTO_INCORRECTO`
- `DOCUMENTO_INCOMPLETO`
- `DOCUMENTO_VENCIDO`
- `NO_COINCIDE_RIF`
- `NO_COINCIDE_REPRESENTANTE`
- `NO_COINCIDE_RAZON_SOCIAL`
- `JUNTA_DIRECTIVA_VENCIDA`
- `FIRMA_CONJUNTA_INCOMPLETA`
- `BAJA_CONFIANZA`

## Canonical Validation Expectations

The service should validate at least the following:

- required document presence
- document readability and extractability
- expiration dates where applicable
- RIF-to-company consistency
- representative identity consistency
- legal authority consistency
- board validity where applicable
- signature-rule consistency

## Notes for Implementation

- Internal processing may use multiple Gemini prompts, but the API must return a stable schema.
- The final result should preserve both document-level results and cross-validation evidence.
- `REQUIRES_REVIEW` should be used for ambiguity, low confidence, or incomplete legal certainty.

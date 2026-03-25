# Onboarding Agent Execution Plan v2

## Objective

Build a Google-native asynchronous document validation service for Cashea onboarding that:

- receives typed document URLs from Cashea
- downloads and validates each file
- extracts structured legal data using Gemini
- normalizes extracted fields into a canonical internal model
- cross-validates data across documents
- returns a case-level decision with detailed evidence

This version removes prototype-only concerns such as HubSpot ingestion, spreadsheet output shaping, and document classification.

## Scope Decisions

### In Scope

- Async API for case submission and job status retrieval
- Direct routing by `document_type` provided in the request
- Document extraction by type
- Cross-document consistency validation
- Google Cloud deployment
- Gemini-based extraction and legal reasoning
- Explicit status and error taxonomy for Cashea integration

### Out of Scope for MVP

- HubSpot integrations
- Automatic document classification
- Contract generation outputs
- Advanced analytics pipelines unless operationally required
- Manual-review tooling UI

## Guiding Principles

1. The external API contract is driven by Cashea's needs.
2. The payload-provided document type is the source of truth for routing.
3. Extraction and validation must be separate layers.
4. Business rules should operate on normalized structured data, not raw model output.
5. Ambiguous cases should return `REQUIRES_REVIEW` instead of forcing false rejects.

## Staged Execution Plan

### Stage 0: Contract and Decision Model Freeze

Define the contract before implementation details spread.

Deliverables:

- customer-facing request and response JSON contract
- async job lifecycle definition
- error/status dictionary
- canonical internal schema for extracted and normalized data
- cross-validation decision table

Exit criteria:

- Cashea confirms payload fields and expected result shape
- internal team agrees on verdict semantics and rejection codes

### Stage 1: Google Cloud MVP Foundation

Set up the minimum production path on Google Cloud.

Core components:

- `Cloud Run` API service
- `Cloud Tasks` or `Pub/Sub` for asynchronous processing
- `Cloud Run` worker service
- `Firestore` for job state and results
- `Cloud Storage` for optional temporary file staging
- `Vertex AI Gemini` for extraction and validation
- `Secret Manager` for credentials and config
- `Cloud Logging` for observability

Deliverables:

- deployable API service
- deployable worker service
- background job execution path
- secrets and environment configuration

Exit criteria:

- request submission creates a job and persists initial state
- background worker can consume a queued job and update status

### Stage 2: Intake and File Handling

Implement trusted typed intake.

Responsibilities:

- validate payload structure
- validate supported document types
- fetch files from provided URLs
- validate content type, size, and basic integrity
- optionally persist files temporarily for retry/debug flows

Deliverables:

- file downloader
- file integrity checks
- structured technical error handling

Exit criteria:

- invalid URLs and unreadable files fail with deterministic error codes
- valid files are available to downstream extraction without manual intervention

### Stage 3: Type-Specific Extraction

Implement one extractor flow per document type.

Supported document types:

- `rif`
- `cedula`
- `acta_constitutiva`
- `acta_mercantil`
- `certificado_emprendimiento`

Responsibilities:

- send document content to the correct Gemini extraction prompt
- return strict structured JSON per document type
- capture extraction confidence and missing-field conditions

Deliverables:

- extractor modules and prompt definitions
- typed extraction response schemas
- initial fixture dataset for each document type

Exit criteria:

- each extractor produces stable structured output on representative samples
- extraction failures are explicit and typed

### Stage 4: Canonical Normalization Layer

Map extractor outputs into one internal model to decouple business rules from prompt shape.

Normalize:

- company name
- legal representative identity
- RIF format
- document expiration dates
- registry metadata
- entity type
- board validity
- signature authority

Deliverables:

- canonical normalization module
- field-level normalization rules
- canonical internal JSON schema

Exit criteria:

- all document types map cleanly into the same internal case model
- business rules no longer depend on extractor-specific field names

### Stage 5: Cross-Validation and Decision Engine

Implement the rules that decide whether the case can proceed.

Initial validation categories:

- required document presence
- RIF validity and expiration
- identity match between cédula and legal representative
- company-name consistency across documents
- entity-type consistency
- board/director validity
- signature authority validity
- joint-signature vs single-signer mismatch
- constitutive/mercantile updates affecting legal authority

Decision outputs:

- `APPROVED`
- `REJECTED`
- `REQUIRES_REVIEW`

Deliverables:

- deterministic rules engine
- evidence payload for each failed or ambiguous check
- case-level verdict composer

Exit criteria:

- every final verdict can be explained from structured data and rule outcomes
- ambiguous cases are routed to review instead of being silently rejected

### Stage 6: Async Result API

Expose the processing lifecycle to Cashea.

Responsibilities:

- create job records
- expose current status and progress
- return final structured results
- preserve error transparency

Deliverables:

- `POST /v1/onboarding/validate`
- status retrieval endpoint
- final result schema with per-document and case-level sections

Exit criteria:

- Cashea can submit, poll, and consume final structured results reliably

### Stage 7: Evaluation, Hardening, and Pilot

Measure the system before broad rollout.

Track:

- extraction accuracy by field and document type
- verdict accuracy
- false reject rate
- `REQUIRES_REVIEW` rate
- latency by case type
- cost per processed case

Deliverables:

- labeled evaluation set
- regression test set
- prompt and rule tuning cycle
- pilot rollout checklist

Exit criteria:

- stable accuracy on representative cases
- acceptable latency and review rate for MVP launch

## Recommended Workstreams

These can run in parallel after Stage 0:

### Workstream A: API and Infrastructure

- API service
- auth
- job persistence
- queueing
- status retrieval
- deployment pipeline

### Workstream B: Extraction

- prompts
- schemas
- fixtures
- normalization contracts
- confidence handling

### Workstream C: Validation and Evals

- rule definitions
- mismatch logic
- verdict composer
- benchmark set
- regression cases

## MVP Risks

### Model Variability

Gemini outputs may vary by document quality and legal format.

Mitigation:

- strict JSON outputs
- schema validation
- normalization layer
- regression fixtures

### Legal Ambiguity

Some cases will not be safely auto-decidable.

Mitigation:

- preserve `REQUIRES_REVIEW`
- record evidence for each rule outcome

### Document Quality

Scans may be blurry, incomplete, or inconsistent.

Mitigation:

- technical integrity checks
- document-level rejection reasons
- confidence thresholds

## Recommended Immediate Next Steps

1. Freeze the request payload and result schema with Cashea.
2. Define the canonical internal model for extraction and validation.
3. Build the Google Cloud async skeleton.
4. Implement extraction for the five supported document types.
5. Implement the cross-validation rules on top of normalized data.

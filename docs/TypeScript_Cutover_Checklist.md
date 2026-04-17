# TypeScript Cutover Checklist

## Objective

Define the minimum validation gates before switching the current Python stack to the TypeScript stack in GCP.

This checklist assumes:

- Python remains the current source of truth
- TypeScript runs in parallel
- real cases are compared against the current stack before cutover

## Current cutover approach

The cutover must be evidence-driven.

We should not switch based on:

- successful deploys only
- health checks only
- partial happy-path smoke tests only

We should switch only after:

- the same real cases run through both stacks
- outputs are compared
- material differences are understood
- unresolved differences are either fixed or explicitly accepted

## Required validation gates

### 1. Deployment readiness

- TS API deploys successfully to Cloud Run
- TS Worker deploys successfully to Cloud Run
- TS Case Explorer deploys successfully to Cloud Run
- IAP/browser access works for the TS Case Explorer
- service accounts and IAM bindings are in place

### 2. API compatibility

- `POST /v1/onboarding/validate` works in the TS stack
- `POST /v1/onboarding/status` works in the TS stack
- internal case endpoints return case payloads consumable by the TS Case Explorer

### 3. Worker processing compatibility

- TS worker can process real jobs end-to-end
- extraction works with `MOCK_MODE=false`
- normalization persists expected canonical fields
- cross-validation and legal assessment complete
- final jobs end in `COMPLETED` or `FAILED` with expected structure

### 4. Real-case parity

For each canonical real case:

- `sociedad_mercantil`
- `emprendimiento`
- `firma_personal`

compare Python vs TS for:

- overall result status
- legal mode
- important deterministic checks
- critical findings
- normalized snapshot fields that drive the verdict

### 5. Explorer readiness

- jobs list works
- row navigation works
- detail page works
- workflow monitor is usable
- prompts / inputs / outputs are inspectable where available

## Comparison workflow

Use:

- `scripts/compare_python_ts_stacks.py`

This script:

- creates fresh signed URLs for the shared real cases
- submits the same payload to:
  - current Python API
  - current TS API
- waits for both jobs to complete
- fetches internal case payloads
- writes a comparison report to `/tmp`

## Minimum sign-off criteria before cutover

- no blocker differences in legal mode
- no blocker differences in overall verdict for the agreed canonical cases
- no blocker differences in critical policy checks
- TS Case Explorer is usable for operational review
- deploy / rollback steps are documented

## Current focus

At this stage, the most important work is:

- reducing Python vs TS parity gaps in extraction for corporate documents
- validating the 3 canonical real cases repeatedly after each stage
- keeping the comparison report current

# TypeScript Parity Report

## Objective

Track the current parity status between the Python stack and the TypeScript stack while both run in parallel in GCP.

This report is a working snapshot used for cutover readiness, not a final sign-off.

## Cases compared

Current comparison batch:

- `sociedad_mercantil`
- `emprendimiento`
- `firma_personal`

Method:

- generate fresh signed URLs
- submit the same payload to:
  - current Python API
  - current TypeScript API
- poll both jobs until completion
- compare:
  - overall result
  - legal mode
  - key deterministic checks

## Results

### Latest validated comparison batch

Latest completed comparable batch:

- `sociedad_mercantil`
  - Python: `REJECTED`
  - TypeScript: `REJECTED`
- `emprendimiento`
  - Python: `REQUIRES_REVIEW`
  - TypeScript: `REQUIRES_REVIEW`
- `firma_personal`
  - Python: `REQUIRES_REVIEW`
  - TypeScript: `REQUIRES_REVIEW`

### sociedad_mercantil

- Python: `REJECTED`
- TypeScript: `REJECTED`
- Status: acceptable high-level parity

Observed behavior:

- both stacks reject because the board of directors is expired
- both stacks preserve the same legal interpretation:
  - valid company identity
  - invalid current representation
  - no operative board renewal for the case

### emprendimiento

- Python: `REQUIRES_REVIEW`
- TypeScript: `REQUIRES_REVIEW`
- Status: acceptable high-level parity

Observed behavior:

- both stacks keep the fiscal address discrepancy as a review case
- both stacks preserve the main non-blocking legal interpretation:
  - identity consistent
  - principal documents still usable
  - address discrepancy requires clarification

### firma_personal

- Python: `REQUIRES_REVIEW`
- TypeScript: `REQUIRES_REVIEW`
- Status: acceptable high-level parity

Observed behavior:

- both stacks preserve the same main pattern:
  - identity and authority generally supported
  - cédula expiration date still missing
  - minor inconsistencies remain review-level, not reject-level

## Current conclusion

The TypeScript stack is now ready for:

- deployment validation
- real technical end-to-end tests
- explorer validation
- cutover preparation

The latest validated comparison batch shows acceptable high-level parity on the three canonical real cases.

## Remaining work before final cutover

1. keep rerunning the canonical parity batch after any logic change
2. continue refining field-level parity where useful for the explorer
3. complete cleanup so TS becomes the primary documented deploy path

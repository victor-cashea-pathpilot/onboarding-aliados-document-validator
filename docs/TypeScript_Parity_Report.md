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

### sociedad_mercantil

- Python: `REJECTED`
- TypeScript: `REJECTED`
- Status: acceptable high-level parity

### emprendimiento

- Python: `REQUIRES_REVIEW`
- TypeScript: `REJECTED`
- Status: parity gap

Observed behavior:

- deterministic checks passed in both stacks
- Python treated the fiscal address discrepancy as a review case
- TypeScript escalated the same pattern to rejection

### firma_personal

- Python: `APPROVED`
- TypeScript: `REQUIRES_REVIEW`
- Status: parity gap

Observed behavior:

- deterministic checks passed in both stacks
- TypeScript still required review because of:
  - missing cédula expiration metadata
  - minor fiscal address discrepancy
- Python treated these as non-blocking and approved the case

## Current conclusion

The TypeScript stack is already ready for:

- deployment validation
- real technical end-to-end tests
- explorer validation

It is not yet ready for cutover because some non-blocking LLM findings still produce stricter outcomes than the current Python stack.

## Current remediation focus

1. downgrade address-only LLM rejections to `REQUIRES_REVIEW` when deterministic checks pass
2. avoid `REQUIRES_REVIEW` in `firma_personal` when the remaining gaps are limited to:
   - missing cédula expiration metadata
   - minor address mismatch
3. rerun the same comparison batch after each fix

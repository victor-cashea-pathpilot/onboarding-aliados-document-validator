# Backend Validation Plan — GCP Dev

## Status: Completed — 2026-05-08

This plan covers the end-to-end validation of the LDV backend stack in `core-allies-dev` before the Explorer webapp was opened to internal users. All 5 stages completed successfully.

---

## Context

At the time this plan was executed:

- API, Worker, and CI/CD were already deployed in `core-allies-dev`
- Worker had processed a real test path when triggered directly through Cloud Tasks
- Documents had been uploaded to GCS and tested with signed URLs
- Firestore was storing job progress and results
- gRPC service existed in the repo and was deployed but unvalidated
- Explorer webapp existed in the repo and was partially wired but not yet deployed via CI/CD

## Goal

Close backend validation before opening the Explorer to internal users.

---

## Stage 1 — Confirm Climatec run

**Goal:** Verify that the first real production-like run completed fully.

**Checks:**
- Final Firestore record for the job
- `status`, `documents`, `normalized_snapshot`, `cross_validation`, `overall_result`
- Structural correctness of the output

**Result:** ✅ PASSED

- `status: COMPLETED`
- `overall_result: REQUIRES_REVIEW`, confidence 78%
- LLM cross-validation and legal assessment both fired and returned findings
- All fields structurally correct

---

## Stage 2 — REST API end-to-end

**Goal:** Validate one real run through the deployed REST API without triggering the Worker directly.

**Flow verified:**
1. `POST /v1/onboarding/validate` accepted request
2. API created Cloud Task with OIDC delivery
3. Cloud Task invoked Worker
4. Worker completed processing
5. Firestore reflected `COMPLETED` job with full result

**Blockers hit and resolved:**
- Cloud Tasks OIDC delivery failed — missing `roles/iam.serviceAccountTokenCreator` on Cloud Tasks service agent and `roles/iam.serviceAccountUser` on API SA. Both granted by DevOps (Luis).
- API service had `ingress: internal-and-cloud-load-balancing` — `gcloud run services proxy` does not work for internal services. Workaround: temporarily set `ingress: all` for test, reverted after.

**Result:** ✅ PASSED

- `COMPLETED / REQUIRES_REVIEW / confidence 78%`

---

## Stage 3 — gRPC end-to-end

**Goal:** Confirm gRPC service is deployed and reachable, submit a real case, confirm it reaches the Worker.

**Methods tested:**
- `GetHealth` → `{ service: "api-grpc", status: "ok" }`
- `SubmitValidation` → job created, `PENDING`
- `GetStatus` → `COMPLETED / REQUIRES_REVIEW / confidence 78%` — same pipeline as REST

**Tooling:** grpcurl with proto from `packages/contracts/proto/onboarding/v1/onboarding.proto`

**Temporary permissions opened for testing (all reverted after):**
- `ingress: all`
- `allUsers` `roles/run.invoker`
- `user:victorlaguna@cashea.app` `roles/run.invoker`

**Result:** ✅ PASSED

---

## Stage 4 — Config drift reconciliation

**Goal:** Compare live Cloud Run runtime config for API, Worker, and gRPC against the intended config in the repo.

**Areas checked:**
- Firestore database and collection
- Worker auth secret source (Secret Manager injection)
- Cloud Tasks queue config
- Ingress and auth settings
- All env vars per service

**Drift found:**

- `FIRESTORE_DATABASE` and `FIRESTORE_COLLECTION` were deployed with CRLF (`\r\n`) in all three services. Root cause: GitHub Actions org-level variables stored with Windows-style line endings. Bash `${}` expansion strips trailing `\n` but not `\r`, so the CR byte passed through `jq` and into Cloud Run env vars unmodified.

**Fix applied:**
- Hotfix: `gcloud run services update --update-env-vars` to strip CRLF on all three services immediately
- Root fix: Re-entered the affected GitHub Actions variables manually in the GitHub UI without trailing whitespace
- Verified via hex inspection on a fresh CI/CD-deployed revision (`00014-sbk`): clean, no `0d` bytes

**Note:** A `tr -d '\r'` sanitization patch in `render_cloud_run_env.sh` was proposed, implemented, and then reverted. Silent transformation in the render script masks bad data at the source and makes debugging impossible. The correct fix is clean source data.

**Result:** ✅ PASSED — zero drift after fix

---

## Stage 5 — Explorer rollout

**Goal:** Produce a rollout plan for the Explorer webapp and deploy it once backend validation was solid.

**Required runtime config:**
- `CASE_EXPLORER_API_URL` — URL of the API service (auto-resolved from Cloud Run if not set)
- `CASE_EXPLORER_API_AUDIENCE` — OIDC audience for API calls (defaults to URL)
- `WEBAPP_SESSION_SECRET` — injected from Secret Manager at runtime

**Auth / exposure model for dev:**
- `allow_unauthenticated: true` + `ingress: all` configured as a boolean toggle in `deploy-config.dev.yaml`
- A comment block marks the fields clearly so they can be reverted by changing two values and redeploying

**Backend dependency assumptions:**
- Explorer calls `GET /internal/jobs` on the API service
- API must be up and have `roles/run.invoker` granted to the Explorer service account

**Changes made:**
- Added `explorer` service definition to `deploy-config.dev.yaml` with debug access toggle
- Added `explorer` to `deploy-cloud-run-dev.yml` workflow options and `all` deploy set
- Added `explorer` to `validate-cicd.yml` dry-run and service key checks
- Added `CASE_EXPLORER_API_URL` auto-resolution from Cloud Run in `render_cloud_run_env.sh` (avoids needing it as a GitHub variable)

**Smoke test result:**
- HTTP 200 at root and `/health`
- Job list visible in the webapp UI

**Result:** ✅ PASSED — Explorer live at `https://backend-ms-ldv-explorer-service-vn44fcjdza-ue.a.run.app`

---

## Summary

| Stage | Result |
|-------|--------|
| 1 — Climatec run verification | ✅ |
| 2 — REST API e2e | ✅ |
| 3 — gRPC e2e | ✅ |
| 4 — Config drift | ✅ |
| 5 — Explorer rollout | ✅ |

Backend fully validated. Explorer live. No outstanding blockers.

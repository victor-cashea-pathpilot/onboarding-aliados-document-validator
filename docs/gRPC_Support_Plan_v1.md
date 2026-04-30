# gRPC Support Plan

## Objective

Add gRPC support for backend-to-backend callers in GCP without destabilizing the existing HTTP API.

## Status

- initial implementation completed
- separate `api-grpc` service added
- versioned proto contract added
- unary methods implemented for `GetHealth`, `SubmitValidation`, and `GetStatus`
- Cloud Run deploy wiring added for a dedicated gRPC service
- build and gRPC controller tests passing

## Short Answer

Yes, and the first version is now implemented.

What was added:

- `packages/contracts/proto/onboarding/v1/onboarding.proto`
- `apps/api-grpc` as a dedicated Nest gRPC app
- GCP deploy wiring for `deploy_api_grpc.sh`
- documentation updates for the auth and deployment model

Remaining gap:

- the initial gRPC contract is intentionally narrow and focuses on unary backend-to-backend use cases

## Recommended Approach

Do **not** replace the current HTTP API.

Instead:

1. keep the existing HTTP API for current consumers
2. add a dedicated gRPC surface for service-to-service callers
3. reuse the same application service layer (`ApiJobsService`) and domain/infrastructure packages underneath

This keeps the rollout lower-risk and avoids coupling gRPC transport concerns to the browser-facing HTTP API hardening that already exists.

## Why a Separate gRPC Surface

Reasons to prefer a separate gRPC service or entrypoint:

- the current HTTP API already has auth, CORS, Swagger, request size limits, and throttling behavior tuned for HTTP
- gRPC has different transport behavior and different auth/interceptor wiring
- Cloud Run gRPC works well for internal microservice communication, including unary and streaming RPCs, but the deployment and test model is different from the current REST shape citeturn0search0turn0search3
- we can roll out gRPC to one caller without risking regressions for the current HTTP consumers

## Proposed Scope

Initial scope should be **unary gRPC only**.

Recommended first methods:

- `SubmitValidation`
- `GetStatus`
- optionally `GetJob`

Do **not** start with:

- streaming RPCs
- admin/list endpoints unless the caller really needs them
- a full one-to-one mirror of every HTTP endpoint

## Transport and Deployment Decision

### Option A: Dedicated gRPC Cloud Run service

Create a separate service such as `onboarding-api-grpc`.

Pros:

- safest rollout
- separate scaling and auth policy if needed
- separate Cloud Run config for gRPC
- avoids mixing HTTP and gRPC concerns in one runtime

Cons:

- extra deployable
- extra image or entrypoint

### Option B: Hybrid service with HTTP + gRPC in one app

Run both transports from the same codebase/runtime.

Pros:

- less duplicated bootstrap logic
- shared implementation in one process

Cons:

- more operational complexity
- harder to reason about auth and observability
- riskier deploy path for the current API

### Recommendation

Start with **Option A**: a dedicated gRPC service that reuses shared application services.

This is the option that was implemented.

## Authentication Model

Keep the same identity model used for HTTP service-to-service calls:

- private Cloud Run service
- caller service account
- `roles/run.invoker`
- Google-signed ID token or equivalent service-to-service auth pattern for the gRPC client

Cloud Run supports gRPC for internal microservice communication, and Google’s service-to-service guidance for private Cloud Run services still applies: callers should use service identity and authenticated requests. citeturn0search0turn0search2turn0search3

## Proposed Stages

## Stage 0: Decide the External Contract

### Goal

Freeze the minimum gRPC API we actually need before writing transport code.

### Tasks

- confirm whether the caller needs:
  - only `submit`
  - `submit` plus `status`
  - internal case retrieval as well
- confirm whether unary RPCs are enough
- confirm whether the caller expects:
  - exact parity with HTTP payload names
  - or a cleaner proto-first contract
- confirm whether gRPC is mandatory or if HTTP with service-account auth would still be acceptable

### Deliverable

- agreed method list
- agreed message shapes
- decision that v1 is unary-only

## Stage 1: Define the Proto Contract

### Goal

Create a stable `.proto` definition that maps cleanly to the existing validation flow.

### Tasks

- add a proto folder, for example:
  - `packages/contracts/proto/onboarding/v1/onboarding.proto`
- define messages for:
  - document reference
  - documents payload
  - submit request
  - submit response
  - status request
  - status response item
- decide how to represent flexible fields such as:
  - `metadata`
  - `overall_result`
  - `documents`
  - `cross_validation`
- prefer explicit proto messages over `google.protobuf.Struct` where the schema is already known
- use versioned package naming from the start, for example:
  - `onboarding.v1`

### Files likely affected

- new `.proto` files under `packages/contracts/`
- generated type output location if codegen is adopted
- package scripts in `package.json`

### Exit Criteria

- proto contract reviewed and versioned
- method and message names are stable enough for an initial consumer

## Stage 2: Add a gRPC Service Entrypoint

### Goal

Expose the existing job submission/status flow over gRPC.

### Tasks

- add Nest gRPC transport wiring
- choose service layout:
  - new app such as `apps/api-grpc`
  - or separate bootstrap entrypoint under `apps/api`
- add gRPC controller/handler methods that delegate to `ApiJobsService`
- map DTO validation and domain validation into gRPC request handling
- map errors into appropriate gRPC status codes

### Recommended file shape

- `apps/api-grpc/src/main.ts`
- `apps/api-grpc/src/app.module.ts`
- `apps/api-grpc/src/onboarding-grpc.controller.ts`
- shared mapping utilities under `apps/api-grpc/src/mappers/`

### Exit Criteria

- local gRPC server can accept `SubmitValidation` and `GetStatus`
- business behavior matches the current HTTP flow

## Stage 3: Add Authentication and Interceptors for gRPC

### Goal

Apply the same service-to-service trust model to gRPC.

### Tasks

- add gRPC auth interceptor or middleware equivalent
- validate caller identity from incoming metadata
- document the required auth header/metadata format for gRPC clients
- make sure the caller service account is granted `run.invoker`
- define how local development will authenticate or bypass auth

### Notes

- HTTP guards do not transfer directly to gRPC
- we need transport-specific auth handling for gRPC metadata

### Exit Criteria

- private deployed gRPC service accepts authenticated service callers
- unauthorized calls fail predictably

## Stage 4: Cloud Run Deployment and Networking

### Goal

Deploy the gRPC service in a way that matches Cloud Run’s transport requirements.

### Tasks

- add deploy script for the gRPC service
- configure the service for gRPC on Cloud Run
- if we later need streaming, configure Cloud Run to use HTTP/2 as recommended by Google citeturn0search0
- add env vars for:
  - audience
  - auth mode
  - proto package/service names if needed
- document the gRPC endpoint host and port behavior for clients

### Files likely affected

- `infra/gcp/common.sh`
- new `infra/gcp/deploy_api_grpc.sh`
- env templates
- `infra/gcp/README.md`

### Exit Criteria

- gRPC service deploys independently
- an authenticated client in GCP can call it end-to-end

## Stage 5: Testing and Tooling

### Goal

Make the gRPC path safe to evolve.

### Tasks

- add unit tests for request/response mapping
- add integration tests for gRPC handlers
- add smoke test script for authenticated gRPC calls
- add local developer instructions for:
  - generating types if needed
  - running the gRPC server
  - exercising it with a sample client

### Exit Criteria

- CI covers the gRPC handler layer
- deployment smoke test exists

## Stage 6: Gradual Rollout

### Goal

Adopt gRPC with one consumer first and only then broaden support.

### Tasks

- onboard one caller service first
- compare HTTP and gRPC behavior for the same workflow
- confirm observability:
  - request IDs / correlation
  - error visibility
  - auth failures
- keep HTTP as the stable fallback during rollout

### Exit Criteria

- first production caller succeeds on gRPC
- no need to break or deprecate the HTTP API immediately

## Concrete Repo Changes Expected

At minimum, this feature will likely require:

- new proto contract files under `packages/contracts/`
- new app or entrypoint for gRPC
- new deploy script and env vars in `infra/gcp/`
- new auth/interceptor layer for gRPC metadata
- new tests and smoke scripts
- documentation updates for callers

## Main Risks

- trying to make gRPC and HTTP share too much transport code
- shipping streaming support before unary support is proven
- unclear proto schema for flexible response fields
- underestimating auth differences between HTTP headers and gRPC metadata
- trying to make the existing browser/documented HTTP API behave exactly like the internal gRPC contract

## Recommended Decision

If the requirement is “a backend microservice in GCP needs to call us,” then the best plan is:

1. keep the current HTTP API
2. add a dedicated unary gRPC service for internal callers
3. use service-account-based auth
4. onboard one caller first

That is the lowest-risk path and fits the current repo architecture best.

# Runtime Release Gate Implementation Plan

## Goal

Make the checked-in BAZA platform reproducible as a local multi-process runtime:
MongoDB replica set, Redis, MinIO, API, outbox worker, ERP web, and marketplace
web. Provide explicit health checks, environment defaults, and documented
commands so that D-07 browser E2E and the listing publication worker runtime E2E
can be run against the same topology.

## Non-Goals

- No changes to ERP or marketplace product behavior, routes, components, or API
  clients owned by the parallel UI work.
- No Admin UI or admin API work.
- No production cloud deployment, secret provisioning, domain/DNS changes, or
  GitHub push.
- No claim that browser E2E passed while Docker or the external services are
  unavailable.

## Current System Notes

- `infrastructure/compose/compose.dev.yml` currently provisions only MongoDB,
  Redis, and MinIO; its Mongo replica-set member is advertised as
  `localhost:27017`, which is suitable for host-side tests but not for
  container-to-container API connections.
- `apps/api/src/main.api.ts` listens on `API_PORT` (default `3000`) and exposes
  `/health` and `/health/ready` without the `/api/v1` prefix.
- `apps/worker/src/main.worker.ts` is a separate application-context process
  that polls the Mongo outbox.
- Both web apps are Vite builds. The marketplace app accepts
  `VITE_API_BASE_URL`; ERP's platform client accepts
  `VITE_PLATFORM_API_BASE_URL` and rejects localhost in production builds.
- The current working tree is clean on `codex/runtime-release-gate` at
  `6cfce25`; parallel agents must work in their own worktrees.

## Tasks

- [ ] Step 1: Add a runtime compose topology without changing dev defaults
  - Files: `infrastructure/compose/compose.runtime.yml`
  - Change: Define MongoDB, Redis, MinIO, a MinIO bucket-init job, API, worker,
    ERP web, and marketplace web. Use service health conditions, a replica-set
    member advertised as `mongodb:27017`, explicit internal service URLs, and
    host ports that match the browser configs (`3000`, `4173`, `4174`).
  - Tests: `docker compose -f infrastructure/compose/compose.runtime.yml config`
    when Docker CLI is available; otherwise inspect the rendered YAML and record
    the environment limitation.
  - Depends on: none.

- [ ] Step 2: Add reproducible container builds
  - Files: `infrastructure/docker/Dockerfile.api`,
    `infrastructure/docker/Dockerfile.worker`,
    `infrastructure/docker/Dockerfile.erp-web`,
    `infrastructure/docker/Dockerfile.marketplace-web`,
    `infrastructure/docker/nginx-spa.conf`.
  - Change: Use Node 20, Corepack with the repository's pnpm version, frozen
    lockfile installs, Turbo dependency builds, and a static nginx runtime for
    the two Vite apps. API and worker images must run their existing compiled
    entrypoints and receive runtime configuration only from Compose env.
  - Tests: `docker build` for each image when Docker/network access is
    authorized; otherwise run repository `pnpm build` and perform Dockerfile
    lint/static inspection.
  - Depends on: Step 1 for service names and environment contract.

- [ ] Step 3: Establish environment and health contracts
  - Files: `.env.runtime.example`, `infrastructure/compose/compose.runtime.yml`,
    existing health/config files only if a real mismatch is found.
  - Change: Document non-secret local defaults, required production overrides,
    CORS origins, Mongo URI, MinIO buckets, and Vite build-time API origins.
    Keep credentials out of tracked files beyond clearly labelled development
    defaults. API readiness must be checked at `/health/ready`; web services
    must return their SPA index for a browser route.
  - Tests: `docker compose ... config`, healthcheck curls from the host/container
    when the stack is running, and a negative check for missing required
    production variables where the existing code already enforces one.
  - Depends on: Step 1.

- [ ] Step 4: Add one-command runtime helpers and operator documentation
  - Files: root `package.json`, `scripts/runtime/` (PowerShell-compatible
    helpers only if needed), `docs/operations/runtime-release-gate.md`.
  - Change: Provide clear `runtime:config`, `runtime:up`, `runtime:down`, and
    `runtime:logs` commands. Document startup order, URLs, first-run bucket
    initialization, teardown, troubleshooting, and how to run the existing
    Playwright suite and isolated worker runtime check. Do not hide failures
    behind `|| true` or equivalent.
  - Tests: command help/config checks; with Docker available, bring the stack up,
    poll health endpoints, and verify API, worker logs, ERP, and marketplace.
  - Depends on: Steps 1–3.

- [ ] Step 5: Add runtime verification harness without touching product tests
  - Files: `scripts/runtime/` and documentation; do not modify
    `apps/erp-web/tests/e2e/**` unless a purely infrastructural baseURL/env hook
    is unavoidable and isolated.
  - Change: Make it possible to run D-07 against the compose services and to
    seed/observe a publication through the real API + worker process. Reuse
    existing tests and endpoints; do not duplicate business logic or convert
    integration tests into fake health checks.
  - Tests: with Docker available, run the exact Playwright command and a real
    outbox publication smoke path; report each result separately. With Docker
    unavailable, run all non-runtime checks and leave the runtime gate honestly
    open.
  - Depends on: Step 4.

- [ ] Step 6: Verify, review, and commit
  - Files: all files from Steps 1–5 only.
  - Change: Run `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, and
    `pnpm build`; run compose/browser checks where possible; inspect `git diff`
    and `git diff --check`; create one or more focused local commits. Never push.
  - Tests: record exact pass/fail/blocked outcomes in the final report.
  - Depends on: Steps 1–5.

## Verification

The release gate is green only when all of the following are true:

1. Compose renders successfully with no unresolved service or environment
   references.
2. API `/health` and `/health/ready` respond successfully after Mongo is ready.
3. API and worker are separate processes and worker logs show active outbox
   polling.
4. Both web apps serve their SPA entrypoint and can reach the API origin used by
   the browser.
5. Existing unit/integration/build checks pass.
6. D-07 and worker runtime E2E are either freshly green or explicitly marked
   blocked by unavailable Docker/external infrastructure.

## Risks

- Mongo replica-set host advertising is the main container networking hazard;
  verify from the API container rather than trusting the host-side URI.
- Vite API variables are build-time values, while API secrets are runtime
  values; do not put runtime secrets into web images.
- MinIO bucket initialization must be idempotent and must complete before API or
  worker health is considered usable.
- Existing dev compose must remain usable for current host-side Jest tests.
- Docker image builds require network access to pull base images and install
  packages; ask for authorization before performing that external action.

# Runtime CI gate plan

## Goal

Make the D-07 runtime acceptance gate reproducible on a clean GitHub Actions
runner: build the same Docker Compose stack, prove service readiness, run the
workspace verification suites, and execute the real Playwright browser suite
against the running HTTP services.

## Non-goals

- Do not change marketplace or admin product behavior.
- Do not bypass the runtime preflight or convert blocked infrastructure into a
  passing/skip result.
- Do not add a production bootstrap endpoint for the first `super_admin`.
- Do not enable the reveal-contact Idempotency-Key scenario on a branch that
  does not contain that API feature.
- Do not touch the shared checkout or rewrite existing agent branches.

## Implementation tasks

1. Add a GitHub Actions workflow with Node 22/pnpm 11, frozen install,
   typecheck, unit tests, integration tests, build, Compose startup, runtime
   preflight, Chromium installation, and the full D-07 Playwright run.
2. Keep the workflow fail-closed: upload Playwright artifacts on failure and
   always tear down only the CI-created Compose stack.
3. Make `host.docker.internal` resolve on Linux runners so MinIO URLs used by
   the host browser are reachable from API/worker containers.
4. Document CI variables, commands, artifact behavior, and the fact that local
   runtime volumes are preserved by the normal `runtime:down` command.

## Verification

- Validate the Compose file with `docker compose config`.
- Run `git diff --check`.
- Re-run typecheck, unit/integration tests, build, runtime preflight, and the
  Chromium Playwright suite in the currently working Docker environment.
- Confirm the workflow and documentation contain no secrets and use only
  repository-local defaults.

## Risks and mitigations

- MinIO presigned URLs must be reachable from both containers and the browser;
  CI sets the endpoint to the published host port and the compose services get
  an explicit Linux host-gateway mapping.
- The CI job may be long because it builds four images and runs a real browser;
  this is intentional for a release gate, while normal unit/integration jobs
  remain available as separate commands.
- Runtime data is isolated in the Compose project and the workflow teardown
  removes containers without deleting any unrelated Docker resources.

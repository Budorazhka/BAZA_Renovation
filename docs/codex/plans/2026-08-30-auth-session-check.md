# Read-only Auth Session Check

## Goal

Replace the marketplace publishing wizard's indirect `GET /marketplace/property-assets` session probe with an explicit, read-only `GET /auth/session` contract that resolves product audience from the request origin and never mutates data.

## Non-Goals

- No changes to cookie name, TTL, token storage, login, logout, or authorization models.
- No identity profile endpoint and no password, organization, grant, or internal session fields in the response.
- No Figma/CSS/UI redesign and no changes to Claude's branches/worktrees.

## Current System Notes

- `SessionService.getActiveSessionFromRequest(req, expectedAudience)` already performs the canonical token-hash, audience, revocation, and expiry lookup.
- `AuthController` owns the `/auth` routes and already resolves audience from `Origin` for login.
- `authApi.checkSession()` currently probes `GET /marketplace/property-assets`, coupling authentication state to a business collection and its guard.
- The OpenAPI document and generated `packages/api-client` schema currently describe login/register/logout but not a generic session check.

## Tasks

- [ ] Step 1: Add failing unit/integration tests for `GET /auth/session`.
  - Files: `apps/api/src/modules/identity/auth.controller.spec.ts` (new), `apps/api/test/integration/auth-session.integration-spec.ts` (new).
  - Behavior: valid marketplace/ERP/admin cookies return only a safe authenticated response; missing, expired, revoked, or wrong-audience cookies return the same unauthenticated response; missing/unrecognized `Origin` follows the existing audience-mismatch contract; endpoint never creates/revokes sessions.
  - Tests: focused Jest unit and HTTP integration tests against `mongodb-memory-server`.

- [ ] Step 2: Implement the endpoint and contract.
  - Files: `apps/api/src/modules/identity/auth.controller.ts`, `docs/api/v1-first-vertical-slice.yaml`, generated `packages/api-client/src/schema.ts` if regeneration is required.
  - Change: resolve audience from `Origin`, call `SessionService.getActiveSessionFromRequest`, return a minimal `{ authenticated: boolean }` response (plus no identity internals), with `security: []` and explicit 200 response in OpenAPI.
  - Depends on: Step 1.

- [ ] Step 3: Switch the publishing frontend to the new route.
  - Files: `apps/marketplace-web/src/features/publishing/api/auth-api.ts`, its existing tests.
  - Change: use the shared request helper with credentials and map `response.authenticated` to boolean; remove the direct property-assets probe.
  - Depends on: Step 2.

- [ ] Step 4: Document the resolved gap and compatibility boundary.
  - Files: `docs/operations/frontend-marketplace-vertical.md`, relevant acceptance/operations note.
  - Change: mark the session-check TODO as closed and state that invalid/no cookie is intentionally a 200 false response to avoid session enumeration.
  - Depends on: Step 2.

- [ ] Step 5: Verify and commit locally.
  - Commands: focused API tests, full API unit/integration suites, marketplace-web tests, typecheck, build, `check-stale.mjs`, `git diff --check`.
  - Commit only on the current isolated branch; do not push.
  - Depends on: Steps 1–4.

## Verification

- HTTP-level assertions cover all three product audiences, no-cookie behavior, revoked/expired sessions, wrong-audience non-disclosure, origin validation, and no side effects in the sessions collection.
- Frontend test asserts `/auth/session` is called and `/marketplace/property-assets` is never requested by `checkSession()`.
- Generated contract remains reproducible and typecheck/build stay green.

## Risks

- Existing callers may expect `checkSession()` to treat transient HTTP failures as `false`; preserve that frontend behavior while ensuring endpoint-level auth semantics are explicit.
- Origin is mandatory under ADR-004; tests and deployments must keep the marketplace origin configured.

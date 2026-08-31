# Local integration consolidation — 2026-08-31

## Scope

The local `codex/integration` branch was advanced to the locally available
`origin/codex/integration` ref (`7a8ae85`) and then consolidated with the
remaining verified workstreams.

## Merged workstreams

- `codex/crm-task-events` — CRM contacts, leads, tasks, timeline, deals and
  associated runtime hardening (`ce25d27`).
- `codex/marketplace-figma-final` — final Marketplace Figma parity
  (`4a3ca3a`).
- `codex/api-contract-reproducibility` — admin account lifecycle, grant
  revocation and audit UI/API coverage (`64285e3`).
- `codex/integration-gate-workflow` — CI integration-test gate (`aecba56`).
- `codex/integration-operational-hardening` — API client and Marketplace
  operational hardening (`21c991a`).

## Classified but not separately merged

- `codex/crm-tasks-next-action` is superseded by the later CRM hardening
  already included through `codex/crm-task-events`.
- `codex/marketplace-map-osm` and `codex/marketplace-map-gate` contain the
  same Map implementation and coverage already present on integration.
- `codex/marketplace-functional-hardening`,
  `codex/marketplace-integration-candidate`, and
  `codex/marketplace-visual-parity` are patch-equivalent to integration.
- `codex/marketplace-publishing-wizard-ui` is an older wizard line superseded
  by the later publishing workflow fixes already on integration.

The source worktrees are intentionally retained; this record only consolidates
their verified content into the local integration branch.

## Verification

On the consolidated branch:

- `pnpm typecheck` — 24 of 24 tasks passed.
- `pnpm turbo run test --force` — 23 of 23 tasks passed with no cache reuse.
- `pnpm turbo run test:integration --force` — 29 suites / 351 tests passed
  with no cache reuse.

The integration suite logs expected Redis connection failures because no local
Redis service is running; its fail-closed paths are covered and the suite
passes. Jest also reports one worker that requires forced exit after the suite;
this is a teardown warning, not a failing test.

## Remaining environment check

Docker is unavailable on this machine, so the Docker-backed runtime E2E flow
was not executed as part of this local consolidation.

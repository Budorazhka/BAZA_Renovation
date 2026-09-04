# Consolidate Local Worktrees Plan

## Goal

Bring every completed, non-duplicative local feature stream into one verified
`codex/integration` history, without overwriting the active uncommitted Admin
lifecycle work or relying on a network fetch.

## Non-Goals

- Do not push, open a pull request, or change remote branches.
- Do not delete worktrees or feature branches after integration.
- Do not claim runtime E2E success while the local Docker daemon is unavailable.

## Current System Notes

- `origin/codex/integration` is locally available at `7a8ae85`; the checked-out
  local `codex/integration` branch is 22 commits behind that ref.
- `codex/crm-task-events` contains the later CRM chain, first-super-admin,
  runtime gate, and operational-hardening history. It supersedes the earlier
  CRM leaf branches for consolidation.
- `codex/marketplace-figma-final` has one unique parity commit relative to the
  local `origin/codex/integration` ref. Its base intentionally lacks four later
  integration commits, so it must be merged, not fast-forwarded.
- `baza-platform` on `codex/api-contract-reproducibility` contains 24 modified
  and 8 new source/test files for Admin lifecycle and grant revocation. Those
  changes have no commit yet and must be tested and committed before merging.

## Tasks

- [ ] Step 1: Preserve and validate the uncommitted Admin lifecycle patch.
  - Files: `apps/admin-web/**`, `apps/api/src/modules/admin/**`,
    `apps/api/src/modules/authorization/**`, `apps/api/src/modules/identity/**`,
    `apps/api/test/integration/admin-*.ts`, `docs/operations/admin-control-plane.md`.
  - Change: Run focused tests and static checks; commit only the present Admin
    lifecycle/reason/revocation patch on `codex/api-contract-reproducibility`.
  - Tests: `pnpm --filter admin-web test`, focused API service/integration tests,
    `pnpm typecheck`, and `git diff --check`.
  - Depends on: none.

- [ ] Step 2: Advance the local integration worktree to its existing remote-tracking ref.
  - Files: Git history only in `baza-platform-integration-final`.
  - Change: fast-forward `codex/integration` to local `origin/codex/integration`
    (`7a8ae85`) without contacting the network.
  - Tests: `git status --short --branch`, `git log -1`, and merge-base check.
  - Depends on: none.

- [ ] Step 3: Merge the superseding CRM/operations feature chain.
  - Files: CRM modules, runtime gate, CI gate and operations documents supplied
    by `codex/crm-task-events`.
  - Change: merge `codex/crm-task-events` into `codex/integration`, resolving
    conflicts from actual source semantics and retaining its later CRM-003/004
    fixes rather than merging earlier duplicate CRM branches.
  - Tests: relevant API integration suites, workspace typecheck/build, and
    `git diff --check`.
  - Depends on: Step 2.

- [ ] Step 4: Merge the final Marketplace Figma parity delta.
  - Files: `apps/marketplace-web/**`, Figma handoff and marketplace operation docs.
  - Change: merge `codex/marketplace-figma-final` after the CRM chain, preserving
    the existing public catalogue/API behaviour and resolving any overlap with
    the integration's later marketplace changes.
  - Tests: marketplace unit/typecheck/build checks and `git diff --check`.
  - Depends on: Step 3.

- [ ] Step 5: Merge the committed Admin lifecycle patch.
  - Files: the commit created in Step 1.
  - Change: merge its single Admin lifecycle/revocation commit into the same
    `codex/integration` history, resolving conflicts against the already
    integrated Admin control plane.
  - Tests: Admin API/client tests, API integration suites, workspace typecheck,
    build, and `git diff --check`.
  - Depends on: Steps 1-4.

- [ ] Step 6: Reconcile residual worktrees and verify the assembled branch.
  - Files: Git refs and `docs/operations/*` only if a factual status correction
    is needed.
  - Change: prove that each remaining feature branch is either an ancestor,
    duplicate/superseded history, or has been separately merged; do not silently
    discard unique work.
  - Tests: ancestry checks for all local `codex/*` branches; full unit,
    integration, typecheck and build gates. Record runtime E2E as blocked if
    Docker remains unavailable.
  - Depends on: Steps 2-5.

## Verification

The consolidated local `codex/integration` branch must be clean, contain the
three chosen consolidation merges plus the Admin lifecycle commit, and pass the
available workspace checks. Runtime Playwright E2E requires a usable Docker
daemon and is outside the claim if the environment remains blocked.

## Risks

- Several Marketplace map/hardening worktrees are alternate or partial paths,
  not automatically additive. Their ancestry and diffs must be reviewed before
  deciding whether they add unique behaviour beyond the selected final branch.
- The Admin patch is uncommitted, so testing must precede any history rewrite or
  merge attempt.
- Some tests may require local Mongo/Redis; failures caused by missing runtime
  services must be separated from code regressions.

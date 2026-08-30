# Current State Reconciliation — 31.08.2026

## Scope boundary

This is a reconciliation of the verified local CRM feature chain ending at
`codex/deal-core` (CRM-003 Task hardening, DEAL-001 and their CAS follow-ups). It must not be read as evidence that the same work
has already been merged into `codex/integration`; integration status is only
updated by an actual merge.

## What is now implemented

| Area | Status | Verified capability |
| --- | --- | --- |
| Contacts | partial | Tenant-scoped list/detail read API, cursor pagination, safe search and own-scope resolution through Leads. |
| Leads | partial | Intake, assign, stage transitions, read path, immutable events, timeline and `stalled` projection/filter. |
| Tasks / next action | partial | List/detail/create/update/complete and dedicated reassign path; tenant/own-scope enforcement, transactional audit, optimistic concurrency and a batched next-action indicator on Lead reads. |
| Deals | partial | Create/read/update, fixed stage lifecycle, participants, checklist, expected commission in minor units, DealEvent and optimistic concurrency for every mutation. |
| CRM UI | not started | No real kanban, timeline, task calendar or deal workspace is connected to these APIs. |

## Security and data guarantees

- Tenant and `own` scopes are applied before read/mutation; foreign or
  out-of-scope CRM objects use a uniform 404 response.
- Responses use explicit read models rather than raw Mongo documents.
- Lead, task and deal mutations write transactional audit records; timeline
  exposes only whitelisted event metadata.
- All mutations of an existing Deal require `expectedVersion` and return 409 on a version race; this covers metadata, stage, participants and checklist as well as the conditional Mongo write.
- Deal create and owner reassignment resolve `ownerPositionId` in the same transaction, so a closed, foreign or nonexistent position cannot become an owner.
- Task updates, reassignment and first completion use the same `expectedVersion` CAS rule. `task.edit` cannot change the assignee; it is a separate `task.reassign` permission and endpoint. A repeated completion is intentionally idempotent.
- `hasOpenNextAction` is a read-only, batched signal for active Leads; it is not a hidden write-time block. An out-of-scope Task or Lead is still non-disclosed as 404.

## Fresh verification — 31.08.2026

Run from the checked-out `codex/deal-core` worktree after the CRM-003 hardening follow-up:

- `pnpm typecheck` — 24/24 tasks passed.
- `pnpm test` — 66 API suites / 619 API tests passed; workspace gate passed.
- `pnpm test:integration` — full workspace gate passed; the CRM Tasks HTTP suite is 22/22, covering CAS, role grants, reassignment isolation and the batched `hasOpenNextAction` read model.
- `pnpm build` — 14/14 packages passed.
- `verify-contract-layout.mjs`, `check-stale.mjs`, `git diff --check` — passed.

The integration run emitted `Redis NOAUTH` log noise because a locally running
Redis instance requires credentials, and Jest warned about a forced worker
teardown. The command nevertheless finished with exit code 0. This does not
replace a live Docker/browser runtime verification.

## Still open

- BOOK-001: atomic Unit booking with BookingLock, transaction, outbox and
  Idempotency-Key.
- CRM web workspace: kanban, task calendar, timeline and deal views.
- CRM-004: transactional Task lifecycle outbox events for a future digest or notification consumer; calls, free-form notes, reports and analytics.
- Team-scope lead reassignment.
- Figma-accurate marketplace UI, Admin UI, and production/runtime E2E.

## Honest coverage estimate

For the intended integrated codebase after merging this CRM chain, overall
platform coverage is estimated at **35–40%**. The estimate remains approximate:
it measures implemented vertical slices against the whole platform backlog, not
lines of code or a production-readiness score. The remote integration branch may
be lower until this branch is merged.

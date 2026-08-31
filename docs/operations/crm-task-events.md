# CRM-004: Transactional Task Lifecycle Outbox

**Document Type**: Operational Runbook
**Component**: `@baza/api` (CRM module) + `@baza/domain-events` (shared outbox schema)
**Дата**: 31.08.2026 (worktree `codex/crm-task-events`, база — `origin/codex/deal-core`)
**Status**: Producer only. No consumer, no cron, no email/push/Telegram delivery, no new public API, no OpenAPI change — this document describes what writes to `outbox_events`, not what reads from it.

---

## 1. What this is

CRM Tasks (`docs/operations/crm-tasks-next-action.md`) already had audit logging (`audit_events`), but nothing a future digest/notification service could subscribe to without polling `audit_events` (which is an append-only compliance log, not a domain-event stream — different consumers, different guarantees). This proof adds three domain events to the existing `@baza/domain-events` transactional outbox (`outbox_events` collection), written in the **same MongoDB transaction** as the Task document write and the `audit_events` row, using the exact pattern already established by `DevelopmentsService.updateUnitPrice`/`updateUnitStatus` (`UnitPriceChanged`/`UnitStatusChanged`).

No consumer exists yet. `apps/worker` already polls `outbox_events` generically (`OutboxEventRepository.findPendingBatch`) for other event types, but nothing today maps `TaskCreated`/`TaskCompleted`/`TaskReassigned` to a side effect. That is intentionally out of scope here — see §5.

## 2. Event → trigger → payload → consumer-ready guarantee

| Event | Trigger (exact condition) | Payload | Consumer-ready guarantee |
|---|---|---|---|
| `TaskCreated` | `POST /tasks` succeeds — task document actually inserted, `task.create` audit row written, transaction commits. | `{taskId, organizationId, leadId, contactId, assignedPositionId, actorPositionId, occurredAt, correlationId}` (all `*Id` fields `null` if absent) | Exactly one row per successful create. No row on `404` (foreign/missing `leadId`/`contactId`) or any thrown exception — `runInTransaction` rolls back the whole write set, `outboxService.publish` is inside that same transaction, so a row can only exist if the task itself exists. |
| `TaskCompleted` | `POST /tasks/:taskId/complete` performs the **first** actual `open→completed` transition (`TaskRepository.completeTask` returns `modifiedCount:1`). | Same base shape as `TaskCreated`, taken from the post-completion document (so `assignedPositionId` reflects whoever the task was assigned to at completion time). | Exactly one row per task, ever — a task can only leave `open` once (no reopen path writes a second `completedAt`). Idempotent repeat calls after completion (`existingTask.status === 'completed'` short-circuit, returns before `runInTransaction` even starts) never call `publish`. A `409` CAS conflict on an open task (`modifiedCount:0`) throws before `publish` is reached and the transaction is discarded — no row. `deduplicationKey`: `task:{taskId}:TaskCompleted:v{expectedVersion+1}` (same versioned-key convention as `UnitPriceChanged`), so even a hypothetical duplicate call with the same version cannot produce two distinct outbox rows without also being blocked by the CAS filter itself. |
| `TaskReassigned` | `PATCH /tasks/:taskId/reassign` performs a CAS-versioned write **and** the resulting `assignedPositionId` actually differs from what it was before the call. | Base shape (`assignedPositionId` = the *new* value) **plus** `previousAssignedPositionId`, `newAssignedPositionId` (both `null` when the corresponding slot is unassigned). | A same-value reassign (`newAssignedPositionId equals oldAssignedPositionId`, including `null→null`) is detected **before** any write — `TaskRepository.reassignTask` is never called, `version` is not incremented, no audit row, no outbox row. A `409` CAS conflict (`modifiedCount:0`) throws before `publish`, transaction discarded. `deduplicationKey`: `task:{taskId}:TaskReassigned:v{expectedVersion+1}`. |

Shared payload builder: `taskEventPayload()` in `crm.service.ts` — the single place that decides what leaves the process for all three events; `TaskReassigned` layers its two extra fields on top of that same base.

## 3. What the payload deliberately excludes

Per the task's explicit constraint, the payload carries only identifiers, the acting position, and timing/correlation metadata:

- **No `title`/`description`** — free-text task content is exactly the kind of business detail a downstream consumer (digest email, push notification) does not need to see raw, and it's the most likely place for an agent to paste something sensitive.
- **No contact PII** (`phone`, `name`, `email`) — `contactId` is a reference, not a denormalization. A consumer that needs the phone number has to look it up through `GET /contacts/:contactId` under its own authorization, not receive it for free in an event it may fan out to third parties.
- **No raw Mongo document** — `taskEventPayload()` builds a fresh plain object field-by-field; it never spreads a Mongoose document or the audit `before`/`after` payload into the event.
- **No session/password/token material** — not applicable to this payload shape at all (no such fields exist on `TaskDocument`), but worth stating as an explicit non-goal, matching `AuditService.assertNoSecrets`'s existing blacklist philosophy for the adjacent `audit_events` write in the same transaction.

Verified in both the unit tests (`crm.service.spec.ts`, `CRM-004: Task outbox events`) and the integration test (`crm-task-events.integration-spec.ts`, `TaskCreated` case: asserts the serialized payload doesn't contain `description`, the seeded phone number, `passwordHash`, or `sessionToken`).

## 4. Atomicity and isolation, proven against real MongoDB

`apps/api/test/integration/crm-task-events.integration-spec.ts` runs the full Fastify HTTP stack against a real `mongodb-memory-server` replica set (same bootstrap as `tasks.integration-spec.ts`) and asserts directly on the `outbox_events` collection:

- **Rollback atomicity**: a `404` on `POST /tasks` (foreign `leadId`) leaves both `tasks` and `outbox_events` at zero new rows — the whole transaction, including the outbox write that never got reached, rolls back together.
- **No duplicates on idempotent complete**: calling `POST /tasks/:taskId/complete` twice on an already-completed task leaves exactly one `TaskCompleted` row, not two.
- **No event on CAS 409**: a stale `expectedVersion` on `complete` or `reassign` produces zero new outbox rows and leaves the task document unmodified.
- **No event on true no-op reassign**: reassigning to the same `assignedPositionId` (including `null→null`) is a `200` with zero `TaskReassigned` rows and an unincremented `version`.
- **Concurrent complete**: two parallel `POST .../complete` calls with the same `expectedVersion` (`Promise.all`, not sequential) resolve to exactly one `TaskCompleted` row regardless of which request "won" the CAS race or which one got the idempotent-replay `200`.
- **Tenant isolation**: completing a task in organization A never produces an outbox row scoped to organization B's task, and a cross-tenant `complete` attempt (org A's session against org B's task) is rejected `404` with zero rows written for either task.

## 5. Explicit limitations (what this proof does NOT include)

- **No consumer.** Nothing reads `TaskCreated`/`TaskCompleted`/`TaskReassigned` from `outbox_events` today. `apps/worker`'s existing polling loop will pick these rows up as `pending` the same way it does for any other `eventType` once a handler exists for them, but no such handler is implemented, wired, or tested here.
- **No email/push/Telegram delivery**, no digest aggregation, no cron schedule for a digest job — all explicitly out of scope per the task.
- **No new public API, no UI.** `TaskController`'s three mutating endpoints (`POST /tasks`, `POST /tasks/:taskId/complete`, `PATCH /tasks/:taskId/reassign`) are unchanged at the HTTP contract level — same request/response shapes, same status codes. `docs/api/v1-first-vertical-slice.yaml` and `packages/api-client/src/schema.ts` are untouched in this change.
- **`TaskReassigned`'s no-op detection compares `assignedPositionId` only** — if a future requirement needs to distinguish "explicitly reassigned to the same person" from "no-op," that's a deliberate design choice reconsideration, not a bug in this pass. The task's own wording ("не публиковать... reassign на то же значение") is what this implements.
- **`version` is a single CAS field for the whole `TaskDocument`**, not per-field — a concurrent `PATCH /tasks/:taskId` (edit) and `PATCH /tasks/:taskId/reassign` on the same task correctly conflict with each other (one gets `409`), which is intentional simplicity, not a gap.
- **`outbox_events` retention/cleanup** (30-day TTL on `status:'done'`, dead-letter handling after max attempts) is entirely the existing `@baza/domain-events`/`OutboxEventRepository` machinery — nothing new was added or changed there for Task events.

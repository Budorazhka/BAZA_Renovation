# CRM — how it works

How the CRM database and API (`erp/bz26-api-crm`) actually behave: request path, identity,
what access is really enforced, and the lead lifecycle. Collections and fields are catalogued
separately in `docs/entities.md` — this doc is about mechanics.

Created: 2026-07-30 · Based on reading service, guard and controller code in `bz26-api-crm/src/`.

---

## 1. The one-paragraph version

NestJS + Mongoose over two MongoDB connections. It is a **document-centric store with
append-only history**, not a workflow engine: the client sends state, the API saves it and
snapshots what changed. Almost all business rules — allowed stage moves, lead distribution,
role permissions — live in the frontend or aren't implemented. Reads are scoped by a single
JWT `role` field with own-or-all semantics; the org chart and RBAC data exist in the database
but no API route consults them.

---

## 2. Shape of the service

| Aspect | How it is |
|---|---|
| Framework | NestJS, ~19 feature modules under `src/modules/` |
| Port / prefix | `PORT` or 3000; global prefix only if `API_GLOBAL_PREFIX` is set (nginx normally adds `/api`) |
| Connections | Default = CRM DB (`MONGODB_URI`), plus `'platform'` = Platform DB (`MONGODB_PLATFORM_URI`). Both mandatory at boot |
| Body limits | Nest's parser is disabled; Express parsers mounted manually at **100 MB** |
| Validation | One global pipe, `SkipMultipartValidationPipe` — validates JSON DTOs but skips multipart bodies |
| CORS | Explicit origin allowlist, `credentials: true` |
| Real-time | Two Socket.IO gateways: `/notifications` and `/community` |
| Scheduling | `ScheduleModule` with six `@Cron` jobs |
| API docs | **No Swagger.** Hand-written `api-doc-full.md` and `docs/*.md` in the API repo |

`RouterModule` mounts `development`, `lms`, `community` and `share-links` under `api`, which is
why those routes are `/api/...` while CRM routes are bare (`/crm/leads`).

---

## 3. Identity: two user records, one id

The same human has a row in **both** databases (see `docs/entities.md` §12). They are kept
aligned by `_id`, and the split matters:

| | Platform `users` | CRM `users` |
|---|---|---|
| Holds | Full profile, contacts, MLS fields, balance | Slim auth record |
| Canonical for | Password (`login-direct`), profile | `role` used by `/auth/login`, and **`isOwner`** |

`isOwner` exists **only** on the CRM record and is the flag that lets someone provision a team.

Alignment happens at login: when a CRM record has to be created, the code copies the platform
user's `_id` so one JWT resolves in both databases. Legacy accounts that predate this are
repaired by `MigrateUserIdsService`, which matches on email and rewrites every foreign key
(`bz26-api-crm/docs/user-id-remap-impact.md` has the cascade).

### Three login endpoints

| Endpoint | Checks password? | Role comes from |
|---|---|---|
| `POST /auth/login` | **No** — email alone is enough for an existing user | CRM `users.role` |
| `POST /auth/login-direct` | Yes, `bcrypt.compare` against platform user | Platform `users.role` |
| `POST /auth/mock-login` | **No** — signs any `{id, role}` you post | request body |

JWT payload is `{ id, role, isOwner? }`, lifetime `JWT_EXPIRES_IN` (default `7h`). There is no
`AuthService` — this logic is inline in `auth.controller.ts`. `login-direct` returns a
`refreshToken`, but it is a fresh `randomUUID()` that is never stored or accepted anywhere, so
**there is no working refresh flow**; after expiry the user must log in again.

Because platform roles (`user`, `agency`, `developer`) and the CRM `UserRole` enum (`agent`,
`mentor`, `manager`, `admin`, …) are different vocabularies, which endpoint you logged in
through changes what your JWT `role` means downstream.

---

## 4. Request path and guards

There are **no global guards**. Each controller opts in with `@UseGuards(...)`, so protection
is per-controller and inconsistent by construction.

| Guard | Checks |
|---|---|
| `JwtAuthGuard` | Bearer JWT; `@Public()` bypasses; **in non-production a missing token injects a mock admin** |
| `RolesGuard` | String equality of `user.role` against `@Roles(...)`; passes when no `@Roles` is present |
| `AdminTokenGuard` | `ADMIN_PANEL_TOKEN`; **disabled outside production** |
| `WsJwtAuthGuard` | Same JWT logic for socket handshakes |
| `LeadsgenKeyGuard` | `LEADSGEN_KEY` on external lead intake |
| `StatSecretKeyGuard` | Secret passed as a **URL path segment** |
| `BotApiGuard` | `TG_BOT_API_TOKEN` for the Telegram bot |

Both JWT guards verify with **`ignoreExpiration: true`** (`common/guards/jwt-auth.guard.ts:61`,
`ws-jwt-auth.guard.ts:27`), so the 7-hour lifetime is advisory — an old token keeps working
server-side.

---

## 5. Access control — what is actually enforced

This is the part most likely to surprise you. Scoping is not centralized: each module has its
own private `buildQuery`, and they disagree. There is **no shared "visible user ids" helper and
no subordinate-tree resolution** anywhere in `src/`.

Leads are the strictest, and the whole rule is four lines:

```3681:3694:/Users/renat/Projects/BazaSale26/erp/bz26-api-crm/src/modules/crm/crm.service.ts
  private canSeeAllLeads(userRole: UserRole): boolean {
    return userRole === UserRole.ADMIN;
  }

  private buildOwnLeadsScope(userId: string): Record<string, unknown> {
    return {
      $or: [
        { assignedTo: new Types.ObjectId(userId) },
        { createdBy: new Types.ObjectId(userId) },
      ],
    };
  }
```

Applied across modules, the effective matrix is:

| Resource | `agent` | `mentor` / `manager` | `admin` |
|---|---|---|---|
| Leads | own | **own** | all |
| Tasks | own | **all** | all |
| Notes | own | **all** | all |
| Calendar | own | own | all |
| Report rows | own created | **all** | all |

So a manager cannot see their team's leads, but can see everyone's tasks and notes. In
`tasks.service.ts` and `reports.service.ts` the mentor/manager branch is an empty block with a
comment saying team logic is still needed — the absence of a filter means unrestricted.

Three further gaps worth knowing:

- **The org chart is decorative, server-side.** `team_positions.rbac`, `accessProfile`,
  `personalAccess` and `permissionOverrides` are written and returned to the client, but no
  route reads them for authorization. `parentPositionId` is used for tree structure and
  cascade delete only. The ERP hides UI; the API does not refuse the request.
- **`isOwner` widens nothing** except `POST /team-users/ensure-team`.
- The only place team membership affects a query is developer analytics
  (`development/services/analytics.service.ts`), which collects all position occupants as a
  **flat list** — not a subtree.

### Unauthenticated or weakly authenticated routes

| Route | Issue |
|---|---|
| `POST /auth/mock-login` | Public, mints a valid JWT for any identity. Deliberately left open — tracked in `docs/tracking/section-development-todo.md` with a code comment in `auth.controller.ts` |
| `POST /auth/login` | No password check for existing users |
| `GET /appeals` | **No guard**, while every sibling route on the controller has one (`appeals.controller.ts:229`) |
| `GET /team-users/:id`, `PATCH /team-users/:id` | Legacy routes, operate on any platform user by id with no team check |
| Any route in dev | Missing JWT injects a mock **admin** user |

Booking and registration endpoints have the same open-read problem, already written up in
`docs/tracking/section-development-todo.md`.

---

## 6. Lead lifecycle

### Creation

Five entry points: authenticated `POST /crm/leads`; external `POST /leads/add/network` and
`/leads/add/referral` (API-key guarded); a referrals cron; and CSV import.

`assignedTo` is **required in the DTO** — the server never picks an assignee. Initial stage is
a straight switch on `productType`:

| `productType` | Initial `stage` |
|---|---|
| `sales` (default) | `first_contact` |
| `network` | `network_new_lead` (also sets `realtorStage = realtor_1`) |
| `owner` | `owner_new_owner` |
| `agent` | `agent_new_agent` |

Deduplication runs at two levels: an application check on normalized phone or email **within
the creating user's own scope**, and for network leads a partial unique index on
`{email, productType, assignedTo}` with case-insensitive collation. Referral creation catches
the resulting duplicate-key error and returns the existing lead. CSV import uses a different
rule — a **global 90-day** window on phone or email — and bypasses `createLead` entirely, so it
skips the per-user check and emits no WebSocket events.

Every lead gets one seed history entry (`Lead created`), then a `lead:created` broadcast.

### Distribution is not implemented

`distributionsettings` stores `round_robin`, `by_load` or `manual`, and there are endpoints to
read and write it. **No code consumes it.** The strings appear only in the schema, DTO, docs and
the settings CRUD; there is no candidate pool, no cursor, no load query. Assignment is whatever
the client puts in `assignedTo`.

The one bulk operation that exists, `POST /crm/leads/bulk-assign`, reassigns every lead from one
manager to another and appends history — no balancing, and notably it does **not** write
`leadtransfers` rows.

### Stage changes are free-form

`PATCH /crm/leads/:id/stage` accepts any enum value for `stage`, `realtorStage` and
`curatorStage`. There is no transition graph, no adjacency check, and `rejectionReason` is
optional even when moving to a rejection stage — it is merely persisted if the target is
`rejected`. Each supplied field produces its own history entry, so one request can append
several.

The one genuinely clever mechanic: on leaving a stage, the API snapshots which checklist items
were ticked into `checkedItems` on the history entry, so the audit trail preserves what was
completed at that moment.

What a stage change does **not** do: create tasks, send notifications (only a WebSocket
broadcast), or change `folder`.

`realtorStage` and `curatorStage` are independent parallel ladders for the network funnel.
Moving one does not affect `stage` or the other.

### Funnel counts

One param-driven endpoint serves all four funnels:
`GET /crm/analytics/leads-by-stage?productType=&assignedTo=`. It is a two-stage pipeline —
`$match` the scoped query, `$group` by `$stage`.

Two consequences: it groups on `stage` **only**, so `realtorStage`/`curatorStage` columns must be
assembled client-side; and it does **not** filter by `folder`, so rejected and transferred leads
still count toward their stage.

### Folders and transfers

`folder` (`rejected`, `deferred_demand`, `golden_fund`, `transferred`) is a UI taxonomy. It is
set explicitly via `PATCH /crm/leads/:id/folder`, or forced to `transferred` by a transfer. No
query filters on it.

A transfer writes a `leadtransfers` row, moves `assignedTo` and sets the folder. A return finds
the most recent non-return transfer to the current user, writes a reversed row with
`isReturn: true`, and restores the previous assignee — but does **not** clear the `transferred`
folder, so returned leads keep the label.

### Contact actions

`POST /crm/leads/:id/contact-action` records a `call` or `chat` click into
`leadcontactactions` and nothing else — no history entry, no lead update. These rows are the raw
material for the activity metrics in partner summaries and reports.

### Developer funnel across databases

`leads.complexId` points at platform `estates._id` with no Mongoose ref, so the join is manual.
A lead enters a developer's funnel if it is tagged with one of their complexes **or** assigned to
one of their team members:

```468:474:/Users/renat/Projects/BazaSale26/erp/bz26-api-crm/src/modules/development/services/analytics.service.ts
    return this.leadModel.find({
      $or: [
        { complexId: { $in: estateIds } },
        { assignedTo: { $in: memberIds }, complexId: { $in: [null, ...estateIds] } },
      ],
    })
```

CRM stages are then folded into five developer funnel stages via `LEAD_STAGE_TO_FUNNEL`;
rejection and no-call stages map to nothing and drop out.

---

## 7. Tasks ↔ calendar sync

The only real bidirectional sync in the service, held together by two mirrored pointers:
`tasks.calendarEventId` and `calendarevents.taskId`.

- Saving a task with `syncWithCalendar` (default true) and both dates set creates or updates a
  `TASK` event with reminders at `[1440, 360, 60]` minutes.
- Creating a `TASK` event without a `taskId` creates the task, with `syncWithCalendar: false` so
  it doesn't bounce back.
- Calendar updates call the task service with `skipCalendarSync=true` — the same recursion guard
  from the other side.
- Turning sync off, or clearing the dates, deletes the event and nulls the pointer.
- Deleting a task **hard-deletes** its event, then soft-deletes the task.

Note the asymmetry: tasks are soft-deleted (`isDeleted`) and restorable, events are not.

---

## 8. Notifications and real-time

`notifications` is a persisted inbox that also serves as a request/response thread via
`parentRequestId`. Documents carry a 30-day TTL on `expiresAt`, and a midnight cron archives
them before Mongo removes them.

Producers are the notifications controller, the admin controller (broadcast to all active
users), and the calendar service. Notably `CrmService` does **not** create notifications for lead
changes — it only broadcasts over WebSocket, so lead activity leaves no inbox trace.

Two Socket.IO namespaces, both JWT-guarded at handshake:

| Namespace | Rooms | Events out |
|---|---|---|
| `/notifications` | `user:{id}`, `role:{role}`, optional `type:{t}` | `notification:new/updated`, `task:created/updated`, `lead:created/updated` |
| `/community` | `community:feed`, `:section:{id}`, `:thread:{id}`, `:exchange` | `thread:*`, `reply:*`, `reaction:changed`, `member:online` |

Reminder delivery is incomplete. `processReminders()` runs every minute, increments
`reminderCount` and stops at 3 — but it only writes to the console. No email, no push, no
WebSocket resend. It also never advances `reminderAt`, so the same document re-matches every
minute until the counter caps, and `nextReminderAt` is written but never read. Similarly,
`respondToRequest()` saves the response directly instead of going through `create()`, so the
original requester gets **no** real-time push.

---

## 9. Scheduled work

| Schedule | Job | What it does |
|---|---|---|
| Every minute | `notifications.processReminders` | Bumps counters; console output only |
| Every minute | `calendar.checkUpcomingEvents` | Creates reminder notifications for events ~15 min out |
| Every 10 min | `referrals-sync` | Pulls referrals from an external API into network leads |
| Daily 08:00 | `sendDailyPlansNotifications` | Per-user daily task summary |
| Daily midnight | `archiveOldNotifications` | Archives notifications older than 30 days |
| Daily 02:00 | `generateNightlyReports` | Deletes expired report caches and exports |

Plus three `setInterval` loops (failed-S3-delete retry, in-memory cache eviction, signed-URL
cache cleanup) and Mongo TTL indexes on notifications, report caches and exports.

**Booking expiry has no job.** Stale pending bookings are expired lazily by `expireStale()` when
a list or detail read happens, so nothing expires until someone looks.

---

## 10. Reports and files

**Reports** cache computed JSON in `reportcaches`, keyed by an MD5 of report type, period, dates,
user and filters, with a 24-hour TTL. Only three types are real aggregations over `leads`:
`sales_efficiency`, `lead_sources`, `conversion_rates`. The seven network and curator types are
stubs returning zeros with a "not fully implemented" message.

Exports are worth flagging: `report-export.service.ts` builds "Excel" and "PDF" output as
**plain text**, tab-separated or pipe-formatted (`:144`), then uploads it with the matching MIME
type and extension — so those files open as garbage in Excel or a PDF reader. `exceljs` *is* a
dependency, but only the chessboard importer
(`development/services/apartments-import.service.ts`) uses it; reports never touch it, and there
is no PDF library at all.

**Files** go to DigitalOcean Spaces via AWS SDK v3, keyed `{folder}/{timestamp}-{originalname}`,
with per-entity folders (`tasks/`, `leads/`, `notes/`, `user-appeals/`, `reports/`). Leads and
tasks embed `{url, key, filename}`; notes store no `key` and delete by parsing the URL. A
separate path handles platform media: `POST /api/files` uploads and inserts into the platform
`cdn_files` collection, returning the id that layouts and projects reference.

Two file abstractions coexist — `UnifiedFileService` (with a retrying cleanup queue) behind
`/files/*`, and `SpacesService` used directly by tasks, notes, leads and appeals.

---

## 11. Non-browser entry points

Four ways in that don't use a user JWT, each with its own shared secret:

| Surface | Auth | Purpose |
|---|---|---|
| `POST /leads/add/network`, `/add/referral` | `LEADSGEN_KEY` | External lead intake |
| `GET /stat/leads/:secretKey`, `/stat/tasks/:secretKey` | Secret **in the URL path** | Raw unpaginated dumps for the whole date range, no role filtering |
| `/tg-bot/*` | `TG_BOT_API_TOKEN` | Pulls unsent appeals and marks them sent; proxies a login code; counts |
| `/admin/*` | `ADMIN_PANEL_TOKEN`, **off in dev** | Broadcasts, user-id migration |

Appeals have no email integration: "sent" just means an external poller has collected them.
Delivery is pull-based, presumably by the Telegram bot.

---

## 12. Defined but not wired

Useful to know before you go looking for these:

| Thing | State |
|---|---|
| `CacheService` / `CacheModule` | Complete implementation, never imported anywhere |
| `PerformanceInterceptor` | Written, never registered |
| `GoogleCalendarService`, `AppleCalendarService` | Files exist, not in `CalendarModule` providers; `calendarsyncconfigs` schema likewise unregistered |
| `DistributionSettings` | Stored and served, no algorithm consumes it |
| `nextReminderAt` | Written, never read |
| Network/curator report types | Zero-filled stubs |
| `AppealsService.downloadFileFromCdn()` | Unused |
| `refreshToken` from `login-direct` | Random UUID, never persisted or validated |
| `leadgen.controller.ts` | Still uses a hardcoded `userId = 'current-user-id'` — JWT not wired |

---

## 13. Mental model for changes

- **Server stores, client decides.** Adding a business rule usually means adding it to the API
  for the first time, not finding where it lives.
- **History is append-only and self-describing.** Stage entries carry the checklist snapshot;
  prefer extending history over adding status fields.
- **Scoping is per-module and duplicated.** Any visibility change means touching each
  `buildQuery` — or introducing the shared helper that doesn't exist yet.
- **Two databases, no transactions.** Anything touching both CRM and platform data (lead ↔
  complex, plan ↔ position) can half-succeed.
- **Check the guard on the route you're touching.** Controller-level guards are the norm, but
  per-route exceptions exist in both directions.

Related: `docs/entities.md` for the data model, `docs/tracking/section-development-todo.md` for
already-triaged auth and scoping gaps, and in the API repo `docs/crm-leads-api.md`,
`docs/crm-funnel-api.md`, `docs/user-id-remap-impact.md`.

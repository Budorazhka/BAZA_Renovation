# CRM Deal Core (DEAL-001)

## 1. Overview & Architecture

CRM Deal Core provides backend-level lifecycle and transactional tracking for real estate deals (`DealDocument`), linking contacts, leads, and participants under strict multi-tenant isolation and role-based access control.

### Core Entity: `deals`
- `_id`: ObjectId
- `organizationId`: ObjectId (Tenant boundary, index `{ organizationId: 1, _id: -1 }`)
- `contactId`: ObjectId (Primary client/buyer/seller, validated within tenant)
- `ownerPositionId`: ObjectId (Assigned agent position)
- `leadId`: ObjectId (Optional reference to originated Lead)
- `title`: String (Deal headline)
- `description`: String (Optional context/notes)
- `stage`: DealStage enum (`showing`, `deposit`, `deal`, `golden`, `check_in`, `referral`, `closed_lost`)
- `expectedCommission`: MoneyAmount `{ amountMinorUnits: number, currency: 'USD' | 'GEL' | 'RUB' }`
- `participants`: Array of `{ role: string, contactId: ObjectId }`
- `checklistItems`: Array of `{ id: string, label: string, done: boolean, completedAt?: Date, completedByPositionId?: ObjectId }`
- `version`: Number (Monotonically increasing optimistic lock sequence)
- `createdAt`, `updatedAt`: ISO timestamps

### Append-Only Event Log: `deal_events`
Records every stage transition and reason for auditability and timeline generation:
- `dealId`: ObjectId
- `organizationId`: ObjectId
- `stage`: DealStage
- `fromStage`: DealStage (optional)
- `reason`: String (optional)
- `changedBy`: `{ type: 'position' | 'system', positionId?: ObjectId }`
- `changedAt`: Date

---

## 2. Stage Lifecycle & Transition Matrix

Deal stages represent the strict pipeline of a real estate transaction. Transitions are validated against a directed acyclic state graph (with allowed rollbacks where business-valid).

```
   +-----------------------------------------------------------------------+
   |                                                                       |
   v                                                                       |
[showing] <=======> [deposit] -------> [deal] -------> [golden] -------> [check_in] -------> [referral]
   |                   |                  |               |                 |                   |
   +-------------------+------------------+---------------+-----------------+-------------------+
   |
   v
[closed_lost] (TERMINAL STAGE - Strictly Irreversible)
```

### Transition Table
| From Stage | Allowed Target Stages | Description |
|:---|:---|:---|
| `showing` | `deposit`, `closed_lost` | Initial stage: showings and property tours underway. |
| `deposit` | `showing`, `deal`, `closed_lost` | Deposit received; can fall back to showing if deposit refunded, or progress to full deal contract. |
| `deal` | `golden`, `closed_lost` | Deal contract signed; progresses to golden (commission received). |
| `golden` | `check_in`, `closed_lost` | Golden stage (commission fully collected); progresses to client check-in / onboarding. |
| `check_in` | `referral`, `closed_lost` | Post-sale check-in with client; progresses to asking for referrals / repeat business. |
| `referral` | `closed_lost` | Referral stage: client actively referring or in long-term nurture. |
| `closed_lost` | *(None)* | **Terminal stage**. A lost deal cannot be reopened or transitioned to any other stage. |

---

## 3. Optimistic Concurrency Control

To prevent lost updates during concurrent mutations (such as two managers simultaneously updating a deal's stage, details, participants, or checklist):
1. The client must supply `expectedVersion` for every mutation of an existing deal: `PATCH /deals/:dealId`, `PATCH /deals/:dealId/stage`, `POST /deals/:dealId/participants`, `DELETE /deals/:dealId/participants/:contactId?expectedVersion=…`, and `PATCH /deals/:dealId/checklist`.
2. The database updates the document conditionally:
   ```typescript
   {
     _id: dealId,
     organizationId,
     version: expectedVersion,
     stage: { $in: allowedFromStages }
   }
   ```
   with `$inc: { version: 1 }` and the requested mutation.
3. If zero documents match because another request already advanced the version, a `409 VERSION_CONFLICT` error is returned. A scoped-out or deleted deal remains a uniform `404 NOT_FOUND`.
4. A created or reassigned `ownerPositionId` is resolved through `OrganizationsService.findAssignablePosition` in the same transaction: a cross-tenant, nonexistent, or closed position can never become a deal owner.

---

## 4. RBAC & Permission Matrix

Permissions for `deal` are defined as follows:

| Resource | Action | Supported Scopes | Assigned Roles |
|:---|:---|:---|:---|
| `deal` | `read` | `organization`, `own` | `owner`, `director`, `rop`, `developer` (`organization`); `manager` (`own`) |
| `deal` | `create` | `organization`, `own` | `owner`, `director`, `rop`, `developer` (`organization`); `manager` (`own`) |
| `deal` | `edit` | `organization`, `own` | `owner`, `director`, `rop`, `developer` (`organization`); `manager` (`own`) |
| `deal` | `changeStage`| `organization`, `own` | `owner`, `director`, `rop`, `developer` (`organization`); `manager` (`own`) |

### Non-Disclosure Enforcement
- Requests by callers with `own` scope (e.g. `manager`) are pre-filtered so that `ownerPositionId === callerPositionId`.
- Accessing a deal owned by another position or belonging to a different tenant returns a uniform `404 NOT_FOUND` rather than `403 FORBIDDEN` to prevent resource enumeration and identity disclosure.

---

## 5. Participants & Checklist Mechanics

### Participants
- Each participant must reference a valid `contactId` belonging to the same `organizationId`.
- Duplicate participant contacts on the same deal are rejected (`400` on create, `409` on add).
- Adding or removing participants requires `expectedVersion`, atomically increments the deal `version`, and records an audit log entry.

### Checklist
- Items maintain a unique string `id`, `label`, `done` status, `completedAt`, and `completedByPositionId`.
- Updating a checklist requires `expectedVersion`, preserves existing `completedAt` timestamps for items that were already completed and remain completed, and returns `409 VERSION_CONFLICT` rather than overwriting a newer checklist snapshot.
- Marking an item as `done: true` sets `completedAt` to current timestamp and `completedByPositionId` to the caller.
- Marking an item as `done: false` resets `completedAt` and `completedByPositionId` to `undefined`.

---

## 6. HTTP API Specification

| Method | Path | Required Permission | Description |
|:---|:---|:---|:---|
| `GET` | `/api/v1/deals` | `deal.read` | Lists tenant deals (newest-first, cursor pagination, filters: `stage`, `ownerPositionId`, `leadId`, `contactId`). |
| `GET` | `/api/v1/deals/:dealId` | `deal.read` | Retrieves full deal details with primary contact and participant contact projections. |
| `POST` | `/api/v1/deals` | `deal.create` | Creates a new deal. |
| `PATCH` | `/api/v1/deals/:dealId` | `deal.edit` | Partially updates deal details (`title`, `description`, `ownerPositionId`, `expectedCommission`) using required `expectedVersion`. |
| `PATCH` | `/api/v1/deals/:dealId/stage` | `deal.changeStage` | Transitions stage with version lock and reason. |
| `POST` | `/api/v1/deals/:dealId/participants` | `deal.edit` | Adds a participant using required `expectedVersion`. |
| `DELETE` | `/api/v1/deals/:dealId/participants/:contactId?expectedVersion=…` | `deal.edit` | Removes a participant using required `expectedVersion`. |
| `PATCH` | `/api/v1/deals/:dealId/checklist` | `deal.edit` | Atomically updates checklist items using required `expectedVersion`. |

---

## 7. Known Limitations & Technical Decisions

1. **Fixed Stages**: The current vertical slice implements the 7 domain stages defined in `domain-model.md`. Customizable pipeline stages per agency tenant are out of scope for DEAL-001 and will be introduced in future pipeline customization milestones.
2. **Participant Role Permissions**: All participants are stored with an informational `role` string (e.g. `'lawyer'`, `'co-buyer'`, `'notary'`). Fine-grained permissions per participant role are deferred to future multi-party deal workflows.
3. **No Direct Float Math**: Commissions use the `MoneyAmount` minor units pattern (`amountMinorUnits` + `currency`) preventing currency floating point inaccuracy.

# API: `/crm/leads`

**Auth:** JWT Bearer token (`Authorization: Bearer <jwt_token>`)  
**Base URL:** `CRM_API_BASE_URL` — `https://api-crm.baza.sale` (prod) / `http://localhost:3000` (dev)

**Source:** `src/features/crm/services/api/leads.ts`, `src/features/crm/services/api/types.ts`, `src/services/crmApi.ts`

All list/read/write operations on leads also pass optional auth query params (`userId`, `userRole`) when available from `localStorage.user_data` or env (`VITE_USER_ID`, `VITE_USER_ROLE`). These scope data access on the backend.

---

## GET `/crm/leads`

List leads with pagination, filters, and full-text search.

### Query Parameters

| Param        | Type          | Required | Description |
|--------------|---------------|----------|-------------|
| `page`       | number        | No       | Page number (default: `1`) |
| `limit`      | number        | No       | Items per page (frontend commonly uses `100`–`2000`) |
| `stage`      | `LeadStage`   | No       | Filter by funnel stage |
| `productType`| `ProductType` | No       | Filter by product funnel: `sales`, `network`, `owner`, `agent` |
| `assignedTo` | string        | No       | MongoDB ObjectId of assigned manager |
| `source`     | string        | No       | Lead source label |
| `search`     | string        | No       | Full-text search by name, phone, or email |
| `userId`     | string        | No       | Current user ID (auth scoping) |
| `userRole`   | string        | No       | Current user role: `agent`, `mentor`, `manager`, `admin` |

### Response

Standard wrapper:

```json
{
  "success": true,
  "data": {
    "items": [Lead],
    "total": 42,
    "page": 1,
    "totalPages": 5
  }
}
```

**Notes:**

- Primary array field is `items`. Some backend versions may return `leads` instead; the frontend accepts both (`parseLeadsResponse` in `useNetworkAnalyticsBackend.ts`).
- Pagination fields: `total`, `page`, `totalPages`.

### Example

```bash
curl -G 'https://api-crm.baza.sale/crm/leads' \
  -H 'Authorization: Bearer <token>' \
  --data-urlencode 'page=1' \
  --data-urlencode 'limit=100' \
  --data-urlencode 'productType=sales' \
  --data-urlencode 'search=+79001234567'
```

---

## POST `/crm/leads`

Create a new lead.

### Request Body

| Field              | Type            | Required | Description |
|--------------------|-----------------|----------|-------------|
| `name`             | string          | Yes      | Client name (trimmed) |
| `phone`            | string          | Yes      | Phone number (trimmed) |
| `productType`      | `ProductType`   | Yes      | `sales` / `network` / `owner` / `agent` |
| `assignedTo`       | string          | Yes      | MongoDB ObjectId of assigned manager |
| `email`            | string          | No       | Email |
| `city`             | string          | No       | City |
| `source`           | string          | No       | Lead source |
| `notes`            | string          | No       | Free-text notes |
| `dealValue`        | number          | No       | Deal value |
| `expectedCloseDate`| string          | No       | Expected close date (ISO or date string) |
| `budgetValue`      | number          | No       | Client budget amount |
| `budgetCurrency`   | `BudgetCurrency`| No       | `USD`, `EUR`, `RUB`, `KZT` |

**Query params (optional):** `userId`, `userRole` — sent by messenger integration (`crmApi.ts`).

### Response

**201 / 200 — success:**

```json
{
  "success": true,
  "data": { /* full Lead object */ }
}
```

**409 — duplicate:**

```json
{
  "success": false,
  "message": "Лид с таким номером телефона или email уже существует"
}
```

---

## GET `/crm/leads/:id`

Get a single lead by MongoDB ObjectId.

### Path Parameters

| Param | Type   | Description |
|-------|--------|-------------|
| `id`  | string | Lead `_id` |

### Query Parameters

| Param      | Type   | Description |
|------------|--------|-------------|
| `userId`   | string | Auth scoping (optional) |
| `userRole` | string | Auth scoping (optional) |

### Response

```json
{
  "success": true,
  "data": { /* full Lead object */ }
}
```

The `history` array should contain timeline entries with at least:

| Field       | Type        | Description |
|-------------|-------------|-------------|
| `changedAt` | string      | ISO timestamp |
| `changedBy` | string      | User ID |
| `userName`  | string      | Display name |
| `userRole`  | string      | Role at time of change |
| `fromStage` | `LeadStage` | Previous stage |
| `toStage`   | `LeadStage` | New stage |
| `comment`   | string      | Optional comment |
| `type`      | string      | Optional: `stage_change`, `assign`, `comment` |

---

## PATCH `/crm/leads/:id`

Update lead fields (partial update). Only sent fields are applied.

### Request Body (allowed fields)

| Field              | Type              | Description |
|--------------------|-------------------|-------------|
| `name`             | string            | Client name |
| `phone`            | string            | Phone |
| `email`            | string            | Email |
| `city`             | string            | City |
| `stage`            | `LeadStage`       | Main funnel stage |
| `productType`      | `ProductType`     | Product funnel |
| `realtorStage`     | `LeadStage`       | Realtor sub-funnel (network) |
| `curatorStage`     | `LeadStage`       | Curator sub-funnel (network) |
| `assignedTo`       | string            | Assigned manager ID |
| `source`           | string            | Source |
| `notes`            | string            | Notes |
| `rejectionReason`  | `RejectionReason` | Rejection reason code |
| `rejectionComment` | string            | Rejection comment |
| `dealValue`        | number            | Deal value |
| `expectedCloseDate`| string            | Expected close date |
| `budgetValue`      | number            | Budget amount |
| `budgetCurrency`   | `BudgetCurrency`  | Budget currency |
| `tags`             | string[]          | Max 2 tags, each max 128 chars |
| `telegram`         | string            | Telegram handle (sent by frontend) |
| `country`          | string            | Country |

**409** on duplicate phone/email (same as POST).

### Response

```json
{
  "success": true,
  "data": { /* updated Lead object */ }
}
```

---

## DELETE `/crm/leads/:id`

Delete a lead.

### Response

```json
{
  "success": true,
  "data": {
    "deleted": true
  }
}
```

---

## Lead Object — Expected Fields

### Core / Identity

| Field         | Type          | Required | Description |
|---------------|---------------|----------|-------------|
| `_id`         | string        | Yes      | MongoDB ObjectId |
| `name`        | string        | Yes      | Client name |
| `phone`       | string        | Yes      | Phone number |
| `email`       | string        | No       | Email |
| `city`        | string        | No       | City |
| `stage`       | `LeadStage`   | Yes      | Current main funnel stage |
| `productType` | `ProductType` | Yes      | `sales`, `network`, `owner`, `agent` |
| `assignedTo`  | string \| object| Yes    | Manager ID, or populated `{ _id, name, email }` |
| `createdBy`   | string        | Yes      | Creator user ID |
| `createdAt`   | string        | Yes      | ISO timestamp |
| `updatedAt`   | string        | Yes      | ISO timestamp |

### Funnel / Deal

| Field              | Type            | Required | Description |
|--------------------|-----------------|----------|-------------|
| `realtorStage`     | `LeadStage`     | No       | Network realtor sub-funnel stage |
| `curatorStage`     | `LeadStage`     | No       | Network curator sub-funnel stage |
| `source`           | string          | No       | Lead source |
| `notes`            | string          | No       | Notes |
| `dealValue`        | number          | Yes*     | Deal value (*defaults to `0`) |
| `expectedCloseDate`| string          | No       | Expected close date |
| `budgetValue`      | number          | No       | Client budget |
| `budgetCurrency`   | `BudgetCurrency`| No       | `USD`, `EUR`, `RUB`, `KZT` |
| `tags`             | string[]        | No       | Tags (max 2) |

### Rejection

| Field              | Type              | Description |
|--------------------|-------------------|-------------|
| `rejectionReason`  | `RejectionReason` | Reason code when lead is rejected |
| `rejectionComment` | string            | Free-text rejection comment |

### Computed (backend)

| Field         | Type    | Description |
|---------------|---------|-------------|
| `hasTask`     | boolean | Has at least one incomplete task |
| `taskOverdue` | boolean | Has an overdue incomplete task |

Used by the poker-table UI (`crm-poker-adapter.ts`, `LeadsCardTableView.tsx`). If absent, frontend falls back to task list lookups.

### Related Data

| Field     | Type          | Description |
|-----------|---------------|-------------|
| `history` | `LeadHistory[]`| Stage change timeline |
| `files`   | `LeadFile[]`  | Attached files (may be omitted in list responses) |

### LeadFile

| Field          | Type   | Description |
|----------------|--------|-------------|
| `filename`     | string | Stored filename |
| `originalName` | string | Original upload name |
| `mimeType`     | string | MIME type |
| `size`         | number | Size in bytes |
| `url`          | string | Download URL |
| `folderId`     | string \| null | Library folder ID |

---

## Enums

### ProductType

```
sales    — Primary sales funnel (Продажи)
network  — Partner network funnel (Сеть)
owner    — Property owner funnel (Собственник)
agent    — Agent / ad campaigns funnel (Посредник)
```

### LeadStage (sales funnel — main values)

```
rejected, first_contact, qualification, rejected1, first_contact1,
needs_analysis, presentation, proposal, negotiation, decision_making,
contract_signing, onboarding, needs_analysis1, presentation1, proposal1,
negotiation1, decision_making1, contract_signing1, deal_closed,
post_purchase_followup, satisfaction_check, upsell_opportunity
```

Network, owner, and agent funnels have additional stage values (e.g. `network_new_lead`, `owner_new_owner`, `agent_new_agent`, `realtor_1`–`realtor_6`, `curator_1`–`curator_6`). See `LeadStage` enum in `src/features/crm/services/api/types.ts`.

### RejectionReason

```
price_too_high, not_interested, wrong_timing, competitor_chosen,
no_budget, no_authority, other, defective_lead, other_reason,
partnership_terminated, cannot_contact
```

---

## Related Endpoints (same `/crm/leads` prefix)

| Method | Path | Description |
|--------|------|-------------|
| PATCH  | `/crm/leads/:id/stage` | Move lead to a new stage (records history) |
| POST   | `/crm/leads/:id/history` | Add manual history entry |
| POST   | `/crm/leads/:id/contact-action` | Record call/chat action |
| GET    | `/crm/leads/:id/history` | Get lead history |
| GET    | `/crm/leads/count?email=` | Count leads created by user email |
| POST   | `/crm/leads/by-emails` | Bulk lookup by email list |
| POST   | `/crm/leads/bulk-assign` | Reassign all leads between managers |
| GET    | `/crm/leads/:id/files` | List lead files |
| POST   | `/crm/leads/:id/files` | Upload file |
| GET    | `/crm/leads/:id/checklist` | Get stage checklist |
| POST   | `/crm/leads/:id/stage-comment` | Add stage comment |

See also `docs/api-лиды-спецификация.md` for detailed specs on stage updates and email search.

---

## Frontend Usage

| Consumer | Call |
|----------|------|
| CRM funnel (`useCrmData`) | `getLeads({ page: 1, limit: 1000 })` |
| Network analytics | `getLeads({ productType: 'network', limit: 1000 })` |
| Duplicate detection | `getLeads({ search: phoneOrEmail, limit: 20 })` |
| Messenger integration | `GET /crm/leads?search=…`, `POST /crm/leads` via `crmApi.ts` |

---

## Error Responses

| Status | Condition | Example `message` |
|--------|-----------|-------------------|
| 400    | Validation error | Field-specific |
| 401    | Missing/invalid JWT | Unauthorized |
| 409    | Duplicate phone/email on create/update | `Лид с таким номером телефона или email уже существует` |

All error responses follow:

```json
{
  "success": false,
  "message": "Human-readable error"
}
```

# Booking apartments — how it works & API integration

This document describes how **бронирование квартир** (apartment booking) works in the ERP client today, what is still mocked, and **exactly what the API (`bz26-api-crm`) must provide** so the feature works end-to-end: a realtor sends a booking request from the chessboard, the developer confirms/rejects it, the unit gets a 72‑hour hold, and the booking shows up in the developer's "Брони / Продажи" panel.

It is the backend-facing companion for the booking UI.

> Frontend code:
> - `src/components/inventory/BookingRequestModal.tsx` — the "Заявка на бронирование" modal (the screenshot).
> - `src/components/inventory/UnitDetailModal.tsx` — opens the modal from a unit card, currently writes the result to `localStorage`.
> - `src/components/development/sales/BookingsPanel.tsx` — developer-side table (confirm / reject / countdown).
> - `src/components/development/sales/salesManagementStorage.ts` — `bookingsKey(projectId)` storage key (to be replaced by API calls).
> - `src/services/developmentApi.ts` — HTTP layer (axios, Bearer token, `/api/development/...`).
> - `src/types/bookings.ts` — `Booking` / `BookingStatus` domain types.

---

## 0. TL;DR — what we need from the API

A booking module mounted under the same prefix as the rest of development (`/api/development`), with:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/development/bookings` | Realtor sends a booking request for a unit (status `pending`). |
| `GET` | `/api/development/bookings` | List bookings (filter by `complexId` / `status`) — feeds the developer panel. |
| `GET` | `/api/development/bookings/:id` | Single booking. |
| `PATCH` | `/api/development/bookings/:id/status` | Developer confirms / rejects / marks paid; system expires. |
| `PATCH` | `/api/development/bookings/:id` | Edit hold deadline / responsible manager / comment. |

Plus the **side effect**: creating/confirming a booking must flip the unit's status to `reserved` (with an `until`), and reject/expire must release it back to `available`. The atomic unit-status endpoint already exists: `PATCH /api/development/units/:id/status` (see `api-zapros.md` §3).

Everything uses `Authorization: Bearer <jwt>` and the standard envelope `{ "success": true, "data": ... }` / `{ "success": false, "message": "..." }`.

---

## 1. The flow (what the user does)

```
Realtor                          API / Developer                     Unit
───────                          ───────────────                     ────
1. Opens chessboard of a ЖК
   GET /complexes/:id/chessboard
2. Clicks a FREE unit → "Забронировать"
3. Fills modal (риэлтор, агентство, comment)
   booking window is fixed: now → now + 72h
4. "Отправить заявку"  ─────────► POST /bookings
                                   status = pending           ──────► reserved (until = +72h)
5.                                 Developer sees it in
                                   "Брони" panel (in_progress)
6.                                 Confirm  ► PATCH /:id/status booked   (stays reserved)
                                   Reject   ► PATCH /:id/status rejected ──────► available
                                   Timeout  ► status expired (auto)       ──────► available
                                   Paid     ► PATCH /:id/status paid      ──────► sold
```

- **Booking window is fixed at 72 hours** in the UI (`BookingRequestModal`): `startsAt = now`, `expiresAt = now + 72h`. The client sends both; the backend should treat `expiresAt` as the hold deadline (or recompute it from a server-side policy and return the authoritative value).
- A unit can only be booked from `free`/`available`. The "Забронировать" button is shown only when `unit.status === 'free'` (see `UnitDetailModal.tsx`).
- The chessboard highlights units that are `in_progress` (pending) or `paid` — today it reads them from `localStorage`; with the API it should read them from `GET /bookings`.

### Status vocabulary (client ↔ API)

The client has two overlapping status sets. Please standardize on the API set and the client will map.

| API booking status | Client `DevBookingStatus` (`BookingsPanel`) | Client label | Unit status side effect |
|---|---|---|---|
| `pending` | `in_progress` | В процессе | `reserved` (hold until `expiresAt`) |
| `booked` | `booked` | Бронь | `reserved` |
| `rejected` | `rejected` | Отказ | `available` |
| `expired` | `expired` | Истекла | `available` |
| `paid` | `paid` | Оплачена | `sold` |

> `src/types/bookings.ts` also defines `active` / `completed`; for the developer sales flow above only the five values in the table are used. Pick `pending|booked|rejected|expired|paid` as the canonical API enum.

---

## 2. Identifiers the client has

When the realtor submits, the client knows:

- `complexId` — the active ЖК id (`activeProjectId`, same id used by `GET /complexes/:id/chessboard`).
- `buildingId` — the unit's building (`unit.buildingId`).
- `unitId` — the unit's id (MongoId from the chessboard).
- `unitNumber` — the human label, e.g. `"104"` (shown as "ЛОТ 104").
- Realtor identity from `currentUser` (`name`, `companyName`) and the JWT.

The backend can derive the agency/realtor from the JWT; the modal also lets the realtor override the displayed `риэлтор` / `агентство` text.

---

## 3. MUST-HAVE — Create a booking request

`POST /api/development/bookings` — `application/json`

**Body the client sends:**

```jsonc
{
  "complexId": "698f3bc1336fbbb95257bca3",
  "buildingId": "6a21c84350ad6f56b866c001",
  "unitId": "6a21c84350ad6f56b866c123",
  "unitNumber": "104",
  "realtorName": "seal555",
  "agency": "Estate Group",
  "comment": "Клиент рассматривает ипотеку",
  "startsAt": "2026-06-09T00:56:00.000Z",
  "expiresAt": "2026-06-12T00:56:00.000Z"
}
```

| Field | Required | Type | Notes |
|---|---|---|---|
| `complexId` | yes | MongoId | The ЖК; same id as the chessboard endpoint. |
| `buildingId` | yes | MongoId | Unit's building. |
| `unitId` | yes | MongoId | The unit being booked. |
| `unitNumber` | no | string | Display label; backend can resolve from `unitId`. |
| `realtorName` | no | string | Display override; default = JWT user name. |
| `agency` | no | string | Display override; default = JWT user company. |
| `comment` | no | string | Free text from the modal. |
| `startsAt` | no | ISO | Defaults to "now"; backend may override. |
| `expiresAt` | no | ISO | Hold deadline; backend may recompute from a 72h policy. |

**Required response (201/200):**

```json
{
  "success": true,
  "data": {
    "id": "66b0e1f2a4c3d5e6f7a8b9c0",
    "complexId": "698f3bc1336fbbb95257bca3",
    "buildingId": "6a21c84350ad6f56b866c001",
    "unitId": "6a21c84350ad6f56b866c123",
    "unitNumber": "104",
    "status": "pending",
    "realtorId": "65f0a1b2c3d4e5f6a7b8c9d0",
    "realtorName": "seal555",
    "agency": "Estate Group",
    "comment": "Клиент рассматривает ипотеку",
    "manager": null,
    "startsAt": "2026-06-09T00:56:00.000Z",
    "expiresAt": "2026-06-12T00:56:00.000Z",
    "createdAt": "2026-06-09T00:56:00.000Z",
    "updatedAt": "2026-06-09T00:56:00.000Z"
  }
}
```

**Behavior / side effects:**

- Create the booking with `status: "pending"`.
- **Atomically set the unit to `reserved` with `until = expiresAt`** (equivalent to `PATCH /units/:unitId/status { status: "reserved", until }`). The chessboard reads unit status, so the cell must turn "Бронь".
- **Reject double-booking:** if the unit is not `available`/`free`, return `{ success: false, message: "Лот уже забронирован" }` (the client shows `message` verbatim).
- `realtorId` should come from the JWT; `realtorName`/`agency` are display values.

---

## 4. MUST-HAVE — List bookings (developer panel + chessboard highlight)

`GET /api/development/bookings?complexId=…&status=…&page=1&limit=50`

| Query | Required | Notes |
|---|---|---|
| `complexId` | recommended | Scope to one ЖК (the panel is per-project). |
| `status` | no | One of `pending|booked|rejected|expired|paid`, or omit for all. |
| `page` / `limit` | no | Standard pagination. |

**Response:**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "66b0e1f2a4c3d5e6f7a8b9c0",
        "complexId": "698f3bc1336fbbb95257bca3",
        "buildingId": "6a21c84350ad6f56b866c001",
        "unitId": "6a21c84350ad6f56b866c123",
        "unitNumber": "104",
        "status": "pending",
        "realtorId": "65f0a1b2c3d4e5f6a7b8c9d0",
        "realtorName": "seal555",
        "agency": "Estate Group",
        "comment": "Клиент рассматривает ипотеку",
        "manager": "Михайлов О.П.",
        "startsAt": "2026-06-09T00:56:00.000Z",
        "expiresAt": "2026-06-12T00:56:00.000Z",
        "createdAt": "2026-06-09T00:56:00.000Z",
        "updatedAt": "2026-06-09T00:56:00.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "totalPages": 1
  }
}
```

- The developer panel renders one row per booking, with a live countdown to `expiresAt` for `pending` rows.
- The chessboard derives "highlight as Бронь" from `status === "pending"` and "Оплачено" from `status === "paid"` for the units in the current ЖК.

---

## 5. MUST-HAVE — Change booking status (confirm / reject / paid)

`PATCH /api/development/bookings/:id/status` — `application/json`

**Body:**

```jsonc
{
  "status": "booked",          // pending | booked | rejected | expired | paid
  "comment": "Договор подписан" // optional, mirrors developer popup textarea
}
```

**Response:** the updated booking (same shape as §3 `data`).

**Side effects (must update the unit):**

| New status | Unit status |
|---|---|
| `booked` | stays `reserved` |
| `rejected` | back to `available` |
| `expired` | back to `available` |
| `paid` | `sold` |

- The developer popup (`BookingsPanel` → `BookingPopup`) offers **Бронь** (`booked`) and **Отказ** (`rejected`) with an optional comment.
- `expired` is normally set **server-side** when `now > expiresAt` for a `pending` booking (a cron/lazy check). The client also detects expiry locally for the countdown UI, but the source of truth is the API.

---

## 6. NICE-TO-HAVE — Edit booking fields

`PATCH /api/development/bookings/:id` — partial body:

```jsonc
{
  "expiresAt": "2026-06-13T12:00:00.000Z", // extend the hold (InlineDateEdit)
  "manager": "Сергеева О.П.",              // responsible person (InlineTextEdit)
  "comment": "Ждём финального ответа"
}
```

Returns the updated booking. Extending `expiresAt` should also extend the unit's `reserved` `until`.

---

## 7. Error contract

On failure return `{ "success": false, "message": "..." }` (non-2xx is fine). The client surfaces `message` to the user, so make it descriptive:

- `"Лот уже забронирован"` — unit not available.
- `"Лот не найден"` / `"ЖК не найден"`.
- `"Недостаточно прав"` — realtor cannot change status (only developer/manager can confirm/reject).

---

## 8. What changes on the frontend once the API exists

Today the booking is **mocked in `localStorage`** and never reaches the backend:

- `UnitDetailModal.tsx` `onSubmit` writes a row into `localStorage[bookingsKey(projectId)]` (`developer.sales.bookings.v3.<projectId>`).
- `BookingsPanel.tsx` reads/writes that same key and seeds demo rows for `project-sample`.
- `InteractiveChessboard.tsx` reads that key to highlight `paid` / `in_progress` units.

When the endpoints land, we will:

1. Add `bookings` methods to `src/services/developmentApi.ts` (`createBooking`, `getBookings`, `updateBookingStatus`, `updateBooking`).
2. Replace the `localStorage` write in `UnitDetailModal` with `POST /bookings`.
3. Replace `BookingsPanel` storage with `GET /bookings` + `PATCH /bookings/:id/status`.
4. Replace the chessboard `localStorage` highlight source with `GET /bookings?complexId=…`.

The `localStorage` path can stay as an offline/demo fallback behind a feature flag.

---

## 9. Quick acceptance test

1. `POST /bookings` for a free unit → `201`, `data.status === "pending"`, and `GET /complexes/:id/chessboard` now reports that unit as `reserved`.
2. `GET /bookings?complexId=…` → the new booking appears with a future `expiresAt`.
3. `PATCH /bookings/:id/status { "status": "rejected" }` → unit returns to `available` on the chessboard.
4. `PATCH /bookings/:id/status { "status": "paid" }` → unit becomes `sold`.
5. Let a `pending` booking pass `expiresAt` → it flips to `expired` and the unit returns to `available`.

If all five pass, the booking modal, developer panel, and chessboard highlighting work against the real API.

# Booking apartments — backend implementation (how it really works)

This document describes the **server-side** implementation of apartment booking
(`бронирование квартир`) in `bz26-api-crm`: which collections are used, what
fields are written, the data flow, the unit-status side effects, and concrete
request/response examples.

It is the implementation companion to
[`frontend-requirements-for-booking.md`](./frontend-requirements-for-booking.md).

> Source files:
> - `src/modules/development/services/bookings.service.ts` — all booking logic + unit side-effects.
> - `src/modules/development/controllers/bookings.controller.ts` — the 5 HTTP routes.
> - `src/modules/development/development.module.ts` — wiring.
> - `src/modules/development/controllers/units.controller.ts` — chessboard mapping (`mapApartmentToUnit`, `mapApartmentStatus`).

---

## 1. Overview

A realtor sends a booking request from the chessboard → the booking is stored as
`pending` and the underlying apartment is flipped to `booked` (so the chessboard
shows it as reserved). The developer then confirms (`booked`), rejects
(`rejected`), or marks it `paid`; a `pending` booking past its deadline becomes
`expired` automatically. Each status change drives a matching apartment-status
side effect.

- **Prefix:** all routes live under `@Controller('development')` → `/api/development/...`
  (the global `/api` prefix is added by the reverse proxy in prod, or via
  `API_GLOBAL_PREFIX=api` locally).
- **Auth:** `JwtAuthGuard` on every route. The JWT payload is `{ id, role }`;
  `realtorId` is taken from `req.user.id`. Role is **not** enforced for status
  changes today (any authenticated user can confirm/reject) — see §8.
- **Envelope:** success → `{ "success": true, "data": ... }`, failure →
  `{ "success": false, "message": "..." }` (via `ResponseUtil`).

---

## 2. Collections used

### 2.1 `developmentbookings` (NEW — owned by this feature)

The booking records. Stored on the **platform** Mongo connection
(`MONGODB_PLATFORM_URI`), accessed as a raw collection (no Mongoose model),
consistent with how apartments are handled elsewhere in the module.

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | Booking id. |
| `complex` | ObjectId | The ЖК (`estates._id`). |
| `building` | ObjectId | The building (`estatebuildings._id`). |
| `unit` | ObjectId | The apartment (`estatenewconstructionsapartments._id`). |
| `unitNumber` | string \| null | Display label; falls back to `apartment.aptNum`. |
| `status` | string | `pending` \| `booked` \| `rejected` \| `expired` \| `paid`. Default `pending`. |
| `realtor` | ObjectId \| null | From the JWT (`req.user.id`). |
| `realtorName` | string \| null | Display override from the request body. |
| `agency` | string \| null | Display override from the request body. |
| `comment` | string \| null | Free text. |
| `manager` | string \| null | Responsible manager (set via edit). |
| `startsAt` | Date | Hold start; defaults to now. |
| `expiresAt` | Date | Hold deadline; defaults to `startsAt + 72h`. |
| `createdAt` | Date | |
| `updatedAt` | Date | |

> The collection is created lazily by MongoDB on first insert. No migration is
> required. If you want explicit indexes, add them on `complex`, `unit`, `status`.

### 2.2 `estatenewconstructionsapartments` (EXISTING — side-effect target)

The real apartments that the chessboard renders. Booking **writes** two fields
on this collection:

| Field | Written value | When |
|---|---|---|
| `status` | `'active'` / `'booked'` / `'sold'` | On every booking create / status change / expiry. |
| `reservedUntil` | Date (= booking `expiresAt`) | Set when `booked`; **unset** when released/sold. |
| `updatedAt` | now | Always. |

The chessboard maps `apartment.status` → unit status:

```62:69:src/modules/development/controllers/units.controller.ts
function mapApartmentStatus(status: string | undefined): UnitStatus {
  switch (status) {
    case 'active': return 'available';
    case 'sold': return 'sold';
    case 'booked': return 'reserved';
    default: return 'available';
  }
}
```

So `booked` apartment ⇒ chessboard cell `reserved` (Бронь). `reservedUntil` is
surfaced on the unit DTO too (added in `mapApartmentToUnit`).

> **Bookable rule:** a unit can only be booked when `apartment.status === 'active'`.
> Any other status (`booked`, `sold`, …) ⇒ `"Лот уже забронирован"`.
> Controlled by `BOOKABLE_APARTMENT_STATUSES` in the service.

---

## 3. Status model & side effects

| Booking status | Apartment `status` | Apartment `reservedUntil` | Chessboard cell |
|---|---|---|---|
| `pending` | `booked` | = `expiresAt` | reserved (Бронь) |
| `booked` | `booked` | = `expiresAt` | reserved (Бронь) |
| `rejected` | `active` | cleared | available |
| `expired` | `active` | cleared | available |
| `paid` | `sold` | cleared | sold |

The apartment update is atomic (`updateOne` with `$set` / `$unset`):

```277:291:src/modules/development/services/bookings.service.ts
  private async setApartmentStatus(
    unit: Types.ObjectId,
    status: 'active' | 'booked' | 'sold',
    reservedUntil?: Date,
  ): Promise<void> {
    const update: Record<string, any> = {
      $set: { status, updatedAt: new Date() },
    };
    if (status === 'booked' && reservedUntil) {
      update.$set.reservedUntil = reservedUntil;
    } else {
      update.$unset = { reservedUntil: '' };
    }
    await this.apartments.updateOne({ _id: unit }, update);
  }
```

---

## 4. Data flow

### Create
1. `POST /bookings` → validate `complexId`/`buildingId`/`unitId` are valid ObjectIds.
2. Load the apartment; 404-style error if missing/deleted (`"Лот не найден"`).
3. Reject if `apartment.status !== 'active'` (`"Лот уже забронирован"`).
4. Compute `startsAt` (body or now) and `expiresAt` (body or `startsAt + 72h`).
5. Insert the booking as `pending`.
6. Set apartment `status: 'booked'`, `reservedUntil: expiresAt`.
7. Return the booking DTO.

### List / Get (with lazy expiry)
- On `GET /bookings` and `GET /bookings/:id`, any `pending` booking whose
  `expiresAt` has passed is flipped to `expired` **and its apartment released**
  (`status: 'active'`, `reservedUntil` cleared) before responding. This is the
  source of truth for expiry — no cron is required.

### Status change
- `PATCH /bookings/:id/status` validates the target status, updates the booking
  (and optional `comment`), then applies the apartment side effect from §3.

### Edit fields
- `PATCH /bookings/:id` sets any of `expiresAt` / `manager` / `comment`.
  Extending `expiresAt` on a `pending`/`booked` booking also re-writes the
  apartment `reservedUntil`.

---

## 5. Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/development/bookings` | Create a booking request (`pending`). |
| `GET` | `/api/development/bookings` | List bookings (filter `complexId`, `status`; paginated). |
| `GET` | `/api/development/bookings/:id` | Single booking. |
| `PATCH` | `/api/development/bookings/:id/status` | Confirm / reject / mark paid. |
| `PATCH` | `/api/development/bookings/:id` | Edit `expiresAt` / `manager` / `comment`. |

The DTO returned by every endpoint (ObjectId refs emitted as hex strings):

```jsonc
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
  "manager": null,
  "startsAt": "2026-06-09T00:56:00.000Z",
  "expiresAt": "2026-06-12T00:56:00.000Z",
  "createdAt": "2026-06-09T00:56:00.000Z",
  "updatedAt": "2026-06-09T00:56:00.000Z"
}
```

---

## 6. Request / response examples

All requests carry `Authorization: Bearer <jwt>` and `Content-Type: application/json`.

### 6.1 Create a booking

```http
POST /api/development/bookings
```
```json
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

**201/200**
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

Side effect: apartment `6a21c84350ad6f56b866c123` → `status: "booked"`,
`reservedUntil: "2026-06-12T00:56:00.000Z"`. The chessboard now shows that cell
as reserved.

**Already booked**
```json
{ "success": false, "message": "Лот уже забронирован" }
```

### 6.2 List bookings

```http
GET /api/development/bookings?complexId=698f3bc1336fbbb95257bca3&status=pending&page=1&limit=50
```

| Query | Required | Notes |
|---|---|---|
| `complexId` | no | Scope to one ЖК. |
| `status` | no | One of `pending|booked|rejected|expired|paid`. |
| `page` / `limit` | no | Defaults `page=1`, `limit=50`, max `200`. |

```json
{
  "success": true,
  "data": {
    "items": [ { "id": "66b0e1f2a4c3d5e6f7a8b9c0", "status": "pending", "...": "..." } ],
    "total": 1,
    "page": 1,
    "totalPages": 1
  }
}
```

### 6.3 Get one

```http
GET /api/development/bookings/66b0e1f2a4c3d5e6f7a8b9c0
```
Returns `{ "success": true, "data": { ...booking } }`. Triggers lazy expiry if overdue.

### 6.4 Change status

```http
PATCH /api/development/bookings/66b0e1f2a4c3d5e6f7a8b9c0/status
```
```json
{ "status": "booked", "comment": "Договор подписан" }
```
Returns the updated booking. Side effects per §3
(`booked` keeps the unit reserved, `rejected`/`expired` release it, `paid` → sold).

### 6.5 Edit fields

```http
PATCH /api/development/bookings/66b0e1f2a4c3d5e6f7a8b9c0
```
```json
{
  "expiresAt": "2026-06-13T12:00:00.000Z",
  "manager": "Сергеева О.П.",
  "comment": "Ждём финального ответа"
}
```
Extending `expiresAt` also re-writes the apartment `reservedUntil`.

---

## 7. Error contract

Failures return `{ "success": false, "message": "..." }`. Known messages:

- `"Лот уже забронирован"` — apartment not `active`.
- `"Лот не найден"` — apartment missing/deleted.
- `"ЖК не найден"` / `"Корпус не найден"` — invalid `complexId` / `buildingId`.
- `"Бронь не найдена"` — invalid/unknown booking id.
- `"Недопустимый статус: …"` — bad `status` value.
- `"complexId, buildingId и unitId обязательны"` — missing create fields.

`BookingError`s are mapped to the envelope in the controller's `run()` helper;
unexpected errors return their `message`.

---

## 8. Notes, decisions & follow-ups

- **No role enforcement.** Any authenticated user can change status. To restrict
  confirm/reject/paid to developer/manager roles, gate on `req.user.role` in the
  controller and return `"Недостаточно прав"`.
- **Lazy expiry, not cron.** Expiry is resolved on read (`GET` list/one). If you
  need eager expiry (e.g. for reports that never list bookings), add a
  `@nestjs/schedule` cron calling the same release logic (`ScheduleModule` is
  already enabled app-wide).
- **Raw collection, not a Mongoose model.** Matches the module's existing style
  (`units.controller.ts`). Swap to `MongooseModule.forFeature` + a schema if you
  want validation/hooks.
- **Bookable statuses** are configurable via `BOOKABLE_APARTMENT_STATUSES` in the
  service — widen it if your "free" units use a status other than `active`.
- **72h policy** lives in `HOLD_WINDOW_MS`; `expiresAt` from the client is honored
  when provided.

---

## 9. Quick acceptance test

1. `POST /bookings` for an `active` unit → `data.status === "pending"`; the
   apartment becomes `booked` (chessboard shows reserved).
2. `GET /bookings?complexId=…` → the booking appears with a future `expiresAt`.
3. `PATCH /bookings/:id/status { "status": "rejected" }` → apartment back to
   `active` (available).
4. `PATCH /bookings/:id/status { "status": "paid" }` → apartment `sold`.
5. Let a `pending` booking pass `expiresAt`, then `GET /bookings` → it flips to
   `expired` and the apartment returns to `active`.

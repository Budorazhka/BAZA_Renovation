# Editing an Apartment & Attaching an Apartment Plan Image

This document explains how to edit a new-construction apartment (including ones that were imported from an Excel file) and how to attach an apartment **plan image** to it **in this API (`bz26-api-crm`)** — which requests to send and what responses to expect.

## Background

Apartments imported via the Excel upload (see `parsing-xls-to-add-apartments.md`) are stored as `EstateNewconstructionsApartment` documents (`estatenewconstructionsapartments` collection). After import, the spreadsheet only fills in data fields (floor, price, area, etc.) — it does **not** set an apartment plan image. Editing values and attaching a plan image are separate follow-up requests.

Key facts:

- The apartment id used by these endpoints is the **real Mongo `_id`** — exactly the `id` returned for each unit by the chessboard (`GET /api/development/complexes/:complexId/chessboard`).
- An apartment's plan image is a **single reference** (`imageFileId`) to a `CdnFile`. The image itself is uploaded earlier at the **building** level (into the building's `apartmentsPlansFiles` pool). Editing the apartment just points `imageFileId` at one of those already-uploaded `CdnFile` ids — there is no direct file upload on the apartment edit endpoint.

> The `/api` prefix is the production global prefix (same as the rest of the development API). Locally it depends on `API_GLOBAL_PREFIX`.

- Code: edit/read in `src/modules/development/controllers/units.controller.ts`; image upload in `src/modules/development/controllers/building-plans.controller.ts`.

---

## 1. Editing an apartment

### Endpoint

| Method | Path | Auth |
|---|---|---|
| `PATCH` | `/api/development/units/:id` | JWT (`JwtAuthGuard`) |

- `:id` must be a valid Mongo ObjectId. If it matches a real apartment, the update is applied to the platform DB. (A non-matching id falls back to the legacy in-memory mock unit store.)
- Body is `application/json`.
- This is a **partial update** — send only the fields you want to change. All fields are optional.

### Request body

| Field | Type | Validation / notes |
|---|---|---|
| `title` | string | Trimmed. |
| `aptNum` | string | Apartment number (the key the Excel importer matches on). Trimmed. |
| `price` | number | Coerced from string; must be numeric. |
| `price_old` | number | Coerced from string; must be numeric. |
| `price_sqm` | number | Coerced from string; must be numeric. |
| `currency` | string | Trimmed. |
| `rooms` | string (enum) | One of `RoomTypes`: `1+1`, `studio`, `2+1`, `1`, `2`, `3`, `3+1`, `4+1`, `4+`, `5+`, `more`. |
| `floor` | number | Coerced from string; must be numeric. |
| `area` | number | Coerced from string; must be numeric. |
| `livingArea` | number | Coerced from string; must be numeric. |
| `kitchenArea` | number | Coerced from string; must be numeric. |
| `balconyArea` | number | Coerced from string; must be numeric. |
| `renovation` | string (enum) | One of `RenovationTypes`: `shell_condition`, `white_box`, `green_box`, `standard`, `turnkey`, `cosmetic`, `designer`, `needs_repair`, `needs_capital_repair`. |
| `bathroomsCount` | number | Coerced from string; must be numeric. |
| `viewType` | string | Trimmed. |
| `promo` | boolean | Coerced from `true`/`"true"`/`"1"`. |
| `imageFileId` | string (MongoId) \| null | CdnFile id of the apartment plan image (see section 2). `null` or `""` clears it. |
| `status` | string (enum) | One of `StatusTypes`: `active`, `pending`, `draft`, `sold`, `booked`, `reserved`, `archived`, `deleted`, `under_moderation`, `completed`. |

`estate`, `building`, and `author` **cannot** be changed through this endpoint.

### Behavior

Only the provided fields are `$set` (or `$unset` for clearing `imageFileId`); `updatedAt` is refreshed automatically. The response is the updated apartment mapped to the same **Unit** shape the chessboard returns, with the plan image populated into `image`.

### Example — edit data fields

```bash
curl -X PATCH https://<host>/api/development/units/665f1234abcd5678ef90a1b2 \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{
        "price": 142000,
        "status": "booked",
        "renovation": "white_box",
        "rooms": "2+1"
      }'
```

### Response

Standard envelope; `data` is the updated unit:

```json
{
  "success": true,
  "data": {
    "id": "665f1234abcd5678ef90a1b2",
    "complexId": "665f0a...e1",
    "buildingId": "665f0b...c2",
    "sectionId": "665f0b...c2",
    "floor": 11,
    "number": "1107",
    "positionInFloor": 0,
    "rooms": 2,
    "roomsStr": "2+1",
    "area": 64.5,
    "price": 142000,
    "currency": "USD",
    "status": "reserved",
    "finishing": "whitebox",
    "windowsSide": "unknown",
    "layoutId": null,
    "image": {
      "id": "665fAAAA1111BBBB2222CCCC",
      "name": "Apartment 1107 plan",
      "mimeType": "image/png",
      "size": 0,
      "url": "https://coasts-cdn.fra1.digitaloceanspaces.com/newconstructions/apartment-plans/....png",
      "createdAt": "2026-06-05T16:20:00.000Z"
    },
    "createdAt": "2026-06-01T10:00:00.000Z",
    "updatedAt": "2026-06-05T16:20:00.000Z"
  }
}
```

> `status` and `finishing` are mapped to the chessboard Unit vocabulary (e.g. DB `booked` → `reserved`, `active` → `available`). The value you sent is what is stored in the DB.

### Example — clear several fields and change the number

Request:

```bash
curl -X PATCH https://<host>/api/development/units/665f1234abcd5678ef90a1b2 \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{
        "aptNum": "1108",
        "floor": 11,
        "area": 70,
        "livingArea": 41.2,
        "kitchenArea": 12.5,
        "balconyArea": 4.3,
        "price": 158000,
        "currency": "USD",
        "viewType": "sea",
        "promo": true
      }'
```

Response (`data`, abbreviated to the changed fields):

```json
{
  "success": true,
  "data": {
    "id": "665f1234abcd5678ef90a1b2",
    "number": "1108",
    "floor": 11,
    "area": 70,
    "price": 158000,
    "currency": "USD",
    "status": "available",
    "image": null,
    "updatedAt": "2026-06-05T17:02:11.300Z"
  }
}
```

### Error responses

All errors use the standard envelope `{ "success": false, "data": null, "message": "..." }`.

Bad numeric value — request:

```bash
curl -X PATCH https://<host>/api/development/units/665f1234abcd5678ef90a1b2 \
  -H "Authorization: Bearer <JWT>" -H "Content-Type: application/json" \
  -d '{ "price": "expensive" }'
```

Response:

```json
{ "success": false, "data": null, "message": "\"price\" must be a number, got \"expensive\"" }
```

Bad enum value:

```json
{ "success": false, "data": null, "message": "Invalid \"rooms\" value \"7+1\" (expected one of: 1+1, studio, 2+1, 1, 2, 3, 3+1, 4+1, 4+, 5+, more)" }
```

`imageFileId` that doesn't exist:

```json
{ "success": false, "data": null, "message": "imageFileId does not reference an existing file" }
```

Other messages: `Invalid imageFileId` (not a valid ObjectId), `No editable fields provided` (body had none of the recognized fields).

---

## 1b. Reading a single apartment

| Method | Path | Auth |
|---|---|---|
| `GET` | `/api/development/units/:id` | JWT (`JwtAuthGuard`) |

Returns the apartment mapped to the **Unit** shape, with the plan image populated into `image`.

Request:

```bash
curl https://<host>/api/development/units/665f1234abcd5678ef90a1b2 \
  -H "Authorization: Bearer <JWT>"
```

Response:

```json
{
  "success": true,
  "data": {
    "id": "665f1234abcd5678ef90a1b2",
    "complexId": "665f0a...e1",
    "buildingId": "665f0b...c2",
    "sectionId": "665f0b...c2",
    "floor": 11,
    "number": "1107",
    "positionInFloor": 0,
    "rooms": 2,
    "roomsStr": "2+1",
    "area": 64.5,
    "price": 142000,
    "currency": "USD",
    "status": "available",
    "finishing": "whitebox",
    "windowsSide": "unknown",
    "layoutId": null,
    "image": {
      "id": "665fAAAA1111BBBB2222CCCC",
      "name": "Apartment 1107 plan",
      "mimeType": "image/png",
      "size": 0,
      "url": "https://coasts-cdn.fra1.digitaloceanspaces.com/newconstructions/apartment-plans/....png",
      "createdAt": "2026-06-05T16:20:00.000Z"
    },
    "createdAt": "2026-06-01T10:00:00.000Z",
    "updatedAt": "2026-06-05T16:20:00.000Z"
  }
}
```

`image` is `null` until a plan image is attached (section 2).

---

## 2. Attaching an apartment plan image

Attaching a plan image is a **two-step** process, because the apartment edit endpoint only stores a reference id, not a file.

### Step 1 — Upload the plan image to the building

Upload the apartment plan image(s) into the building's `apartmentsPlansFiles` pool. This creates a `CdnFile` per image (real CDN upload) and stores the ids on the building.

| Method | Path | Auth | File field |
|---|---|---|---|
| `POST` | `/api/development/buildings/:buildingId/apartment-plans` | JWT | `apartmentsPlans` |

`multipart/form-data`, image types only (`jpeg/jpg/png/gif/webp`). Optional `apartmentsPlanMeta` gives each file a display name (same order as the files).

```bash
curl -X POST https://<host>/api/development/buildings/665f0b...c2/apartment-plans \
  -H "Authorization: Bearer <JWT>" \
  -F "apartmentsPlans=@apt-1107-plan.png" \
  -F "apartmentsPlanMeta=Apartment 1107 plan"
```

Response includes the newly created files with their `CdnFile` ids:

```json
{
  "success": true,
  "data": {
    "buildingId": "665f0b...c2",
    "uploaded": [
      {
        "id": "665fAAAA1111BBBB2222CCCC",
        "name": "Apartment 1107 plan",
        "type": "image/png",
        "url": "https://coasts-cdn.fra1.digitaloceanspaces.com/newconstructions/apartment-plans/....png",
        "createdAt": "2026-06-05T16:20:00.000Z"
      }
    ]
  }
}
```

You can also read the full pool back later via `GET /api/development/buildings/:buildingId/plans`.

Request:

```bash
curl https://<host>/api/development/buildings/665f0b...c2/plans \
  -H "Authorization: Bearer <JWT>"
```

Response (`apartmentsPlansFiles` holds the ids you can attach):

```json
{
  "success": true,
  "data": {
    "buildingId": "665f0b...c2",
    "floorPlansFiles": [],
    "apartmentsPlansFiles": [
      {
        "id": "665fAAAA1111BBBB2222CCCC",
        "name": "Apartment 1107 plan",
        "type": "image/png",
        "url": "https://coasts-cdn.fra1.digitaloceanspaces.com/newconstructions/apartment-plans/....png",
        "createdAt": "2026-06-05T16:20:00.000Z"
      }
    ],
    "floorPlansData": []
  }
}
```

> See `creating-floorplans-and-apartment-plans.md` for full details on the building plan endpoints (list/upload/delete and the interactive floor map).

### Step 2 — Point the apartment at that CdnFile

Set `imageFileId` on the apartment to the chosen `CdnFile` id using the edit endpoint from section 1:

```bash
curl -X PATCH https://<host>/api/development/units/665f1234abcd5678ef90a1b2 \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{ "imageFileId": "665fAAAA1111BBBB2222CCCC" }'
```

Response — the updated unit, now with `image` populated to the full file:

```json
{
  "success": true,
  "data": {
    "id": "665f1234abcd5678ef90a1b2",
    "buildingId": "665f0b...c2",
    "floor": 11,
    "number": "1107",
    "image": {
      "id": "665fAAAA1111BBBB2222CCCC",
      "name": "Apartment 1107 plan",
      "mimeType": "image/png",
      "size": 0,
      "url": "https://coasts-cdn.fra1.digitaloceanspaces.com/newconstructions/apartment-plans/....png",
      "createdAt": "2026-06-05T16:20:00.000Z"
    },
    "updatedAt": "2026-06-05T17:10:42.118Z"
  }
}
```

The chessboard will also return this image for the unit on the next fetch.

### Detaching the image

Send `"imageFileId": null` (or `""`) to clear it.

Request:

```bash
curl -X PATCH https://<host>/api/development/units/665f1234abcd5678ef90a1b2 \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{ "imageFileId": null }'
```

Response (`image` is now `null`):

```json
{
  "success": true,
  "data": {
    "id": "665f1234abcd5678ef90a1b2",
    "number": "1107",
    "image": null,
    "updatedAt": "2026-06-05T17:12:05.901Z"
  }
}
```

---

## Typical flow after an Excel import

```
1. POST  /api/development/units/upload-excel                     → bulk create/update apartments (no plan image)
2. POST  /api/development/buildings/:buildingId/apartment-plans  → upload apartment plan image(s) (field: apartmentsPlans)
3. GET   /api/development/buildings/:buildingId/plans            → read back apartmentsPlansFiles to get a CdnFile id
4. PATCH /api/development/units/:id                              → edit fields and/or set imageFileId
```

## Endpoint summary

| Action | Method & path | Body | Response |
|---|---|---|---|
| Edit apartment fields | `PATCH /api/development/units/:id` | JSON (apartment edit body) | Updated unit |
| Read apartment (image populated) | `GET /api/development/units/:id` | — | Unit with `image` populated |
| Upload plan image to building | `POST /api/development/buildings/:buildingId/apartment-plans` | multipart (`apartmentsPlans`) | Uploaded files with `CdnFile` ids |
| List building plans | `GET /api/development/buildings/:buildingId/plans` | — | `floorPlansFiles` / `apartmentsPlansFiles` / `floorPlansData` |
| Attach plan image to apartment | `PATCH /api/development/units/:id` | JSON (`{ "imageFileId": "<CdnFile id>" }`) | Updated unit |

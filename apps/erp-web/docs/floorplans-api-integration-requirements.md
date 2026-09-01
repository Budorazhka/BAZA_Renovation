# Floor Plans — API-Side Integration Requirements

This document lists exactly what the API (`bz26-api-crm`) must provide so the **Поэтажные планы** (floor plan editor) feature in the ERP client works end-to-end: uploading a floor image, drawing clickable apartment polygons, persisting them, and re-displaying everything after reload.

It is the backend-facing companion to [`creating-floorplans-and-apartment-plans.md`](./creating-floorplans-and-apartment-plans.md) (which describes the endpoints) — here we pin down the **exact shapes the frontend sends and depends on**, plus the gotchas that make a plan look "not saved".

> Frontend code: `src/services/developmentApi.ts` (HTTP), `src/store/useCoreStore.ts` (upload/persist/load + encode/decode), `src/components/inventory/FloorPlanEditor.tsx` (UI).

---

## 0. Route prefix (confirm first)

The client calls everything under **`/api/development/...`** (to match the rest of `developmentApi.ts`):

```
GET    /api/development/buildings/:buildingId/plans
POST   /api/development/buildings/:buildingId/floor-plans
PUT    /api/development/buildings/:buildingId/floormap
DELETE /api/development/buildings/:buildingId/floor-plans/:fileId
DELETE /api/development/buildings/:buildingId/floormap/:floorNum
POST   /api/development/buildings/:buildingId/apartment-plans
DELETE /api/development/buildings/:buildingId/apartment-plans/:fileId
```

The reference doc lists them as `/development/buildings/...` (no `/api`), but **production runs with the `/api` prefix**, so the client paths above are correct as-is. **Resolved — no change needed.**

- All requests send `Authorization: Bearer <jwt>`.
- All responses use the standard envelope: `{ "success": true, "data": ... }` or `{ "success": false, "message": "..." }`.
- The building must belong to the authenticated user, otherwise return an error (e.g. `Building not found`).

---

## 1. MUST-HAVE — Upload floor plan image

`POST /api/development/buildings/:buildingId/floor-plans` — `multipart/form-data`

What the frontend sends:

| Form field | Value |
|---|---|
| `floorPlans` | the image file (currently one per request) |
| `floorPlanMeta` | display name string, e.g. `"Floor 15"` |

Required response shape:

```json
{
  "success": true,
  "data": {
    "buildingId": "…",
    "uploaded": [
      {
        "id": "<CdnFile _id>",
        "name": "Floor 15",
        "type": "image/png",
        "url": "https://cdn…/uuid.png",
        "createdAt": "…"
      }
    ]
  }
}
```

**Critical:**
- `uploaded[0].id` is reused immediately as `imageId` in the `floormap` call — it **must** be the persistent `CdnFile` `_id`.
- `uploaded[0].url` is rendered directly as `<img src>`. It must be a **publicly fetchable** URL. Otherwise the plan shows during the session (base64 fallback) but breaks after reload.
- Allowed image types: `jpeg`, `jpg`, `png`, `gif`, `webp`.

> **CDN / CORS — resolved.** Uploads use the existing `CdnUploadService` with `ACL: 'public-read'` on DigitalOcean Spaces, and the chessboard already serves these same `coasts-cdn` URLs as `<img src>` in production — so public fetchability is proven. The editor only **renders** the image (`<img src>` + `naturalWidth/naturalHeight` on load); it never `fetch()`es the image bytes, so **bucket-level CORS is not required** for this feature. (CORS would only matter if the client later reads pixels / fetches bytes directly.)

---

## 2. MUST-HAVE — Upsert interactive floor map

`PUT /api/development/buildings/:buildingId/floormap` — `application/json`

Body the frontend sends:

```json
{
  "imageId": "<CdnFile _id from step 1>",
  "floorNum": "15",
  "apartments": ["1501|available|0.12,0.10,0.40,0.10,0.40,0.55"]
}
```

| Field | Required | Type | Notes |
|---|---|---|---|
| `imageId` | yes | MongoId | A `CdnFile` `_id` (the floor image from the upload step). |
| `floorNum` | yes | string | Floor identifier, e.g. `"15"`. |
| `apartments` | no | string[] | Encoded apartment polygons (format below). |

### Apartment string format (frontend encode/decode contract)

```
<aptNumber>|<status>|x1,y1,x2,y2,…
```

- Coordinates are **`0..1` fractions** (relative to the image), paired as `x,y` and flattened. Rounded to 5 decimals.
- `aptNumber` = the unit's `number`. On load the frontend re-matches polygons to units **by this number**, so it must equal `unit.number`.
- `status` values the frontend **writes**: `available` | `reserved` | `sold` | `hidden`.
  When **reading**, the frontend also tolerates `active` / `free` / `booked` / `withdrawn`.
  Mapping used in the client:

  | UI status | written as |
  |---|---|
  | free (В продаже) | `available` |
  | booked (Бронь) | `reserved` |
  | sold (Продано) | `sold` |
  | withdrawn (Снято) | `hidden` |

  If the public portal expects a different vocabulary, flag it and the client mapping will be adjusted.

### Behavior

Upsert by `buildingId + floorNum` (no duplicate floor entries). The frontend does **not** depend on the PUT response body, but returning the saved `floor-plans-data` entry is fine.

---

## 3. MUST-HAVE — Read all plans (makes plans survive reload)

`GET /api/development/buildings/:buildingId/plans`

Response:

```json
{
  "success": true,
  "data": {
    "buildingId": "…",
    "floorPlansFiles": [
      { "id": "…", "name": "Floor 15", "type": "image/png", "url": "https://…", "createdAt": "…" }
    ],
    "apartmentsPlansFiles": [],
    "floorPlansData": [
      {
        "id": "…",
        "floorNum": "15",
        "imageId": "…",
        "image": { "id": "…", "name": "Floor 15", "type": "image/png", "url": "https://…", "createdAt": "…" },
        "apartments": ["1501|available|0.12,0.10,…"]
      }
    ]
  }
}
```

**Critical — the most common reason a saved plan looks "not saved":**
- `floorPlansData[].image` **must be the resolved `CdnFile`** (with `url`), not just an id.
- On load, the frontend keeps a `floorPlansData` entry **only if `image.url` is non-empty**. If you return `imageId` but leave `image` null/unpopulated, saved plans will **not reappear after refresh**.
- Please `.populate('imageId')` (or equivalent) into `image`.

If the building has no plans yet, return `success: true` with empty arrays. A `404` is also acceptable — the client treats it as empty.

> **Ordering — not significant.** `floorPlansData` may be returned in any order (the API currently sorts `floorNum` lexically, e.g. `"10"` before `"2"`). The client sorts floors numerically on its side and re-matches polygons by `unit.number`, so no numeric sort is required in the response.

---

## 4. Nice-to-have (client methods exist; UI not calling them yet)

| Method | Path | Response |
|---|---|---|
| `DELETE` | `/api/development/buildings/:buildingId/floor-plans/:fileId` | `{ success, data: { buildingId, fileId, deleted: true } }` |
| `DELETE` | `/api/development/buildings/:buildingId/floormap/:floorNum` | `{ success, data: { buildingId, floorNum, deleted: true } }` |
| `POST` | `/api/development/buildings/:buildingId/apartment-plans` | Same as floor-plans upload; fields `apartmentsPlans` / `apartmentsPlanMeta`. |
| `DELETE` | `/api/development/buildings/:buildingId/apartment-plans/:fileId` | Same as floor-plan delete. |

---

## 5. Error contract

On failure return `{ "success": false, "message": "..." }` (a non-2xx status is fine). The client surfaces `message` **verbatim** in the red status banner of the editor, so a descriptive message (`"Building not found"`, `"Invalid image type"`, …) is shown directly to the user.

---

## 6. Quick acceptance test

1. `POST .../floor-plans` with one PNG and `floorPlanMeta=Floor 15` → response contains `uploaded[0].id` + a public `url`.
2. `PUT .../floormap` with that `imageId`, `floorNum: "15"`, `apartments: []` → `200`.
3. `GET .../plans` → `floorPlansData[0].image.url` equals the same public URL, and `floorPlansData[0].apartments` round-trips what was sent.

If all three pass, the editor shows the green **"План этажа N загружен и сохранён"** banner and the plan persists across reloads.

---

## 6a. Layouts (планировки) — "Complex not found" ⚠️

The **Планировки → Библиотека** tab uses the layouts CRUD from `api-zapros.md` §5. The routes **exist** on `api-crm.baza.sale`, but `POST` is rejected with a structured 404 whose message is **`"Complex <id> not found"`** — for the *same* `complexId` that the chessboard endpoint resolves successfully:

```
POST https://api-crm.baza.sale/api/development/layouts → 404
{ "success": false, "message": "Complex 6a21c84350ad6f56b866bfd7 not found" }

# …yet this works for the exact same id:
GET  https://api-crm.baza.sale/api/development/complexes/6a21c84350ad6f56b866bfd7/chessboard → 200
```

**Backend action:** the layouts module must resolve the complex from the same source/collection as the chessboard (or accept the same id). Today a complex that exists for `/complexes/:id/chessboard` is reported "not found" by `/layouts`. The client sends `complexId = activeProjectId` (the id from `GET /complexes`), which is what the chessboard uses.

> Also: layout records returned by `GET /layouts` currently carry placeholder image URLs like `https://cdn.example.com/dev/layouts/.../plan.png` (unresolvable host). The client now hides broken images behind the "Нет изображения" placeholder, but these seed URLs should be replaced with real CDN URLs (or `plan` left empty).

Required endpoints (must be mounted under the same `/api/development` prefix as the chessboard):

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/development/layouts` | Query `complexId`, `page`, `limit`, … → `{ success, data: { items: Layout[], total, page, totalPages } }` |
| `POST` | `/api/development/layouts` | Body below → `{ success, data: Layout }` |
| `PATCH` | `/api/development/layouts/:id` | Partial body → `{ success, data: Layout }` |
| `DELETE` | `/api/development/layouts/:id` | → `{ success, data: { deleted: true } }` |

**POST/PATCH body the client now sends** (aligned to `api-zapros.md`):

```jsonc
{
  "complexId": "…",
  "buildingId": "…",   // extra, for building-scoped libraries; ignore if unused
  "name": "studio",
  "rooms": 0,            // number (Студия → 0)
  "area": 30,
  "isEuro": false,
  "tags": [],
  "planFileId": "<CdnFile _id>"   // from the image upload; optional
}
```

- `planFileId` is the `id` returned by the apartment-plans upload (`POST .../apartment-plans` → `uploaded[0].id`). The client uploads the plan image first, then sends its id here.
- On read, the client expects the layout's image at `layout.plan.url` (resolved file) — please populate it, same as floor plans (§3).
- Errors are now surfaced **verbatim** in the modal, so return `{ success:false, message }` with a useful message.

> Until these routes exist, the layout library shows mock cards and saving will show a red error in the modal.

| Action | Collections written |
|---|---|
| Upload floor/apartment plan image | `cdn_files` (one per file) + `estatebuildings` (`floorPlansFiles` / `apartmentsPlansFiles`) |
| Delete plan image | `cdn_files` (removed) + `estatebuildings` (array pull) |
| Floor map upsert | `floor-plans-data` (upsert by `buildingId` + `floorNum`) + `estatebuildings` (`floorPlansData` array, `$addToSet`) |
| Floor map delete | `floor-plans-data` (removed) + `estatebuildings` (array pull) |

# Creating Floor Plans & Apartment Plans

This document explains how floor plans and apartment plans are created/updated **in this API (`bz26-api-crm`)**, which endpoints to use, and exactly what each request expects and returns.

There are **three distinct things** that often get confused. They are stored differently and created through different endpoints.

| Concept | Field on building | What it is | How it's sent |
|---|---|---|---|
| **Floor plan images** | `floorPlansFiles` | Plain images of a floor's layout (one image per floor plan). | Uploaded as files in the `floorPlans` form field. |
| **Apartment plan images** | `apartmentsPlansFiles` | Plain images of a single apartment's layout. | Uploaded as files in the `apartmentsPlans` form field. |
| **Interactive floor map** | `floorPlansData` | Structured per-floor data: floor number + image + clickable apartment polygons. | Sent as JSON to the `floormap` endpoint (the image must already exist on the CDN). |

All three live on the `estatebuildings` collection. Floor/apartment plan images create `cdn_files` records; the interactive floor map creates `floor-plans-data` records.

> **Auth & ownership:** every endpoint below requires a `Bearer` JWT. The building must belong to the authenticated user (`estatebuildings.author === user.id`), otherwise you get `Building not found`.

> **Responses** follow the standard envelope: `{ "success": true, "data": ... }` on success and `{ "success": false, "message": "..." }` on error.

---

## Endpoint summary

| Method | Path | Body type | Purpose |
|---|---|---|---|
| `GET` | `/development/buildings/:buildingId/plans` | — | Read all plans (floor plan images, apartment plan images, interactive floor maps). |
| `POST` | `/development/buildings/:buildingId/floor-plans` | multipart | Upload floor plan images. |
| `POST` | `/development/buildings/:buildingId/apartment-plans` | multipart | Upload apartment plan images. |
| `DELETE` | `/development/buildings/:buildingId/floor-plans/:fileId` | — | Remove a floor plan image. |
| `DELETE` | `/development/buildings/:buildingId/apartment-plans/:fileId` | — | Remove an apartment plan image. |
| `PUT` | `/development/buildings/:buildingId/floormap` | JSON | Upsert the interactive floor map for one floor. |
| `DELETE` | `/development/buildings/:buildingId/floormap/:floorNum` | — | Remove the interactive floor map for one floor. |

Allowed image types: `jpeg`, `jpg`, `png`, `gif`, `webp`.

---

## 1. Read all plans

### `GET /development/buildings/:buildingId/plans`

Returns everything attached to the building, with CDN files resolved to `{ id, name, type, url, createdAt }`.

#### Response

```json
{
  "success": true,
  "data": {
    "buildingId": "698de1b9967ca39a0aa7f9d6",
    "floorPlansFiles": [
      {
        "id": "665f...",
        "name": "Floor 3",
        "type": "image/png",
        "url": "https://coasts-cdn.fra1.digitaloceanspaces.com/newconstructions/floor-plans/uuid.jpg",
        "createdAt": "2026-06-04T10:00:00.000Z"
      }
    ],
    "apartmentsPlansFiles": [
      { "id": "665f...", "name": "Studio 28m2", "type": "image/png", "url": "https://...", "createdAt": "..." }
    ],
    "floorPlansData": [
      {
        "id": "667a...",
        "floorNum": "3",
        "imageId": "665f...",
        "image": { "id": "665f...", "name": "Floor 3", "type": "image/png", "url": "https://...", "createdAt": "..." },
        "apartments": ["301|active|10,10,200,10,200,200", "302|sold|..."]
      }
    ]
  }
}
```

---

## 2. Floor plan images & apartment plan images

These are uploaded as `multipart/form-data`. Each file is uploaded to the CDN, a `cdn_files` record is created per file, and the resulting ObjectIds are appended to the building's `floorPlansFiles` / `apartmentsPlansFiles` array (existing files are kept — uploads are additive).

### `POST /development/buildings/:buildingId/floor-plans`

| Form field | Type | Required | Goes to |
|---|---|---|---|
| `floorPlans` | image files (one or many) | yes | `floorPlansFiles` (via CdnFile) |
| `floorPlanMeta` | string or string[] | no | Display names, same order as the files. Falls back to the file's `originalname`. |

### `POST /development/buildings/:buildingId/apartment-plans`

| Form field | Type | Required | Goes to |
|---|---|---|---|
| `apartmentsPlans` | image files (one or many) | yes | `apartmentsPlansFiles` (via CdnFile) |
| `apartmentsPlanMeta` | string or string[] | no | Display names, same order as the files. Falls back to the file's `originalname`. |

#### What each uploaded file becomes (`cdn_files`)

```typescript
{
  name: string;   // from *Meta field, or the file's originalname
  type: string;   // mimetype, e.g. "image/png"
  url: string;    // CDN URL after upload
  createdAt: Date;
}
```

#### Response

```json
{
  "success": true,
  "data": {
    "buildingId": "698de1b9967ca39a0aa7f9d6",
    "uploaded": [
      {
        "id": "665f...",
        "name": "Floor 3",
        "type": "image/png",
        "url": "https://coasts-cdn.fra1.digitaloceanspaces.com/newconstructions/floor-plans/uuid.jpg",
        "createdAt": "2026-06-04T10:00:00.000Z"
      }
    ]
  }
}
```

#### Example

```bash
curl -X POST https://<host>/development/buildings/<buildingId>/floor-plans \
  -H "Authorization: Bearer <JWT>" \
  -F "floorPlans=@floor3.png" \
  -F "floorPlans=@floor4.png" \
  -F "floorPlanMeta=Floor 3" \
  -F "floorPlanMeta=Floor 4"
```

### Deleting plan images

| Method | Path | Purpose |
|---|---|---|
| `DELETE` | `/development/buildings/:buildingId/floor-plans/:fileId` | Remove the ref from `floorPlansFiles` and delete the `cdn_files` record. |
| `DELETE` | `/development/buildings/:buildingId/apartment-plans/:fileId` | Same for `apartmentsPlansFiles`. |

`:fileId` is the `CdnFile` `_id` (the `id` returned on upload / in `GET .../plans`).

#### Response

```json
{ "success": true, "data": { "buildingId": "698d...", "fileId": "665f...", "deleted": true } }
```

---

## 3. Interactive floor map (`floorPlansData`)

The structured, clickable floor map — a specific floor's image plus polygon coordinates for each apartment on that floor (so the frontend can highlight/click apartments by status).

It is **not** created during image upload. It has its own endpoint, and the floor image must already exist as a `CdnFile` (typically a `floorPlans` file you uploaded earlier — reuse its `id`).

### `PUT /development/buildings/:buildingId/floormap`

#### Request body (`application/json`)

```typescript
{
  imageId: string;        // required, MongoId — a CdnFile _id (the floor's image)
  floorNum: string;       // required — e.g. "3"
  apartments?: string[];  // optional — apartment polygons (see format)
}
```

| Field | Required | Type | Notes |
|---|---|---|---|
| `imageId` | yes | MongoId | Must reference an existing `CdnFile` (the floor image). |
| `floorNum` | yes | string | Floor identifier, e.g. `"3"`, `"8"`. |
| `apartments` | no | string[] | Each string encodes `aptNum | status | polygon`, e.g. `"301|active|x1,y1,x2,y2,..."`. |

#### Behavior (upsert)

1. Finds-or-creates a `floor-plans-data` document keyed by `buildingId` + `floorNum`.
2. Sets `imageId`.
3. If `apartments` is provided it is set; on first insert it defaults to `[]` when omitted.
4. `$addToSet`s the entry's id onto the building's `floorPlansData` array (no duplicates).

Calling the endpoint again for the same floor **updates** that floor's entry rather than creating a duplicate.

#### Response

```json
{
  "success": true,
  "data": {
    "id": "667a...",
    "buildingId": "698de1b9967ca39a0aa7f9d6",
    "floorNum": "3",
    "imageId": "665f...",
    "apartments": ["301|active|10,10,200,10,200,200", "302|sold|..."]
  }
}
```

#### Example

```bash
curl -X PUT https://<host>/development/buildings/<buildingId>/floormap \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{
        "imageId": "665f...cdnFileId",
        "floorNum": "3",
        "apartments": ["301|active|10,10,200,10,200,200,10,200", "302|sold|..."]
      }'
```

### `DELETE /development/buildings/:buildingId/floormap/:floorNum`

Removes the `floor-plans-data` entry for that floor and pulls its id from the building's `floorPlansData` array.

```json
{ "success": true, "data": { "buildingId": "698d...", "floorNum": "3", "deleted": true } }
```

---

## How this connects to the chessboard

The chessboard endpoint (`GET /development/complexes/:complexId/chessboard`) exposes a `planUrl` per floor. It resolves it in this order:

1. From `floor-plans-data` (the interactive floor map) — matched by `buildingId` + `floorNum`.
2. **Fallback:** from `floorPlansFiles` — the floor number is parsed from the CDN file `name` (e.g. `"Floor 3"` → floor `3`).

So uploading floor plan images via `POST .../floor-plans` with a name that contains the floor number is enough to populate `planUrl`; the `floormap` endpoint additionally adds the clickable apartment polygons.

---

## Collections touched

| Endpoint | Collections written |
|---|---|
| Upload floor/apartment plan images | `cdn_files` (one per file) + `estatebuildings` (`floorPlansFiles` / `apartmentsPlansFiles`) |
| Delete plan image | `cdn_files` (removed) + `estatebuildings` (array pull) |
| Floor map upsert | `floor-plans-data` (upsert) + `estatebuildings` (`floorPlansData` array) |
| Floor map delete | `floor-plans-data` (removed) + `estatebuildings` (array pull) |

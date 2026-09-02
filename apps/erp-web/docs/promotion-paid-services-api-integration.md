# Paid Services (Продвижение) — API Integration Requirements

This document describes the **Продвижение / Paid Services** page in the ERP client and the
API contract needed to move it off `localStorage` and onto the backend (`bz26-api-crm`).

It pins down **exactly what the frontend sends** and **the response shape it depends on** to
render the activation table (active state, countdown, price, per-service config).

> Frontend code:
> - UI: `src/pages/development/SalesPromotionPage.tsx`
> - Storage / domain model (today: `localStorage`, to be replaced by HTTP): `src/lib/promoActivations.ts`
> - HTTP client + envelope: `src/services/developmentApi.ts`
> - Promotion badges already live on the estate document: `src/schemas/estates.schema.ts`

---

## 0. Conventions

- Base URL: `CRM_API_BASE_URL` (`src/config/backend.ts`); all paths below are under **`/api/development/...`** to match the rest of `developmentApi.ts`.
- All requests send `Authorization: Bearer <jwt>`.
- Standard envelope (already typed as `ApiResponse<T>`):

```jsonc
{ "success": true,  "data": { /* ... */ } }
{ "success": false, "message": "Human-readable error shown verbatim in the UI" }
```

- A promotion is **scoped to one complex/estate** (`complexId`). On the page this is the
  selected project (`project._id` from `GET /api/development/projects`). Confirm whether the
  promotion should attach to the **complex id** or the underlying **estate `_id`** — the client
  currently keys everything by the selected project id.

---

## 1. Service catalog (source of truth: frontend)

The catalog is currently hardcoded in `SalesPromotionPage.tsx` (`SERVICE_GROUPS`). The API only
needs to **accept these `serviceId`s** and store activations against them. Prices are **per 24h in USD**.

| Group | `serviceId` | Label | Price / 24h | Config required |
|---|---|---|---|---|
| `visibility` | `boost` | Поднять в выдаче | `$1` | — |
| `visibility` | `top4_main` | Топ-4 на главной | `$1` | — |
| `visibility` | `main_banner` | Большой баннер на главной | `$5` | — |
| `visibility` | `map_marker` | Отметка с графиком на карте | `$3` | — |
| `sections` | `section_promo` | Раздел «Акции» | `$1` | — |
| `sections` | `section_invest` | Раздел «Для инвесторов» | `$2` | — |
| `sections` | `section_launch` | Раздел «Старт продаж» | `$1` | — |
| `card` | `custom_text` | Надпись на карточке | `$10` | `config` = free text, **max 12 chars** |
| `card` | `object_mark` | Метка на объекте | `$1` | `config` = one of the marks below |
| `brand` | `white_header` | Белый хедер | `$10` | — |
| `brand` | `developer_logo` | Логотип застройщика в хедере | `$5` | — |
| `brand` | `realtor_outreach` | Обращение к риелторам | `$10` | handled via **Рассылки** (broadcasts), not this endpoint |

`object_mark` allowed `config` values: `Супер цена`, `Хит продаж`, `Новинка`, `Последние лоты`, `Скидка`, `Подарок при покупке`.

> `realtor_outreach` is a special case: the "Активировать" button **navigates to the broadcasts page**
> (`/dashboard/development/management/broadcasts`) instead of calling activate. It is listed here only
> for catalog completeness.

### How active promotions render on the complex card (visual rules)

The complex card (`src/components/ui/ComplexCard.tsx`, used on both **Объекты (ЖК)**
`/dashboard/development/projects` and **Новостройки**) shows a **limited, fixed set** of
visual elements derived from the active `promotions`. Mapping lives in
`src/lib/promotionBadges.ts`.

**Hard limit: at most 2 badges over the photo + 1 text on the right.**

| Slot | Driven by service | Rendered as | Text source |
|---|---|---|---|
| Image badge #1 | `boost` | «ТОП» badge (gold, Crown icon) | fixed label |
| Image badge #2 | `object_mark` | colored mark badge (Flame icon) | `config` (e.g. «Супер цена», «Хит продаж», …) |
| Right-side text | `custom_text` | large tilted colored text on the right of the card | `config` (≤12 chars) |

Rules:
- **Only `boost` and `object_mark`** produce badges over the photo. Max 2 (`MAX_CARD_BADGES`), de-duplicated; if more were somehow active, extras are dropped.
- **All other services do NOT appear as card badges** — `top4_main`, `main_banner`, `section_promo`, `section_invest`, `section_launch`, `map_marker`, `white_header`, `developer_logo`, `realtor_outreach`. They affect placement *outside* the card (homepage top-4 / banner, thematic sections, map, branding) and are honoured by the public portal, not by this card.
- **`custom_text`** is never a badge — it renders as the single big text on the right side (color/angle are global constants `PROMO_TEXT_COLOR` / `PROMO_TEXT_ANGLE` in `ComplexCard.tsx`). Only the first active `custom_text` is used.
- Expired activations (`expiresAt <= now`) are ignored for all of the above.

### Durations & pricing

Source: `PROMO_DURATIONS` in `src/lib/promoActivations.ts`.

| `durationId` | Label | Hours | Price factor |
|---|---|---|---|
| `24h` | 24 ч | 24 | ×1 |
| `48h` | 48 ч | 48 | ×2 |
| `7d` | 7 дн | 168 | ×7 |
| `30d` | 30 дн | 720 | ×30 |

**Charged amount** = `pricePer24h × factor`. The backend should compute and return the charged
price authoritatively (the client renders `data.priceUsd`), but it must match this table.

**Min lock:** after activation a service cannot be cancelled for **24h** (`PROMO_MIN_LOCK_MS`).
The client hides the "Отключить" button during the lock; the API should also reject early
deactivation (see §5).

---

## 2. GET — active promotions for a complex

`GET /api/development/complexes/:complexId/promotions`

Returns every currently-active (non-expired) promotion for the complex. Used to hydrate the table
on load (active badge + countdown + per-service config + chosen duration).

Response:

```jsonc
{
  "success": true,
  "data": {
    "complexId": "6a21c84350ad6f56b866bfd7",
    "activations": [
      {
        "id": "65f...",            // activation record id (needed for deactivate)
        "serviceId": "boost",
        "durationId": "24h",
        "priceUsd": 1,
        "activatedAt": "2026-06-06T19:48:00.000Z",
        "expiresAt":  "2026-06-07T19:48:00.000Z",
        "config": null              // string for custom_text / object_mark, else null/absent
      },
      {
        "id": "65f...",
        "serviceId": "custom_text",
        "durationId": "7d",
        "priceUsd": 70,
        "activatedAt": "2026-06-06T10:00:00.000Z",
        "expiresAt":  "2026-06-13T10:00:00.000Z",
        "config": "СУПЕР ЦЕНА"
      }
    ]
  }
}
```

**Critical for the UI:**
- `expiresAt` drives the live countdown (`formatCountdown`). It **must** be an ISO timestamp.
- `activatedAt` is used to compute the 24h cancel-lock window client-side.
- `config` must round-trip exactly for `custom_text` (the overlay text) and `object_mark` (the chosen mark).
- Expired activations should **not** be returned (or the client filters them, but please drop them server-side).
- No promotions → `success: true` with `activations: []`. A `404` is also tolerated as "empty".

---

## 3. POST — activate a service

`POST /api/development/complexes/:complexId/promotions`

Body the frontend sends:

```jsonc
{
  "serviceId": "custom_text",   // one of the catalog ids in §1
  "durationId": "7d",           // one of 24h | 48h | 7d | 30d
  "config": "СУПЕР ЦЕНА"        // required only for custom_text (≤12 chars) and object_mark (from the allowed list); omit otherwise
}
```

| Field | Required | Type | Notes |
|---|---|---|---|
| `serviceId` | yes | string | Must be a known catalog id. |
| `durationId` | yes | enum | `24h` \| `48h` \| `7d` \| `30d`. |
| `config` | conditional | string | Required for `custom_text` (max 12 chars) and `object_mark` (must be an allowed mark). Ignored for others. |

Desired response — the **created activation record** (same shape as one element of §2 `activations`):

```jsonc
{
  "success": true,
  "data": {
    "id": "65f...",
    "serviceId": "custom_text",
    "durationId": "7d",
    "priceUsd": 70,
    "activatedAt": "2026-06-06T19:48:00.000Z",
    "expiresAt":  "2026-06-13T19:48:00.000Z",
    "config": "СУПЕР ЦЕНА"
  }
}
```

**Backend responsibilities:**
- Compute `expiresAt = activatedAt + duration` and `priceUsd = pricePer24h × factor` server-side.
- **Charge / reserve balance** here (billing is out of scope for this doc, but the activate call is the charge point). If funds are insufficient, return `{ success:false, message:"Недостаточно средств" }`.
- If the same `serviceId` is already active for this complex, decide: reject, or extend/replace. Recommended: **replace** (re-activates from now) and return the new record — that matches the client's "change duration while active" behaviour.
- Toggle the corresponding estate flag where one exists (see §6).

---

## 4. PATCH — change duration of an active service (optional)

The client lets the user change duration on an already-active row (`changeDuration` recomputes
`expiresAt` from the original `activatedAt`). If you'd rather not support this separately, the
client can re-`POST` (§3). If you do support it:

`PATCH /api/development/complexes/:complexId/promotions/:serviceId`

```jsonc
{ "durationId": "30d" }
```

Response: the updated activation record (§3 shape) with recomputed `expiresAt` and `priceUsd`.

---

## 5. DELETE — deactivate a service

`DELETE /api/development/complexes/:complexId/promotions/:serviceId`

Response:

```jsonc
{ "success": true, "data": { "serviceId": "boost", "deleted": true } }
```

- Reject if still inside the **24h lock window** (`activatedAt + 24h > now`):
  `{ success:false, message:"Услугу можно отключить через ..." }`. The client also hides the button, but server-side enforcement is required.
- On success, clear any estate flag set in §6.

---

## 6. Mapping promotions → existing estate fields

`src/schemas/estates.schema.ts` already carries promotion **badge** booleans. When the matching
service is active, the public marketplace reads these flags, so activate/deactivate should keep
them in sync (or the read endpoint should derive them). Suggested mapping:

| Service (`object_mark` config or `serviceId`) | Estate field | Type |
|---|---|---|
| `object_mark` = `Скидка` / `Акции` context | `paramUrgentSale` | `boolean` |
| `object_mark` = `Супер цена` | `paramSuperPrice` | `boolean` |
| `object_mark` = `Хит продаж` / "best" | `paramBestPrice` | `boolean` |
| `object_mark` = `Новинка` / `section_launch` | `paramStartSales` | `boolean` |
| premium/exclusive placement | `paramExclusive` | `boolean` |

These badges should be **renamed with a `param` prefix** (current schema names in parentheses):

```jsonc
// src/schemas/estates.schema.ts — promotion badges (renamed with `param` prefix)

// "Urgent sale" promotion badge (was: urgentSale)
@Prop({ type: Boolean, required: false })
paramUrgentSale: boolean;

// "Best price" promotion badge (was: bestPrice)
@Prop({ type: Boolean, required: false })
paramBestPrice: boolean;

// "Exclusive" listing promotion badge (was: exclusive)
@Prop({ type: Boolean, required: false })
paramExclusive: boolean;

// "Super price" promotion badge (was: superPrice)
@Prop({ type: Boolean, required: false })
paramSuperPrice: boolean;

// "Sales just started" promotion badge (was: startSales)
@Prop({ type: Boolean, required: false })
paramStartSales: boolean;

```

> These booleans have **no expiry** of their own. If the marketplace should auto-hide a badge when
> the promotion expires, either (a) store an expiry alongside the badge, or (b) have the public read
> path consult the active `promotions` collection instead of the raw booleans. Recommendation: keep
> the `promotions` collection authoritative and treat the estate booleans as a denormalised cache
> that the activate/deactivate/expiry job keeps in sync.

The free-overlay text (`custom_text`) and structured marks/sections have **no dedicated estate field
yet**. If they must render on the public card, add fields (see §6a) or serve them from the
`promotions` collection.

---

## 6a. New fields required

Everything below is **new** — it does not exist in the current schema. Two layers:

### A. New `promotions` collection (primary, authoritative)

This is the main new entity. One document per active service per complex.

| Field | Type | Required | Notes |
|---|---|---|---|
| `complexId` | `ObjectId` | yes | Ref to the complex/estate the promotion is bought for (confirm target, §0). |
| `serviceId` | `string` (enum) | yes | One of the catalog ids in §1 (`boost`, `top4_main`, `main_banner`, `map_marker`, `section_promo`, `section_invest`, `section_launch`, `custom_text`, `object_mark`, `white_header`, `developer_logo`). |
| `durationId` | `string` (enum) | yes | `24h` \| `48h` \| `7d` \| `30d`. |
| `priceUsd` | `number` | yes | Charged amount = `pricePer24h × factor`; computed server-side. |
| `config` | `string` | no | Overlay text (`custom_text`, ≤12 chars) or mark (`object_mark`, from the allowed list). `null` for others. |
| `activatedAt` | `Date` | yes | Charge moment; basis for the 24h cancel-lock. |
| `expiresAt` | `Date` | yes | `activatedAt + duration`; drives the live countdown + TTL. |
| `author` | `ObjectId` (User) | yes | Who paid. |
| `createdAt` | `Date` | yes | Record creation timestamp. |

Indexes: unique `{ complexId, serviceId }`, TTL on `expiresAt`.

### B. New fields on the estate schema (denormalised cache for the public card)

The existing badge booleans (renamed to `paramUrgentSale`, `paramBestPrice`, `paramExclusive`,
`paramSuperPrice`, `paramStartSales` — see §6) are **reused** — no new boolean needed for those.
What's missing are fields to render the free-text overlay, the chosen mark, the active sections,
and (optionally) expiry so the public portal can auto-hide badges (all use the `param` prefix):

```jsonc
// --- New promotion fields on Estate (src/schemas/estates.schema.ts) ---

// Free-text overlay shown over the card photo (service: custom_text). Max 12 chars.
@Prop({ required: false })
paramOverlayText: string;

// Selected corner mark on the card (service: object_mark),
// e.g. "Супер цена" | "Хит продаж" | "Новинка" | "Последние лоты" | "Скидка" | "Подарок при покупке".
@Prop({ required: false })
paramMark: string;

// Thematic sections the complex is currently promoted into
// (services: section_promo | section_invest | section_launch).
@Prop({ type: [String], default: [] })
paramSections: string[];

// When the active promotion bundle expires — lets the public portal auto-hide
// badges/overlay without consulting the promotions collection. Optional if the
// portal reads the promotions collection directly instead.
@Prop({ type: Date, required: false })
paramExpiresAt: Date;
```

| New estate field | Type | Filled by service | Purpose |
|---|---|---|---|
| `paramOverlayText` | `string` | `custom_text` | Big text over the card photo. |
| `paramMark` | `string` | `object_mark` | Corner label/badge text. |
| `paramSections` | `string[]` | `section_promo` / `section_invest` / `section_launch` | Which thematic showcases the card appears in. |
| `paramExpiresAt` | `Date` | any (latest expiry) | Optional auto-hide hint for the public portal. |

> Recommendation: keep the `promotions` collection (A) authoritative and treat the estate fields
> (B) as a cache that the activate / deactivate / expiry job keeps in sync. If the public portal can
> instead query the `promotions` collection at read time, layer **B is optional** and only the
> existing badge booleans need toggling.

---

## 7. Suggested storage shape (backend)

A `promotions` collection keyed by complex + service:

```jsonc
{
  "_id": "ObjectId",
  "complexId": "ObjectId",     // (or estateId — confirm, see §0)
  "serviceId": "custom_text",
  "durationId": "7d",
  "priceUsd": 70,
  "config": "СУПЕР ЦЕНА",      // nullable
  "activatedAt": "ISODate",
  "expiresAt": "ISODate",
  "author": "ObjectId(User)",  // who paid
  "createdAt": "ISODate"
}
```

- Unique index on `{ complexId, serviceId }` (one active record per service per complex).
- TTL index on `expiresAt` (or a sweep job) so expired promotions disappear from §2 automatically.

---

## 8. Quick acceptance test

1. `POST .../promotions` with `{ serviceId:"boost", durationId:"24h" }` → `data.expiresAt` ≈ now+24h, `data.priceUsd === 1`.
2. `GET .../promotions` → `activations` includes `boost` with the same `expiresAt`.
3. `DELETE .../promotions/boost` **before** 24h → `success:false` with a message.
4. `POST .../promotions` with `{ serviceId:"custom_text", durationId:"7d", config:"СУПЕР ЦЕНА" }` → `data.priceUsd === 70`, `data.config === "СУПЕР ЦЕНА"`.
5. Reload the page → the table shows both services as **Активно** with live countdowns and the overlay text round-tripped.
```

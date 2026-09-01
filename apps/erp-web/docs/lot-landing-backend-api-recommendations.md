# Lot Landing — Backend / API Recommendations

**Decision (2026-07-07):** share configuration and as much landing data as
possible must come from the backend, not from the URL / client localStorage.
This doc lists what the API needs to provide, in priority order, with endpoint
sketches.

Context docs:
- [lot-landing-full-control.md](./lot-landing-full-control.md) — how control works today
- [unit-landing-page-data-flow.md](./unit-landing-page-data-flow.md) — current fetch chain

Backend repos: `platform/api/berega-api` (platform API) and
`erp/bz26-api-crm` (`api-crm.baza.sale` — the service the ERP actually calls).
**They do not proxy to each other; they share one platform MongoDB.** See
"Deployment topology & the remaining gap" at the bottom of this doc — read it
before reviewing the progress table.

---

## Implementation progress

| Item | Status | Where |
|------|--------|-------|
| §4 Server-resolved `installment` per unit | ✅ **Done 2026-07-07** | `berega-api/src/services/estate-apartment-newconstructions.service.ts` → `resolveUnitInstallment()`; returned as top-level `installment` in `GET newconstructions/public/units/:unitId` |
| §3.5 `similarUnits` in landing payload | ✅ **Done 2026-07-07** | same service → `findSimilarUnits()`; up to 6 `active` units of the same complex, closest by area |
| §1 Share-link resource | ✅ **Done 2026-07-07** (API side) | `berega-api`: `unit-share-link.schema/service/controller/module`; routes under `share/unit-links` (see below) |
| §1 make `/api/share/*` reachable by the ERP (**Option A**) | ✅ **Done 2026-07-07** | module ported into `bz26-api-crm/src/modules/share-links/`, mounted under `path: 'api'` via RouterModule — same origin/JWT as `/api/development/*`; end-to-end after api-crm deploy |
| §4/§3.5 parity in `bz26-api-crm` public unit endpoint | ✅ **Done 2026-07-07** | `resolveUnitInstallment()` + `findSimilarUnits()` in `units.controller.ts`; `getPublicUnit` now also returns `complex.installmentPlans`/`installmentTerms`; **server-side mock installment fallback removed** (see below) |
| Unified token store in the platform DB | ✅ **Done 2026-07-08** | both APIs use the same `unitsharelinks` collection (api-crm via `'platform'` connection); schemas unified to string ids |
| baza.sale page customization via `?share=<token>` | ✅ **Done 2026-07-08** | `bz26-client` Astro page renders blocks/sender/lang/theme from the share config + fires view events; details in the topology section |
| §1 ERP client: build/consume `?share=<token>` links | ✅ **Done 2026-07-07** | see "ERP client integration" below |
| §3.5 ERP client: render server `similarUnits` | ✅ **Done 2026-07-07** | `ClientUnitPage.tsx` prefers API list, store fallback kept |
| §4 «Продажи» installment editor persisting to API | ⬜ TODO (ERP + API) | replace localStorage persistence in `InstallmentsPanel.tsx` |
| §3 media/texts always populated (no client enrichment) | ◐ partial | landing already resolves CDN files server-side; city/country content still client-enriched (see Q B2) |
| §2 Public sender/realtor profiles | ⬜ TODO | — |
| §5 Agency branding endpoints | ⬜ TODO | — |
| §6 Server-side share drafts | ⬜ TODO (low prio) | — |

### Implemented API (as built, may differ slightly from the sketches below)

- `POST share/unit-links` (JWT) — body `{ unitId, customization?, sender? }` →
  owner view `{ token, unitId, customization, sender, isRevoked, viewCount, … }`.
  **Returns the token only — the client composes the final URL** (the API does
  not know the ERP origin).
- `GET share/unit-links?unitId=…` (JWT) — own links for a unit, with view stats.
- `GET share/unit-links/:token` (public) — `{ token, unitId, customization,
  sender, createdAt, updatedAt }`; 404 when unknown / revoked / expired.
- `POST share/unit-links/:token/events` (public) — `{ type: 'view' }`,
  increments `viewCount`; always 204 (no token-probing signal).
- `PATCH share/unit-links/:token` (JWT, owner) — partial update of
  `customization` / `sender` / `isRevoked`.
- `DELETE share/unit-links/:token` (JWT, owner) — soft revoke (stats kept).

Implementation notes:
- `customization` stored as explicit `{ language, currency, theme,
  brandingMode, blocks: Record<key, boolean> }` — no bitmask server-side;
  unknown keys are dropped on write.
- `sender` keys are whitelisted (`name company role phone whatsapp telegram
  instagram website bio avatarUrl companyLogoUrl`); **no email**, values
  trimmed/capped, `data:` URLs rejected (logos must be CDN URLs → §5).
- Tokens: 8 chars base62 from `crypto.randomBytes`, uniqueness-checked.
- `expiresAt` exists in the schema but is not yet settable through the API
  (pending Q B4 on access-control scope).
- `installment` resolution (§4): unit-scoped plans override project-wide ones;
  `isActive === false` and past `fixed_end_date` plans are dropped; `amount`
  down payments converted to percent from the unit's list price; legacy
  `installmentTerms` used as fallback; `null` → block hides.

### ERP client integration (done 2026-07-07)

- **API client** ([developmentApi.ts](../src/services/developmentApi.ts)):
  `createUnitShareLink` / `getUnitShareLink` / `registerUnitShareLinkView`
  against `/api/share/unit-links`; responses unwrapped whether raw or
  `{ success, data }`-enveloped (gateway may add the envelope).
- **Link building** ([unit-share.ts](../src/lib/unit-share.ts) →
  `buildUnitShareUrlSmart()`): tries the API and returns
  `#/lot/:unitId?share=<token>`; **falls back to the legacy long param URL if
  the API call fails**, so sharing keeps working until the gateway route is
  deployed. Identical config reuses the session-cached token (no duplicate
  links per repeated copy); a changed config creates a *new* link — already
  sent links are never mutated implicitly.
- **Share tab** ([UnitDetailModal.tsx](../src/components/inventory/UnitDetailModal.tsx)):
  copy-link, chats, WhatsApp and Telegram use the short token link.
  «Предпросмотр визитки» deliberately keeps the legacy URL — instant open and
  no fake `viewCount` from the realtor's own preview.
- **Landing** ([ClientUnitPage.tsx](../src/pages/public/ClientUnitPage.tsx)):
  reads `?share=<token>` → `GET share/unit-links/:token` → applies
  customization (`shareLinkCustomizationToCustomization()`, values validated
  like URL params) and sender (`shareLinkSenderToAgent()`); fires the view
  event (fire-and-forget). Precedence: **explicit URL params → token config →
  defaults**; unknown/revoked token degrades to defaults, page still renders.
- **similarUnits**: landing renders the server list when present (works for
  anonymous visitors), falling back to the old store-based matcher on old
  backends.
- Server `installment` flows through the existing
  `resolvePublicInstallment()` chain unchanged (plans → DTO → terms).

---

## 0. Current state (what the backend does NOT cover today)

| Data | Where it lives today | Problem |
|------|---------------------|---------|
| Visible blocks (`blk`), lang, currency, theme, branding mode | URL query, base36 bitmask | Long fragile links; can't be changed after sending; append-only bit order is easy to break |
| Sender identity (name, phone, socials, bio, avatar) | URL query (`n`, `co`, `r`, `ph`, `wa`, `tg`, `av`, `bio`, `web`, `ig`) | PII in every forwarded link; not updatable |
| Agency logo (`lg`) | **data-URL inside the link** | Links grow to thousands of chars; messengers truncate them |
| Share draft per unit | `localStorage` `bz26_unit_share_custom_<unitId>` | Lost across devices/browsers |
| Agency branding (logo, description) | `localStorage` (agencyStore) | Same |
| Complex media / infrastructure / yields | Partially in `GET public/units/:id`, client patches holes with `GET complexes/:id` + newbuildings catalog | Up to 3 requests per page view; inconsistent results by account |
| Installment for the unit | `installmentPlans` on complex; client selects applicable plans; localStorage fallback recently disabled | Selection logic duplicated on client; anonymous visitors depend on complex payload completeness |
| Similar units | Client-side from store | Empty for anonymous visitors |

---

## 1. Share-link resource (highest priority)

Replace the URL-encoded config with a server-stored share config addressed by a
short token.

### Create (auth required)

```
POST /api/share/unit-links
{
  "unitId": "6a328064e9f3bc3dc4f6712c",
  "customization": {
    "language": "ru",            // ru | en | ka
    "currency": "USD",           // USD | EUR | GEL
    "theme": "dark",             // dark | light | baza
    "brandingMode": "agent",     // agent | baza
    "blocks": {                  // explicit map, NOT a bitmask
      "shareHero": true,
      "shareInstallment": true,
      "shareCityInfo": false
      // ... only keys that differ from server defaults are required
    }
  },
  "sender": {                    // optional; see §2 for profileId alternative
    "name": "Вы",
    "company": "Tempo",
    "role": "Собственник",
    "phone": "+995…",
    "whatsapp": "995…",
    "telegram": "username",
    "instagram": "handle",
    "website": "https://…",
    "bio": "…",
    "avatarFileId": "cdn-id",    // CDN refs instead of raw URLs / data-URLs
    "companyLogoFileId": "cdn-id"
  }
}
→ 201 { "token": "k3J9fQ", "url": "https://erp.baza.sale/#/lot/6a32…?share=k3J9fQ" }
```

Requirements:
- **Token**: короткий, неугадываемый (≥ 6–8 chars, случайный, без перебора).
- **Ownership**: link belongs to the creating user; `PATCH`/`DELETE` only for owner.
- **Update semantics**: `PATCH /api/share/unit-links/:token` — редактирование
  конфигурации *после* отправки ссылки (главное преимущество перед URL-параметрами).
- Store `blocks` as an explicit key→bool map. Do **not** persist the base36
  bitmask server-side — it's a URL-compression detail; the append-only bit
  order stays a client concern for legacy links only.
- Optional: `expiresAt`, `isRevoked` для отзыва ссылки.

### Read (public, no auth)

```
GET /api/share/unit-links/:token
→ 200 {
  "unitId": "…",
  "customization": { …resolved, with server defaults applied… },
  "sender": { …whitelisted public fields only, avatar/logo as CDN URLs… },
  "createdAt": "…", "updatedAt": "…"
}
```

- Whitelist output: no email, no internal user ids.
- Rate-limit / cache-friendly (immutable except via PATCH).

### Client migration

- New links: `#/lot/:unitId?share=<token>` (unitId kept in the path so the page
  can render even if the share service is down — fallback to defaults).
- Old param-links keep working; **explicit URL params override the token** so
  existing behaviour is preserved and manual tweaks stay possible.
- `em`, data-URL `lg` are dropped from new links entirely.

### Analytics (bonus enabled by tokens)

```
POST /api/share/unit-links/:token/events   { "type": "view" }
GET  /api/share/unit-links?unitId=…        → list with viewCount, lastViewedAt
```

---

## 2. Public sender / realtor profile

Instead of copying contact fields into every link (or into every share config),
reference a profile:

```
GET /api/public/realtor-profiles/:id
→ { "name", "company", "role", "phone", "whatsapp", "telegram",
    "instagram", "website", "bio", "avatarUrl", "companyLogoUrl" }
```

- Filled from the user's ERP profile + agency Settings (logo/description move
  from client localStorage to the backend — see §5).
- `POST /api/share/unit-links` then accepts `"senderProfileId"` as an
  alternative to the inline `sender` object; profile edits propagate to all
  previously sent links automatically.
- Visibility of each field controlled by the user (consent flags), since these
  become publicly readable.

---

## 3. One self-sufficient public landing endpoint

`GET /api/development/public/units/:unitId` must return **everything the page
renders**, so the client stops stitching 2–3 extra requests:

Add / guarantee in the payload (fields already typed client-side in
`PublicUnitLanding`, [developmentApi.ts:419-490](../src/services/developmentApi.ts#L419-L490)):

1. **Complex media, always populated**: `cover`, `renders`, `images`,
   `constructionProgress`, `districtGallery`, `cityGallery`, `countryGallery`.
   Today the client falls back to `GET complexes/:id` and the newbuildings
   catalog when these are empty — that enrichment belongs server-side.
2. **All wizard texts**: `description`, `descriptionWhy`, `descriptionWho`,
   `districtText`, `rentalText`, `investmentText`, yields
   (`rentalYieldShort/Long`, `investmentYield`), `documents`.
3. **`developerProfile`** (name, description, logo, website) — from the
   `developers` collection, not from client agency settings.
4. **Installment resolved per unit** (see §4).
5. **`similarUnits`**: 3–6 available units of the same complex (id, number,
   rooms, area, floor, price, layout thumb) — currently client-only and empty
   for anonymous visitors.
6. **City / country content**: `cityInfo` / `countryInfo` objects
   (text + gallery), managed as standalone content entities (per city/country,
   editable centrally), not scraped from the catalog.

Result: page load = 1 request (`public/units/:id`) + optionally 1 share-config
request (`share/unit-links/:token`). No auth-dependent variance.

---

## 4. Installments: resolve on the server

Client-side selection (`selectPlansForUnit`) and legacy fallbacks caused the
mock-data bug fixed on 2026-07-07. Move resolution server-side:

```
GET /api/development/public/units/:unitId
→ …,
  "installment": {
    "base":     { "id", "label", "downPaymentPercent", "termMonths",
                  "discountPercent", "paymentStep", "validUntil" },
    "optional": [ … ]
  }
```

- Server picks the plans applicable to this unit (project-wide + unit-scoped),
  ordered, active only (`isActive`, `validUntil` respected).
- Same resolved structure should back the ERP chessboard modal for non-owner
  accounts, so a regular user sees exactly what the developer configured.
- `null` when the developer configured nothing → the block hides. The client
  no longer reads or writes `developer.sales.installments.*` localStorage.
- The «Продажи» module's installment editor should persist to the API
  (project-level plans), not to localStorage, otherwise its programs are
  invisible to everyone but the author's browser.

---

## 5. Agency branding to the backend

`agencyStore` (logo as data-URL, agency description) lives in localStorage and
leaks into links via `lg`. Needed:

```
GET  /api/agency/branding          (auth)  → { "logoUrl", "description", … }
PUT  /api/agency/branding          (auth, multipart for logo upload → CDN)
```

Share links / sender profiles then reference the CDN `logoUrl`.

---

## 6. Server-side share drafts (nice-to-have)

Per-user, per-unit draft of the Share tab (what `bz26_unit_share_custom_*`
does today), synced across devices:

```
GET /api/users/me/share-drafts/:unitId
PUT /api/users/me/share-drafts/:unitId   { customization }
```

Low priority — drafts are a convenience; the share-link resource (§1) already
removes the correctness problem.

---

## 7. Priority & rollout

| # | Item | Value | Effort guess |
|---|------|-------|--------------|
| 1 | §3 self-sufficient public unit endpoint | kills 2 extra requests + account-dependent rendering | medium |
| 2 | §4 server-resolved installments (+ Sales module persisting to API) | correctness (mock-data class of bugs) | small–medium |
| 3 | §1 share-link tokens | short editable links, analytics | medium |
| 4 | §2 sender profiles + §5 agency branding | no PII/data-URLs in links | small |
| 5 | §6 share drafts sync | convenience | small |

Backward compatibility throughout: the landing must keep rendering old
param-style links; URL params override token config; absence of a token or
params → server defaults («Стандартная», `en`, `USD`, dark, agent branding —
confirm defaults, see Q3 in the control guide).

---

## 8. Questions for the backend team

> **B1.** Can `public/units/:id` embed the full complex payload without a
> performance hit, or should we add `?include=complex,similar,installment`?

> **B2.** Where should city/country content (texts + galleries) live — new
> collections, or extend the existing catalog entities?

> **B3.** Share tokens: any existing short-link/token infrastructure to reuse
> (e.g. for booking links), or is this a new service?

> **B4.** Do we need link-level access control (revocation, expiry, per-client
> links) in v1, or is create/read/update enough?

> **B5.** View analytics (§1): is a simple counter acceptable in v1, or should
> events go to the existing analytics pipeline?

---

## Deployment topology & the remaining gap (review carefully)

This section corrects an assumption made earlier in this doc and spells out
exactly what is deployed where, what the ERP can reach today, and what is left
to connect. Every claim below was verified against the actual code on
2026-07-07.

### The real topology: two backends, one database, no gateway

Earlier this doc said the ERP's `/api/development/*` calls are "rewritten by a
gateway to berega-api". **That is wrong.** The verified picture:

```
ERP client (bz26-client-erp)
  └── CRM_API_BASE_URL = https://api-crm.baza.sale   (dev: localhost:3000)
        └── repo: erp/bz26-api-crm  (NestJS, global prefix `api`)
              ├── serves /api/development/* itself (own controllers)
              ├── Mongo #1: its own CRM database (MONGODB_URI)
              └── Mongo #2: the shared "platform" database
                            (MONGODB_PLATFORM_URI, connection name 'platform')

Platform API
  └── repo: platform/api/berega-api  (NestJS, NO global prefix)
        ├── serves newconstructions/*, share/unit-links, …
        └── same platform MongoDB (estates, estatebuildings,
            estatenewconstructionsapartments, cdnfiles, …)
```

Concretely:

- `GET /api/development/public/units/:id` (what the ERP landing calls) is
  implemented **inside bz26-api-crm** —
  `src/modules/development/controllers/units.controller.ts` → `getPublicUnit()`.
  It reads the platform Mongo collections directly (`@InjectConnection('platform')`)
  and builds its own landing payload. It does **not** call berega-api.
- berega-api's `GET newconstructions/public/units/:unitId`
  (`findPublicUnitLanding()`) is a **parallel implementation** of the same
  payload on the platform side, serving other consumers.
- The two services share data through MongoDB, not through HTTP.

### Consequence: where my backend work actually landed

All backend changes in this round were made in **berega-api**:

1. `resolveUnitInstallment()` + `findSimilarUnits()` in
   `estate-apartment-newconstructions.service.ts` — enrich
   `newconstructions/public/units/:unitId`.
2. The `UnitShareLink` module (`share/unit-links`) — schema, service,
   controller, registered in `app.module.ts`.

Because the ERP talks to **bz26-api-crm**, the berega-api implementation alone
was not reachable by the ERP. **Option A was therefore implemented on
2026-07-07** — the same logic now exists in bz26-api-crm:

| Feature | berega-api | bz26-api-crm (ERP-facing) |
|---|---|---|
| `installment` resolved per unit | ✅ `estate-apartment-newconstructions.service.ts` | ✅ `units.controller.ts` → `resolveUnitInstallment()`; also used by the chessboard endpoint (project-wide plans) |
| `similarUnits` | ✅ same service | ✅ `findSimilarUnits()` (same-estate `active` units, closest by area, layout thumbs batched from `cdn_files`) |
| `share/unit-links` CRUD + public read | ✅ `share/unit-links` | ✅ `src/modules/share-links/` — `@Controller('share/unit-links')` + RouterModule `path: 'api'` ⇒ `/api/share/unit-links`, `ResponseUtil` envelope, `@Public()` on token read/events, `@CurrentUser().id` as owner |
| **Unified token store** (2026-07-08) | ✅ reads/writes `unitsharelinks` in its default DB = platform DB | ✅ module moved to the **`'platform'` Mongo connection** — same collection. Schemas unified: `unitId`/`ownerId` are plain **strings** in both repos. One token now resolves via either API: ERP creates it through api-crm, the baza.sale page reads it through berega |
| `complex.installmentPlans` / `installmentTerms` in public unit payload | ✅ (was already there) | ✅ added to `getPublicUnit` — the ERP's plans-first client chain now works without the extra `complexes/:id` fetch |

**baza.sale full customization (2026-07-08).** The public unit page
`bz26-client/src/pages/nc/apartments/[apartmentId].astro` now reads
`?share=<token>`: it fetches the config from berega
(`GET {PUBLIC_API_URL}/share/unit-links/:token`, server-side in the Astro
frontmatter — no CORS involved), then applies:

- **blocks** — every section is gated by its `share*` key (`shareHero`,
  `shareBranding`+`shareRealtorAvatar`/`shareRealtorInfo`,
  `shareDeveloperInfo`(+`shareDeveloperLogo`/`shareDeveloperCompanyName`),
  `shareUnitCard`, `shareUnitPlan`, `shareInstallment`, `shareFullPayment`,
  `sharePurchaseFlow`, `shareProjectInfrastructure`, `shareProjectInfo`,
  `shareProjectGallery` (also gates ход строительства), `shareDistrictGallery`,
  `shareProjectMap`, `shareLegalInfo`, `shareFinalCta`, `shareStickyContacts`).
  Missing key ⇒ visible (`blocks[key] !== false`).
- **sender** — a «Ваш консультант» card replaces the sales contacts: agent
  phone/WhatsApp/Telegram are used in the hero, CTA and sticky-bar links
  instead of the developer's.
- **language** — `ru`/`en` for all page chrome (headings, stats labels,
  buttons, steps, SEO title); `ka` falls back to `ru`.
- **theme** — `dark` switches the page to a dark palette (`.uv-dark`).
- **view counter** — the browser fires `POST …/events {type:'view'}`
  (requires berega CORS to allow the baza.sale origin — it's the platform's
  own client, normally already allowed).
- **Currency is NOT converted** — prices render in USD as stored; `cur` from
  the config is ignored on this page (no rate source wired). Known limitation.
- No token / unknown / revoked token ⇒ the canonical marketplace page,
  unchanged.

The ERP's «Ссылка на baza.sale» now publishes the Share-tab draft, creates the
token (same one used for the ERP visit-card link) and copies
`baza.sale/nc/apartments/:id?share=<token>`; if the share API is unreachable it
falls back to the plain canonical URL.

Adaptations made while porting (intentional differences from berega-api):

- `unitId` is stored as a **string**, not ObjectId — api-crm units can come
  from its in-memory development store with non-Mongo ids.
- Responses are wrapped in `ResponseUtil.success(...)` per api-crm convention;
  the ERP client unwraps both shapes.
- api-crm's `JwtAuthGuard` in non-production **injects a mock user when no/bad
  token is present** — in dev, `POST /api/share/unit-links` succeeds without
  auth. That's repo-wide behaviour, not specific to this module, but worth
  knowing when testing ownership rules locally.

**Bonus fix — the server-side origin of the original mock-installment bug.**
`buildInstallment()` in api-crm contained a hardcoded demo fallback
(«Базовая» 30%/12 мес, «24 месяца», «36 месяцев») returned whenever an estate
had no legacy installment fields. That is exactly the fake data regular users
saw on the chessboard (and the ERP cached it into localStorage via
`resp.installment`). It is now commented out: no wizard plans → no legacy
fields → `{ base: null, optional: [] }` → the client hides the block. Both
callers (`getPublicUnit` and the chessboard endpoint) now try wizard
`installmentPlans` first via `resolveUnitInstallment()` and fall back to the
legacy `installmentsData` parser only after that.

**Nothing regresses meanwhile** — the ERP client was written defensively:

- `buildUnitShareUrlSmart()` → `POST /api/share/unit-links` will get a 404
  from api-crm → caught → falls back to the legacy long param URL. Sharing
  works exactly as before this work.
- `ClientUnitPage` only fetches a share config when `?share=` is present in
  the URL; such links don't exist until creation works, so the code path is
  dormant. If someone crafts one, the fetch 404s and the page renders defaults.
- `similarUnits` absent from the api-crm payload → the page falls back to the
  old store-based matcher (same behaviour as before).
- `installment` from api-crm is unchanged; the ERP keeps resolving plans
  client-side from the complex payload, as it does today.

### The api-crm installment builder is weaker — a real parity gap

`bz26-api-crm` → `units.controller.ts` → `buildInstallment(estateDoc)`:

- Reads **legacy** fields only: `installmentsData` (array of JSON strings or
  `"Ежемесячный|10|27 мес."` pipe-strings) and scalar
  `installmentFirstPayment` / `installmentPeriod`.
- **Ignores the wizard's `installmentPlans`** (the structured plans the
  developer edits in the ERP — the "ПВ 10%" case from the original bug).
- Is **estate-level**: no per-unit plan selection (`applyTo: 'unit'` plans are
  never matched to the requested unit), no `isActive` / expiry filtering.

Today the ERP compensates client-side: it fetches
`GET /api/development/complexes/:id` (whose mapper *does* return
`installmentPlans`, `complexes.controller.ts:358`) and runs
`selectPlansForUnit` in the browser. That works when the complex payload is
reachable, but it is exactly the class of client-side resolution §4 set out to
eliminate — and it's why anonymous/regular users have historically seen
different installment data than the developer.

### Options to close the gap (Option A chosen and implemented 2026-07-07)

**Option A — port the code into bz26-api-crm. Recommended. ✅ IMPLEMENTED.**

- Copy the `UnitShareLink` module (4 self-contained files: schema, service,
  controller, module) from berega-api into bz26-api-crm. Adjustments:
  - Follow api-crm conventions: its `JwtAuthGuard` + `@Public()` decorator,
    `ResponseUtil.success(...)` envelope (the ERP client already unwraps both
    enveloped and raw responses).
  - Storage: either Mongo connection works; the CRM's default connection is
    the natural home (share links are an ERP/CRM concern, not platform data).
  - Controller path `share/unit-links` + global prefix `api` ⇒
    `/api/share/unit-links` — exactly what the ERP client already calls.
- Port `resolveUnitInstallment()` + `findSimilarUnits()` into
  `getPublicUnit()` (they operate on the same platform collections api-crm
  already reads; ~150 lines, no new dependencies). Replace/augment
  `buildInstallment` so wizard `installmentPlans` win over legacy
  `installmentsData`.
- Pros: single origin, existing auth just works, no infra change, ERP needs
  zero further edits. Cons: code exists twice (berega + api-crm) until a
  shared package exists — same duplication these two repos already live with.

**Option B — nginx/gateway proxy `api-crm.baza.sale/api/share/*` → berega-api.**

- Needs an infra change outside both repos.
- **Auth problem**: `POST`/`PATCH` are JWT-guarded. ERP tokens are issued by
  bz26-api-crm; berega-api's `JwtAuthGuard` verifies with **its own secret**.
  Unless both services deliberately share `JWT_SECRET` (verify! silently
  diverging secrets = 401s only on write paths), creating links will fail.
- Public `GET :token` / `POST :token/events` would work regardless.
- Also review: CORS on berega for the ERP origin, and berega has **no** `api`
  prefix (proxy must strip `/api`).

**Option C — point the ERP directly at berega for share links.**

- New env plumbing (`VITE_…`), mixed origins, same JWT-issuer problem as B.
- Not recommended; listed for completeness.

### Verification checklist (after deploying whichever option)

```bash
# 1. Create (with a valid ERP JWT) — expect 201 + token
curl -X POST https://api-crm.baza.sale/api/share/unit-links \
  -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' \
  -d '{"unitId":"<24-hex unit id>","customization":{"language":"ru","blocks":{"shareInstallment":true}}}'

# 2. Public read — expect the stored config, no auth required
curl https://api-crm.baza.sale/api/share/unit-links/<token>

# 3. View event — expect 204; repeat and check viewCount via authorized GET ?unitId=
curl -X POST https://api-crm.baza.sale/api/share/unit-links/<token>/events \
  -H 'Content-Type: application/json' -d '{"type":"view"}'

# 4. Landing payload parity — expect `installment` + `similarUnits` keys
curl https://api-crm.baza.sale/api/development/public/units/<unitId> | jq 'keys'
```

In the ERP: Share tab → copy link should now yield
`…#/lot/<unitId>?share=<token>` (short); opening it in an incognito window must
render the exact block set/theme/sender configured in the Share tab, and the
Рассрочка tab must show the developer's wizard plans for an anonymous visitor.
If the copy still yields a long `?n=…&blk=…` URL, the POST failed — check
routing/auth per the options above (the client hides this failure by design).

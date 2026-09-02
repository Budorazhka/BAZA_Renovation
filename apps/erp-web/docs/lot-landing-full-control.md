# Lot Landing (`#/lot/:unitId`) — Full Control Guide

How to control **everything** a client sees on the public lot landing page:
which sections render, in which language/currency/theme, whose contacts are
shown, and where each section's content comes from.

Companion doc: [unit-landing-page-data-flow.md](./unit-landing-page-data-flow.md)
(data fetching internals). This doc is about **control**: UI steps, URL
parameters, and the `blk` bitmask.

Example link being dissected:

```
https://erp.baza.sale/#/lot/6a328064e9f3bc3dc4f6712c?n=Вы&co=Tempo&r=Собственник&blk=1o4t0mpn&bm=a
```

---

## 1. The three layers of control

| Layer | Who controls it | Where |
|-------|----------------|-------|
| **Visibility & appearance** (which blocks, language, currency, theme, branding) | The person sharing the link | Share tab in the lot modal → encoded into the URL (`lang`, `cur`, `thm`, `blk`, `bm`) |
| **Sender identity** (name, company, role, phone, socials, logo) | The person sharing the link | Taken from the logged-in profile / Settings when the link is built → URL params (`n`, `co`, `r`, `ph`, …) |
| **Content** (texts, galleries, prices, installment plans) | The developer / project owner | Project wizard + unit card + agency Settings → fetched from the API by the landing at open time |

Key consequence: **the URL is the single source of truth for visibility and
sender.** Nothing about who shares the page or what they toggled is stored on
the server; if a param isn't in the URL, the landing falls back to defaults
(the «Стандартная» preset, `en`/`USD`/dark, agent branding).

---

## 2. Controlling visibility from the UI (no URL editing)

1. Open the chessboard (`Development → Chessboard` or `New buildings → Chessboard`),
   click a lot, switch to the **Share** tab.
2. Pick a **preset** in the left column — it flips the whole block set at once:

   | Preset | Id | Intent |
   |--------|----|--------|
   | Короткая | `short` | Warm client, quick WhatsApp/Telegram send |
   | Стандартная | `standard` | Default; what a bare URL (no `blk`) shows |
   | Иностранный покупатель | `foreignBuyer` | Adds city / country / purchase-procedure blocks |
   | Инвестор | `investor` | Adds investment & rental potential blocks |
   | Максимальная | `maximal` | Everything on |

3. Fine-tune with the **section toggles** (Первый экран, Квартира / лот,
   Проект / жилой комплекс, Застройщик и документы, Район/город/страна,
   Инвестиционная логика). Each switch maps 1:1 to a `share*` block key
   (see the table in §5).
4. Pick **language** (`ru`/`en`/`ka`), **currency** (`USD`/`EUR`/`GEL`),
   **theme** (Тёмная / Светлая / BAZA.sale) and the **sender mode**
   («Отправитель BAZA.sale» toggle = branding mode).
5. Use **«Предпросмотр визитки»** to see exactly what the client will see, then
   **«Переслать презентацию»** (or copy link) — the URL is generated with all
   of the above encoded.

Your edits are also saved as a per-unit draft in the browser
(`localStorage` key `bz26_unit_share_custom_<unitId>`), so reopening the Share
tab for the same lot restores your last setup. **The draft never affects
visitors** — only the generated URL does.

### Two share links: ERP visit card vs. baza.sale page

The «Переслать презентацию» popup offers **two links**, and since 2026-07-08
**both carry the customization token**:

| | «Скопировать ссылку» | «Ссылка на baza.sale» |
|---|---|---|
| URL | `erp.baza.sale/#/lot/:unitId?share=<token>` (or legacy params) | `baza.sale/nc/apartments/:unitId?share=<token>` |
| Audience | a specific client, sent personally | same, but on the public marketplace domain |
| Customization | full block set, theme, language, currency, **agent's contacts** | blocks, sender card + agent contacts, language (ru/en), dark/light theme; **currency not converted** (USD as stored) |
| Without token | defaults («Стандартная», en/USD/dark) | canonical marketplace page with developer's contacts |
| Rendered by | ERP client (`ClientUnitPage`) via `api-crm.baza.sale` | Astro site (`bz26-client/src/pages/nc/apartments/[apartmentId].astro`) via `api.baza.sale` (berega-api) |

One token serves both links (share configs live in the shared platform-DB
collection `unitsharelinks`, written via api-crm, read via berega). The
baza.sale item is hidden for lots that don't exist on the platform (mock units
without a Mongo id); if the share API is unreachable the ERP copies the plain
canonical URL.

Relevant code:
- Share URL builder: [src/lib/unit-share.ts](../src/lib/unit-share.ts) → `buildUnitShareUrl()`
- Encoder/decoder: [src/lib/unit-share-customization.ts](../src/lib/unit-share-customization.ts)
- Presets & toggle groups: [src/config/dev-selection-customization.ts](../src/config/dev-selection-customization.ts)
- Landing consumption: [src/pages/public/ClientUnitPage.tsx](../src/pages/public/ClientUnitPage.tsx) (~line 1226)

---

## 3. URL parameter reference

### 3.1 Sender / agent params (plain text, optional)

| Param | Meaning | Notes |
|-------|---------|-------|
| `n` | Sender name | legacy alias `agent` |
| `co` | Company | legacy alias `company` |
| `r` | Role (e.g. Собственник, Риэлтор) | legacy alias `role` |
| `ph` | Phone | legacy alias `phone` |
| `wa` | WhatsApp number | digits only |
| `tg` | Telegram username | without `@` |
| `av` | Avatar image URL | |
| `bio` | About-me text | |
| `web` | Website | |
| `ig` | Instagram | without `@` |
| `lg` | Agency logo (data-URL!) | shown in the sender block when BAZA branding is off; makes links very long |
| `em` | Email — **deprecated**, parser still reads it but builder no longer writes it | |

If none of these are present, the landing shows no personal sender block.

### 3.2 Customization params

| Param | Values | Default (when absent) |
|-------|--------|----------------------|
| `lang` | `ru` \| `en` \| `ka` | `en` |
| `cur` | `USD` \| `EUR` \| `GEL` | `USD` |
| `thm` | `d` (dark) \| `l` (light) \| `b` (BAZA.sale) | `d` |
| `blk` | base36 bitmask of visible blocks (§4) | «Стандартная» preset |
| `bm` | `a` (agent branding) \| `b` (BAZA.sale branding) | `a` |

The builder only writes params that differ from the defaults, **but always adds
`bm` whenever `blk` is written** — a lone `blk` ≤ `0xfff` would otherwise be
interpreted as a legacy 12-bit mask from old links (see
`parseUnitShareCustomization`, [unit-share-customization.ts:128-151](../src/lib/unit-share-customization.ts#L128-L151)).
If you hand-craft URLs, follow the same rule: **`blk` must come with `bm`**.

---

## 4. The `blk` bitmask — hand-crafting visibility

`blk` is a base36 number. Bit *i* = block *i* in `UNIT_VISIT_BLOCK_ORDER`
([src/lib/unit-visit-block-labels.ts:47-85](../src/lib/unit-visit-block-labels.ts#L47-L85)).
Bit set → block visible. The order is **append-only** — never reorder or insert
in the middle, or every previously shared link changes meaning.

Worked example — `blk=1o4t0mpn` from the link above:

```js
BigInt(parseInt('1o4t0mpn', 36))  // 130897543163
```

Decodes to: everything from the «Стандартная» preset — hero, sender contact,
unit card/plan/gallery/finance, installment, full payment, project
info/gallery/infrastructure/location/map, developer + documents, purchase flow,
district blocks, similar units, social links, final CTA, realtor avatar/bio,
developer company name + logo — with **off**: BAZA branding, city & country
blocks, investment/rental potential.

To build your own mask in a console:

```js
const ORDER = [ /* copy UNIT_VISIT_BLOCK_ORDER from unit-visit-block-labels.ts */ ];
const on = new Set(['shareHero', 'shareUnitCard', 'shareInstallment' /* … */]);
let mask = 0n;
ORDER.forEach((k, i) => { if (on.has(k)) mask |= 1n << BigInt(i); });
console.log(mask.toString(36)); // → value for blk
```

Then append `?blk=<value>&bm=a` (plus `lang`/`cur`/`thm` as needed).

---

## 5. Block map: switch label → key → content source

Where the *content* of each block comes from, i.e. what the developer must fill
in so the block isn't empty. Blocks with no data auto-hide even when enabled.

### Первый экран

| Switch (RU) | Block key | Content source |
|---|---|---|
| Презентация объекта | `shareObjectInfo` | Unit + complex basic info |
| Hero-презентация | `shareHero` | Complex cover / renders (project wizard → media) |
| Отправитель BAZA.sale | `shareBazaBranding` | Static BAZA branding |
| Контакт риэлтора | `shareBranding` | URL agent params (§3.1) |
| Аватарка риэлтора | `shareRealtorAvatar` | `av` URL param |
| Описание риэлтора | `shareRealtorInfo` | `bio` URL param |
| Социальные сети | `shareStickyContacts` | `tg`/`wa`/`ig`/`web` params |
| Связаться с нами | `shareFinalCta` | Same contacts |

### Квартира / лот

| Switch | Block key | Content source |
|---|---|---|
| Параметры квартиры | `shareUnitCard` | Unit card: area, floor, rooms, price |
| Планировка | `shareUnitPlan` | Unit layout image + floor plan (`floorPlanUrl`) |
| Галерея (не в UI-группе, входит в пресеты) | `shareUnitGallery` | Unit/complex images |
| Условия покупки | `shareUnitFinance` | Unit price + complex `paymentTypes` |
| Рассрочка | `shareInstallment` | **Project wizard installment plans** (`installmentPlans`, legacy `installmentTerms`). Since 2026‑07 the localStorage fallback is disabled — only real API data renders, otherwise the block hides. |
| Полная оплата | `shareFullPayment` | Unit price |

### Проект / жилой комплекс

| Switch | Block key | Content source (project wizard fields) |
|---|---|---|
| О проекте | `shareProjectInfo` | `description`, `descriptionSuccess`, `descriptionAudience` |
| Галерея проекта | `shareProjectGallery` | `renders`, `constructionProgress` |
| Инфраструктура | `shareProjectInfrastructure` | `infrastructureInternal/External/Location`, `amenities` |
| Локация проекта | `shareProjectLocation` | `location`, `coastline` |
| Карта | `shareProjectMap` | `locationCenter`, `areaPolygon` |

### Застройщик и документы

| Switch | Block key | Content source |
|---|---|---|
| Застройщик | `shareDeveloperInfo` | `developer` + agency Settings (logo, description) |
| Название компании | `shareDeveloperCompanyName` | `developer` |
| Логотип | `shareDeveloperLogo` | Agency Settings logo / backend developer profile |
| Как проходит покупка | `sharePurchaseFlow` | Static copy per language |
| Документы | `shareLegalInfo` | Project wizard `documents` |

### Район, город и страна

| Switch | Block keys | Content source |
|---|---|---|
| О районе / Информация / Атмосфера района | `shareDistrict`, `shareDistrictInfo`, `shareDistrictGallery` | `districtText`, `districtGallery` |
| О городе / Информация / Галерея города | `shareCity`, `shareCityInfo`, `shareCityGallery` | Complex `city` + catalog enrichment |
| О стране / Информация / Галерея страны | `shareCountry`, `shareCountryInfo`, `shareCountryGallery` | Complex `country` + catalog enrichment |

### Инвестиционная логика

| Switch | Block key | Content source |
|---|---|---|
| Инвестиционный потенциал | `shareInvestmentPotential` | `investmentYield`, `investmentText` |
| Арендный потенциал | `shareRentalPotential` | `rentalYieldShort/Long`, `rentalText` |
| Похожие варианты | `shareSimilarUnits` | Other units of the same complex |

> `shareRealtorCard` exists in the mask order but is **force-disabled** in code
> (`resolveUnitShareCustomization` sets it to `false` unconditionally).

---

## 6. Full-control checklist

To guarantee a landing looks exactly as intended:

1. **Fill the content** (developer account): project wizard — descriptions,
   renders, infrastructure, documents, district/city texts, yields, and
   **installment plans** (these drive the Рассрочка block for every viewer).
2. **Fill the unit**: layout image, floor plan, price / price per m², finish prices.
3. **Set sender identity**: profile + Settings (logo, description) — they get
   baked into the link when sharing.
4. **Open Share tab** on the lot → choose preset → fine-tune toggles →
   language / currency / theme / branding.
5. **Preview** («Предпросмотр визитки»), then copy/send the link.
6. Optionally, post-edit the URL by hand using §3–§4 (remember `bm` with `blk`).

---

## 7. Open questions (please confirm / clarify)

> **Q1. Server-side share configs?** Everything is URL-encoded; with `lg`
> (data-URL logo) links become thousands of characters and messengers may
> truncate them. Do we want short links (`/lot/:id?share=<token>`) with the
> config stored on the backend?
>
> ✅ **Answered (2026-07-07): yes — as much as possible must come from the
> backend.** API requirements are drafted in
> [lot-landing-backend-api-recommendations.md](./lot-landing-backend-api-recommendations.md).

> **Q2. Who may control what?** Should regular (agency) users be able to toggle
> developer-owned blocks (documents, installments, yields), or should some
> switches be locked to the complex owner? Today anyone with the Share tab can
> hide/show any block on their own link.

> **Q3. Default preset.** A bare URL (no `blk`) renders the «Стандартная»
> preset in `en`/`USD`/dark. Is that the desired default for links forwarded
> from chats, or should it be `ru`?

> **Q4. `em` param.** The builder stopped writing email but the parser still
> reads it. Can we drop parsing too, or are old links with `em` still shared?

> **Q5. Legacy 12-bit `blk` links.** The parser keeps a compatibility branch
> for pre-2026 masks. Do we know if such links are still in circulation, or can
> that branch be retired?

> **Q6. `shareRealtorCard`.** Force-disabled everywhere but still occupies bit
> 26 of the mask. Intentional reserve, or dead code to clean up (keeping the
> bit reserved)?

> **Q7. City/country content.** These blocks rely on catalog enrichment
> (`newbuildings` catalog images). Should the project wizard get explicit
> city/country text+gallery fields so developers can control this content
> directly?

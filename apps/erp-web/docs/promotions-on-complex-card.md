# Promotions on the Complex Card

How paid promotion services map onto the **complex card** (ЖК card) shown on
**Объекты (ЖК)** newbuilds and **Новостройки**.

(full API contract). Here we only cover: which paid services exist, what the API gives us per
complex, and the exact rules for what shows up on the card.

---

## 1. Paid services we have

The developer buys these per complex on the **Продвижение** page. Each is identified by a
`serviceId`. Most of them affect placement **outside** the card (homepage, thematic sections,
map, branding). Only a few are visible **on the card itself** (last column).

| `serviceId` | Service (RU) | What it does | Shows on card? |
|---|---|---|---|
| `boost` | Поднять в выдаче | Raises the listing in marketplace/ERP search | ✅ «ТОП» badge |
| `object_mark` | Метка на объекте | Colored mark «Супер цена» / etc. — a visual anchor on the card | ✅ colored mark badge |
| `custom_text` | Надпись на карточке | Large custom text over the card | ✅ right-side text |
| `top4_main` | Топ-4 на главной | Top-4 slot on the homepage | ❌ |
| `main_banner` | Большой баннер на главной | Full-width homepage banner | ❌ |
| `map_marker` | Отметка с графиком на карте | Animated marker on the search map | ❌ |
| `section_promo` | Раздел «Акции» | Lists the complex in the “Акции” section | ❌ |
| `section_invest` | Раздел «Для инвесторов» | Lists it in the “Для инвесторов” section | ❌ |
| `section_launch` | Раздел «Старт продаж» | Lists it in the “Старт продаж” section | ❌ |
| `white_header` | Белый хедер | Branded header bar across the platform | ❌ |
| `developer_logo` | Логотип застройщика в хедере | Developer logo in the nav | ❌ |
| `realtor_outreach` | Обращение к риелторам | Targeted broadcast to the realtor network | ❌ |

`object_mark` allowed `config` values: `Супер цена`, `Хит продаж`, `Новинка`, `Последние лоты`,
`Скидка`, `Подарок при покупке`.

---

## 2. What the API gives us

The complex objects from `GET /api/development/complexes` and
`GET /api/development/newbuildings` each carry a `promotions` array of the **currently active**
paid services for that complex.

Example (complex `BVTest`):

```jsonc
{
  "id": "6a21c84350ad6f56b866bfd7",
  "name": "BVTest",
  // ...
  "promotions": [
    {
      "id": "6a26abc1615c54dccdd37dff",
      "serviceId": "boost",
      "durationId": "24h",
      "priceUsd": 1,
      "config": null,
      "activatedAt": "2026-06-08T11:47:13.762Z",
      "expiresAt":  "2026-06-09T11:47:13.762Z"
    },
    {
      "id": "6a26abe4615c54dccdd37e02",
      "serviceId": "custom_text",
      "durationId": "24h",
      "priceUsd": 10,
      "config": "abc 23984y f",
      "activatedAt": "2026-06-08T11:47:48.315Z",
      "expiresAt":  "2026-06-09T11:47:48.315Z"
    },
    {
      "id": "6a26abce615c54dccdd37e00",
      "serviceId": "section_invest",
      "durationId": "24h",
      "priceUsd": 2,
      "config": null,
      "activatedAt": "2026-06-08T11:47:26.807Z",
      "expiresAt":  "2026-06-09T11:47:26.807Z"
    },
    {
      "id": "6a26abd2615c54dccdd37e01",
      "serviceId": "section_promo",
      "durationId": "24h",
      "priceUsd": 1,
      "config": null,
      "activatedAt": "2026-06-08T11:47:30.913Z",
      "expiresAt":  "2026-06-09T11:47:30.913Z"
    }
  ]
}
```

Each activation:

| Field | Meaning |
|---|---|
| `serviceId` | which paid service (table in §1) |
| `config` | extra value: text for `custom_text`, the chosen mark for `object_mark`, else `null` |
| `activatedAt` / `expiresAt` | ISO timestamps; we ignore anything already expired |
| `priceUsd`, `durationId` | billing info (not used for card rendering) |

---

## 3. What we render on the card

**Hard rule: a card shows at most 2 badges over the photo + 1 text on the right.**

| Slot | Driven by | Rendered as | Text from |
|---|---|---|---|
| Image badge #1 | `boost` | «ТОП» badge (gold, Crown) | fixed |
| Image badge #2 | `object_mark` | colored mark badge (Flame) | `config` |
| Right-side text | `custom_text` | big tilted colored text on the right | `config` |

Rules:

1. **Only `boost` and `object_mark` become photo badges.** Everything else in §1 marked ❌ is ignored on the card (it lives on the homepage / sections / map / header instead).
2. **Max 2 badges** (`MAX_CARD_BADGES`), de-duplicated. Extras are dropped.
3. **`custom_text` is the only right-side text.** If several were active, only the first is used. Its color and tilt are global constants `PROMO_TEXT_COLOR` / `PROMO_TEXT_ANGLE` in `ComplexCard.tsx` (currently green-blue `#5ee0d0`, `-4°`) — they are **not** per-promotion.
4. **Expired activations** (`expiresAt <= now`) are skipped everywhere.

### Applied to the BVTest example

From the 4 active promotions above, the card renders:

- ✅ **«ТОП»** badge — from `boost`
- ✅ right-side text **“ABC 23984Y F”** — from `custom_text.config`
- ❌ `section_invest`, `section_promo` — **not** shown on the card (they only place it into homepage sections)

Result: **1 badge + 1 right text** (no `object_mark` was active, so only one badge).

---

## 4. Mapping reference (code)

```ts
// src/lib/promotionBadges.ts
const PROMO_BADGE_MAP = {
  boost:       { kind: 'top' },   // «ТОП»
  object_mark: { kind: 'hot' },   // colored mark, label from config
}
export const MAX_CARD_BADGES = 2

promotionsToBadges(promotions) // → ComplexCardPromo[]  (badges over the photo, ≤ 2)
getPromotionText(promotions)   // → string | undefined  (custom_text → right-side text)
```

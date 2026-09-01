# Community Forum (Сообщество) — API Integration Requirements

This document describes the **Сообщество / Community forum** in the ERP client and the API
contract a backend must provide to move it off the in-file mock and onto HTTP.

There is **no backend for the forum yet** — so this doc is written as the source of truth the
backend implements against. It pins down **exactly what the frontend sends** and **the response
shape it depends on** to render the feed, sections, threads, replies, member profiles, the
co-broking exchange board, and events.

> Frontend code:
> - UI pages: `src/components/community/forum/` — `ForumHomePage.tsx` (feed), `SectionPage.tsx`,
>   `ThreadPage.tsx`, `NewThreadPage.tsx`, `ExchangeBoardPage.tsx`, `MemberProfilePage.tsx`,
>   `ThreadCard.tsx`, `forumKit.tsx` (right rail).
> - Domain model + mock (today: in-file arrays, to be replaced by HTTP): `src/components/community/forum/forumData.ts`
> - Module entry: `src/pages/modules/CommunityHubPage.tsx`
> - HTTP client + envelope convention to mirror: `src/services/developmentApi.ts`, `src/config/backend.ts`

---

## 0. Conventions

- **Base URL / prefix.** All paths are under **`/api/community/...`** on the CRM API
  (`api-crm.baza.sale`), parallel to `/api/development/...`. Origin is one line in `src/config/backend.ts`.
- **Member = CRM user.** A forum member is the existing CRM user/contact; `crmContactId` links the profile.
- **Reactions = single like toggle** (one counter per thread/reply), not multiple emoji types.
- **Auth.** Every request sends `Authorization: Bearer <jwt>` — same JWT as the rest of the app.
  The backend derives the current user (`me`) from the token for create/react/best-answer actions.
- **Envelope** (already typed in the client as `ApiResponse<T>` / `PaginatedResponse<T>`):

```jsonc
{ "success": true,  "data": { /* ... */ } }
{ "success": false, "message": "Human-readable error shown verbatim in the UI" }
```

```jsonc
// list endpoints wrap data in:
{ "success": true, "data": { "items": [ /* ... */ ], "total": 124, "page": 1, "totalPages": 7 } }
```

- **IDs** are opaque strings (Mongo ObjectId or otherwise).
- **No `404` needed for empty lists** — return `success: true` with `items: []`. A `404` is tolerated
  as "empty" (the client maps it), but a 200 + empty list is preferred.

### 0.1 Raw values, not pre-formatted strings (important)

The current mock stores **display-baked** strings. The API must return **raw** values; the
frontend already formats them. Do **not** send relative time labels or pre-formatted money.

| Mock field (today) | Mock value | API field | API value |
|---|---|---|---|
| `createdAgo` | `"2 ч"` | `createdAt` | `"2026-06-13T08:40:00.000Z"` (ISO) |
| `lastActiveAgo` | `"40 мин"` | `lastActivityAt` | ISO timestamp |
| `joined` | `"06.2024"` | `joinedAt` | ISO timestamp |
| `lastActiveLabel` | `"сегодня"` | `lastActiveAt` | ISO timestamp |
| `exchange.amount` | `"до $400 000"` | `exchange.amount` | structured object (§6) |
| `exchange.deadline` | `"до 30.04"` | `exchange.deadline` | structured object (§6) |

- **Timestamps:** ISO 8601 UTC. The client renders «2 ч» / «сегодня» (relative) itself.
- **Money:** numeric **USD** only. The client formats «$400 000». No `₽` anywhere.

---

## 1. Enums (source of truth: frontend)

These mirror `forumData.ts`. The API should accept/return exactly these string values.

| Enum | Values |
|---|---|
| `segment` | `broker` \| `developer` \| `partner` \| `agent` |
| `role` (community) | `member` \| `expert` \| `moderator` \| `partner_admin` |
| `threadType` | `discussion` \| `question` \| `announcement` \| `exchange` \| `showcase` |
| `sectionKind` | `feed` \| `category` \| `exchange` \| `showcase` \| `events` |
| `exchangeIntent` | `rent_seek` \| `buy_seek` \| `partner_seek` \| `client_handover` \| `rent_offer` \| `sale_offer` \| `service_offer` |
| `exchangeSide` | `demand` \| `supply` |
| `exchangeStatus` | `open` \| `in_work` \| `closed` |

> `exchangeSide` is derivable from `exchangeIntent` (`*_seek` + `partner_seek` → `demand`; the rest → `supply`).
> The client has this mapping (`INTENT_SIDE`); the backend may send `side` or let the client derive it.

---

## 2. TL;DR — endpoints

| Method | Path | Purpose | Priority |
|---|---|---|---|
| `GET` | `/api/community/sections` | Left-rail sections + thread counts | MUST |
| `GET` | `/api/community/threads` | Feed / section list / exchange / author filter (paginated) | MUST |
| `GET` | `/api/community/threads/:id` | Single thread (with embedded author) | MUST |
| `POST` | `/api/community/threads` | Create a thread (any `threadType`) | MUST |
| `GET` | `/api/community/threads/:id/replies` | Replies for a thread | MUST |
| `POST` | `/api/community/threads/:id/replies` | Post a reply | MUST |
| `GET` | `/api/community/members` | Members list + leaderboard (`sort=trust`) | MUST |
| `GET` | `/api/community/members/:id` | Member profile + their threads | MUST |
| `GET` | `/api/community/events` | Upcoming events (right rail + Events section) | SHOULD |
| `GET` | `/api/community/tags/trending` | Trending tags (right rail) | SHOULD |
| `POST` | `/api/community/threads/:id/reactions` | Toggle like on a thread | NICE |
| `POST` | `/api/community/replies/:id/reactions` | Toggle like on a reply | NICE |
| `PATCH` | `/api/community/replies/:id/best` | Mark a reply as best answer (solves a `question`) | NICE |

---

## 3. Sections

`GET /api/community/sections`

Static-ish catalog rendered in the left rail and used to label threads. `threads` is the live count.

```jsonc
{
  "success": true,
  "data": [
    { "id": "market",     "name": "Лента рынка",        "kind": "feed",     "group": null,        "icon": "megaphone", "description": "Анонсы застройщиков и изменения рынка", "threads": 124 },
    { "id": "law",        "name": "Право и сделки",       "kind": "category", "group": "Кулуары",   "icon": "scale",     "description": "Эскроу, ДДУ, налоги, сделки с нерезидентами", "threads": 86 },
    { "id": "exchange",   "name": "Биржа",                "kind": "exchange", "group": null,        "icon": "arrows",    "description": "Спрос и предложение: co-broking, объекты, услуги", "threads": 92 },
    { "id": "events",     "name": "События",              "kind": "events",   "group": null,        "icon": "calendar",  "description": "Эфиры, нетворкинги, круглые столы", "threads": 18 }
  ]
}
```

| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable slug (`market`, `law`, `mortgage`, `marketing`, `tech`, `networking`, `exchange`, `showcase`, `events`). Used in thread filters. |
| `name` | string | Display name. |
| `kind` | enum `sectionKind` | Drives layout (feed vs category vs exchange board vs events). |
| `group` | string \| null | Optional left-rail grouping (e.g. «Кулуары»). |
| `icon` | string | Icon key the client maps to a glyph. |
| `description` | string | One-line subtitle. |
| `threads` | number | Count of threads in the section. |

> The initial section list can be **seeded from `forumData.ts` `SECTIONS`** — the slugs there are canonical.

---

## 4. Threads — list

`GET /api/community/threads`

One endpoint serves the home feed, a section page, the author's threads, and the exchange board,
via query params.

| Query | Type | Notes |
|---|---|---|
| `sectionId` | string | Filter to one section. |
| `type` | enum `threadType` | Filter by type. Home-feed type tabs use this; the exchange board uses `type=exchange`. |
| `authorId` | string | Member profile → that member's threads. |
| `tag` | string | Threads carrying a tag. |
| `q` | string | Full-text search over title/excerpt (optional). |
| `intent` | enum `exchangeIntent` | Exchange board filter (only meaningful with `type=exchange`). |
| `side` | enum `exchangeSide` | Exchange board filter. |
| `status` | enum `exchangeStatus` | Exchange board filter. |
| `sort` | `feed` \| `recent` \| `top` | `feed` = pinned first, then `lastActivityAt` desc (home default). |
| `page` / `limit` | number | Standard pagination; `limit` default 20. |

**Response** (`PaginatedResponse<Thread>`):

```jsonc
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "t1",
        "type": "announcement",
        "sectionId": "market",
        "title": "Старт продаж ЖК «Грин Парк» — комиссия агентам 4.5%",
        "excerpt": "Открыли продажи первой очереди: 32 лота, студии и двушки от $95 000…",
        "author": {
          "id": "m3", "name": "Елена Воронова", "segment": "developer",
          "role": "partner_admin", "company": "ГК «Север»"
        },
        "createdAt": "2026-06-13T08:40:00.000Z",
        "lastActivityAt": "2026-06-13T10:20:00.000Z",
        "views": 312,
        "reactionCount": 18,
        "reactedByMe": false,
        "replyCount": 6,
        "tags": ["жк-грин-парк", "старт-продаж"],
        "pinned": false,
        "solved": false,
        "exchange": null
      }
    ],
    "total": 124, "page": 1, "totalPages": 7
  }
}
```

**Thread fields:**

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `type` | enum `threadType` | |
| `sectionId` | string | |
| `title` | string | |
| `excerpt` | string | Short preview; backend may derive from the body's first paragraph. |
| `author` | object | **Embedded summary** (avoids N+1): `{ id, name, segment, role, company }`. Full profile via §8. |
| `createdAt` | ISO | |
| `lastActivityAt` | ISO | Last reply or edit; drives feed sort + «активность». |
| `views` | number | |
| `reactionCount` | number | Likes. |
| `reactedByMe` | boolean | Whether the JWT user liked it (for the toggle UI). |
| `replyCount` | number | |
| `tags` | string[] | Lowercase slugs. |
| `pinned` | boolean | Pinned to top of feed/section. |
| `solved` | boolean | Only meaningful for `type: "question"` — a best answer exists. |
| `exchange` | object \| null | Present **only** when `type: "exchange"` — see §6. |

---

## 5. Threads — single & create

### 5.1 Get one

`GET /api/community/threads/:id`

Same `Thread` shape as §4 items, plus the full body and a count for views (increment a view on read,
or expose a separate `POST /threads/:id/view` — confirm). Add a `body` field:

```jsonc
{ "success": true, "data": { /* …Thread fields… */, "body": "Full markdown/plaintext body of the post" } }
```

### 5.2 Create

`POST /api/community/threads` — `application/json`

```jsonc
{
  "type": "question",
  "sectionId": "law",
  "title": "Как оформить эскроу при переуступке ДДУ?",
  "body": "Клиент покупает по переуступке…",
  "tags": ["эскроу", "переуступка", "дду"],
  "exchange": {                       // required only when type === "exchange"; omit otherwise
    "intent": "client_handover",
    "dealKind": "Покупка, вторичка",
    "location": "СПб, Приморский",
    "amount":   { "valueUsd": 400000, "qualifier": "up_to" },
    "commission": "30% от агентской",
    "deadline": { "kind": "until", "date": "2026-04-30" }
  }
}
```

| Field | Required | Type | Notes |
|---|---|---|---|
| `type` | yes | enum `threadType` | |
| `sectionId` | yes | string | Must match the type's allowed section (e.g. `exchange` → `exchange`). |
| `title` | yes | string | |
| `body` | yes | string | |
| `tags` | no | string[] | Server lowercases/normalizes. |
| `exchange` | conditional | object | **Required** when `type === "exchange"`, ignored otherwise. See §6. |

- `authorId` comes from the JWT — **the client does not send it**.
- Response: the created `Thread` (§4 shape, with `body`, `replyCount: 0`, `views: 0`).
- `NewThreadPage.tsx` is the form; the exchange branch shows the §6 fields when type is `exchange`.

---

## 6. Exchange meta (co-broking board)

Present on a thread only when `type === "exchange"`. The **Биржа** board is just
`GET /api/community/threads?type=exchange` with the §4 exchange filters.

```jsonc
"exchange": {
  "intent": "client_handover",
  "side": "supply",
  "dealKind": "Покупка, вторичка",
  "location": "СПб, Приморский",
  "amount":   { "valueUsd": 400000, "qualifier": "up_to", "period": null },
  "commission": "30% от агентской",
  "deadline": { "kind": "until", "date": "2026-04-30" },
  "status": "open"
}
```

| Field | Type | Notes |
|---|---|---|
| `intent` | enum `exchangeIntent` | The «ИЩУ / ОТДАЮ / СДАЮ / ПРОДАЮ / ПРЕДЛАГАЮ» selector. |
| `side` | enum `exchangeSide` | Derivable from `intent` (client has `INTENT_SIDE`); send it or let the client derive. |
| `dealKind` | string | Free label, e.g. «Аренда, жилая», «Совместный показ». |
| `location` | string | Free text, e.g. «СПб, Петроградка», «Онлайн». |
| `amount` | object | **Structured** — the client formats it. See below. |
| `commission` | string \| null | Descriptive, e.g. «50% за со-агента», «бесплатно для агента». Kept free-form. |
| `deadline` | object \| null | `{ "kind": "until" \| "from", "date": "YYYY-MM-DD" }`. Client renders «до 30.04» / «с 01.05». |
| `status` | enum `exchangeStatus` | `open` \| `in_work` \| `closed`. |

**`amount` object** (replaces the baked string «до $400 000»):

```jsonc
{ "valueUsd": 400000, "qualifier": "up_to", "period": null }
```

| `qualifier` | `period` | Renders as | Mock example it replaces |
|---|---|---|---|
| `exact` | — | `$620 000` | `"$620 000"` |
| `up_to` | — | `до $400 000` | `"до $400 000"` |
| `from` | — | `от $95 000` | (start-of-sales style) |
| `exact` | `month` | `$2 100 / мес` | `"$2 100 / мес"` |
| `up_to` | `month` | `до $1 800 / мес` | `"до $1 800 / мес"` |
| `negotiable` | — | `по договорённости` | `"по договорённости"` (omit `valueUsd`) |
| `free` | — | `бесплатно для агента` | `"бесплатно для агента"` (omit `valueUsd`) |

- `valueUsd` is a number in **USD**; omit (or `null`) for `negotiable` / `free`.
- `period: "month"` marks a recurring (rent) amount; absent/`null` for one-off sums.

---

## 7. Replies

### 7.1 List

`GET /api/community/threads/:id/replies` — chronological.

```jsonc
{
  "success": true,
  "data": [
    {
      "id": "r1",
      "threadId": "t2",
      "author": { "id": "m4", "name": "Олег Панин", "segment": "partner", "role": "expert", "company": "LegalPro" },
      "body": "При переуступке эскроу-счёт переоформляется на нового дольщика через банк…",
      "createdAt": "2026-06-13T05:10:00.000Z",
      "reactionCount": 22,
      "reactedByMe": false,
      "isBest": true
    }
  ]
}
```

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `threadId` | string | |
| `author` | object | Embedded summary, same shape as thread `author`. |
| `body` | string | |
| `createdAt` | ISO | |
| `reactionCount` | number | |
| `reactedByMe` | boolean | |
| `isBest` | boolean | Marked best answer; only one per `question` thread. |

### 7.2 Create

`POST /api/community/threads/:id/replies`

```jsonc
{ "body": "Добавлю: уточняйте у конкретного банка регламент…" }
```

- `authorId` from JWT. Response: the created `Reply`. Posting a reply should bump the thread's
  `lastActivityAt` and `replyCount`.

### 7.3 Reactions & best answer (NICE-TO-HAVE)

- `POST /api/community/threads/:id/reactions` → toggles the JWT user's like.
  Response: `{ "success": true, "data": { "reactionCount": 19, "reactedByMe": true } }`.
- `POST /api/community/replies/:id/reactions` → same for a reply.
- `PATCH /api/community/replies/:id/best` `{ "isBest": true }` → marks the reply best and sets the
  parent thread's `solved: true` (only the thread author / a moderator may do this). Clears any prior best.

---

## 8. Members

### 8.1 List + leaderboard

`GET /api/community/members?sort=trust&limit=3`

| Query | Notes |
|---|---|
| `sort` | `trust` (leaderboard, by `trustIndex` desc) \| `recent`. |
| `segment` / `role` | Optional filters. |
| `page` / `limit` | Pagination. |

The right rail uses `sort=trust&limit=3` (`topMembers`). The `sys` system account
(«BAZA Сообщество») must be **excluded from the leaderboard**.

### 8.2 Profile

`GET /api/community/members/:id`

```jsonc
{
  "success": true,
  "data": {
    "id": "m1",
    "name": "Ирина Соколова",
    "segment": "broker",
    "role": "moderator",
    "company": "Альфа-недвижимость",
    "city": "Москва",
    "crmContactId": "crm-c-901",
    "joinedAt": "2024-06-01T00:00:00.000Z",
    "lastActiveAt": "2026-06-13T09:00:00.000Z",
    "stats": {
      "trustIndex": 92,
      "solvedQuestions": 7,
      "cobrokingDeals": 4,
      "eventsYtd": 9,
      "reactionsReceived": 184
    },
    "badges": ["Проверенный брокер", "Модератор"]
  }
}
```

| Field | Type | Notes |
|---|---|---|
| `name` / `company` / `city` | string | Display. |
| `segment` / `role` | enum | §1. |
| `crmContactId` | string \| null | Link to CRM contact; `null` if not linked (mock uses `"—"` → send `null`). |
| `joinedAt` / `lastActiveAt` | ISO | Client renders «06.2024» / «сегодня». |
| `stats.trustIndex` | number | 0–100. |
| `stats.solvedQuestions` / `cobrokingDeals` / `eventsYtd` / `reactionsReceived` | number | Profile counters. |
| `badges` | string[] | Free-text verification badges. |

> `MemberProfilePage.tsx` also lists the member's threads — that's `GET /threads?authorId=:id` (§4), no extra endpoint.

---

## 9. Events (SHOULD)

`GET /api/community/events?upcoming=true`

```jsonc
{
  "success": true,
  "data": [
    { "id": "e1", "title": "Нетворкинг брокеров", "date": "2026-04-12", "format": "offline", "city": "Москва", "registrationOpen": true },
    { "id": "e2", "title": "MLS круглый стол",     "date": "2026-04-16", "format": "online",  "city": null,     "registrationOpen": true }
  ]
}
```

| Field | Type | Notes |
|---|---|---|
| `date` | `YYYY-MM-DD` | Client renders «12.04». |
| `format` | `online` \| `offline` | |
| `city` | string \| null | `null` for online. |
| `registrationOpen` | boolean | Toggles the «Регистрация» affordance. |

Used by the right rail (`forumKit.tsx`) and the **События** section page.

---

## 10. Trending tags (SHOULD)

`GET /api/community/tags/trending?limit=5`

```jsonc
{ "success": true, "data": [ { "tag": "эскроу", "count": 42 }, { "tag": "ипотека", "count": 31 } ] }
```

Right-rail widget. `count` is usage over a recent window (backend decides the window).

---

## 11. Error contract

On failure return `{ "success": false, "message": "..." }` (non-2xx is fine). The client surfaces
`message` verbatim, so make it descriptive:

- `"Тема не найдена"` / `"Раздел не найден"` / `"Участник не найден"`.
- `"Недостаточно прав"` — e.g. a non-author/non-moderator marking a best answer.
- `"Заполните обязательные поля"` — validation on create.

---

## 12. What changes on the frontend once the API exists

Today everything is the in-file mock in `src/components/community/forum/forumData.ts` (arrays +
synchronous accessors: `getThread`, `threadsBySection`, `repliesByThread`, `exchangeThreads`,
`feedThreads`, `topMembers`, `getMember`, …). When the endpoints land, we will:

1. Extract the types out of `forumData.ts` into `forum.types.ts` (no mock dependency).
2. Add a `src/services/forumApi.ts` service (axios + Bearer, mirroring `developmentApi.ts`) with the
   methods above, returning `ApiResponse<T>` / `PaginatedResponse<T>`.
3. Add a thin formatting layer (raw → display): relative time, money («$400 000»), `amount`/`deadline`
   objects → labels — the client already owns these mappings (`INTENT_LABEL`, `STATUS_LABEL`, …).
4. Switch the forum pages from the synchronous accessors to async loading (loading / error / empty
   states). The mock can stay behind a flag as an offline/demo fallback.

The swap is isolated to the data layer; the components already read through accessor functions, so
the UI does not change shape.

---

## 13. Quick acceptance test

1. `GET /sections` → returns the 9 seeded sections with `threads` counts.
2. `GET /threads?sort=feed` → pinned threads first, then by `lastActivityAt` desc; `exchange` is `null`
   for non-exchange threads.
3. `POST /threads` `{ type:"question", sectionId:"law", title:"…", body:"…" }` → returns the thread with
   `replyCount:0`; it then appears in `GET /threads?sectionId=law`.
4. `POST /threads/:id/replies` `{ body:"…" }` → the thread's `replyCount` increments and `lastActivityAt` bumps.
5. `GET /threads?type=exchange&intent=client_handover` → only co-broking-handover listings, each with a
   structured `exchange.amount` (numeric `valueUsd`, no baked string).
6. `GET /members?sort=trust&limit=3` → top 3 by `trustIndex`, excluding the `sys` account.
7. `GET /members/:id` → profile with ISO `joinedAt`/`lastActiveAt` and numeric `stats`; `GET /threads?authorId=:id`
   lists that member's threads.

If these pass, the feed, section pages, thread view, new-thread form, exchange board, member profiles,
and the right rail all work against the real API.

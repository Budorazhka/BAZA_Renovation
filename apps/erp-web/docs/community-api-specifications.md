# Спецификация API для раздела «Сообщество» (Форум)

Фронтендфорума полностью готов. Для полноценной работы с боевым API бэкенд должен реализовать следующие эндпоинты.

**Base URL:** `https://api-crm.baza.sale` (или локальный сервер из `.env`)

---

## Общие типы

```typescript
type ApiResponse<T> = {
  success: boolean
  data: T
  error?: string
}

type PaginatedResponse<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

type ThreadType = 'discussion' | 'question' | 'announcement' | 'exchange' | 'showcase'
type SectionKind = 'feed' | 'category' | 'exchange' | 'showcase' | 'events'
type ExchangeIntent = 'rent_seek' | 'buy_seek' | 'partner_seek' | 'client_handover' | 'rent_offer' | 'sale_offer' | 'service_offer'
type ExchangeSide = 'demand' | 'supply'
type ExchangeStatus = 'open' | 'in_work' | 'closed'
type MemberSegment = 'broker' | 'developer' | 'partner' | 'agent'
type CommunityRole = 'member' | 'expert' | 'moderator' | 'partner_admin'
```

---

## 1. Разделы форума

### GET `/api/community/sections`
Получение списка разделов с количеством тем.

**Ответ:**
```json
{
  "success": true,
  "data": {
    "sections": [
      {
        "id": "market",
        "name": "Лента рынка",
        "kind": "feed",
        "group": null,
        "icon": "megaphone",
        "description": "Анонсы застройщиков и изменения рынка",
        "threadCount": 124
      }
    ],
    "groups": ["Кулуары"]
  }
}
```

### GET `/api/community/sections/:id`
Получение одного раздела.

**Ответ:** `ApiResponse<ForumSection>`

---

## 2. Темы (треды)

### GET `/api/community/threads`
Лента тем с фильтрацией и пагинацией.

**Query параметры:**
| Параметр | Тип | Описание |
|----------|-----|----------|
| `section` | `string` | ID раздела |
| `type` | `ThreadType` | Тип темы (discussion, question, etc.) |
| `authorId` | `string` | ID автора |
| `tag` | `string` | Тег для фильтрации |
| `exchangeIntent` | `ExchangeIntent` | Только биржевые по интенту |
| `exchangeSide` | `ExchangeSide` | demand / supply |
| `exchangeStatus` | `ExchangeStatus` | open / in_work / closed |
| `search` | `string` | Поиск по заголовку и тексту |
| `sort` | `active` \| `new` \| `unanswered` | Сортировка |
| `page` | `number` | Номер страницы (по умолчанию 1) |
| `pageSize` | `number` | Элементов на странице (по умолчанию 20) |

**Ответ:** `ApiResponse<PaginatedResponse<ForumThread>>`

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "t1",
        "type": "announcement",
        "sectionId": "market",
        "title": "Старт продаж ЖК «Грин Парк»",
        "excerpt": "Открыли продажи первой очереди...",
        "authorId": "m3",
        "createdAt": "2026-04-12T10:00:00Z",
        "updatedAt": "2026-04-12T14:20:00Z",
        "views": 312,
        "reactionCount": 18,
        "replyCount": 6,
        "tags": ["жк-грин-парк", "старт-продаж"],
        "pinned": false,
        "solved": false,
        "exchange": null
      }
    ],
    "total": 42,
    "page": 1,
    "pageSize": 20,
    "hasMore": true
  }
}
```

**Примечания:**
- Закреплённые темы (`pinned: true`) всегда возвращаются первыми
- Для ленты главной страницы: `sort=active`, `section` не указывать
- Для раздела: `section={id}`, `sort` по выбору
- Для биржи: `type=exchange`

### GET `/api/community/threads/:id`
Получение одной темы с полным текстом.

**Ответ:**
```json
{
  "success": true,
  "data": {
    "id": "t2",
    "type": "question",
    "sectionId": "law",
    "title": "Как оформить эскроу при переуступке ДДУ?",
    "body": "Полный текст темы в markdown или HTML...",
    "excerpt": "Краткое описание для карточки",
    "authorId": "m2",
    "createdAt": "2026-04-12T08:00:00Z",
    "updatedAt": "2026-04-12T12:00:00Z",
    "views": 287,
    "reactionCount": 9,
    "replyCount": 14,
    "tags": ["эскроу", "переуступка", "дду"],
    "pinned": false,
    "solved": true,
    "exchange": null,
    "author": {
      "id": "m2",
      "name": "Георгий Мамедов",
      "segment": "broker",
      "role": "expert",
      "company": "GeoPrime Realty",
      "badges": ["Эксперт · право"]
    }
  }
}
```

### POST `/api/community/threads`
Создание новой темы.

**Тело запроса:**
```json
{
  "type": "question",
  "sectionId": "law",
  "title": "Вопрос по оформлению сделки",
  "body": "Текст темы...",
  "tags": ["сделки", "покупка"],
  "exchange": {
    "intent": "client_handover",
    "side": "supply",
    "dealKind": "Покупка, вторичка",
    "location": "Москва, Приморский",
    "amount": "до $400 000",
    "commission": "30%",
    "deadline": "до 30.04"
  }
}
```

**Примечания:**
- Поле `exchange` обязательно только для `type: "exchange"`
- Типы `announcement` и `showcase` доступны только для `role: "moderator"` или `role: "partner_admin"`

**Ответ:** `ApiResponse<ForumThread>` (созданная тема)

### PATCH `/api/community/threads/:id`
Редактирование темы (только автор или модератор).

**Тело запроса:** частичное обновление полей `title`, `body`, `tags`, `pinned`, `solved`

**Ответ:** `ApiResponse<ForumThread>`

### DELETE `/api/community/threads/:id`
Удаление темы (только автор или модератор).

**Ответ:** `ApiResponse<{ success: boolean }>`

### PATCH `/api/community/threads/:id/pin`
Закрепить/открепить тему (только модератор).

**Тело запроса:** `{ "pinned": true }`

---

## 3. Ответы

### GET `/api/community/threads/:id/replies`
Получение ответов в теме.

**Query параметры:**
| Параметр | Тип | Описание |
|----------|-----|----------|
| `page` | `number` | Номер страницы |
| `pageSize` | `number` | Элементов на странице |
| `sort` | `newest` \| `oldest` \| `best_first` | Сортировка |

**Ответ:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "r1",
        "threadId": "t2",
        "authorId": "m4",
        "createdAt": "2026-04-12T12:00:00Z",
        "body": "Текст ответа...",
        "reactionCount": 22,
        "isBest": true,
        "author": {
          "id": "m4",
          "name": "Олег Панин",
          "segment": "partner",
          "role": "expert",
          "company": "LegalPro",
          "badges": ["Эксперт · юрист"]
        }
      }
    ],
    "total": 14,
    "page": 1,
    "pageSize": 20,
    "hasMore": true
  }
}
```

### POST `/api/community/threads/:id/replies`
Создание ответа.

**Тело запроса:**
```json
{
  "body": "Текст ответа..."
}
```

**Ответ:** `ApiResponse<ForumReply>`

### PATCH `/api/community/replies/:id`
Редактирование ответа (только автор).

**Тело запроса:** `{ "body": "Обновлённый текст" }`

**Ответ:** `ApiResponse<ForumReply>`

### DELETE `/api/community/replies/:id`
Удаление ответа (только автор или модератор).

---

## 4. Лучший ответ

### PATCH `/api/community/threads/:id/best-reply`
Отметить ответ как лучший (только автор темы). Повторный вызов снимает отметку.

**Тело запроса:**
```json
{
  "replyId": "r1"
}
```

**Логика:**
- Если `replyId` уже помечен как лучший — снять отметку
- Если другой ответ уже был лучшим — заменить
- При установке лучшего ответа теме автоматически ставится `solved: true`
- При снятии лучшего ответа теме ставится `solved: false`

**Ответ:**
```json
{
  "success": true,
  "data": {
    "replyId": "r1",
    "isBest": true,
    "threadSolved": true
  }
}
```

---

## 5. Реакции (лайки)

### POST `/api/community/threads/:id/reactions`
Поставить/убрать реакцию на тему.

**Тело запроса:**
```json
{
  "type": "like"
}
```

**Логика:** Toggle — если уже стоит, убрать. Если нет — поставить.

**Ответ:**
```json
{
  "success": true,
  "data": {
    "reacted": true,
    "reactionCount": 19
  }
}
```

### POST `/api/community/replies/:id/reactions`
Поставить/убрать реакцию на ответ.

Аналогично теме.

**Ответ:**
```json
{
  "success": true,
  "data": {
    "reacted": false,
    "reactionCount": 21
  }
}
```

---

## 6. Участники

### GET `/api/community/members`
Список участников с лидербордом.

**Query параметры:**
| Параметр | Тип | Описание |
|----------|-----|----------|
| `sort` | `trust` \| `activity` \| `reactions` \| `joined` | Сортировка |
| `segment` | `MemberSegment` | Фильтр по сегменту |
| `role` | `CommunityRole` | Фильтр по роли |
| `search` | `string` | Поиск по имени |
| `inactive` | `boolean` | Только неактивные (не заходили >7 дней) |
| `page` | `number` | Страница |
| `pageSize` | `number` | Размер страницы |

**Ответ:** `ApiResponse<PaginatedResponse<ForumMember>>`

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "m1",
        "name": "Ирина Соколова",
        "segment": "broker",
        "role": "moderator",
        "company": "Альфа-недвижимость",
        "city": "Москва",
        "crmContactId": "crm-c-901",
        "joinedAt": "2024-06-12T00:00:00Z",
        "lastActiveAt": "2026-04-12T10:00:00Z",
        "trustIndex": 92,
        "solvedQuestions": 7,
        "cobrokingDeals": 4,
        "eventsYtd": 9,
        "reactionsReceived": 184,
        "badges": ["Проверенный брокер", "Модератор"]
      }
    ],
    "total": 7,
    "page": 1,
    "pageSize": 20,
    "hasMore": false
  }
}
```

### GET `/api/community/members/:id`
Профиль участника.

**Ответ:**
```json
{
  "success": true,
  "data": {
    "id": "m2",
    "name": "Георгий Мамедов",
    "segment": "broker",
    "role": "expert",
    "company": "GeoPrime Realty",
    "city": "Москва",
    "crmContactId": "crm-c-902",
    "joinedAt": "2025-01-20T00:00:00Z",
    "lastActiveAt": "2026-04-12T09:00:00Z",
    "trustIndex": 78,
    "solvedQuestions": 12,
    "cobrokingDeals": 2,
    "eventsYtd": 6,
    "reactionsReceived": 96,
    "badges": ["Эксперт · право"],
    "threadCount": 5,
    "replyCount": 23
  }
}
```

### GET `/api/community/members/:id/threads`
Темы участника.

**Ответ:** `ApiResponse<PaginatedResponse<ForumThread>>`

### PATCH `/api/community/members/:id/role`
Изменение роли участника (только модератор).

**Тело запроса:** `{ "role": "expert" }`

---

## 7. События

### GET `/api/community/events`
Список событий.

**Query параметры:**
| Параметр | Тип | Описание |
|----------|-----|----------|
| `status` | `planned` \| `done` | Фильтр по статусу |
| `format` | `online` \| `offline` | Фильтр по формату |

**Ответ:**
```json
{
  "success": true,
  "data": [
    {
      "id": "e1",
      "title": "Нетворкинг брокеров",
      "date": "2026-04-12T18:00:00Z",
      "format": "offline",
      "city": "Москва",
      "description": "Описание события...",
      "registrationOpen": true,
      "attendees": 38,
      "capacity": 50,
      "status": "planned",
      "createdAt": "2026-03-20T10:00:00Z"
    }
  ]
}
```

### POST `/api/community/events`
Создание события (только модератор).

**Тело запроса:**
```json
{
  "title": "Нетворкинг брокеров",
  "date": "2026-04-12T18:00:00Z",
  "format": "offline",
  "city": "Москва",
  "description": "Описание...",
  "capacity": 50
}
```

### POST `/api/community/events/:id/register`
Регистрация на событие.

**Ответ:**
```json
{
  "success": true,
  "data": {
    "registered": true,
    "attendees": 39
  }
}
```

---

## 8. Теги

### GET `/api/community/tags/trending`
Популярные теги для правого рельса.

**Query параметры:**
| Параметр | Тип | Описание |
|----------|-----|----------|
| `limit` | `number` | Количество (по умолчанию 5) |

**Ответ:**
```json
{
  "success": true,
  "data": [
    { "tag": "эскроу", "count": 42 },
    { "tag": "ипотека", "count": 31 },
    { "tag": "внж-сделки", "count": 27 }
  ]
}
```

### GET `/api/community/tags/search`
Поиск тегов для автокомплита.

**Query параметры:**
| Параметр | Тип | Описание |
|----------|-----|----------|
| `q` | `string` | Префикс тега |
| `limit` | `number` | Максимум результатов |

---

## 9. Поиск

### GET `/api/community/search`
Глобальный поиск по сообществу.

**Query параметры:**
| Параметр | Тип | Описание |
|----------|-----|----------|
| `q` | `string` | Поисковый запрос |
| `type` | `threads` \| `members` \| `all` | Тип результатов |
| `page` | `number` | Страница |
| `pageSize` | `number` | Размер страницы |

**Ответ:**
```json
{
  "success": true,
  "data": {
    "threads": [...],
    "members": [...],
    "total": 15
  }
}
```

---

## 10. Статистика (для дашборда панели)

### GET `/api/community/stats`
Агрегированная статистика для панели управления.

**Ответ:**
```json
{
  "success": true,
  "data": {
    "totalMembers": 7,
    "activeLast7Days": 5,
    "avgEngagement": 73,
    "plannedEvents": 3,
    "atRiskMembers": 2,
    "totalThreads": 42,
    "totalReplies": 156,
    "solvedQuestions": 28
  }
}
```

---

## 11. Биржа (специальные эндпоинты)

### GET `/api/community/exchange/board`
Доска биржи — разбивка на спрос/предложение с фильтрами.

**Query параметры:**
| Параметр | Тип | Описание |
|----------|-----|----------|
| `intentGroup` | `sale` \| `rent` \| `cobroking` \| `service` | Группа интентов |
| `side` | `demand` \| `supply` | Сторона стакана |

**Ответ:**
```json
{
  "success": true,
  "data": {
    "demand": [...],
    "supply": [...],
    "total": 92
  }
}
```

### PATCH `/api/community/threads/:id/exchange/status`
Обновление статуса биржевого объявления (только автор).

**Тело запроса:** `{ "status": "in_work" }`

**Допустимые переходы:**
- `open` → `in_work`
- `in_work` → `closed`
- `in_work` → `open` (откат)
- `open` → `closed`

---

## 12. WebSocket события

Сервер должен транслировать события через **Socket.io** для обновления данных в реальном времени.

### События:
1. `thread:created` — новая тема
2. `thread:updated` — обновление темы (включая pin/solved)
3. `thread:deleted` — удаление темы
4. `reply:created` — новый ответ
5. `reply:updated` — редактирование ответа
6. `reply:deleted` — удаление ответа
7. `reaction:changed` — изменение реакции (обновить счётчик)
8. `member:online` — участник зашёл
9. `event:updated` — обновление события (места, статус)

### Каналы:
- `community:feed` — лента главной страницы
- `community:section:{id}` — конкретный раздел
- `community:thread:{id}` — конкретная тема
- `community:exchange` — биржа

---

## Реализация на фронтенде

Код фронтенда полностью готов. Сервисный слой `src/services/communityApi.ts` реализует механизм **auto-fallback**:

1. При первом запросе делается probe `GET /api/community/sections`
2. Если API отвечает → все данные только из API, моки **полностью отключаются**
3. Если API недоступен → работают локальные заглушки из `forumData.ts`
4. При перезагрузке проверка повторяется — как только бэкенд появится, моки сразу исчезнут

**Все данные грузятся через API:**
- Лента тем, разделы, треды, ответы
- Реакции (лайки) на темы и ответы
- Лучший ответ
- Биржа (спрос/предложение)
- Участники и лидерборд (Топ недели)
- События (Ближайшие события)
- Популярные теги (Сейчас обсуждают)
- Мой индекс (текущий пользователь)
- Поиск
- Статистика для дашборда

Для включения боевого API необходимо:
1. Реализовать все эндпоинты выше
2. Настроить WebSocket подключение для канала `community`

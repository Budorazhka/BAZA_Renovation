# CRM API Reference — BAZA.sale

> Справочник всех REST- и WebSocket-эндпоинтов CRM-системы для интеграции с внешними системами.

## Содержание

1. [Общая информация](#общая-информация)
2. [Авторизация](#авторизация)
3. [Лиды (Leads)](#лиды-leads)
4. [Аналитика (Analytics)](#аналитика-analytics)
5. [Задачи (Tasks)](#задачи-tasks)
6. [Календарь (Calendar)](#календарь-calendar)
7. [Заметки (Notes)](#заметки-notes)
8. [Уведомления (Notifications)](#уведомления-notifications)
9. [Обращения (Appeals)](#обращения-appeals)
10. [Онлайн-статус (Online)](#онлайн-статус-online)
11. [Настройки (Settings)](#настройки-settings)
12. [Файлы (Files)](#файлы-files)
13. [Админ-панель (Admin)](#админ-панель-admin)
14. [Внешний API (Baza Public API)](#внешний-api-baza-public-api)
15. [WebSocket (Socket.IO)](#websocket-socketio)

---

## Общая информация

### Base URLs

| Сервис | Production URL | Dev URL | Переменная окружения |
|---|---|---|---|
| CRM API (основной) | `https://api-crm.baza.sale` | `http://localhost:3000` | `VITE_CRM_API_BASE_URL` |
| Baza Public API | `https://api.baza.sale` | — | `VITE_USER_FAVORITES_API_BASE_URL` |
| Socket.IO | = CRM API URL | — | `VITE_WS_URL` |

### Общая структура ответа

Все ответы CRM API имеют единый формат:

```typescript
interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string; // сообщение об ошибке при success=false
}
```

### Пагинация

Эндпоинты с пагинацией возвращают:

```typescript
interface PaginatedResult<T> {
  items: T[];
  total: number;       // общее количество записей
  page: number;        // текущая страница (с 1)
  totalPages: number;  // общее количество страниц
}
```

### Авторизация запросов

Два механизма авторизации:

1. **JWT Bearer Token** — в заголовке `Authorization: Bearer <token>` (для HTTP-запросов и Socket.IO)
2. **Query-параметры** — `userId` + `userRole` (fallback для某些 эндпоинтов, передаются через `getAuthQuery()`)

> **Важно:** Большинство эндпоинтов принимают авторизацию через query-параметры `{ userId, userRole }`. Это означает, что даже без JWT-токена можно вызвать эндпоинт, передав `userId` и `userRole` в query string.

---

## Авторизация

### POST /auth/login

Авторизация по email + опциональный пароль. Возвращает JWT-токен.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "secret"  // опционально
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "id": "690ca643abbceba815ba7090",
    "role": "agent" | "mentor" | "manager" | "admin"
  }
}
```

**Особенности:**
- Пароль опционален —某些 пользователи могут входить только по email
- При 502/503/504 ошибках возвращает friendly-сообщение
- Токен сохраняется клиентом в `localStorage` как `jwt_token`
- Срок жизни токена: **7 часов**

### POST /auth/mock-login

Авторизация по ID пользователя без пароля (dev/demo). Используется при 401/403 для автоматического восстановления сессии.

**Request:**
```json
{
  "id": "690ca643abbceba815ba7090",
  "role": "agent"
}
```

**Response:** Тот же формат, что и `/auth/login`.

**Особенности:**
- По умолчанию ID = `690ca643abbceba815ba7090`, role = `agent`
- Используется автоматически при отсутствии валидного JWT
- В dev-режиме автоматически вызывается при 401/403

### POST /admin/login

Вход в админ-панель по админскому токену.

**Request:**
```
POST /admin/login?token=<ADMIN_TOKEN>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "OK",
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

**Особенности:**
- Админский токен передаётся как query-параметр `token`
- Полученный JWT сохраняется в `localStorage` как `jwt_token`
- Админский токен сохраняется в `localStorage` + `sessionStorage` как `admin_token`
- При админ-запросах админский токен передаётся в заголовке `X-Admin-Token`

---

## Лиды (Leads)

### GET /crm/leads

Получение списка лидов с фильтрацией и пагинацией.

**Query-параметры:**
| Параметр | Тип | Описание |
|---|---|---|
| `page` | number | Номер страницы (с 1) |
| `limit` | number | Количество на странице |
| `stage` | LeadStage | Фильтр по этапу воронки |
| `productType` | ProductType | Тип продукта: `sales`, `network`, `owner`, `agent` |
| `assignedTo` | string | ID ответственного |
| `source` | string | Источник лида |
| `search` | string | Поиск по имени/телефону/email |
| `userId` | string | ID текущего пользователя (auth query) |
| `userRole` | UserRole | Роль текущего пользователя (auth query) |

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [/* Lead[] */],
    "total": 150,
    "page": 1,
    "totalPages": 15
  }
}
```

**Особенности:**
- По умолчанию возвращает лиды текущего пользователя (определяется по JWT или userId/userRole)

---

### GET /crm/leads/:id

Получение одного лида по ID.

**Response:**
```json
{
  "success": true,
  "data": {/* Lead */}
}
```

---

### POST /crm/leads

Создание нового лида.

**Request:**
```json
{
  "name": "Иван Иванов",
  "phone": "+79001234567",
  "email": "ivan@example.com",       // опционально
  "city": "Москва",                  // опционально
  "productType": "sales",
  "assignedTo": "user_id_here",
  "source": "recom.ru",             // опционально
  "notes": "Заинтересован в 2-ком", // опционально
  "dealValue": 15000000,            // опционально
  "expectedCloseDate": "2026-09-01", // опционально
  "budgetValue": 1000000,           // опционально
  "budgetCurrency": "USD"           // опционально: USD | EUR | RUB | KZT
}
```

**Response:** `{ success: true, data: Lead }`

**Особенности:**
- `name`, `phone`, `productType`, `assignedTo` — обязательные поля
- При дубле телефона/email бэкенд возвращает **409 Conflict**
- Все строковые поля автоматически trim'ятся

---

### PATCH /crm/leads/:id

Обновление данных лида (частичное обновление).

**Request:**
```json
{
  "name": "Новое имя",
  "phone": "+79001234567",
  "email": "new@example.com",
  "city": "СПб",
  "stage": "qualification",
  "productType": "network",
  "realtorStage": "realtor_1",
  "curatorStage": "curator_2",
  "assignedTo": "user_id",
  "source": "website",
  "notes": "Новые заметки",
  "rejectionReason": "price_too_high",
  "rejectionComment": "Клиент считает цену завышенной",
  "dealValue": 20000000,
  "expectedCloseDate": "2026-10-01",
  "budgetValue": 1500000,
  "budgetCurrency": "EUR",
  "telegram": "@username",
  "country": "ОАЭ",
  "tags": ["VIP", "premium"]
}
```

**Response:** `{ success: true, data: Lead }`

**Особенности:**
- Можно передавать только изменяемые поля
- `tags` — массив строк, максимум 2 тега по 128 символов
- 409 Conflict при дубле телефона/email

---

### PATCH /crm/leads/:id/stage

Смена этапа воронки лида.

**Request:**
```json
{
  "stage": "qualification",           // опционально
  "realtorStage": "realtor_2",        // опционально
  "curatorStage": "curator_3",        // опционально
  "comment": "Переведён в квалификацию", // опционально
  "rejectionReason": "not_interested", // опционально
  "rejectionComment": "Не заинтересован" // опционально
}
```

**Response:** `{ success: true, data: Lead }`

**Особенности:**
- **Обязательно** передать хотя бы один из `stage`, `realtorStage`, `curatorStage`
- При смене этапа бэкенд автоматически сохраняет запись в историю

---

### DELETE /crm/leads/:id

Удаление лида.

**Response:**
```json
{
  "success": true,
  "data": { "deleted": true }
}
```

---

### POST /crm/leads/:leadId/history

Добавление записи в историю лида.

**Request:**
```json
{
  "message": "Позвонил клиенту, ответил положительно",
  "comment": "Перезвонить завтра"  // опционально
}
```

**Response:** `{ success: true, data: LeadHistory }`

---

### POST /crm/leads/:leadId/contact-action

Фиксация действия контакта (+1 звонок или +1 чат).

**Request:**
```json
{
  "type": "call" | "chat"
}
```

**Response:**
```json
{
  "success": true,
  "data": { "recorded": true }
}
```

**Особенности:**
- Бэкенд автоматически сохраняет дату и время действия
- Требует `userId` и `userRole` в query

---

### GET /crm/leads/:leadId/history

Получение полной истории изменений лида.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "fromStage": "first_contact",
      "toStage": "qualification",
      "changedAt": "2026-06-29T10:00:00Z",
      "changedBy": "user_id",
      "userName": "Иван Иванов",
      "userRole": "manager",
      "comment": "Переведён в квалификацию"
    },
    {
      "type": "stage_comment",
      "stage": "qualification",
      "stageName": "Квалификация",
      "comment": "Заметка по этапу",
      "createdAt": "2026-06-29T11:00:00Z",
      "updatedAt": "2026-06-29T11:00:00Z",
      "createdBy": { "_id": "...", "name": "...", "email": "..." }
    }
  ]
}
```

---

### GET /crm/leads/count

Получение количества лидов по email.

**Query:** `email=user@example.com`

**Response:**
```json
{
  "success": true,
  "data": { "count": 42 }
}
```

---

### POST /crm/leads/by-emails

Массовое получение лидов по списку email.

**Request:**
```json
{
  "emails": ["user1@example.com", "user2@example.com"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [/* Lead[] */],
    "total": 10,
    "emailsFound": 2,
    "emailsNotFound": ["missing@example.com"]
  }
}
```

---

### POST /crm/leads/bulk-assign

Массовое переназначение лидов от одного менеджера к другому.

**Request:**
```json
{
  "fromManagerId": "old_manager_id",
  "toManagerId": "new_manager_id"
}
```

**Response:**
```json
{
  "success": true,
  "data": { "updated": 15 }
}
```

**Особенности:**
- Требует `userId` и `userRole` в query

---

### Чеклисты

#### POST /crm/leads/:leadId/checklist

Сохранение состояния чеклиста.

**Request:**
```json
{
  "items": [
    { "stage": "first_contact", "index": 0, "checked": true },
    { "stage": "first_contact", "index": 1, "checked": false }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": { "leadId": "...", "savedCount": 2 }
}
```

#### GET /crm/leads/:leadId/checklist

Получение состояния чеклиста.

**Response:**
```json
{
  "success": true,
  "data": {
    "leadId": "...",
    "items": [
      { "stage": "first_contact", "index": 0, "checked": true, "updatedAt": "..." },
      { "stage": "first_contact", "index": 1, "checked": false, "updatedAt": "..." }
    ],
    "totalChecked": 1,
    "totalItems": 5
  }
}
```

#### PATCH /crm/leads/:leadId/checklist/item

Обновление одного элемента чеклиста.

**Request:**
```json
{
  "stage": "first_contact",
  "index": 0,
  "checked": true
}
```

---

### Комментарии к этапам (Stage Comments)

#### POST /crm/leads/:leadId/stage-comment

Создание/обновление комментария к этапу.

**Request:**
```json
{
  "stage": "qualification",
  "comment": "Клиент заинтересован, обсудили бюджет"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "...",
    "leadId": "...",
    "stage": "qualification",
    "comment": "...",
    "createdBy": "...",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

#### GET /crm/leads/:leadId/stage-comment/:stage

Получение комментария к конкретному этапу.

#### GET /crm/leads/:leadId/stage-comments

Получение всех комментариев по этапам лида.

#### DELETE /crm/leads/:leadId/stage-comment/:stage

Удаление комментария к этапу.

---

### Файлы лидов

#### POST /crm/leads/:leadId/files

Загрузка файлов на лид (multipart/form-data).

**Request:** `FormData` с полем `file` (один файл) или `files[]` (массив файлов).

**Response:**
```json
{
  "success": true,
  "data": { "lead": {/* Lead с обновлённым файлом */}, "message": "..." }
}
```

**Особенности:**
- При bulk-загрузке сначала пробует ключ `files[]`, при 404 — `files`
- Timeout рассчитывается автоматически на основе размера файлов

#### GET /crm/leads/:leadId/files

Получение списка файлов лида.

**Response:**
```json
{
  "success": true,
  "data": {
    "files": [
      {
        "filename": "abc123.pdf",
        "originalName": "Договор.pdf",
        "mimeType": "application/pdf",
        "size": 1048576,
        "url": "https://cdn.baza.sale/..."
      }
    ],
    "count": 1
  }
}
```

#### DELETE /crm/leads/:leadId/files/by-name/:filename

Удаление файла по имени (URL-encoded).

#### POST /crm/leads/:leadId/files/register

Регистрация уже загруженного файла (если файл загружается отдельно через CDN).

**Request:**
```json
{
  "url": "https://cdn.baza.sale/file.pdf",
  "key": "abc123",
  "filename": "abc123.pdf",
  "originalName": "Договор.pdf",
  "mimeType": "application/pdf",
  "size": 1048576
}
```

#### POST /crm/leads/:leadId/files/register/bulk

Массовая регистрация файлов.

**Request:**
```json
{
  "files": [/* массив fileInfo объектов */]
}
```

---

### База файлов (Base Files)

#### GET /crm/files/base

Получение списка базовых файлов (шаблоны).

**Query:** `productType=sales` (опционально)

**Response:**
```json
{
  "success": true,
  "data": {
    "files": [/* LeadFile[] */],
    "count": 10
  }
}
```

#### POST /crm/leads/:leadId/files/attach-base

Прикрепление базовых файлов к лиду.

**Request:**
```json
{
  "fileIds": ["file_id_1", "file_id_2"]
}
```

#### POST /crm/files/base/upload

Загрузка файлов в базу (требует админский токен).

**Headers:** `X-Admin-Token: <token>`
**Request:** `FormData` с полями `files` и `productType`

#### DELETE /crm/files/base/:fileId

Удаление файла из базы (требует админский токен).

---

### Библиотека файлов (Realtor Library)

#### GET /crm/files/library

Получение файлов из библиотеки риэлтора.

**Query:**
| Параметр | Тип | Описание |
|---|---|---|
| `folderId` | string | ID папки (опционально) |
| `includeFolders` | boolean | Включить папки в ответ |
| `productType` | ProductType | Фильтр по типу продукта |

**Response:**
```json
{
  "success": true,
  "data": {
    "files": [/* LeadFile[] */],
    "folders": [/* LibraryFolder[] */],
    "count": 5,
    "foldersCount": 2
  }
}
```

#### POST /crm/files/library/upload

Загрузка файлов в библиотеку.

**Request:** `FormData` с полями `files` и опционально `folderId`.

#### POST /crm/leads/:leadId/files/attach-library

Прикрепление файлов из библиотеки к лиду.

#### DELETE /crm/files/library/:fileId

Удаление файла из библиотеки.

#### POST /crm/files/library/folders

Создание папки в библиотеке.

**Request:**
```json
{
  "name": "Договоры",
  "parentId": null  // или ID родительской папки
}
```

#### DELETE /crm/files/library/folders/:folderId

Удаление папки.

**Query:** `force=true` — принудительное удаление с подпапками и файлами.

---

## Аналитика (Analytics)

### GET /crm/analytics/leads-stats

Статистика лидов текущего пользователя за период.

**Query:** `period=week|month|allTime`

**Response:**
```json
{
  "success": true,
  "data": {
    "leadsCount": 42,
    "timeseries": [
      { "date": "2026-06-23", "leads": 5 },
      { "date": "2026-06-24", "leads": 3 }
    ]
  }
}
```

**Особенности:** При 404 возвращает нулевые данные.

---

### GET /crm/analytics/leads-stats/by-email

Статистика лидов по email партнёра.

**Query:** `email=partner@example.com&period=week`

**Response:** Аналогичен `leads-stats`.

---

### GET /crm/analytics/leads-by-stage

Распределение лидов по этапам воронки.

**Query:** `productType=sales&assignedTo=user_id` (все опционально)

**Response:**
```json
{
  "success": true,
  "data": {
    "first_contact": 15,
    "qualification": 8,
    "proposal": 3,
    "deal_closed": 2
  }
}
```

---

### GET /crm/analytics/leads-by-stage/by-email

Распределение лидов по этапам для конкретного email.

**Query:** `email=partner@example.com&productType=sales`

**Особенности:**
- 403 — нет доступа к статистике этого пользователя
- Неверный формат userId в JWT → ошибка

---

### GET /crm/analytics/leads-by-email-by-stage

Воронки по каждому продукту (sales, network, owner, broker) для email.

**Query:** `email=partner@example.com`

**Response:**
```json
{
  "success": true,
  "data": {
    "sales": { "first_contact": 5, "qualification": 3 },
    "network": { "network_new_lead": 10 },
    "owner": { "owner_new_owner": 2 },
    "broker": { "agent_new_agent": 1 }
  }
}
```

---

### POST /crm/analytics/sales-leads-count/by-emails

Массовый подсчёт лидов по списку email.

**Request:**
```json
{
  "emails": ["user1@example.com", "user2@example.com"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user1@example.com": 15,
    "user2@example.com": 3
  }
}
```

---

### POST /crm/analytics/sales-leads-count/by-user-ids

Массовый подсчёт лидов по списку user IDs.

**Request:**
```json
{
  "userIds": ["id1", "id2"]
}
```

---

### GET /crm/analytics/contact-actions

Статистика контактов (звонки/чаты) текущего пользователя.

**Query:** `period=week|month|allTime`

**Response:**
```json
{
  "success": true,
  "data": {
    "callsCount": 25,
    "chatsCount": 12,
    "timeseries": [
      { "date": "2026-06-23", "calls": 5, "chats": 2 }
    ]
  }
}
```

---

### GET /crm/analytics/contact-actions/by-email

Статистика контактов по email партнёра.

**Query:** `email=partner@example.com&period=month`

---

### GET /crm/analytics/partner-summary

KPI-сводка по партнёру.

**Query:** `email=partner@example.com&period=month`

**Response:**
```json
{
  "success": true,
  "data": {
    "addedLeads": 10,
    "callClicks": 25,
    "chatOpens": 12,
    "selectionsCreated": 5,
    "deals": 2
  }
}
```

---

### GET /crm/analytics/lead-report

Единый отчёт по лиду или текущему пользователю.

**Query:**
| Параметр | Тип | Описание |
|---|---|---|
| `leadId` | string | ID лида (опционально) |
| `email` | string | Email (опционально) |
| `period` | string | `week`, `month`, `allTime` |

**Response:**
```json
{
  "success": true,
  "data": {
    "lead": { "id": "...", "name": "Иван", "email": "ivan@example.com" },
    "staticKpi": {
      "totalLeads": 42,
      "totalDeals": 5,
      "level1Referrals": 3,
      "level2Referrals": 1,
      "totalListings": 8
    },
    "dynamicKpi": {
      "addedListings": 2,
      "addedLevel1Referrals": 1,
      "addedLevel2Referrals": 0,
      "addedLeads": 10,
      "callClicks": 25,
      "chatOpens": 12,
      "selectionsCreated": 5,
      "deals": 2
    },
    "leadsTimeseries": [{ "date": "2026-06-23", "leads": 5 }],
    "activityTimeseries": [{ "date": "2026-06-23", "calls": 5, "chats": 2 }],
    "monthActivityTimeseries": [/*...*/],
    "allTimeActivityTimeseries": [/*...*/],
    "stageCountsByProduct": {
      "sales": { "first_contact": 5 },
      "network": { "network_new_lead": 10 }
    },
    "l1ReferralEmails": ["ref1@example.com"]
  }
}
```

**Особенности:**
- Без `leadId` и `email` — отчёт по текущему пользователю (JWT)
- `l1ReferralEmails` — используется для fallback-подсчёта L2 на фронте

---

### GET /crm/analytics/network-report

Отчёт по сети (агрегированные данные по всем партнёрам).

**Query:** `period=week|month|allTime`

**Response:**
```json
{
  "success": true,
  "data": {
    "staticKpi": { "totalLeads": 500, "totalDeals": 50, "level1Referrals": 30, "level2Referrals": 10, "totalListings": 80 },
    "dynamicKpi": { "addedListings": 5, "addedLeads": 20, "callClicks": 100, "chatOpens": 50, "selectionsCreated": 15, "deals": 5 },
    "todayDelta": { /* то же что dynamicKpi, но за сегодня */ },
    "activityTimeseries": [{ "date": "...", "calls": 10, "chats": 5, "selections": 3 }],
    "leadsTimeseries": [{ "date": "...", "leads": 5 }]
  }
}
```

---

### GET /crm/analytics/plan

План по метрикам (неделя/месяц).

**Query:** `leadId=...` (опционально, для плана партнёра)

**Response:**
```json
{
  "success": true,
  "data": {
    "week": { "leads": 10, "contacts": 50, "deals": 2 },
    "month": { "leads": 40, "contacts": 200, "deals": 8 }
  }
}
```

### PUT /crm/analytics/plan

Сохранение плана по метрикам.

**Request:** Тот же формат, что и ответ `GET /crm/analytics/plan`.

---

### GET /crm/analytics/getAllNumbersLeads

Общее количество лидов по email.

**Query:** `email=partner@example.com`

**Response:**
```json
{
  "success": true,
  "data": { "count": 42 }
}
```

**Особенности:**
- 403 — нет доступа
- Если пользователь не найден — возвращает `{ count: 0 }`

---

### GET /crm/analytics/getAllNumbersLeadsForAllCategories

Количество лидов по каждому этапу для email.

**Query:** `email=partner@example.com`

**Response:**
```json
{
  "success": true,
  "data": [
    { "stage": "first_contact", "count": 15 },
    { "stage": "qualification", "count": 8 }
  ]
}
```

---

## Задачи (Tasks)

### GET /tasks

Получение списка задач с фильтрацией и пагинацией.

**Query:**
| Параметр | Тип | Описание |
|---|---|---|
| `page` | number | Номер страницы |
| `limit` | number | Количество на странице |
| `status` | TaskStatus | `pending`, `in_progress`, `completed`, `cancelled` |
| `priority` | TaskPriority | `urgent_important`, `not_urgent_important`, ... |
| `assignedTo` | string | ID ответственного |
| `leadId` | string | ID связанного лида |
| `userId` | string | ID текущего пользователя (auth query) |
| `userRole` | UserRole | Роль текущего пользователя (auth query) |

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [/* Task[] */],
    "total": 50,
    "page": 1,
    "totalPages": 5
  }
}
```

---

### GET /tasks/:id

Получение одной задачи по ID.

---

### POST /tasks

Создание задачи.

**Request:**
```json
{
  "title": "Позвонить клиенту",
  "description": "Обсудить условия сделки",
  "priority": "urgent_important",
  "startDate": "2026-06-30T10:00:00Z",
  "endDate": "2026-06-30T18:00:00Z",
  "colorLabel": "#FF5722",
  "category": 1,
  "categories": ["Звонки"],
  "clientName": "Иван Иванов",
  "assignedTo": "user_id",
  "leadId": "lead_id",
  "subtasks": [
    { "title": "Подготовить документы", "completed": false }
  ],
  "syncWithCalendar": true
}
```

---

### PATCH /tasks/:id

Обновление задачи.

**Особенности:**
- Подзадачи (`subtasks`) обновляются как целый массив — бэкенд заменяет все подзадачи

---

### DELETE /tasks/:id

Удаление задачи.

---

### GET /tasks/archive

Получение архивных задач.

**Query:** Аналогичен `GET /tasks`.

---

### PATCH /tasks/:id/restore

Восстановление задачи из архива.

---

### Категории задач

#### GET /tasks/getCategoryList

Получение списка категорий задач.

#### POST /tasks/categories

Создание категории задач.

**Request:**
```json
{ "name": "Звонки", "id": 1 }
```

#### POST /tasks/categories/get-or-create

Получение или создание категории по имени.

**Request:**
```json
{ "name": "Звонки" }
```

---

### Подзадачи (Subtasks)

Подзадачи не имеют отдельных эндпоинтов — они управляются через PATCH /tasks/:id:

- **Добавление:** передать полный список `subtasks` с новой подзадачей
- **Обновление статуса:** передать `subtasks` с изменённым `completed` у нужного индекса
- **Удаление:** передать `subtasks` без удаляемой подзадачи

---

### Файлы задач

#### POST /tasks/:taskId/files

Загрузка файла (multipart/form-data, поле `file`).

**Response:**
```json
{
  "success": true,
  "data": { "task": {/* Task с файлом */}, "message": "..." }
}
```

**Особенности:**
- Bulk-загрузка загружает файлы **последовательно** (по одному)
- При ошибке одного файла — считается failed, остальные продолжаются

#### GET /tasks/:taskId/files

Получение списка файлов задачи.

#### DELETE /tasks/:taskId/files/:fileIndex

Удаление файла по индексу.

#### DELETE /tasks/:taskId/files/by-name/:filename

Удаление файла по имени (URL-encoded).

#### POST /tasks/:taskId/files/register

Регистрация уже загруженного файла (аналогично лидам).

#### POST /tasks/:taskId/files/register/bulk

Массовая регистрация файлов.

---

## Календарь (Calendar)

### POST /calendar/events

Создание события календаря.

**Request:**
```json
{
  "title": "Встреча с клиентом",
  "description": "Обсуждение сделки",
  "startTime": "2026-06-30T14:00:00Z",
  "endTime": "2026-06-30T15:00:00Z",
  "type": "meeting",
  "status": "scheduled",
  "isAllDay": false,
  "location": "Офис на Тверской",
  "meetingUrl": "https://meet.google.com/abc-defg-hij",
  "leadId": "lead_id",
  "taskId": "task_id",
  "participants": ["user_id_1", "user_id_2"],
  "externalParticipants": ["client@example.com"],
  "reminderMinutes": [15, 60],
  "isRecurring": false,
  "recurringRule": "RRULE:FREQ=WEEKLY;COUNT=10",
  "parentEventId": "parent_event_id"
}
```

**Особенности:**
- `type`: `meeting`, `call`, `reminder`, `task`, `lead_followup`
- `status`: `scheduled`, `in_progress`, `completed`, `cancelled`, `no_show`

---

### GET /calendar/events

Получение событий с фильтрацией и пагинацией.

**Query:**
| Параметр | Тип | Описание |
|---|---|---|
| `page` | number | Страница |
| `limit` | number | Количество |
| `startDate` | string | Начало периода (ISO) |
| `endDate` | string | Конец периода (ISO) |
| `type` | EventType | Тип события |
| `status` | EventStatus | Статус |
| `leadId` | string | ID лида |
| `taskId` | string | ID задачи |
| `isRecurring` | boolean | Только повторяющиеся |
| `search` | string | Поиск по названию |

---

### GET /calendar/events/view

Получение событий для отображения (без пагинации, возвращает массив).

**Query:** `startDate`, `endDate`, `type`, `userId`, `userRole`

---

### GET /calendar/events/:id

Получение одного события.

---

### PATCH /calendar/events/:id

Обновление события.

---

### PATCH /calendar/events/:id/move

Перемещение события во времени (drag & drop).

**Request:**
```json
{
  "newStartTime": "2026-06-30T16:00:00Z",
  "newEndTime": "2026-06-30T17:00:00Z"
}
```

---

### DELETE /calendar/events/:id

Удаление события. **Обязательный** query-параметр `userId`.

---

### GET /calendar/unified

Единый вид календаря: события + задачи за период.

**Query:** `startDate`, `endDate`, `type`, `userId`, `userRole`

**Response:**
```json
{
  "success": true,
  "data": {
    "events": [/* CalendarEvent[] */],
    "tasks": [
      {
        "_id": "...",
        "title": "Задача",
        "startDate": "...",
        "endDate": "...",
        "priority": "urgent_important",
        "status": "pending",
        "type": "task",
        "taskId": "...",
        "colorLabel": "#FF5722"
      }
    ]
  }
}
```

---

## Заметки (Notes)

### POST /notes

Создание заметки.

**Request:**
```json
{
  "title": "Заметка по звонку",
  "content": "Клиент заинтересован в 2-комнатной квартире",
  "isPinned": false,
  "category": 1,
  "fullName": "Иван Иванов",
  "leadId": "lead_id",   // опционально — привязка к лиду
  "taskId": "task_id"    // опционально — привязка к задаче
}
```

---

### GET /notes

Получение списка заметок с фильтрацией.

**Query:**
| Параметр | Тип | Описание |
|---|---|---|
| `page` | number | Страница |
| `limit` | number | Количество |
| `isPinned` | boolean | Только закреплённые |
| `leadId` | string | По лиду |
| `taskId` | string | По задаче |
| `search` | string | Поиск по содержимому |

---

### GET /notes/:id

Получение одной заметки.

---

### PATCH /notes/:id

Обновление заметки.

---

### DELETE /notes/:id

Удаление заметки.

---

### PATCH /notes/:id/pin

Закрепление/открепление заметки.

**Request:**
```json
{ "isPinned": true }
```

---

### Категории заметок

#### GET /notes/getCategoryList

Получение списка категорий.

#### POST /notes/categories

Создание категории.

#### POST /notes/categories/get-or-create

Получение или создание по имени.

---

### Файлы заметок

#### POST /notes/:noteId/files

Загрузка файла (multipart/form-data, поле `file`).

**Особенности:**
- Bulk-загрузка — последовательная, по одному файлу

#### GET /notes/:noteId/files/:fileIndex

Получение файла (возвращает `Blob`).

#### DELETE /notes/:noteId/files/:fileIndex

Удаление файла по индексу.

#### POST /notes/:noteId/files/register

Регистрация уже загруженного файла.

#### POST /notes/:noteId/files/register/bulk

Массовая регистрация файлов.

---

## Уведомления (Notifications)

### POST /notifications

Создание уведомления.

**Request:**
```json
{
  "title": "Напоминание",
  "message": "Не забудьте позвонить клиенту",
  "type": "reminder",
  "userId": "target_user_id",
  "priority": "high",
  "actionUrl": "#/crm/lead/123",
  "metadata": { "key": "value" },
  "taskId": "task_id",
  "leadId": "lead_id",
  "reminderAt": "2026-06-30T10:00:00Z",
  "dueDate": "2026-06-30",
  "requestText": "Текст запроса",
  "requestDescription": "Описание запроса",
  "parentRequestId": "parent_notification_id",
  "attachments": [/* NotificationAttachment[] */]
}
```

**Типы уведомлений:**
- `reminder` — напоминание
- `news` — новость
- `task_due` — задача истекает
- `lead_update` — обновление лида
- `system` — системное
- `request` — запрос
- `response` — ответ на запрос

---

### GET /notifications

Получение списка уведомлений.

**Query:**
| Параметр | Тип | Описание |
|---|---|---|
| `page` | number | Страница |
| `limit` | number | Количество |
| `type` | NotificationType | Тип |
| `priority` | NotificationPriority | Приоритет |
| `isRead` | boolean | Прочитанные/непрочитанные (передавать как строку!) |
| `isArchived` | boolean | В архиве (передавать как строку!) |
| `taskId` | string | По задаче |
| `leadId` | string | По лиду |
| `dateFrom` | string | Дата начала |
| `dateTo` | string | Дата конца |

**Особенности:**
- `isRead` и `isArchived` передаются как **строки** (`"true"`/`"false"`), не boolean

---

### GET /notifications/unread-count

Количество непрочитанных уведомлений.

**Response:**
```json
{
  "success": true,
  "data": 5
}
```

---

### GET /notifications/:id

Получение одного уведомления (требует заголовки админа).

---

### PATCH /notifications/:id

Обновление уведомления.

---

### PATCH /notifications/:id/read

Отметка о прочтении.

**Request:**
```json
{ "isRead": true }
```

---

### PATCH /notifications/:id/archive

Архивация уведомления.

**Request:**
```json
{ "isArchived": true }
```

---

### POST /notifications/bulk-read

Массовая отметка о прочтении.

**Request:**
```json
{
  "notificationIds": ["id1", "id2"],  // или
  "markAllAsRead": true
}
```

---

### DELETE /notifications/:id

Удаление уведомления.

---

### Файлы уведомлений

#### POST /notifications/:notificationId/files

Загрузка файла (требует админский токен в `X-Admin-Token`).

#### POST /notifications/:notificationId/files/bulk

Bulk-загрузка файлов (требует админский токен).

#### DELETE /notifications/:notificationId/files/:fileIndex

Удаление файла по индексу.

---

### Ответы на запросы

#### POST /notifications/:notificationId/respond

Ответ на уведомление-запрос.

**Request:**
```json
{
  "responseText": "Запрос одобрен",
  "responseDescription": "Подробности...",
  "attachments": [/* NotificationAttachment[] */]
}
```

---

### Системные эндпоинты уведомлений

#### POST /notifications/task-reminder

Создание напоминания о задаче.

**Request:**
```json
{
  "taskId": "task_id",
  "userId": "user_id",
  "dueDate": "2026-06-30T10:00:00Z"
}
```

#### POST /notifications/lead-update

Уведомление об обновлении лида.

**Request:**
```json
{
  "leadId": "lead_id",
  "userId": "user_id",
  "updateType": "stage_changed"
}
```

#### POST /notifications/news

Массовая рассылка новостей.

**Request:**
```json
{
  "title": "Важная новость",
  "message": "Текст новости",
  "userIds": ["user1", "user2"]
}
```

---

## Обращения (Appeals)

### POST /files/upload (appeal file)

Загрузка файла для обращения (multipart/form-data).

**Response:**
```json
{
  "success": true,
  "data": {
    "file": {
      "url": "https://cdn.baza.sale/...",
      "filename": "doc.pdf",
      "originalName": "Документ.pdf",
      "mimeType": "application/pdf",
      "size": 1048576
    }
  }
}
```

**Особенности:**
- Существует три варианта: `uploadAppealFile` (с auth query), `uploadAppealFileFallback` (только userId), и `uploadFile` (без auth)
- Fallback-версия использует `cdnUrl` вместо `url`

---

### POST /appeals

Создание обращения.

**Request:**
```json
{
  "type": "technical",
  "text": "Не работает загрузка файлов",
  "urgency": "medium",
  "userId": "user_id",
  "userEmail": "user@example.com",
  "attachments": [
    { "cdnUrl": "https://cdn.baza.sale/file.pdf", "filename": "file.pdf", "size": 1048576 }
  ],
  "contactInfo": {
    "phone": "+79001234567",
    "email": "user@example.com",
    "telegram": "@username",
    "other": "WhatsApp"
  }
}
```

**Типы обращений:**
- `technical` — техническая проблема
- `feature_request` — запрос функции
- `bug_report` — баг-репорт
- `question` — вопрос
- `complaint` — жалоба
- `other` — другое

**Срочность:**
- `low`, `medium`, `high`, `critical`

---

## Онлайн-статус (Online)

### POST /crm/online/heartbeat

Отправка сигнала «я в сети».

**Request:**
```json
{
  "minutesToday": 45  // опционально — накопленные минуты за сегодня
}
```

**Response:**
```json
{
  "success": true,
  "data": { "lastSeenAt": "2026-06-29T14:30:00Z" }
}
```

**Особенности:**
- Клиент отправляет heartbeat каждые ~60 секунд

---

### GET /crm/online/users

Список онлайн-пользователей.

**Query:** `maxIdleMinutes=5` (по умолчанию — все, кто был активен)

**Response:**
```json
{
  "success": true,
  "data": {
    "users": [
      { "userId": "...", "email": "user@example.com", "lastSeenAt": "2026-06-29T14:30:00Z" }
    ]
  }
}
```

---

### GET /crm/analytics/online-stats

Статистика времени в сети по дням.

**Query:**
| Параметр | Тип | Описание |
|---|---|---|
| `from` | string | Дата начала (YYYY-MM-DD) |
| `to` | string | Дата конца (YYYY-MM-DD) |
| `userId` | string | ID пользователя (опционально) |

**Response:**
```json
{
  "success": true,
  "data": {
    "stats": [
      { "date": "2026-06-23", "minutes": 420 },
      { "date": "2026-06-24", "minutes": 380 }
    ]
  }
}
```

---

## Настройки (Settings)

### GET /crm/settings/distribution

Получение настроек распределения лидов.

**Response:**
```json
{
  "success": true,
  "data": {
    "type": "round_robin",  // "round_robin" | "by_load" | "manual"
    "manualDistributorId": null
  }
}
```

**Особенности:**
- При 404/501 — fallback на localStorage

---

### POST /crm/settings/distribution

Обновление настроек распределения.

**Request:** Тот же формат, что и ответ GET.

**Особенности:**
- Всегда сохраняет в localStorage как fallback
- При 404/501 — возвращает success с переданными данными

---

## Файлы (Files)

Эти методы — обёртки, которые вызывают соответствующие методы из других модулей:

- `uploadAndRegisterFile(file, entityType, entityId)` — загружает файл и возвращает его метаданные
- `uploadAndRegisterFilesBulk(files, entityType, entityId)` — массовая загрузка

`entityType`: `task` | `lead` | `note`

---

## Админ-панель (Admin)

Все админ-эндпоинты требуют заголовок `X-Admin-Token: <token>`.

### POST /admin/notifications/create

Создание уведомления от имени админа.

**Request:**
```json
{
  "title": "...",
  "message": "...",
  "type": "news",
  "userId": "target_user_id",
  "priority": "high"
}
```

---

### POST /admin/notifications/news

Массовая рассылка новостей.

**Request:**
```json
{
  "title": "Новость",
  "message": "Текст новости"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "created": 15,
    "items": [/* Notification[] */]
  }
}
```

---

### POST /admin/notifications/send-daily-task

Отправка ежедневного уведомления о задачах.

---

### POST /admin/leads/create

Создание лида из админ-панели.

**Request (manual):**
```json
{
  "mode": "manual",
  "data": {
    "name": "...",
    "phone": "...",
    "productType": "sales",
    "assignedTo": "user_id"
  },
  "forAll": true  // опционально — назначить всем
}
```

**Request (auto):**
```json
{
  "mode": "auto",
  "forAll": true,
  "assignedTo": "user_id"
}
```

**Response:**
```json
{
  "success": true,
  "data": {/* Lead */}  // или { created: 10, items: [/* Lead[] */] } при forAll
}
```

---

### PATCH /admin/users/role

Обновление роли пользователя.

**Request:**
```json
{
  "email": "user@example.com",
  "role": "admin"
}
```

---

### PATCH /admin/users/roles/batch

Массовое обновление ролей.

**Request:**
```json
{
  "updates": [
    { "email": "user1@example.com", "role": "admin" },
    { "email": "user2@example.com", "role": "manager" }
  ]
}
```

---

### POST /admin/users/info

Получение информации о пользователе.

**Request:**
```json
{ "email": "user@example.com" }
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "...",
    "email": "user@example.com",
    "name": "Иван Иванов",
    "role": "manager",
    "phone": "+79001234567",
    "avatar": "https://...",
    "isActive": true,
    "lastLogin": "2026-06-29T10:00:00Z",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

---

### POST /crm/referrals/sync

Принудительная синхронизация рефералов в воронку СЕТЬ.

**Headers:** `X-Admin-Token: <token>` (опционально — для фоновой синхронизации)

---

## Внешний API (Baza Public API)

Base URL: `https://api.baza.sale`

Все запросы требуют JWT-токен в заголовке `Authorization: Bearer <token>`.

### GET /crm/user-favorites/:email

Получение избранных объектов пользователя.

**Response:**
```json
{
  "items": [
    {
      "_id": "...",
      "title": "2-комн. квартира в Дубае",
      "price": 150000,
      "price_sqm": 2500,
      "rooms": "2",
      "area": 60,
      "propertyType": "apartment",
      "dealType": "sale",
      "status": "active",
      "coordinates": [25.2, 55.3],
      "tags": ["new"],
      "amenities": ["pool", "gym"],
      "images": ["https://..."],
      "photos": [],
      "createdAt": "..."
    }
  ]
}
```

**Особенности:**
- Возвращает `RawFavoriteObject[]`, клиент маппит в `FavoriteObject[]`
- `location` извлекается из `title` (слово после "in" или "в")

---

### GET /crm/referrals/count?email=...

Количество рефералов пользователя.

**Response:**
```json
{
  "success": true,
  "data": { "totalCount": 15 }
}
```

---

### GET /crm/objects/count?type=secondary&email=...

Количество объектов пользователя по типу (`secondary` или `rent`).

**Response:**
```json
{
  "success": true,
  "data": { "totalCount": 8, "type": "secondary" }
}
```

---

### GET /crm/referrals/getTotalObjects?email=...

Общее количество объектов рефералов.

**Response:**
```json
{
  "success": true,
  "data": { "total": 25 }
}
```

---

### GET /crm/referrals/getJoinDate?email=...

Дата регистрации рефералов.

**Response:**
```json
{
  "success": true,
  "data": { "date": ["2026-01-15", "2026-03-20"] }
}
```

---

### POST /crm/user/objects/dates/:secret

Получение объектов пользователя по email (с секретным ключом в URL).

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "items": [
    {
      "_id": "...",
      "title": "Квартира в Москве",
      "dealType": "sale",
      "status": "active",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

**Особенности:**
- `secret` — секретный ключ из env (`VITE_OBJECTS_DATES_SECRET`)

---

## WebSocket (Socket.IO)

### Подключение

```
WebSocket URL: = CRM_API_BASE_URL (wss://api-crm.baza.sale)
Transport: websocket
Query: { token: "Bearer <jwt_token>" }
```

**Параметры:**
- `reconnection: true`
- `reconnectionAttempts: 5`
- `reconnectionDelay: 1000` мс
- `reconnectionDelayMax: 5000` мс
- `timeout: 10000` мс

---

### События (emit с ack)

Все события используют callback-формат с ack (ответ в течение 15 секунд).

**Формат ответа:**
```json
{
  "success": true,
  "data": {},
  "message": "...",
  "correlationId": "..."
}
```

---

### events:replay

Запрос пропущенных событий (для восстановления после дисконнекта).

**Request:**
```json
{
  "lastEventId": "event_id_123",
  "sinceTs": "2026-06-29T10:00:00Z",
  "rooms": ["task:123", "lead:456"],
  "onlyMine": true,
  "limit": 50
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "events": [
      {
        "event": "lead:updated",
        "envelope": {
          "eventId": "...",
          "ts": "2026-06-29T14:30:00Z",
          "data": { /* payload */ }
        }
      }
    ]
  }
}
```

**Особенности:**
- `onlyMine: true` — только события текущего пользователя
- Автоматически вызывается при реконнекте (limit: 50)
- `lastEventId` сохраняется в `localStorage` ключ `ws_last_event_id`

---

### rooms:subscribe

Подписка на комнаты (обновления в реальном времени).

**Request:**
```json
{
  "rooms": [
    "task:task_id_1",
    "lead:lead_id_1",
    "org:org_id_1"
  ]
}
```

**Особенности:**
- Типы комнат: `task`, `lead`, `org`
- Также принимает массив объектов: `[{ type: "task", id: "..." }]`

---

### rooms:unsubscribe

Отписка от комнат.

**Request:** Аналогичен `rooms:subscribe`.

---

### Push-события (входящие)

Все push-события приходят в формате:

```typescript
interface PushEnvelope<T> {
  eventId: string;   // уникальный ID для дедупликации
  ts: string;        // ISO8601
  data: T;           // payload
}
```

**Дедупликация:**
- Каждое событие имеет `eventId`
- Клиент хранит `Set` уже обработанных `eventId`
- Дубликаты игнорируются
- `lastEventId` сохраняется в `localStorage` для replay при реконнекте

---

### Переподключение с новым токеном

```
reconnectWithToken(newToken: string) → Socket
```

Отключает текущий сокет и создаёт новый с новым токеном.

---

## Перечень enums

### UserRole
```
agent | mentor | manager | admin
```

### ProductType
```
sales | network | owner | agent
```

### TaskPriority
```
urgent_important | not_urgent_important | urgent_not_important | not_urgent_not_important
```

### TaskStatus
```
pending | in_progress | completed | cancelled
```

### LeadStage
Содержит **80+ значений** для разных воронок:
- **Sales:** `rejected`, `first_contact`, `qualification`, `needs_analysis`, `presentation`, `proposal`, `negotiation`, `decision_making`, `contract_signing`, `onboarding`, `deal_closed`, `post_purchase_followup`, `satisfaction_check`, `upsell_opportunity`
- **Network:** `network_rejected_defective`, `network_new_lead`, `network_call_later`, `network_company_presented`, `network_platform_presented`, `network_offer_given`, `network_objections`, `network_deferred_demand`, `network_agreement`, `network_form_filled`, `network_account_registered`, `network_offer_signed`, `network_work_started`
- **Realtor/Curator:** `realtor_1`..`realtor_6`, `curator_1`..`curator_6`
- **Owner:** `owner_rejected_defective`, `owner_new_owner`, `owner_call_later`, `owner_company_presented`, `owner_object_discussed`, `owner_photo_proposed`, `owner_exclusive_proposed`, `owner_objections`, `owner_agreed`, `owner_active_for_sale`, `owner_get_referral`, `owner_new_object_inquiry`
- **Agent:** `agent_rejected_defective`, `agent_new_agent`, `agent_call_later`, `agent_company_presented`, `agent_format`, `agent_objections`, `agent_agreed`, `agent_active`

### RejectionReason
```
price_too_high | not_interested | wrong_timing | competitor_chosen | no_budget | no_authority | other | defective_lead | other_reason | partnership_terminated | cannot_contact
```

### BudgetCurrency
```
USD | EUR | RUB | KZT
```

### NotificationType
```
reminder | news | task_due | lead_update | system | request | response
```

### NotificationPriority
```
low | medium | high | urgent
```

### EventType
```
meeting | call | reminder | task | lead_followup
```

### EventStatus
```
scheduled | in_progress | completed | cancelled | no_show
```

### AppealType
```
technical | feature_request | bug_report | question | complaint | other
```

### AppealUrgency
```
low | medium | high | critical
```

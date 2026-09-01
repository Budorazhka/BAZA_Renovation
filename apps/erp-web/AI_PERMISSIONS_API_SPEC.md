# AI Permissions — Спецификация API для фронта

## Обзор

Система разрешений управляет автоматическими действиями ИИ с лидами в CRM. ИИ может заполнять данные лида, перемещать по воронке, создавать задачи. Для критичных действий требуется одобрение риэлтора.

---

## Концепция

**Общие настройки** — дефолт для ВСЕХ новых чатов.
**Персональные настройки** — переопределение для конкретного чата (приоритет над общими).

**Два типа действий:**
- **Авто** (разрешено по умолчанию) — ИИ выполняет сразу
- **Требует разрешения** (запрещено по умолчанию) — ИИ создаёт запрос и ждёт одобрения

---

## Действия и разрешения

### Требуют разрешения (по умолчанию = false)

| Ключ | Описание |
|------|----------|
| `fill_name` | Заполнение имени |
| `fill_phone` | Заполнение телефона |
| `fill_budget` | Заполнение бюджета |
| `deal_value` | Сумма сделки |
| `fill_deal_type` | Тип сделки |
| `move_stage` | Перемещение по воронке |
| `create_task` | Создание задачи |

### Авто (по умолчанию = true)

| Ключ | Описание |
|------|----------|
| `fill_email` | Заполнение email |
| `fill_city` | Заполнение города |
| `fill_object_type` | Тип объекта (теги) |
| `fill_telegram` | Заполнение Telegram |
| `fill_country` | Заполнение страны |
| `source` | Источник |
| `add_history` | Комментарий к этапу |
| `add_comment` | Комментарий-наблюдение |
| `sync_notes` | Синхронизация заметок |
| `create_lead` | Создание лида |
| `link_lead` | Привязка лида |

---

## Статусы запросов

| Статус | Описание |
|--------|----------|
| `pending` | Ожидает одобрения |
| `approved` | Одобрен (не используется, сразу переходит в executed) |
| `rejected` | Отклонён риэлтором |
| `executed` | Выполнен после одобрения |
| `expired` | Истёк срок (24ч) |
| `obsolete` | Заменён новым запросом |
| `cancelled` | Отменён |
| `auto_cancelled` | Автоотмена (данные изменились / уже актуальны / лид не привязан) |

**Terminal states:** rejected, expired, cancelled, obsolete, executed, auto_cancelled

---

## API Эндпоинты

### 1. Получить настройки разрешений

```
GET /api/ai-permissions
```

**Headers:**
```
Authorization: Bearer <token>
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "general": {
      "fill_name": false,
      "fill_phone": false,
      "fill_budget": false,
      "deal_value": false,
      "fill_deal_type": false,
      "move_stage": false,
      "create_task": false,
      "fill_email": true,
      "fill_city": true,
      "fill_object_type": true,
      "fill_telegram": true,
      "fill_country": true,
      "source": true,
      "add_history": true,
      "add_comment": true,
      "sync_notes": true,
      "create_lead": true,
      "link_lead": true
    },
    "dialogOverrides": [
      {
        "dialogId": "665f1a2b3c4d5e6f7a8b9c0d",
        "overrides": {
          "fill_name": true,
          "fill_phone": true
        }
      }
    ],
    "labels": {
      "fill_name": "Заполнение имени",
      "fill_phone": "Заполнение телефона",
      "fill_budget": "Заполнение бюджета",
      "deal_value": "Сумма сделки",
      "fill_deal_type": "Тип сделки",
      "move_stage": "Перемещение по воронке",
      "create_task": "Создание задачи",
      "fill_email": "Заполнение email",
      "fill_city": "Заполнение города",
      "fill_object_type": "Тип объекта",
      "fill_telegram": "Заполнение Telegram",
      "fill_country": "Заполнение страны",
      "source": "Источник",
      "add_history": "Комментарий к этапу",
      "add_comment": "Комментарий-наблюдение",
      "sync_notes": "Синхронизация заметок",
      "create_lead": "Создание лида",
      "link_lead": "Привязка лида"
    },
    "requiredActions": [
      "fill_name",
      "fill_phone",
      "fill_budget",
      "deal_value",
      "fill_deal_type",
      "move_stage",
      "create_task"
    ]
  }
}
```

---

### 2. Обновить общие настройки

```
PUT /api/ai-permissions/general
```

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "fill_name": true,
  "fill_phone": true,
  "fill_budget": false,
  "deal_value": false,
  "fill_deal_type": true,
  "move_stage": true,
  "create_task": false,
  "fill_email": true,
  "fill_city": true,
  "fill_object_type": true,
  "fill_telegram": true,
  "fill_country": true,
  "source": true,
  "add_history": true,
  "add_comment": true,
  "sync_notes": true,
  "create_lead": true,
  "link_lead": true
}
```

Все поля опциональны. Отправлять только те которые нужно изменить.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "general": { ... }
  }
}
```

---

### 3. Обновить персональные настройки для чата

```
PUT /api/ai-permissions/dialog/:dialogId
```

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "fill_name": true,
  "fill_budget": true
}
```

Только переопределения. Отправлять только те поля которые отличаются от общих.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "dialogOverrides": [
      { "dialogId": "...", "overrides": { "fill_name": true, "fill_budget": true } }
    ]
  }
}
```

---

### 4. Применить общие настройки ко всем чатам

```
POST /api/ai-permissions/apply-to-all
```

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:** `{}`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "updated": 1
  }
}
```

Эффект: общие настройки применяются ко всем чатам, все персональные переопределения удаляются.

---

### 5. Получить эффективные настройки для чата

```
GET /api/ai-permissions/dialog/:dialogId/effective
```

**Headers:**
```
Authorization: Bearer <token>
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "fill_name": true,
    "fill_phone": false,
    "fill_budget": true,
    "deal_value": false,
    "fill_deal_type": false,
    "move_stage": true,
    "create_task": false,
    "fill_email": true,
    "fill_city": true,
    "fill_object_type": true,
    "fill_telegram": true,
    "fill_country": true,
    "source": true,
    "add_history": true,
    "add_comment": true,
    "sync_notes": true,
    "create_lead": true,
    "link_lead": true
  }
}
```

Возвращает финальные настройки с учётом персональных переопределений.

---

### 6. Список запросов на одобрение

```
GET /api/ai-action-requests
```

**Headers:**
```
Authorization: Bearer <token>
```

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "665f1a2b3c4d5e6f7a8b9c0d",
      "dialogId": "665f1a2b3c4d5e6f7a8b9c0e",
      "action": "fill_name",
      "actionLabel": "Заполнение имени",
      "payload": {
        "name": "Алексей"
      },
      "currentData": {
        "name": "Клиент WhatsApp"
      },
      "status": "pending",
      "expiresAt": "2026-07-07T12:00:00.000Z",
      "createdAt": "2026-07-06T12:00:00.000Z",
      "isExpired": false,
      "cancelledReason": null
    },
    {
      "_id": "665f1a2b3c4d5e6f7a8b9c0f",
      "dialogId": "665f1a2b3c4d5e6f7a8b9c10",
      "action": "move_stage",
      "actionLabel": "Перемещение по воронке",
      "payload": {
        "stage": "decision_making",
        "comment": "[ИИ] Переход на этап decision_making"
      },
      "currentData": {
        "stage": "proposal"
      },
      "status": "expired",
      "expiresAt": "2026-07-05T12:00:00.000Z",
      "createdAt": "2026-07-04T12:00:00.000Z",
      "isExpired": true,
      "cancelledReason": null
    }
  ]
}
```

Возвращает `pending` и `expired` запросы. Поле `isExpired` показывает просрочен ли запрос.

---

### 7. Одобрить запрос

```
POST /api/ai-action-requests/:id/approve
```

**Headers:**
```
Authorization: Bearer <token>
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "approved": true
  }
}
```

**Response 400 (данные изменились):**
```json
{
  "success": false,
  "error": "Поле \"budgetValue\" уже изменено риэлтором: 100000 (было: null, запрошено: 50000)"
}
```

**Response 400 (уже обработан):**
```json
{
  "success": false,
  "error": "Запрос уже в статусе: executed"
}
```

---

### 8. Отклонить запрос

```
POST /api/ai-action-requests/:id/reject
```

**Headers:**
```
Authorization: Bearer <token>
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "rejected": true
  }
}
```

---

### 9. История действий

```
GET /api/ai-action-requests/logs?dialogId=xxx&limit=50&offset=0
```

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
| Параметр | Обязательный | Описание |
|----------|-------------|----------|
| `dialogId` | Нет | Фильтр по диалогу |
| `limit` | Нет | Лимит (макс 100, дефолт 50) |
| `offset` | Нет | Смещение (дефолт 0) |

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "665f1a2b3c4d5e6f7a8b9c11",
      "userId": "665f1a2b3c4d5e6f7a8b9c12",
      "dialogId": "665f1a2b3c4d5e6f7a8b9c0e",
      "action": "fill_name",
      "status": "executed",
      "payload": { "name": "Алексей" },
      "details": "Выполнено: name",
      "createdAt": "2026-07-06T12:05:00.000Z"
    },
    {
      "_id": "665f1a2b3c4d5e6f7a8b9c12",
      "userId": "665f1a2b3c4d5e6f7a8b9c12",
      "dialogId": "665f1a2b3c4d5e6f7a8b9c0e",
      "action": "fill_name",
      "status": "pending_approval",
      "payload": { "name": "Алексей" },
      "details": "Запрос на одобрение: fill_name",
      "createdAt": "2026-07-06T12:00:00.000Z"
    }
  ]
}
```

---

## WebSocket события

### ai:action_request

Событие приходит при создании или изменении статуса запроса.

**При создании:**
```json
{
  "type": "created",
  "request": {
    "id": "665f1a2b3c4d5e6f7a8b9c0d",
    "dialogId": "665f1a2b3c4d5e6f7a8b9c0e",
    "action": "fill_name",
    "payload": { "name": "Алексей" },
    "currentData": { "name": "Клиент WhatsApp" },
    "status": "pending",
    "expiresAt": "2026-07-07T12:00:00.000Z"
  }
}
```

**При решении (одобрение/отклонение/автоотмена):**
```json
{
  "type": "resolved",
  "request": {
    "id": "665f1a2b3c4d5e6f7a8b9c0d",
    "dialogId": "665f1a2b3c4d5e6f7a8b9c0e",
    "action": "fill_name",
    "status": "executed",
    "cancelledReason": null
  }
}
```

**При автоотмене:**
```json
{
  "type": "resolved",
  "request": {
    "id": "665f1a2b3c4d5e6f7a8b9c0d",
    "dialogId": "665f1a2b3c4d5e6f7a8b9c0e",
    "action": "fill_budget",
    "status": "auto_cancelled",
    "cancelledReason": "Поле \"budgetValue\" уже изменено риэлтором: 100000 (было: null, запрошено: 50000)"
  }
}
```

---

## Сценарии использования

### Сценарий 1: Настройка общих разрешений

1. Фронт загружает `GET /api/ai-permissions`
2. Показывает свитчи для каждого действия
3. Пользователь включает `fill_name` и `fill_phone`
4. Фронт отправляет `PUT /api/ai-permissions/general` с `{ "fill_name": true, "fill_phone": true }`
5. Общие настройки обновлены. Новые чаты будут использовать эти разрешения

### Сценарий 2: Персональная настройка чата

1. Пользователь открывает чат с клиентом
2. Фронт загружает `GET /api/ai-permissions/dialog/:dialogId/effective`
3. Показывает переключатели с текущими значениями
4. Пользователь включает `fill_budget` для этого чата
5. Фронт отправляет `PUT /api/ai-permissions/dialog/:dialogId` с `{ "fill_budget": true }`
6. Для этого чата ИИ будет автоматически заполнять бюджет

### Сценарий 3: Одобрение запроса

1. ИИ хочет изменить имя лида, но `fill_name` запрещён
2. ИИ создаёт запрос, фронт получает `ai:action_request` через WebSocket
3. Фронт показывает уведомление в списке запросов
4. Пользователь видит: "ИИ хочет изменить имя клиента с 'Клиент WhatsApp' на 'Алексей'"
5. Пользователь нажимает "Разрешить"
6. Фронт отправляет `POST /api/ai-action-requests/:id/approve`
7. Бэк проверяет актуальность данных → применяет → статус `executed`
8. Фронт получает `ai:action_request` с `type: "resolved"` и `status: "executed"`

### Сценарий 4: Отклонение запроса

1. ИИ хочет переместить лид на этап `decision_making`
2. Фронт показывает запрос
3. Пользователь нажимает "Запретить"
4. Фронт отправляет `POST /api/ai-action-requests/:id/reject`
5. Статус → `rejected`, ИИ не выполняет действие

### Сценарий 5: Автоотмена

1. ИИ запросил изменение бюджета на $50k
2. Риэлтор через 30 минут сам изменил бюджет на $100k
3. Риэлтор одобряет запрос ИИ
4. Бэк проверяет: текущий бюджет $100k ≠ $50k (payload) ≠ null (currentData)
5. Автоотмена: "Поле 'budgetValue' уже изменено риэлтором: 100000"
6. Фронт показывает статус `auto_cancelled` с причиной

### Сценарий 6: Применить ко всем чатам

1. Пользователь изменил общие настройки
2. Нажимает "Применить ко всем чатам"
3. Фронт отправляет `POST /api/ai-permissions/apply-to-all`
4. Все персональные переопределения удаляются
5. Все чаты используют общие настройки

---

## Таймауты

- **Запрос на одобрение:** 24 часа
- **Крон проверки:** каждые 5 минут
- **После истечения:** статус `expired`, риэлтор видит пометку "истёк срок"

---

## Цвета статусов (рекомендация)

| Статус | Цвет | Иконка |
|--------|------|--------|
| `pending` | 🟡 Жёлтый | ⏳ |
| `executed` | 🟢 Зелёный | ✅ |
| `rejected` | 🔴 Красный | ❌ |
| `expired` | 🟠 Оранжевый | ⏰ |
| `auto_cancelled` | ⚪ Серый | 🔄 |
| `obsolete` | ⚪ Серый | 📋 |

---

## Пример UI макета

### Список запросов

```
┌─────────────────────────────────────────────────┐
│ 🤖 Запросы ИИ (2 pending)                       │
├─────────────────────────────────────────────────┤
│ ⏳ Заполнение имени          Чат: Алексей       │
│    Клиент WhatsApp → Алексей                    │
│    Истекает через: 23ч 15мин                    │
│    [Разрешить] [Запретить]                       │
├─────────────────────────────────────────────────┤
│ ⏳ Перемещение по воронке   Чат: Мария         │
│    proposal → decision_making                   │
│    Истекает через: 12ч 30мин                    │
│    [Разрешить] [Запретить]                       │
├─────────────────────────────────────────────────┤
│ ✅ Заполнение телефона       Чат: Дмитрий       │
│    +79001234567 записан                          │
│    Выполнено                                     │
└─────────────────────────────────────────────────┘
```

### Настройки разрешений

```
┌─────────────────────────────────────────────────┐
│ ⚙️ Настройки разрешений ИИ                      │
├─────────────────────────────────────────────────┤
│ Общие настройки (для новых чатов):              │
│                                                 │
│ Требуют разрешения:                             │
│   ☑ Заполнение имени            [ON]            │
│   ☐ Заполнение телефона         [OFF]           │
│   ☐ Заполнение бюджета          [OFF]           │
│   ☐ Сумма сделки                [OFF]           │
│   ☐ Тип сделки                  [OFF]           │
│   ☑ Перемещение по воронке      [ON]            │
│   ☐ Создание задачи             [OFF]           │
│                                                 │
│ Автоматические:                                 │
│   ☑ Заполнение email             [ON]           │
│   ☑ Заполнение города            [ON]           │
│   ☑ Тип объекта                  [ON]           │
│   ☑ Заполнение Telegram          [ON]           │
│   ☑ Заполнение страны            [ON]           │
│   ☑ Источник                     [ON]           │
│   ☑ Комментарий к этапу          [ON]           │
│   ☑ Комментарий-наблюдение       [ON]           │
│   ☑ Синхронизация заметок        [ON]           │
│   ☑ Создание лида                [ON]           │
│   ☑ Привязка лида                [ON]           │
│                                                 │
│ [Сохранить] [Применить ко всем чатам]           │
└─────────────────────────────────────────────────┘
```

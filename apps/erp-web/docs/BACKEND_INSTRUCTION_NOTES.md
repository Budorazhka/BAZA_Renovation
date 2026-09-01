# Полная инструкция для бэкенда: ИИ + CRM (описание лида, комментарии к этапу, контекст лида)

## Краткость

Фронт реализовал 3 новых возможности для бэкенда мессенджеров:

1. **`leadContext`** — фронт передаёт полные данные лида при каждом AI-запросе (включая текущее описание)
2. **CRM-действия через `crm:action_required`** — бэкенд может попросить фронт обновить описание лида или добавить комментарий к этапу воронки
3. **ИИ знает с каким лидом работает** — из `leadContext.leadId`

---

## §1. Что фронт передаёт бэкенду

### 1.1. Новый параметр `leadContext` в AI-эндпоинтах

При вызове `POST /dialogs/{dialogId}/messages/generate` и `POST /dialogs/{dialogId}/messages/ai-send` фронт передаёт `leadContext` в body:

```json
{
  "hint": "текст сообщения",
  "aiSettings": { "tone": "mid", "frequency": "mid", "pressure": "mid" },
  "leadContext": {
    "leadId": "64a1b2c3d4e5f6a7b8c9d0e1",
    "name": "Иван Иванов",
    "phone": "+79991234567",
    "email": "ivan@example.com",
    "city": "Москва",
    "stage": "qualification",
    "productType": "sales",
    "source": "telegram",
    "notes": "Интересуется 2-комнатной квартирой.\nБюджет: до 8 млн.\nГород: Казань.",
    "dealValue": 5000000,
    "tags": ["vip", "повторный"]
  }
}
```

**Когда `leadContext` передаётся:**
- Если диалог привязан к лиду (`crmLeadId` есть) → `leadContext` передаётся
- Если диалог НЕ привязан → `leadContext` не передаётся (undefined)

**Поля `leadContext`:**

| Поле | Тип | Описание |
|------|-----|----------|
| `leadId` | string | ID лида в CRM |
| `name` | string | Имя клиента |
| `phone` | string | Телефон |
| `email` | string? | Почта |
| `city` | string? | Город |
| `stage` | string | Текущий этап воронки |
| `productType` | string | Тип продукта (sales/network/owner/agent) |
| `source` | string? | Источник лида |
| `notes` | string? | **Текущее описание лида** (поле `notes` в карточке) |
| `dealValue` | number | Стоимость сделки |
| `tags` | string[]? | Теги лида |

---

## §2. CRM-действия, которые бэкенд может отправлять на фронт

Бэкенд отправляет Socket.IO событие **`crm:action_required`**. Фронт обрабатывает его и вызывает CRM API.

### 2.1. `update_notes` — Обновить описание лида в карточке

**Когда использовать:** ИИ извлёк новую информацию из переписки и хочет дополнить/изменить описание лида в карточке. Описание — это поле `notes` на самом лиде (строка).

**Формат:**
```json
{
  "dialogId": "64a1b2c3d4e5f6a7b8c9d0e1",
  "action": "update_notes",
  "payload": {
    "leadId": "64a1b2c3d4e5f6a7b8c9d0e1",
    "notes": "Интересуется 2-комнатной квартирой.\nБюджет: до 8 млн.\nГород: Казань.\nРайон: Парк Победы.\nЭтажи: 10-20."
  }
}
```

**Что делает фронт:** Вызывает `PATCH /crm/leads/{leadId}` с `{ notes: "..." }`.

**Payload:**

| Поле | Тип | Обязательно | Описание |
|------|-----|-------------|----------|
| `leadId` | string | да | ID лида |
| `notes` | string | да | Полный текст описания (бэкенд формирует: дописывает к существующему или заменяет) |

**Важно:** Бэкенд должен сам решать — дописать к существующему описанию или заменить. Текущее описание приходит в `leadContext.notes`. Формат текста — свободный, рекомендуется через переносы строк.

---

### 2.2. `add_history` — Комментарий к текущему этапу воронки

**Когда использовать:** ИИ хочет добавить информацию в историю лида БЕЗ перемещения по воронке.

**Формат:**
```json
{
  "dialogId": "64a1b2c3d4e5f6a7b8c9d0e1",
  "action": "add_history",
  "payload": {
    "leadId": "64a1b2c3d4e5f6a7b8c9d0e1",
    "message": "Клиент уточнил: интересуется район Парк Победы, этажи 10-20",
    "comment": "дополнение к квалификации"
  }
}
```

**Что делает фронт:** Вызывает `POST /crm/leads/{leadId}/history` с `{ message, comment }`.

**Payload:**

| Поле | Тип | Обязательно | Описание |
|------|-----|-------------|----------|
| `leadId` | string | да | ID лида |
| `message` | string | да | Текст комментария (отображается в истории этапа) |
| `comment` | string | нет | Доп. комментарий |

**Важно:** Это НЕ перемещает лид по воронке. Запись просто добавляется в историю текущего этапа.

---

### 2.3. `move_stage` — Перемещение по воронке (уже существовало)

```json
{
  "dialogId": "64a1b2c3d4e5f6a7b8c9d0e1",
  "action": "move_stage",
  "payload": {
    "leadId": "64a1b2c3d4e5f6a7b8c9d0e1",
    "suggestedStage": "needs_analysis",
    "reason": "Клиент ответил на вопросы квалификации"
  }
}
```

---

## §3. Как бэкенд определяет лид в диалоге

Бэкенд мессенджеров уже хранит связь `dialogId → crmLeadId` (см. эндпоинт `POST /dialogs/{dialogId}/crm-linked`).

При обработке AI-сообщения:
1. Найти диалог по `dialogId`
2. Проверить `crmLeadId` — если есть, диалог привязан к лиду
3. Фронт автоматически передаст `leadContext` с полными данными лида (включая текущее `notes`)

---

## §4. Что нужно реализовать на бэкенде

### Шаг 1. Пробросить `leadContext` в AI-модуль

В обработчиках `generate` и `ai-send`:

```javascript
// body: { hint, aiSettings, leadContext }
const { hint, aiSettings, leadContext } = req.body;

const aiResult = await aiModule.processMessage({
  message: hint,
  dialogId,
  leadContext,   // <-- новый параметр
  aiSettings,
});
```

### Шаг 2. Передавать `leadContext` в промпт ИИ

```javascript
const leadInfo = leadContext
  ? `Клиент: ${leadContext.name} (тел: ${leadContext.phone}, город: ${leadContext.city || 'неизвестен'}).
     Этап воронки: ${leadContext.stage}. Стоимость сделки: ${leadContext.dealValue || 'не указана'}.
     Теги: ${leadContext.tags?.join(', ') || 'нет'}.
     Источник: ${leadContext.source || 'неизвестен'}.`
  : 'Лид не привязан к диалогу.';

const currentNotes = leadContext?.notes
  ? `\nТекущее описание лида в карточке:\n"""\n${leadContext.notes}\n"""`
  : '\nОписание лида в карточке пока пустое.';

const systemPrompt = `${leadInfo}${currentNotes}

Проанализируй сообщение клиента. Если ты извлёк новую информацию:
- Дополни описание лида (update_notes) если появился новый факт о клиенте
- Добавь комментарий к этапу (add_history) если клиент уточнил что-то по текущему этапу
- Перемести по воронке (move_stage) если клиент перешёл на новый этап

Если нужно CRM-действие — верни JSON в ответе.`;
```

### Шаг 3. Обрабатывать CRM-действия из ответа ИИ

После получения ответа от ИИ, если ИИ вернул JSON с CRM-действием:

```javascript
if (aiResult.crmAction) {
  const { action, payload } = aiResult.crmAction;

  if (action === 'update_notes' && payload.leadId && payload.notes) {
    io.to(dialogSocketRoom).emit('crm:action_required', {
      dialogId,
      action: 'update_notes',
      payload: {
        leadId: payload.leadId,
        notes: payload.notes,  // полный текст описания
      },
    });
  }

  if (action === 'add_history' && payload.leadId && payload.message) {
    io.to(dialogSocketRoom).emit('crm:action_required', {
      dialogId,
      action: 'add_history',
      payload: {
        leadId: payload.leadId,
        message: payload.message,
        comment: payload.comment,
      },
    });
  }

  if (action === 'move_stage' && payload.leadId && payload.suggestedStage) {
    io.to(dialogSocketRoom).emit('crm:action_required', {
      dialogId,
      action: 'move_stage',
      payload: {
        leadId: payload.leadId,
        suggestedStage: payload.suggestedStage,
        reason: payload.reason,
      },
    });
  }
}
```

### Шаг 4. Определять действие по контексту

Таблица решений для ИИ:

| Ситуация в переписке | Действие | Пример |
|---------------------|----------|--------|
| Клиент назвал новый факт (город, район, бюджет, пожелания) | `update_notes` | "Я из Казани" → дополнить описание: "Город: Казань" |
| Описание устарело | `update_notes` | Бюджет был 5 млн, стал 8 млн → обновить описание |
| Клиент уточнил что-то по текущему этапу | `add_history` | "Давайте в субботу" → комментарий к этапу |
| Клиент перешёл на новый этап | `move_stage` | "Готов к показу" → перемещение в "Показ" |
| Ничего нового | — | Просто ответить на сообщение |

---

## §5. Полная таблица эндпоинтов CRM API

Все запросы проксируются с:
- `Headers: Authorization: Bearer {crmToken}`
- `Query: ?userId={userId}&userRole={userRole}`

| Действие | HTTP | Путь | Тело |
|----------|------|------|------|
| `update_notes` | PATCH | `/crm/leads/{leadId}` | `{ notes: "..." }` |
| `add_history` | POST | `/crm/leads/{leadId}/history` | `{ message, comment? }` |
| `move_stage` | PATCH | `/crm/leads/{leadId}/stage` | `{ stage, comment? }` |
| `lead.create` | POST | `/crm/leads` | `{ name, phone, email?, city?, productType, assignedTo, source?, notes? }` |
| `lead.update` | PATCH | `/crm/leads/{leadId}` | частичное обновление |
| `lead.get_by_id` | GET | `/crm/leads/{leadId}` | — |

---

## §6. Пример полного цикла

**Входящее сообщение от клиента:** "Привет! Я из Казани, бюджет до 8 млн, хочу 2-комнатную в районе Парк Победы"

**Что происходит:**

1. Фронт отправляет `sendAiMessage` с `leadContext` (включая текущее `notes`)
2. Бэкенд получает, передаёт в ИИ
3. ИИ анализирует → извлечены: город Казань, бюджет 8 млн, 2-комната, район Парк Победы
4. ИИ видит текущее описание: "Интересуется 2-комнатной квартирой." → решает дополнить
5. ИИ решает:
   - `update_notes` — дополнить описание новыми фактами
   - `add_history` — комментарий к текущему этапу
6. Бэкенд отправляет 2 события `crm:action_required`:
   ```json
   { "dialogId": "...", "action": "update_notes", "payload": { "leadId": "...", "notes": "Интересуется 2-комнатной квартирой.\nГород: Казань.\nБюджет: до 8 млн.\nРайон: Парк Победы." } }
   ```
   ```json
   { "dialogId": "...", "action": "add_history", "payload": { "leadId": "...", "message": "Клиент уточнил: город Казань, бюджет до 8 млн, район Парк Победы, интересуется 2-комнатной" } }
   ```
7. Фронт выполняет оба вызова CRM API
8. Пользователь видит тосты: "Описание лида обновлено" + "Комментарий добавлен к этапу"
9. В карточке лида обновлено описание, в истории этапа появилась запись

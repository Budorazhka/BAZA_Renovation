# Спецификация для фронта: CRM через WebSocket

> Дата: 2026-06-18
> Архитектура: бэкенд определяет действия → фронт выполняет в CRM

---

## Как работает

Бэкенд **не работает** с CRM API напрямую. Он только:
1. Анализирует чат с клиентом
2. Определяет что нужно сделать (создать лид, переместить этап)
3. Отправляет WebSocket-событие фронту
4. **Фронт выполняет** CRM-действие через свои API

---

## WebSocket-событие: crm:action_required

Бэкенд отправляет это событие после каждого сообщения клиента.

### Структура

```typescript
interface CrmActionRequiredEvent {
  dialogId: string;
  accountId: string;
  action: 'no_crm' | 'already_linked' | 'waiting_data' | 'create_lead';
  payload: Record<string, unknown>;
  analysis: {
    currentStage: string;
    hasCrm: boolean;
    hasLead: boolean;
    extractedName?: string;
    extractedPhone?: string;
    extractedEmail?: string;
    extractedCity?: string;
    missingFields: string[];
  };
}
```

### Действия

| action | Описание | Что делает фронт |
|--------|----------|------------------|
| `no_crm` | CRM не подключена | Показать «Подключите CRM» |
| `already_linked` | Лид уже привязан | Ничего (обновить UI) |
| `waiting_data` | Не хватает данных | Ничего (ИИ сам попросит) |
| `create_lead` | Нужно создать лид | Вызвать `leadsApi.createLead()` |

### Payload для create_lead

```typescript
{
  name: "Иван",
  phone: "+995555123456",
  email: "ivan@example.com",
  city: "batumi",
  productType: "sales",
  source: "telegram",
  dialogId: "507f1f77bcf86cd799439011"
}
```

---

## Что делает фронт

### 1. Подписка на событие

```typescript
socket.on('crm:action_required', async (data) => {
  if (data.action === 'create_lead') {
    await handleCreateLead(data);
  }
});
```

### 2. Создание лида

```typescript
async function handleCreateLead(data: CrmActionRequiredEvent) {
  const { payload } = data;

  // 1. Создаём лид через CRM API (уже работает)
  const result = await leadsApi.createLead({
    name: payload.name,
    phone: payload.phone,
    email: payload.email,
    city: payload.city,
    productType: payload.productType,
    source: payload.source,
    assignedTo: getCurrentUserId(), // из auth
  });

  if (result.success && result.data) {
    // 2. Привязываем лид к диалогу на бэке
    await messengerApi.linkCrmLead(data.dialogId, {
      leadId: result.data._id,
      leadStage: result.data.stage,
    });

    // 3. Показываем уведомление
    showNotification(`Лид создан: ${result.data.name}`);
  }
}
```

### 3. Привязка лида к диалогу

```typescript
// messengerApi.ts
linkCrmLead: async (dialogId: string, data: { leadId: string; leadStage: string }) => {
  const response = await api.post(`/dialogs/${dialogId}/crm-linked`, data);
  return response.data;
},
```

---

## Эндпоинт бэкенда

### POST /api/dialogs/:dialogId/crm-linked

Привязка CRM-лида к диалогу.

**Запрос:**
```json
{
  "leadId": "507f1f77bcf86cd799439011",
  "leadStage": "needs_analysis"
}
```

**Ответ 200:**
```json
{
  "success": true,
  "dialogId": "...",
  "crmLeadId": "507f1f77bcf86cd799439011",
  "crmLeadStage": "needs_analysis"
}
```

---

## Полная схема

```
Клиент пишет → ИИ отвечает → Бэкенд анализирует
    │
    └──→ WebSocket crm:action_required
              │
              └──→ Фронт получает событие
                    │
                    ├── action=create_lead → leadsApi.createLead()
                    │       → Успех → messengerApi.linkCrmLead()
                    │
                    ├── action=no_crm → показать «Подключите CRM»
                    │
                    ├── action=already_linked → обновить UI
                    │
                    └── action=waiting_data → ИИ сам попросит данные
```

---

## Преимущества

- Фронт **уже работает** с CRM API (leads.ts)
- Бэкенд **не хранит** CRM-токены
- Нет проблем с `assignedTo` и валидацией
- Фронт контролирует CRM-операции

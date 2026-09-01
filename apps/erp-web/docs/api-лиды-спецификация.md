# Спецификация API: Воронка продаж и поиск лидов

Источник: `src/features/crm/services/api/leads.ts`, `src/features/crm/services/api/types.ts`

Base URL: CRM API (`VITE_CRM_API_BASE_URL` → `api-crm.baza.sale`)

---

## 1. Перемещение лида по воронке

### Метод: обновление этапа лида

```
PATCH /crm/leads/{id}/stage
```

**Описание:** Перемещает лида на другой этап воронки. Бэкенд автоматически записывает историю перехода (fromStage → toStage).

**Источник:** `leads.ts:508-523`

---

#### Request

**Headers:**
```
Content-Type: application/json
Authorization: Bearer <jwt_token>
```

**Path params:**

| Параметр | Тип | Описание |
|----------|-----|----------|
| `id` | `string` | MongoDB ObjectId лида |

**Body:**

| Поле | Тип | Обязательно | Описание |
|------|-----|-------------|----------|
| `stage` | `LeadStage` | Да* | Новый этап основной воронки |
| `realtorStage` | `LeadStage` | Нет | Этап для риелтора (под-воронка Сеть) |
| `curatorStage` | `LeadStage` | Нет | Этап для куратора (под-воронка Сеть) |
| `comment` | `string` | Нет | Комментарий к переходу |
| `rejectionReason` | `RejectionReason` | Нет | Причина отказа (при переходе в отказ) |
| `rejectionComment` | `string` | Нет | Комментарий к отказу |

*Хотя бы одно из полей `stage`, `realtorStage`, `curatorStage` обязательно.

**Допустимые значения `stage` (для воронки «Продажи»):**

```
rejected | first_contact | qualification | rejected1 | first_contact1 |
needs_analysis | presentation | proposal | negotiation | decision_making |
contract_signing | onboarding | needs_analysis1 | presentation1 | proposal1 |
negotiation1 | decision_making1 | contract_signing1 | deal_closed |
post_purchase_followup | satisfaction_check | upsell_opportunity
```

**Допустимые значения `rejectionReason`:**

```
price_too_high | not_interested | wrong_timing | competitor_chosen |
no_budget | no_authority | other | defective_lead | other_reason |
partnership_terminated | cannot_contact
```

---

#### Response

**200 OK:**

```json
{
  "success": true,
  "data": {
    "_id": "665f1a2b3c4d5e6f7a8b9c0d",
    "name": "Иван Петров",
    "phone": "+79001234567",
    "email": "ivan@example.com",
    "stage": "proposal",
    "productType": "sales",
    "assignedTo": "665f0a1b2c3d4e5f6a7b8c9d",
    "createdBy": "665f0a1b2c3d4e5f6a7b8c9d",
    "dealValue": 15000000,
    "history": [
      {
        "fromStage": "needs_analysis",
        "toStage": "proposal",
        "changedAt": "2026-06-16T12:00:00.000Z",
        "changedBy": "665f0a1b2c3d4e5f6a7b8c9d",
        "userName": "Алексей Сидоров",
        "userRole": "agent",
        "comment": "Проведена презентация компании"
      }
    ],
    "createdAt": "2026-06-01T10:00:00.000Z",
    "updatedAt": "2026-06-16T12:00:00.000Z"
  }
}
```

**400 Bad Request (нет stage):**

```json
{
  "success": false,
  "message": "At least one stage is required"
}
```

**409 Conflict (дубликат):**

```json
{
  "success": false,
  "message": "Лид с таким номером телефона или email уже существует"
}
```

---

#### Пример вызова (JavaScript)

```typescript
import { createCrmApi } from '@/features/crm/services/api';

const api = createCrmApi();

// Переместить лида из «Новый лид» в «Презентовали компанию»
const result = await api.updateLeadStage('665f1a2b3c4d5e6f7a8b9c0d', {
  stage: 'proposal',           // LeadStage.PROPOSAL
  comment: 'Проведена презентация компании',
});

if (result.success) {
  console.log('Лид перемещён:', result.data.stage);
}
```

#### Пример вызова (cURL)

```bash
curl -X PATCH 'https://api-crm.baza.sale/crm/leads/665f1a2b3c4d5e6f7a8b9c0d/stage' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIs...' \
  -d '{
    "stage": "proposal",
    "comment": "Проведена презентация компании"
  }'
```

#### Пример: отказ лида

```typescript
await api.updateLeadStage('665f1a2b3c4d5e6f7a8b9c0d', {
  stage: 'rejected',
  rejectionReason: 'not_interested',
  rejectionComment: 'Клиент не заинтересован в покупке',
});
```

---

## 2. Поиск лидов

### 2.1 Получение списка лидов (с поиском)

```
GET /crm/leads
```

**Описание:** Получение списка лидов с фильтрацией и полнотекстовым поиском по имени, телефону, email.

**Источник:** `leads.ts:76-88`

#### Request

**Query params:**

| Параметр | Тип | Описание |
|----------|-----|----------|
| `page` | `number` | Номер страницы (по умолчанию 1) |
| `limit` | `number` | Количество на странице |
| `stage` | `LeadStage` | Фильтр по этапу |
| `productType` | `ProductType` | Фильтр по типу продукта (`sales`, `network`, `owner`, `agent`) |
| `assignedTo` | `string` | ID назначенного агента |
| `source` | `string` | Источник лида |
| `search` | `string` | Полнотекстовый поиск (имя, телефон, email) |

#### Response

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "_id": "665f1a2b3c4d5e6f7a8b9c0d",
        "name": "Иван Петров",
        "phone": "+79001234567",
        "email": "ivan@example.com",
        "stage": "needs_analysis",
        "productType": "sales",
        "assignedTo": "665f0a1b2c3d4e5f6a7b8c9d"
      }
    ],
    "total": 42,
    "page": 1,
    "totalPages": 5
  }
}
```

#### Пример: поиск по телефону

```typescript
const result = await api.getLeads({ search: '+79001234567' });
// Найдёт всех лидов с таким телефоном
```

#### Пример: поиск по email

```typescript
const result = await api.getLeads({ search: 'ivan@example.com' });
// Найдёт всех лидов с таким email
```

---

### 2.2 Получение лидов по списку email

```
POST /crm/leads/by-emails
```

**Описание:** Массовый поиск лидов по списку email-адресов. Возвращает найденных лидов и список email, которые не найдены в базе.

**Источник:** `leads.ts:816-829`

#### Request

**Body:**

```json
{
  "emails": ["ivan@example.com", "petr@example.com", "unknown@example.com"]
}
```

#### Response

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "_id": "665f1a2b3c4d5e6f7a8b9c0d",
        "name": "Иван Петров",
        "phone": "+79001234567",
        "email": "ivan@example.com",
        "stage": "needs_analysis",
        "productType": "sales"
      },
      {
        "_id": "665f1a2b3c4d5e6f7a8b9c1d",
        "name": "Пётр Сидоров",
        "phone": "+79007654321",
        "email": "petr@example.com",
        "stage": "proposal",
        "productType": "sales"
      }
    ],
    "total": 2,
    "emailsFound": 2,
    "emailsNotFound": ["unknown@example.com"]
  }
}
```

---

### 2.3 Количество лидов по email

```
GET /crm/leads/count?email={email}
```

**Описание:** Возвращает количество лидов, созданных пользователем с указанным email.

**Источник:** `leads.ts:624-643`

#### Request

**Query params:**

| Параметр | Тип | Описание |
|----------|-----|----------|
| `email` | `string` | Email пользователя |

#### Response

```json
{
  "success": true,
  "data": {
    "count": 15
  }
}
```

---

## 3. Справочники

### LeadStage (этапы воронки «Продажи»)

```typescript
enum LeadStage {
  // Отказ
  REJECTED = 'rejected',                // Бракованный лид
  FIRST_CONTACT = 'first_contact',      // Отказ
  QUALIFICATION = 'qualification',      // Не дозвонился 3
  REJECTED1 = 'rejected1',              // Не дозвонился 2
  FIRST_CONTACT1 = 'first_contact1',    // Не дозвонился 1

  // В работе
  NEEDS_ANALYSIS = 'needs_analysis',    // Новый лид
  PRESENTATION = 'presentation',        // Попросил связаться позже
  PROPOSAL = 'proposal',                // Презентовали компанию
  NEGOTIATION = 'negotiation',          // Обсудили ситуацию в стране
  DECISION_MAKING = 'decision_making',  // Выявлена потребность
  CONTRACT_SIGNING = 'contract_signing',// Потребность скорректирована
  ONBOARDING = 'onboarding',            // Отправлено КП
  NEEDS_ANALYSIS1 = 'needs_analysis1',  // Отработка возражений
  PRESENTATION1 = 'presentation1',      // Отложенный спрос
  PROPOSAL1 = 'proposal1',              // Прогрев
  NEGOTIATION1 = 'negotiation1',        // Показ
  DECISION_MAKING1 = 'decision_making1',// Задаток получен
  CONTRACT_SIGNING1 = 'contract_signing1',// Заключен договор

  // Купили
  DEAL_CLOSED = 'deal_closed',          // Золотой фонд
  POST_PURCHASE_FOLLOWUP = 'post_purchase_followup', // Узнал как дела
  SATISFACTION_CHECK = 'satisfaction_check',          // Взять рекомендацию
  UPSELL_OPPORTUNITY = 'upsell_opportunity',         // Выявление потребности о новых сделках
}
```

### ProductType (тип продукта)

```typescript
enum ProductType {
  SALES = 'sales',     // Продажи (первичка)
  NETWORK = 'network', // Сеть (вторичка)
  OWNER = 'owner',     // Собственник (аренда)
  AGENT = 'agent',     // Посредник (рекламные кампании)
}
```

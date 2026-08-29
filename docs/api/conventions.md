# API conventions — BAZA.sale

**Статус**: Proposed (первый цельный проход, 25.08.2026)
**Опирается на**: все 10 ADR, domain-model.md, mongodb-schema.md, permission-matrix.md.

---

## 1. Базовые правила транспорта

- **Prefix**: все endpoint'ы под `/api/v1`. Версионирование через путь (не через header) — простота для клиентской генерации (OpenAPI-generated client, master plan разд.7.1).
- **UTC timestamps**: все даты/время хранятся и передаются в UTC ISO 8601 (`2026-08-25T10:00:00.000Z`). Пользовательская timezone — свойство профиля/организации на уровне отображения, не транспорта.
- **Деньги**: `MoneyAmount` (domain-model.md) сериализуется как `{amountMinorUnits: integer, currency: 'USD' | 'GEL' | 'RUB'}` — **никогда JS float**, никогда голое число без явной валюты. Пример: $150,000.00 → `{amountMinorUnits: 15000000, currency: 'USD'}`.
- **Публичные URL используют slug**, внутренние связи между сущностями — неизменяемый `_id` (ObjectId, сериализуется как hex-строка).
- **Транспортная схема не является domain entity** — DTO (request/response body) — это отдельный слой, явно маппящийся на domain-модель (domain-model.md), не то же самое, что Mongoose-документ, отдаваемый напрямую.

## 2. Pagination

**Cursor-based**, не offset-based (ADR-007, master plan разд.7.1) — деградация на больших skip-значениях недопустима.

Формат запроса: `?cursor={opaque_string}&limit={int, default 20, max 100}`.

Формат ответа списков:
```json
{
  "items": [...],
  "nextCursor": "opaque_string | null",
  "filterMetadata": { "totalCount": null | integer, "appliedFilters": {...} }
}
```

`totalCount` — `null` по умолчанию для больших публичных каталогов (посчитать точный total на большом датасете дорого и не нужно для infinite-scroll UX); присутствует явным числом только там, где UI требует точный счётчик (например, "У вас 12 задач") и коллекция заведомо мала (tenant-scoped, не публичный каталог).

`cursor` — непрозрачная строка (base64-encoded внутренний sort-key + tie-breaker `_id`), клиент не парсит и не конструирует её вручную.

## 3. Ошибки

Единый формат (детали кодов — `error-catalog.md`):

```json
{
  "error": {
    "code": "STABLE_MACHINE_READABLE_CODE",
    "message": "Человекочитаемое сообщение (RU/EN/KA по Accept-Language)",
    "requestId": "uuid",
    "details": { ...безопасные детали, без stack trace, без внутренних путей... }
  }
}
```

`requestId` — совпадает с correlation ID в audit_events (Module 3, domain-model.md), позволяет связать ошибку клиента с конкретной серверной операцией при разборе инцидента. `details` — **никогда** не содержит raw exception message, database error text, file paths, или что-либо, потенциально раскрывающее внутреннее устройство системы (master plan разд.7.2 п.14 «Отсутствие секретов, персональных данных и необработанных stack trace в клиентских ответах»).

## 4. Idempotency

*(ADR-006)*

Критические команды (`publish`, `book`, `cancel`, manual ledger operations) **обязаны** принимать header `Idempotency-Key: {client-generated UUID}`. Отсутствие header на этих конкретных endpoint'ах — `400 Bad Request` с кодом `IDEMPOTENCY_KEY_REQUIRED` (не молчаливое выполнение без защиты).

Поведение при повторном запросе с тем же ключом — см. ADR-006 раздел Idempotency (сравнение `requestHash`, возврат сохранённого `response` либо `409` при несовпадении тела запроса).

## 5. Optimistic concurrency

Карточки, редактируемые параллельно несколькими пользователями (Unit, Development, Deal) — содержат поле `version: integer`, инкрементируемое при каждом update.

Клиент обязан прислать `If-Match: {version}` (или `version` в теле PATCH-запроса — конкретный транспорт уточняется в OpenAPI-спеке per-endpoint, принцип фиксируется здесь) при редактировании. Несовпадение версии → `409 Conflict`, код `VERSION_CONFLICT`, тело содержит актуальную серверную версию сущности — клиент может показать diff/re-fetch, не теряет свои несохранённые изменения молча.

## 6. Аутентификация и сессии

*(ADR-004)*

- Marketplace/ERP/Admin — **три раздельных host-only cookie**, session содержит `productAudience`, сервер отклоняет сессию с несовпадающим audience.
- `POST /api/v1/auth/login` вызывается через origin соответствующего продукта — сервер определяет нужный `productAudience` по origin запроса, не по полю в теле.
- Cookie: `HttpOnly`, `Secure`, `SameSite=Strict` (защита от CSRF на уровне транспорта, дополняется explicit CSRF-token стратегией для state-changing запросов — деталь C-05, не переопределяется этим документом).
- Пароль/refresh token **никогда** не в теле ответа, никогда в localStorage на клиенте (master plan разд.11, жёсткое требование).

## 7. TenantContext / AdminContext на уровне транспорта

*(ADR-002)*

Клиент **никогда** не передаёт `organizationId` как параметр, определяющий scope запроса (query/path/body). `organizationId`, если появляется в теле ответа, — это данные (например, "к какой организации относится этот Lead"), не инструкция серверу "покажи мне данные этой организации". Сервер выводит tenant scope из серверной сессии + активного PositionAssignment, всегда.

Endpoint'ы Admin-домена — отдельный namespace `/api/v1/admin/*`, использующий `AdminContext`, физически отдельный authorization-слой от ERP tenant-endpoints (не тот же путь с разным заголовком).

## 8. Критические команды — единообразный контракт

Publish/unpublish/book/cancel/reassign/manual-ledger-change — все следуют одному паттерну:
1. Требуют `Idempotency-Key`.
2. Проверяют permission через `resource.action.scope` (permission-matrix.md) до выполнения.
3. Для admin-инициированных — требуют `reason` в теле запроса (`400` без него на действиях, помеченных как требующие reason в permission-matrix.md раздел 4).
4. Пишут audit event (Module 3) в той же транзакции, что бизнес-изменение.
5. Возвращают немедленный синхронный результат для быстрых операций (unpublish, ADR-005) или промежуточный статус для операций, завершаемых worker'ом (publish → `publication_pending`, ADR-005).

## 9. Локализация

`Accept-Language: ru | en | ka` header определяет язык `message` в ошибках и, где применимо, локализованный контент (`LocalizedContent`, Module 11). Fallback — `ru` (domain-model.md Модуль 11).

## 10. Генерация клиента

Frontend TypeScript client генерируется из OpenAPI-спеки (единый `packages/api-client` на все три приложения, master plan разд.7.1) — ручное написание HTTP-вызовов на фронтенде не допускается для endpoint'ов, уже описанных в OpenAPI. Breaking change в OpenAPI-спеке ловится в CI (C-04) до мержа.

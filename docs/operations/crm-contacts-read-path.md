# CRM Contacts Read Path — GET /contacts, GET /contacts/:contactId

**Дата:** 30.08.2026
**Ветка:** `codex/crm-contacts-read-path` (worktree на базе `codex/integration-operational-hardening`, commit `f635282`)

---

## 1. Обзор

Два новых ERP tenant-scoped read-эндпоинта над `ContactDocument` (`apps/api/src/modules/crm/schemas/contact.schema.ts`), в новом `ContactController` (`apps/api/src/modules/crm/contact.controller.ts`), физически отдельном от `CrmController` (публичный reveal-contact) и `LeadController` — тот же принцип разделения контроллеров, что уже применён к leads:

- `GET /api/v1/contacts` — список контактов текущей организации, cursor-paginated, единый поиск `q` по name/phone.
- `GET /api/v1/contacts/:contactId` — контакт по id.

Оба защищены `@UseGuards(TenantGuard, PermissionGuard)` и `@RequirePermission('contact', 'read')` — существующий grant, без изменений в permission-модели (`apps/api/src/modules/organizations/default-role-grants.ts` уже содержит `{resource:'contact', action:'read', scope:'organization'|'own'}` для всех ролей до этого прохода).

## 2. Решение для own-scope: Contact не хранит ownerPositionId

Ключевое архитектурное отличие от `GET /leads`: `LeadDocument.ownerPositionId` — прямое поле, а `ContactDocument` его не имеет и не должно — Contact представляет человека/канал, не привязан к конкретному менеджеру напрямую (один и тот же Contact физически может фигурировать в нескольких Lead с разными ownerPositionId, если гость обращался несколько раз через разные источники — см. `CrmService.resolveContact`/`revealListingContact` докстринг про tenant-local dedupe по телефону).

**Решение:** own-scope для Contact резолвится **транзитивно через Lead** — "свой" контакт для manager'а (permission-matrix.md `contact.read.own`) это контакт, связанный **хотя бы с одним** Lead, где `Lead.ownerPositionId === своя Position`.

Механика (`LeadRepository.distinctContactIdsForOwner`, новый метод):

```ts
async distinctContactIdsForOwner(organizationId, ownerPositionId): Promise<Types.ObjectId[]> {
  return this.model.distinct('contactId', { organizationId, ownerPositionId }).exec();
}
```

`CrmService.listContacts`/`getContact` вызывают этот метод **один раз в начале запроса** (только для own-scope; organization-scope пропускает этот шаг целиком и видит весь tenant), передают резолвленное множество `contactId` в `ContactRepository` как `_id: {$in: contactIds}` — **AND-фильтр в самом Mongo-запросе**, не постфильтрация уже прочитанной страницы контактов. Это принципиально: постфильтрация после cursor-пагинации сломала бы саму пагинацию (страница могла бы вернуться пустой или с "дырками", даже если в организации есть контакты, которые manager должен видеть, просто не на этой физической странице курсора).

Тот же принцип уже применяется в `AdminAuditService.buildAuditScopeFilter` (резолвит множество `sourceId` публикаций по scope ДО фильтрации `audit_events`) — не новый паттерн для этой кодовой базы.

### Пустое множество

Если у Position ещё нет ни одного лида (`distinctContactIdsForOwner` вернул `[]`), `ContactRepository.listForOrganization` делает ранний return `[]` без похода в Mongo (`$in: []` физически не может ничего вернуть) — `GET /contacts` отвечает `200 {items: [], nextCursor: null}`, не ошибкой.

## 3. Cursor pagination и `q`-поиск

- Курсор — `_id` (не `createdAt`), сортировка `{_id: -1}` (newest-first), фильтр `{_id: {$lt: cursor}}` — тот же принцип, что `LeadRepository.listForOrganization`/`AuditEventRepository.listForAdmin`: ObjectId монотонно возрастает и уникален, `_id`-курсор не имеет дублей/пропусков.
- `limit+1` паттерн: `ContactRepository` запрашивается на одну запись больше `params.limit`; `CrmService` отбрасывает лишнюю и берёт её `_id` как `nextCursor`.
- `limit` — по умолчанию 20, максимум **100** (`@Max(100)`), вне диапазона → `400 VALIDATION_FAILED`.
- `cursor` — валидируется как MongoID; невалидное значение → `400`, не 500.
- `q` — **единый** параметр (не отдельные `name`/`phone`), регистронезависимый partial-match по `{$or: [{name: q}, {phone: q}]}`. Пользовательский ввод **экранируется** (`escapeRegex` в `crm.service.ts`) перед сборкой `RegExp` — сырые regex-метасимволы (`. * + ? ^ $ { } ( ) | [ ] \`) никогда не попадают в `$regex` буквально (защита от ReDoS/непреднамеренных wildcard-матчей). `q`-фильтр и own-scope `contactIds`-фильтр объединяются AND'ом — own-scope не может быть обойдён широким `q` (см. тест `scope escalation` ниже).

## 4. GET /contacts/:contactId — scope-проверка до чтения, non-disclosure

`CrmService.getContact` резолвит own-scope `contactIds` (если applicable) **до** вызова `ContactRepository.findByIdForOrganizationScoped`, который:
1. Если own-scope активен (`contactIds` передан) и запрошенный `contactId` не входит в это множество — возвращает `null` **без похода в базу**.
2. Иначе читает `{_id, organizationId}` — тот же non-disclosure паттерн, что `LeadRepository.findByIdForOrganization`.

`CrmService.getContact` транслирует `null` в `404 NotFoundException('Contact not found')` — **тот же код** для:
- контакта другой организации,
- контакта, не связанного ни с одним "своим" лидом (own-scope),
- несуществующего `contactId`.

Ни один из трёх случаев не отличим снаружи (тот же принцип, что `GET /leads/:leadId`, `GET /leads/:leadId/events`).

## 5. Non-disclosure полей

`CrmContactReadModel` — явная whitelist-проекция (`toContactReadModel` в `crm.service.ts`), не сериализация Mongoose-документа целиком: `{id, organizationId, name, phone, email, createdAt}`. `ContactDocument.roles` и любые будущие служебные поля **не включены**. Ни один ответ обоих эндпоинтов не содержит `passwordHash`, `sessionToken`, `tokenHash` — подтверждено HTTP integration-тестом.

## 6. Тесты

| Файл | Уровень | Покрывает |
|---|---|---|
| `apps/api/src/modules/crm/repository/contact.repository.spec.ts` | unit | Mongo-фильтр `listForOrganization` (contactIds/q/cursor комбинации, ранний return на `contactIds:[]`), `findByIdForOrganizationScoped` (id вне/внутри contactIds) |
| `apps/api/src/modules/crm/repository/lead.repository.spec.ts` | unit | `distinctContactIdsForOwner` — фильтр organizationId+ownerPositionId |
| `apps/api/src/modules/crm/crm.service.spec.ts` | unit | `listContacts`/`getContact` — own-scope резолвится ДО чтения, `q` экранируется в RegExp, limit+1/nextCursor, non-disclosure 404, маппинг read model |
| `apps/api/src/modules/crm/contact.controller.spec.ts` | unit | own/organization scope → `ownerPositionId`, проброс `q`/`cursor`/`limit` |
| `apps/api/test/integration/contact-read-path-http.integration-spec.ts` | HTTP integration (реальный MongoDB + полный AppModule + реальные Fastify guard/middleware hooks) | 401/403, cursor pagination без дублей/пропусков, `q` по name и по phone, экранирование regex-метасимволов в `q`, own-scope изоляция (видит только контакты своих лидов, пустой список без лидов), cross-tenant isolation, scope escalation (own-scope не обходится широким `q`), invalid cursor/limit (400), 404 non-disclosure, absence of internal fields |

Запуск: `pnpm --filter @baza/api test` (unit), `pnpm --filter @baza/api test:integration` (integration, in-process MongoDB replica set через `mongodb-memory-server`).

## 7. Что осталось прежним

- `ContactDocument`, `ContactRepository.findByPhone/create/findByIdForOrganization/findByIdsForOrganization` — не изменены (только добавлены новые методы).
- `LeadRepository` — только добавлен `distinctContactIdsForOwner`, существующие методы не тронуты.
- `TenantGuard`, `PermissionGuard`, `PolicyEvaluatorService`, permission-модель (`contact.read` grants) — без изменений.
- `apps/marketplace-web`, `apps/admin-web`, Figma, runtime CI, лишние lockfile-изменения — не затронуты этим проходом.

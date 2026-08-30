# CRM Lead Read Path — GET /leads, GET /leads/:leadId/events

**Дата:** 30.08.2026
**Ветка:** `codex/crm-leads-read-path` (worktree на базе `codex/integration-operational-hardening`)

---

## 1. Обзор

Два ERP tenant-scoped read-эндпоинта над существующим CRM lead-модулем (`apps/api/src/modules/crm`):

- `GET /api/v1/leads` — список лидов текущей организации, cursor-paginated, с фильтрами `stage`/`ownerPositionId`.
- `GET /api/v1/leads/:leadId/events` — append-only история stage-переходов одного лида, cursor-paginated.

Оба эндпоинта защищены `@UseGuards(TenantGuard, PermissionGuard)` и `@RequirePermission('lead', 'read')` (без изменений — тот же guard-стек, что уже применялся к `GET /leads` и `GET /leads/:leadId` до этого прохода). Контракт задокументирован в `docs/api/v1-first-vertical-slice.yaml` (`listLeads`, `listLeadEvents` operations) и сгенерирован в `packages/api-client/src/schema.ts`.

## 2. Permission scopes (без изменений в модели)

`lead.read` grant существует в трёх вариантах (`apps/api/src/modules/organizations/default-role-grants.ts`):

| Роль | Scope | Видимость |
|---|---|---|
| owner / director / rop / administrator | `organization` | весь tenant |
| manager | `own` | только лиды, где `ownerPositionId === своя Position` |

`PermissionGuard` проверяет только факт наличия гранта `lead.read` — сам scope резолвит `LeadController.ownerFilterForAction` (`policyEvaluator.matchingScopes`) и передаёт `ownerPositionId` в `CrmService` как обязательный Mongo-фильтр, **не** постфильтрацию уже прочитанного списка. `assigned`-scope в `PermissionScope` enum существует как значение, но default-role-grants его не назначает ни одной роли на `lead.read` — при появлении такой роли `ownerFilterForAction` уже сузит её тем же путём, что и `own` (любой scope, кроме `organization`/`global`, сужается до своей Position).

### Клиентский фильтр `ownerPositionId` (GET /leads)

`ownerPositionId` в query — **дополнительное** сужение поверх уже резолвленного scope, не альтернативный путь авторизации:

- `organization`/`global` scope → любой `ownerPositionId` из query принимается как есть (включая его отсутствие — весь tenant).
- `own` scope → клиент может явно передать **только свою же** Position (идемпотентно) или не передавать фильтр вовсе. Запрос чужой Position здесь — попытка расширить own-scope через query-параметр, отклоняется **400 VALIDATION_FAILED** (`LeadController.resolveOwnerFilter`), не 403 — сам grant на `read` есть, это невалидная комбинация фильтров.

## 3. Cursor pagination

Курсор — `_id` последней лида/события на странице (не производный от `createdAt`/`changedAt`): ObjectId монотонно возрастает и уникален на уровне драйвера, поэтому `_id`-курсор не имеет дублей/пропусков даже когда несколько записей созданы в одну и ту же миллисекунду (несколько лидов из одной транзакции, несколько LeadEvent одной транзакции). Тот же принцип, что `AuditEventRepository.listForAdmin`/`AdminAuditService.list`.

- Сортировка — `{ _id: -1 }` (newest-first).
- Фильтр курсора — `{ _id: { $lt: cursor } }`.
- `limit+1` паттерн: repository запрашивается на одну запись больше, чем `params.limit`; `CrmService` отбрасывает лишнюю запись и берёт её `_id` как `nextCursor`, если она была получена. `nextCursor: null` — страница последняя.
- `limit` — по умолчанию 20, безопасный максимум **100** (`@Max(100)`, `class-validator`), значение вне `[1, 100]` → `400 VALIDATION_FAILED`.
- `cursor` — валидируется как MongoID (`@IsMongoId()`); невалидное значение → `400 VALIDATION_FAILED`, не 500.

Индексы:
- `leads`: без изменений (`{organizationId:1, ownerPositionId:1, stage:1}` покрывает фильтры; `_id`-сортировка использует implicit primary-key index).
- `lead_events`: добавлен `{leadId:1, organizationId:1, _id:-1}` — предыдущие индексы (`{leadId:1, changedAt:1}`, `{organizationId:1, changedAt:-1}`) не обслуживают `_id`-курсор эффективно.

## 4. GET /leads/:leadId/events — tenant/owner scope и non-disclosure

`CrmService.listLeadEvents` вызывает `LeadRepository.findByIdForOrganization(leadId, organizationId, ownerPositionId)` **до** любого обращения к `lead_events`. Это тот же метод, что уже использует `getLead`/`changeLeadStage`:

- Lead другой организации или Lead, не принадлежащий вызывающей Position (при `own`-scope) — оба случая дают **одинаковый `404 NotFoundException`**. Не раскрывается ни факт существования чужого лида, ни причина отказа (403 vs 404) — тот же non-disclosure принцип, что везде в lead-модуле.
- Несуществующий `leadId` даёт тот же `404`, что и существующий-но-чужой — неотличимы по коду ответа и телу.
- Только после успешной scope-проверки читается `lead_events` с фильтром `{leadId, organizationId}` — `organizationId` в фильтре репозитория остаётся defense-in-depth, но не единственная граница: сама граница tenant/owner-изоляции — проверка на уровне `Lead`, выполненная раньше.
- Пустая история (лид существует, событий пока нет — по факту невозможно в текущей модели, так как `revealContact`/`revealListingContact`/`assignLead`/`changeLeadStage` всегда пишут `LeadEvent`, но контракт не полагается на этот инвариант) → `200 { items: [], nextCursor: null }`, не ошибка.

## 5. Non-disclosure полей

`CrmLeadReadModel`/`CrmLeadEventReadModel` — явные whitelist-проекции, собираемые вручную в `crm.service.ts` (`toLeadReadModel`/`toLeadEventReadModel`), не сериализация Mongoose-документа целиком:

- `contact` — только `{id, name, phone, email?}`, никогда весь `Contact`-документ.
- Ни один ответ обоих эндпоинтов не содержит `passwordHash`, `tokenHash`, `sessionToken` или любые поля другой организации — подтверждено HTTP integration-тестом (`не раскрывает внутренние поля`).

## 6. Тесты

| Файл | Уровень | Покрывает |
|---|---|---|
| `apps/api/src/modules/crm/repository/lead.repository.spec.ts` | unit | Mongo-фильтр `listForOrganization` (cursor/stage/ownerPositionId), сортировка |
| `apps/api/src/modules/crm/repository/lead-event.repository.spec.ts` | unit | Mongo-фильтр `listForLead` (cursor), `append` |
| `apps/api/src/modules/crm/crm.service.spec.ts` | unit | `listLeads`/`listLeadEvents` — limit+1/nextCursor, tenant/owner scope до чтения, non-disclosure 404, маппинг read model |
| `apps/api/src/modules/crm/lead.controller.spec.ts` | unit | `resolveOwnerFilter` (own-scope сужение/расширение), проброс cursor/limit/ownerPositionId в сервис |
| `apps/api/test/integration/lead-read-path-http.integration-spec.ts` | HTTP integration (реальный MongoDB + полный AppModule + реальные Fastify guard/middleware hooks) | 401 без cookie, 403 с мусорной cookie, cursor pagination без дублей/пропусков (полный обход всех страниц при limit=1), stage/ownerPositionId фильтры, own-scope изоляция, cross-tenant isolation, invalid cursor/limit (400), 404 non-disclosure для чужого/несуществующего лида, пустая история, absence of internal fields |
| `apps/api/test/integration/lead-management.integration-spec.ts` | DI-level integration (существовал до этого прохода) | Без изменений — write-путь (`assignLead`/`changeLeadStage`), не затронут этим проходом |

Запуск: `pnpm --filter @baza/api test` (unit), `pnpm --filter @baza/api test:integration` (integration, поднимает in-process MongoDB replica set через `mongodb-memory-server`, не требует внешней инфраструктуры).

## 7. Что осталось прежним

- `POST /leads/:leadId/assign`, `PATCH /leads/:leadId/stage`, `GET /leads/:leadId` — не изменены.
- `LEAD_STAGE_TRANSITIONS`, optimistic concurrency (`version`), non-disclosure паттерны write-пути — не изменены.
- `apps/marketplace-web`, `apps/admin-web`, Figma, Docker runtime, лишние lockfile-изменения — не затронуты этим проходом.

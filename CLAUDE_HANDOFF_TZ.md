# BAZA.sale — точное ТЗ и порядок работ для Claude

> Рабочая папка: `C:\Users\Александр\Desktop\IT\working\BAZA_Renovation`  
> Главный контекст: `baza-platform-integration-final/docs/BAZA_MASTER_PLAN.md`
> (перенесён из корня рабочей папки 01.09.2026, чтобы лежать под контролем версий
> вместе с остальной документацией; см. `baza-platform-integration-final/docs/README.md`)  
> Статус: проектный код создавать нельзя до завершения и утверждения Этапа A.  
> Цель этого файла: позволить Claude продолжить работу без устного контекста и без повторения старых ошибок.

## 1. Короткий ответ: что мы строим

Нужно создать с нуля единую платформу недвижимости BAZA.sale с тремя самостоятельными веб-приложениями:

1. **Marketplace** — новый публичный сайт и личный кабинет, полностью переписанный по Figma.
2. **ERP** — существующий React-фронтенд агентства/застройщика/риэлтора, подключённый к новому backend.
3. **Admin** — существующий React-фронтенд сотрудников BAZA, подключённый к новому backend.

Backend новый: TypeScript + MongoDB. Старый backend, старое API и старая база не являются основой. Перенос старых ошибок и механическая совместимость со старыми endpoint-ами запрещены.

Три приложения используют общие канонические данные, но имеют отдельные домены, отдельные host-only сессии и разные разрешения. Автоматического SSO нет.

## 2. Что Claude должен сделать первым

Claude не должен начинать с генерации monorepo, endpoint-ов или Mongo-схем. Первая работа — закрыть discovery и превратить текущий master plan в утверждённую, трассируемую спецификацию.

Точный порядок:

1. Полностью прочитать этот файл.
2. Полностью прочитать `BAZA_MASTER_PLAN.md`.
3. Проверить все перечисленные локальные источники, не изменяя их.
4. С разрешения владельца обследовать Figma, `baza.sale` и `erp.baza.sale`.
5. Подготовить результаты Этапа A в указанных ниже файлах.
6. Показать владельцу только найденные противоречия и 8 принципиальных решений.
7. После ответов обновить master plan и отметить ADR как Accepted/Rejected.
8. Получить явную команду владельца на начало implementation.

## 3. Обязательные источники

### 3.1. В новой рабочей папке

- `C:\Users\Александр\Desktop\IT\working\BAZA_Renovation\baza-platform-integration-final\docs\BAZA_MASTER_PLAN.md`
- `C:\Users\Александр\Desktop\IT\working\BAZA_Renovation\CLAUDE_HANDOFF_TZ.md`
- `C:\Users\Александр\Desktop\IT\working\BAZA_Renovation\outputs\01a034ef-7c42-72d2-9bc5-f05fc46dfba9\BAZA_неотвеченные_вопросы.xlsx`
- `C:\Users\Александр\Desktop\IT\working\BAZA_Renovation\.codex-artifacts\baza-discovery\extracted\*`

### 3.2. Существующие frontend-репозитории

- ERP: `C:\Users\Александр\Desktop\IT\working\bz26-client-erp-main`
- Admin: `C:\Users\Александр\Desktop\IT\working\bz26-dev-admin-client`
- Старый marketplace, только для инвентаря: `C:\Users\Александр\Desktop\IT\old\berega-client`

Исходные репозитории read-only. Нельзя исправлять их, чистить, коммитить или менять зависимости. Для будущей реализации будут импортированы рабочие копии.

### 3.3. Дополнительные документы

- `C:\Users\Александр\Downloads\Telegram Desktop\erp_master_rail.xlsx`
- `C:\Users\Александр\Downloads\Тарифы.xlsx`
- `C:\Users\Александр\Downloads\Telegram Desktop\Технический_аудит_baza.sale.pdf`
- Ролевые/RBAC-таблицы из Downloads, найденные по префиксу `BAZA_sale_`.

### 3.4. Внешние источники

- Figma: `https://www.figma.com/design/VEhjCW3yruV1B04Xy8VC4M/Batumi-Real-Estate-Project?node-id=0-1`
- Marketplace: `https://baza.sale/`
- ERP: `https://erp.baza.sale/#/dashboard`

Старые network-запросы и API можно смотреть только для понимания поведения интерфейса. Нельзя копировать их DTO, URL, auth flow или ошибки в новую спецификацию.

## 4. Приоритет требований

При конфликте Claude обязан использовать такой порядок:

1. Последнее прямое решение владельца продукта.
2. Заполненные ответы Excel.
3. Figma для UX и состава marketplace.
4. ERP frontend для ERP-сценариев.
5. Admin frontend для admin-сценариев.
6. Master rail, ТЗ, CRM-концепция, тарифы и ролевые таблицы как черновые каталоги.
7. Старый сайт и старый marketplace-код только как инвентарь и отрицательный пример.

Если конфликт нельзя разрешить этим порядком, Claude фиксирует его, предлагает безопасный default и задаёт один конкретный вопрос. Нельзя молча выбирать понравившийся вариант.

## 5. Неизменяемые решения

Claude не должен повторно обсуждать или менять без прямой команды владельца:

- Backend с нуля на TypeScript + MongoDB.
- Старое API не наследуется.
- Marketplace переписывается полностью.
- ERP и Admin frontend сохраняются как интерфейсная основа.
- Три сайта и три отдельные сессии, без автоматического SSO.
- Marketplace-аккаунт возможен без ERP.
- ERP multi-tenant; организации и их данные изолированы.
- ERP-типы организаций: агентство, застройщик, независимый риэлтор.
- Один человек не занимает позиции в нескольких организациях одновременно.
- Фиксированные внутренние роли: Собственник, Директор, РОП, Менеджер, Администратор.
- Рабочая база принадлежит стабильной Position, а не логину сотрудника.
- При замене сотрудника пароль не передаётся: создаётся новый PositionAssignment.
- Новостройки публикуются из ERP застройщика.
- Вторичка может создаваться собственником/риэлтором в marketplace.
- MLS-публикация требует регистрации и верификации.
- AI-функции отложены до реализации основной системы.
- MongoDB размещается на собственном сервере; Docker разрешён.
- Запуск: Батуми/Грузия, RU/EN/KA, USD/GEL.
- Платёжного провайдера пока нет; биллинг ручной, но серверно журналируемый.

## 5.1. Жёсткий gate: marketplace UI делается только по Figma

Это правило введено владельцем 26.08.2026 после обнаружения недопустимого generic UI-черновика. Оно важнее удобства, скорости и личного вкуса исполнителя.

- **Figma — единственный source of truth для визуального marketplace.** Старый сайт допустим только как источник поведения/SEO-инвентаря, но никогда как источник вёрстки, цветов, карточек или структуры экрана.
- До начала любого marketplace UI-кода исполнитель обязан получить и указать конкретные Figma node ID, название фрейма, desktop/mobile-варианты и нужные состояния. Одного общего `figma-screen-inventory.md` недостаточно для реализации экрана.
- Каждый UI PR/пакет изменений обязан содержать запись в `docs/discovery/figma-ui-delivery-gate.md`: route, node ID, целевые файлы, подтверждённые состояния и результат visual compare.
- Нельзя выдумывать дизайн-систему, палитру, типографику, структуру карточек, hero-блоки, placeholder-иллюстрации, копирайт или фильтры. В частности, generic design skills / «красивые» шаблоны не заменяют Figma и не могут задавать визуальное направление.
- Если в Figma нет нужного состояния (например loading, empty, error), исполнитель фиксирует Figma gap в delivery gate и предлагает минимальное системное состояние. Кодить его можно только после явного решения владельца либо существующего принятого правила DoD.
- Если Figma содержит несколько вариантов либо фрейм помечен `(не используется)`, выбор нельзя угадывать: зафиксировать conflict и получить решение владельца.
- До визуальной сверки с Figma экран имеет статус `scaffold`, а не `готово`; его нельзя представлять владельцу как перенос дизайна.
- Это правило относится к **marketplace**. Для ERP и Admin источником визуальной правды остаются их сохранённые frontend-репозитории, если конкретный Figma-фрейм явно не относится к соответствующему приложению.

Полная процедура и Definition of Done: `docs/discovery/figma-ui-delivery-gate.md`.

## 6. Этап A — обязательный discovery до кода

### A-01. Инвентарь Figma

Создать `docs/discovery/figma-screen-inventory.md`.

Для каждого frame/page/state записать:

| Поле | Содержание |
|---|---|
| Figma node | node id и название |
| Product | marketplace / ERP / admin / неизвестно |
| Route | предполагаемый URL |
| Actor | гость / покупатель / собственник / риэлтор / агентство / застройщик |
| Desktop/mobile | какие варианты существуют |
| States | loading / empty / error / success / blocked / logged-out |
| Data | какие сущности и поля отображаются |
| Actions | что пользователь может сделать |
| Auth | нужна ли сессия |
| Backend domain | модуль из master plan |
| Source status | build / later / reject / question |

Обязательные результаты:

- Ни один marketplace-frame не пропущен.
- ERP/Admin-экраны внутри Figma отделены от marketplace и не используются случайно как его требования.
- Зафиксированы компоненты, typography, colors, grids, breakpoints, hover/focus/disabled states.
- Отдельно отмечены экраны, отсутствующие на live-сайте.

### A-02. Сравнение live marketplace

Создать `docs/discovery/marketplace-gap-matrix.md`.

Для каждого публичного route:

| Route | Live функция | Figma эквивалент | Сохранить функцию | Переписать UX | Удалить | Backend domain | SEO redirect |
|---|---|---|---|---|---|---|---|

Проверить минимум:

- главную;
- каталоги всех категорий;
- список/карта и переключение режимов;
- фильтры и URL query state;
- карточки ЖК, корпуса, юнита и вторичного объекта;
- профили риэлтора, агентства, застройщика;
- избранное, подборки, запросы, проекты, услуги;
- регистрацию/login и личный кабинет;
- добавление/редактирование объявления;
- контакты, WhatsApp/Telegram/телефон;
- desktop/mobile;
- title/description/canonical/robots/sitemap/schema;
- URL, которые уже имеют SEO-ценность.

Нельзя писать «оставить как сейчас». Нужно зафиксировать конкретное наблюдаемое поведение и решение.

### A-03. ERP functional map

Создать `docs/discovery/erp-functional-map.md`.

Пройти локальные routes из `src/main.tsx`, меню, master rail и по возможности live ERP. Для каждого экрана:

| Route | Actor/role | Purpose | Current source | Mutations | Required entities | Permission | Mock/local/API | Target status |
|---|---|---|---|---|---|---|---|---|

Обязательно покрыть:

- Dashboard/workbench.
- Development, project wizard, buildings/floors/units, chessboard, floorplans.
- Bookings, registrations, installments, broadcasts, promotion, selections.
- Newbuild catalog and partners.
- Secondary/rent/commercial/land/houses/projects.
- Leads, clients, deals, tasks, calendar, analytics.
- Chats WA/TG and CRM linking.
- Team, Position, vacancy, assignment history, permissions and KPI.
- Finance, partners/MLM, LMS, community, news/settings.

Для каждого экрана вынести localStorage keys, mock stores и старые API зависимости. Это migration inventory, а не контракты нового backend.

### A-04. Admin functional map

Создать `docs/discovery/admin-functional-map.md`.

Для каждого раздела зафиксировать:

- разрешения `resource.action.scope`;
- поиск/фильтры/pagination;
- массовые операции;
- критические действия и обязательную причину;
- before/after audit;
- необходимость city/domain scope;
- support impersonation;
- текущий mock/live status;
- решение build/later/reject.

AI-раздел пометить `reject for current scope`.

### A-05. Traceability matrix

Создать `docs/discovery/requirements-traceability.xlsx` или `.md`.

Каждое требование получает стабильный ID:

- `MKT-*` — marketplace;
- `ERP-*` — ERP;
- `ADM-*` — admin;
- `IAM-*` — identity;
- `TEN-*` — tenancy/roles;
- `SEC-*` — security;
- `OPS-*` — infrastructure;
- `QA-*` — verification.

Поля: requirement, owner decision, source, affected routes, domain, priority/order, dependency, acceptance criteria, status, unresolved conflict.

### A-06. Decision closure

Создать `docs/decisions/open-decisions.md` и вынести только эти вопросы:

1. Регистрация агентства: открытая, invite-only или заявка с одобрением.
2. Пороги актуализации по категориям.
3. Retention удалённых аккаунтов, audit, сообщений, документов и медиа.
4. Процесс и ответственные за MLS-верификацию.
5. Infrastructure budget.
6. Финальный справочник коммерческой недвижимости и обязательных полей.
7. Точный flow доски запросов и раздела «Журнал».
8. Источник и правило курса USD/GEL.

Нельзя повторно задавать уже закрытые 183 вопроса.

### A-07. Результат Этапа A

Этап завершён, только если:

- все перечисленные файлы созданы;
- каждый экран связан с route, actor, domain и requirement ID;
- все противоречия перечислены;
- владелец ответил либо явно разрешил safe default;
- `BAZA_MASTER_PLAN.md` обновлён;
- Proposed ADR получили Accepted/Rejected;
- владелец написал, что можно начинать implementation.

## 7. Этап B — проектирование до реализации

После утверждения discovery Claude создаёт точные проектные документы. Код всё ещё не начинается до review этих документов.

### B-01. ADR-пакет

Создать:

- `docs/architecture/adr/001-modular-monolith.md`
- `docs/architecture/adr/002-mongodb-tenancy.md`
- `docs/architecture/adr/003-identity-position-assignment.md`
- `docs/architecture/adr/004-separate-product-sessions.md`
- `docs/architecture/adr/005-publication-projection.md`
- `docs/architecture/adr/006-transactions-outbox-workers.md`
- `docs/architecture/adr/007-search-and-map.md`
- `docs/architecture/adr/008-media-storage.md`
- `docs/architecture/adr/009-admin-permission-scopes.md`
- `docs/architecture/adr/010-import-not-migration.md`

Каждый ADR содержит context, decision, alternatives, consequences, security impact, operational impact и rollback/revisit trigger.

### B-02. Domain model

Создать `docs/architecture/domain-model.md`.

Обязательные bounded modules:

- Identity/Sessions/ProductAccess.
- Organizations/Positions/Assignments/Invitations.
- Authorization/AdminAccess/Audit.
- Developments/Buildings/Sections/Floors/Units/FloorPlans.
- PropertyAssets/Listings/Publications.
- Media/Search/Geo/Dedupe/Moderation/MLS.
- Contacts/Leads/Tasks/Deals/Bookings/Selections.
- Reviews/Complaints.
- Subscriptions/Entitlements/Promotion/ManualLedger.
- Messaging/Notifications.
- Content/SEO/Localization.
- Analytics/Imports/Exports.
- LMS/Community as later modules.

Для каждой сущности указать:

- canonical owner module;
- fields and value objects;
- lifecycle/status machine;
- invariants;
- tenant/public/admin visibility;
- commands and events;
- references to other modules;
- indexes and uniqueness;
- retention/soft-delete behavior;
- audit requirements.

### B-03. MongoDB collection/index specification

Создать `docs/architecture/mongodb-schema.md`.

Минимальные коллекции:

```text
identities
product_accesses
sessions
organizations
positions
position_assignments
invitations
permission_grants
admin_accounts
audit_events
media_assets
developments
buildings
sections
floors
units
floor_plans
property_assets
listings
marketplace_publications
duplicate_candidates
complaints
mls_verifications
contacts
leads
lead_events
tasks
deals
bookings
selections
reviews
subscription_plans
subscriptions
entitlements
manual_ledger_entries
promotion_placements
outbox_events
job_failures
```

Обязательные индексы и правила:

- normalized login уникален в `identities`.
- session хранит только hash токена; TTL по `expiresAt`.
- у identity не более одного активного assignment во всех организациях.
- у position не более одного активного assignment.
- tenant-уникальности включают `organizationId`.
- public slug уникален и отделён от `_id`.
- GeoJSON всегда `[longitude, latitude]`, индекс `2dsphere`.
- active booking одного unit не может пересекаться по времени; защита транзакцией/lock record, не UI-проверкой.
- outbox event создаётся в одной транзакции с бизнес-изменением.
- audit append-only; payload не содержит password/token/provider secret.

Для каждого индекса указать query, который он обслуживает, и риск роста.

### B-04. Permission matrix

Создать `docs/security/permission-matrix.md`.

Формат permission: `resource.action.scope`.

Базовые роли организации:

- owner;
- director;
- rop;
- manager;
- administrator.

Системные admin actors:

- super_admin;
- admin с индивидуальными grants/scopes.

Обязательные scopes: `own`, `position`, `team`, `organization`, `project`, `city`, `global`, `assigned` — использовать только там, где они имеют определённый смысл.

Матрица должна отдельно описывать critical actions: price update, bulk price update, booking cancel/extend, lead reassignment, listing unpublish, rating adjustment, manual ledger change, impersonation, export.

### B-05. API conventions and first OpenAPI design

Создать:

- `docs/api/conventions.md`
- `docs/api/error-catalog.md`
- `docs/api/v1-first-vertical-slice.yaml`

Правила:

- API prefix `/api/v1`.
- Cursor pagination.
- Stable error code + message + requestId + safe details.
- Idempotency key для publish/book/cancel/manual ledger/import.
- Optimistic version для параллельно редактируемых карточек.
- UTC timestamps.
- Money: Decimal128 или minor units + currency, никогда JS float.
- Transport schema не является domain entity.
- Frontend client генерируется из OpenAPI.

Сессии:

- Marketplace, ERP и Admin получают разные host-only cookies.
- Cookie не имеет `Domain=.baza.sale`.
- Auth endpoint проксируется через origin соответствующего приложения.
- Session содержит product audience; ERP session не принимается Admin/Marketplace.
- Пароль/refresh token не хранится в localStorage.

### B-06. Infrastructure and security specification

Создать:

- `docs/operations/environments.md`
- `docs/operations/docker-compose-topology.md`
- `docs/operations/backup-restore.md`
- `docs/operations/observability.md`
- `docs/security/threat-model.md`

Test/staging topology:

- reverse proxy/TLS;
- marketplace;
- ERP static app;
- Admin static app;
- API;
- worker;
- MongoDB single-node replica set;
- Redis;
- MinIO;
- structured logs, health, metrics;
- backup job.

Ограничение 8 ГБ: не добавлять OpenSearch, self-hosted map tiles и тяжёлый monitoring stack в стартовый compose.

Threat model минимум: tenant escape/IDOR, admin escalation, stolen session, brute force, contact scraping, spam leads/reviews, malicious uploads, XSS/CSRF, mass export, impersonation abuse, booking race, webhook/provider replay.

## 8. Этап C — implementation foundation после утверждения

Целевая структура:

```text
baza-platform/
  apps/
    marketplace-web/
    erp-web/
    admin-web/
    api/
    worker/
  packages/
    api-client/
    contracts/
    domain-events/
    config/
    observability/
    test-kit/
    ui-business/
    eslint-config/
    tsconfig/
  infrastructure/
    compose/
    docker/
    proxy/
    backup/
  docs/
```

Рекомендуемый stack, пока ADR не изменён:

- pnpm workspace + Turborepo;
- TypeScript;
- NestJS + Fastify adapter;
- Mongoose/MongoDB;
- Redis + BullMQ;
- Next.js marketplace;
- React/Vite ERP и Admin;
- MapLibre;
- MinIO/S3 API;
- OpenAPI-generated client;
- Vitest/Jest according to selected packages;
- Playwright E2E.

### C-01. Monorepo baseline

- Files: root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, shared TS/lint configs.
- Change: reproducible install/build/lint/typecheck/test commands.
- Import: ERP/Admin в копии `apps/erp-web`, `apps/admin-web`; история исходников не изменяется.
- Marketplace: только shell, без выдуманного UI до подтверждённого Figma mapping.
- Verify: clean checkout → install → build всех apps.
- Depends on: approved ADR package.

### C-02. Local infrastructure

- Files: `infrastructure/compose/compose.dev.yml`, Mongo init, healthchecks, `.env.example`.
- Change: Mongo replica set, Redis, MinIO, API/worker dependencies.
- Security: real secrets только локально/secret store; `.env.example` без значений.
- Tests: services healthy; API может выполнить тестовую Mongo transaction; worker получает idempotent job.
- Depends on: C-01.

### C-03. API skeleton and module boundaries

- Files: `apps/api/src/modules/*`, dependency rules, global exception/filter/request context.
- Change: modules не импортируют чужие repositories напрямую; общение командами/query/events.
- Tests: architecture dependency test; health/readiness endpoints.
- Depends on: C-01, C-02.

### C-04. OpenAPI pipeline

- Files: OpenAPI generation, `packages/api-client`, CI breaking-change check.
- Change: один generated client для трёх frontend apps.
- Tests: DTO change regenerates client; stale generated output fails CI.
- Depends on: C-03.

### C-05. Identity and three sessions

- Modules: Identity, Sessions, ProductAccess.
- Behavior: login/logout/revoke/recovery; host-only secure cookies; separate product audience.
- Security: Argon2id, token hashes, rotation, CSRF strategy, auth rate limit.
- Tests: ERP cookie rejected by Admin; revoked session rejected; brute force limited; no auth token in browser storage.
- Depends on: C-03, C-04.

### C-06. Organizations/Positions/Assignments

- Behavior: create org, create stable position, invite identity, occupy/vacate, close assignment, handover.
- Invariant: one active org per identity; one active occupant per position.
- Ownership: lead/client/task/deal can reference stable `ownerPositionId`.
- Tests: terminated employee loses session; new occupant sees position-owned work; history remains immutable.
- Depends on: C-05.

### C-07. Authorization and tenant context

- Behavior: deny-by-default policy evaluator, role defaults, explicit grants, scopes.
- Every tenant repository requires TenantContext.
- AdminContext is separate and requires permission/scope/reason.
- Tests: cross-org ID read/update/list/search/export all denied without revealing existence.
- Depends on: C-06.

### C-08. Audit and outbox

- Behavior: append-only critical audit, correlation ID, outbox transaction, idempotent worker.
- Tests: business mutation and outbox commit atomically; replay does not duplicate side effect.
- Depends on: C-03, C-07.

### C-09. Media foundation

- Behavior: upload intent, size/MIME/magic-byte/checksum, ownership, public/private variants, signed URL.
- Worker: virus scan hook, public derivative, EXIF removal.
- Tests: unauthorized file denied; fake MIME rejected; private object not public.
- Depends on: C-07, C-08.

### C-10. Foundation release gate

Запустить и сохранить доказательства:

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm test:e2e --grep foundation
```

Дополнительно: tenant escape suite, session audience suite, backup/restore smoke test.

Пока gate не зелёный, разработка массовых ERP-экранов запрещена.

## 9. Этап D — первая вертикальная функция

Цель: доказать архитектуру цепочкой «застройщик → ERP → marketplace → лид → ERP → admin».

### D-01. Development aggregate

Минимальные сущности: Development, Building, optional Section, Floor, Unit, FloorPlan.

Статусы:

- Development: draft / active / archived.
- Unit: available / reserved / sold / hidden.

Unit kind как отдельное поле: apartment / commercial / office / parking / storage / other. Паркинг имеет отдельный шахматный view.

Tests: hierarchy, valid status transitions, permissions, price audit, optimistic conflict.

### D-02. ERP project wizard and chessboard

- Подключить минимально необходимые существующие экраны ERP.
- Удалить localStorage/mock как источник истины только в затронутом сценарии.
- Не переписывать весь ERP одним PR.
- Loading/empty/error/forbidden/conflict/success states обязательны.

### D-03. Publication projection

- Команда publish валидирует активный Development и публичные обязательные поля.
- В одной transaction сохраняется состояние и outbox event.
- Worker строит versioned MarketplacePublication.
- Внутренние комиссии, заметки и tenant data не попадают в projection.
- Unpublish перестраивает/скрывает projection и пишет audit.

### D-04. Marketplace public slice

- Figma-accurate каталог первички, карточка Development и Unit.
- SSR/metadata/canonical/schema/sitemap.
- RU/EN/KA data fallback rules.
- USD/GEL display rule после решения владельца.
- Mongo structured/geo search, cursor pagination.

### D-05. Contact reveal and lead intake

- Контакты отсутствуют в list/search HTML/JSON.
- Reveal — отдельная rate-limited команда с audit/abuse signals.
- Lead сохраняет source route, publication, UTM/referrer и organizationId.
- Lead назначается вручную РОПом/Директором/Собственником.
- Другие организации не видят факт существования lead/contact.

### D-06. Admin operation

- Admin может найти publication только в разрешённом scope.
- Unpublish/block требует permission и reason.
- Действие отражается в audit, public projection и ERP status.
- Support impersonation не даёт выполнять unpublish/financial critical actions без отдельного разрешения.

### D-07. Vertical E2E acceptance

Один Playwright-набор должен доказать:

1. Developer owner входит в ERP.
2. Создаёт draft комплекса, корпус, этаж и unit.
3. Публикует.
4. Гость на marketplace находит комплекс фильтром и картой.
5. Открывает индексируемую карточку.
6. Явно раскрывает контакт или отправляет обращение.
7. Lead появляется только в ERP организации застройщика.
8. РОП назначает lead на Position менеджера.
9. Admin с подходящим scope снимает публикацию с причиной.
10. Marketplace больше не выдаёт карточку, ERP видит причину, audit полон.

Также обязательны negative paths:

- чужая организация не читает/не меняет комплекс;
- менеджер без права не меняет цену;
- параллельное редактирование даёт version conflict;
- contact scraping получает rate limit;
- admin без scope получает forbidden;
- повтор idempotency key не создаёт второй lead/publication.

## 10. Что делать после первой вертикали

Только после прохождения D-07:

1. PropertyAsset + sale/rent Listing.
2. Owner/realtor publishing wizard.
3. Dedupe + actuality + complaints.
4. Полный marketplace scope по Figma.
5. CRM Contacts/Leads/Tasks/Deals.
6. Team/Positions UI полностью.
7. Полная первичка: bookings, registrations, installments, selections.
8. Операционная Admin.
9. Entitlements/manual billing/promotion.
10. WA/TG messaging.
11. Finance analytics, LMS, community.
12. AI отдельным проектным этапом.

Подробности находятся в `BAZA_MASTER_PLAN.md`; порядок нельзя заменять горизонтальным «сначала весь backend, потом весь frontend».

## 11. Правила работы Claude

- Перед действием указывать текущий task ID и ожидаемый artifact/result.
- Каждую гипотезу помечать `assumption`; каждое решение владельца — `accepted decision`.
- Не менять исходные ERP/Admin/old marketplace repos.
- Не устанавливать зависимости и не выходить в сеть без разрешения владельца.
- Не удалять данные/файлы без точного target verification.
- Не хранить secrets/tokens/passwords в коде, логах, localStorage или документации.
- Не создавать роль Marketer/Lawyer/Finance и другие старые роли без нового решения.
- Не считать mock/localStorage feature реализованной.
- Не использовать AI-разделы в текущем scope.
- Не объявлять задачу готовой без свежих test/inspection evidence.
- После каждого завершённого task обновлять traceability и master plan, если изменилось решение.

## 12. Формат отчёта Claude владельцу

Не выдавать длинный поток внутренних действий. Отчёт должен содержать:

1. **Результат:** какой artifact или работа реально завершены.
2. **Найденные факты:** только подтверждённые источниками.
3. **Противоречия:** источник A против источника B и предлагаемое решение.
4. **Нужные ответы:** только блокирующие вопросы.
5. **Проверка:** какие файлы/экраны/команды проверены.
6. **Следующий шаг:** один конкретный task ID.

## 13. Готовый первый prompt для Claude

Скопировать Claude следующий текст:

```text
Ты работаешь над новой платформой BAZA.sale в папке
C:\Users\Александр\Desktop\IT\working\BAZA_Renovation.

Сначала полностью прочитай CLAUDE_HANDOFF_TZ.md и BAZA_MASTER_PLAN.md.
Не начинай писать продуктовый код и не изменяй исходные репозитории.

Твоя первая задача — выполнить Этап A из CLAUDE_HANDOFF_TZ.md:
1) проверить локальные источники;
2) запросить разрешение перед внешним доступом;
3) обследовать Figma, live marketplace и live ERP;
4) создать docs/discovery/figma-screen-inventory.md,
   marketplace-gap-matrix.md,
   erp-functional-map.md,
   admin-functional-map.md,
   requirements-traceability.xlsx или .md;
5) создать docs/decisions/open-decisions.md только с восемью указанными решениями;
6) обновить BAZA_MASTER_PLAN.md подтверждёнными фактами.

При конфликте соблюдай приоритет источников из ТЗ. Старый API и старый backend не использовать как основу. В конце покажи точные результаты, противоречия и блокирующие решения. До моего явного разрешения implementation не начинай.
```

## 14. Что владельцу нужно сказать Claude сейчас

Коротко: «Начинай с Этапа A. Сетевой доступ к Figma и сайтам разрешаю/не разрешаю. Код не писать. После discovery принеси только gap-матрицу, противоречия и 8 решений».

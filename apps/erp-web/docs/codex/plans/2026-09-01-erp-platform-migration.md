# ERP platform migration implementation plan

## Goal

Последовательно перевести рабочие области ERP с legacy CRM API и локальных
демоданных на BAZA Platform API. План охватывает каждую вкладку левого меню,
но не подменяет отсутствующие серверные контракты вымышленными.

## Non-Goals

- Не менять существующие роли, визуальную систему и дерево маршрутов без
  отдельной задачи.
- Не удалять legacy-код, пока экран не имеет подтверждённой замены и миграции
  данных.
- Не реализовывать серверные процессы бронирования повторно: BOOK-001 уже
  находится в новом backend-контуре.
- Не делать интеграции со внешними MLS, оплатами и почтой до утверждённого
  контракта и прав доступа.

## Current System Notes

- Уже переведены на Platform API: вход/выход с cookie-сессией, чтение команды,
  V2 inbox лидов, V2 проекты девелопмента и чтение списка объектов вторичного
  рынка. Карточка и создание/активация вторички также используют V2 asset/listing.
- В `development` уже работают создание ЖК, список, структура
  корпус--секция--этаж--лот, шахматка V2 и публикация. Маршрут
  `projects/:id/edit` намеренно отключён, хотя `developmentsApiV2.update` уже
  существует.
- Во `secondary` есть Platform API для asset/listing, публикации, актуальности
  и кандидатов на дубли. Основной список объектов и отчёты пока читают
  `secondaryObjectsApi` (legacy), поэтому экраны используют разные источники
  правды.
- CRM, команда, чат, LMS, сообщество, финансы, аналитика и настройки всё ещё
  содержат legacy или mock-границы в различной степени.

## Inventory and Order

| Area | Routes / screens | Current source | Next migration outcome | Priority |
| --- | --- | --- | --- | --- |
| Development | `development/projects`, management, chessboard, floorplans, sales management | Platform V2 + legacy adjacent screens | Finish V2 project lifecycle, then move floorplans/chessboard/sales screens by contract | P0 |
| Secondary market | `objects/*`, `my-properties`, selections, report | Platform asset/listing plus legacy catalog | One authoritative V2 list/detail/edit flow, then publication/actuality/dedupe UX | P0 |
| CRM | inbox, poker, clients, deals, tasks, calendar | Leads inbox V2; remainder legacy | Extend lead lifecycle, then contacts/deals/tasks with server contracts | P1 |
| New buildings | catalog, partners, registrations, installments, selections | Legacy / shared screens | Reuse completed development inventory; migrate commercial partner and sales operations separately | P1 |
| Team | org, branches, KPI, access | V2 read; legacy writes | Move mutations after team/role contract is confirmed | P1 |
| Community | forum, exchange, threads, profiles | Legacy community API | Contract audit, then forum/read-write migration as one vertical | P2 |
| Learning | browse, course, lesson, test | Legacy LMS API | Adopt LMS v2 contract; preserve learner progress and test attempts | P2 |
| Chats | chats, chat settings | Legacy REST/socket | Define realtime and delivery contract, then migrate messages and notifications | P2 |
| Finance and analytics | finance hub/report, CRM analytics/reports | Legacy / derived views | Migrate only after source entities and permissions are authoritative | P3 |
| Dashboard, info, settings, partners, public/share links | home, news, reminders, profile, tariff, visitka/lot links | Mixed legacy/local | Inventory each data dependency and migrate without breaking public links | P3 |

## Tasks

- [x] Establish the shared Platform boundary for session and team reads.
  - Files: `src/context/AuthContext.tsx`, `src/services/platformAuthApi.ts`,
    `src/services/teamApi.ts`.
  - Change: browser credentialed session and server-derived tenant context.
  - Tests: platform auth and team route unit tests.

- [x] Finish the core Development V2 project lifecycle.
  - Files: `src/pages/projects/ProjectWizardV2Page.tsx`,
    `src/pages/projects/ProjectWizardDisabledPage.tsx`,
    `src/pages/projects/ProjectsPage.tsx`, `src/main.tsx`.
  - Change: replaced the disabled project-edit route with the existing V2
    `getById`/`update` contract, including optimistic `expectedVersion`; the
    project management V2 route remains intact.
  - Tests: prove edit load, submit payload, success navigation and error state.
  - Depends: none; the backend contract is already present.

- [ ] Finish Development inventory operations in dependency order.
  - Files: `src/features/developments-v2/**`, adjacent legacy development
    pages and routes.
  - Change: connect V2 hierarchy to floor plans and chessboard, then define
    migration of registrations, bookings, broadcasts, promotion and selections.
  - Tests: unit status/price version conflicts, publication retry and route
    integration.
  - Depends: complete product mapping for sales and booking contracts.

- [x] Make the Secondary market list read authoritative.
  - Files: `src/components/objects/ObjectsListPage.tsx`,
    `src/components/objects/ObjectCardPage.tsx`,
    `src/components/objects/ObjectEditWizard.tsx`,
    `src/components/management/my-properties/MyPropertiesPage.tsx`,
    `src/services/propertyAssetsApi.ts`.
  - Change: replaced legacy catalog reads with the server-scoped Platform
    asset/listing projection. Edit/create and detail already use the same V2
    IDs; persistence of list actions remains a separate task below.
  - Tests: query-to-list mapping, empty/error states, detail hand-off from list.
  - Depends: API pagination/filter projection if the current list endpoint is
    insufficient; do not simulate it client-side.

- [ ] Complete Secondary publication safety.
  - Files: secondary object card/editor and `propertyAssetsApi`.
  - Change: surface draft/active/expired lifecycle, actuality confirmation,
    duplicate review/override, retry-safe publish and reasoned unpublish.
  - Tests: idempotency keys, expected-version errors, duplicate decision and
    stale actuality states.
  - Depends: accepted business thresholds and publication-channel policy.

- [ ] Extend CRM from V2 lead inbox to the full workflow.
  - Files: lead, client, deal, task and calendar modules.
  - Change: migrate one entity chain at a time: lead -> contact -> deal -> task
    -> calendar; retain legacy view only until an equivalent V2 screen works.
  - Tests: assignment/stage changes, access visibility and audit timeline.
  - Depends: CRM API contracts for entities after leads.

- [ ] Move Team mutations after the read path is stable.
  - Files: `src/services/teamApi.ts`, team pages and access controls.
  - Change: move branches, membership, roles and access mutations to the new
    server-side tenant boundary.
  - Tests: role denial, self/team ensure flows and optimistic refresh.
  - Depends: team role and mutation API contract.

- [ ] Migrate New buildings operations separately from Development inventory.
  - Files: catalog, partners, registrations, installments and selections pages.
  - Change: attach commercial partner/sales screens to the completed inventory
    model without duplicating the development aggregate.
  - Tests: access by partner role and booking/registration state hand-offs.
  - Depends: partner, commission and registration API contracts.

- [ ] Migrate Community as a complete forum vertical.
  - Files: community pages and `communityApi`.
  - Change: sections, threads, exchange board, author profiles and moderation
    use one versioned API.
  - Tests: permission matrix, pagination and thread write/read consistency.
  - Depends: forum v2 contract and moderation rules.

- [ ] Migrate Learning as a complete learner workflow.
  - Files: LMS pages and `lmsApi`.
  - Change: catalogue, course, lesson, test and progress use LMS v2 APIs.
  - Tests: progress durability, attempts, course access and resume behaviour.
  - Depends: LMS v2 server delivery.

- [ ] Design and migrate Chats without breaking realtime guarantees.
  - Files: chat pages, `messengerApi` and socket client.
  - Change: versioned conversation, delivery, unread and reconnect boundaries.
  - Tests: reconnect, duplicate event and permission cases.
  - Depends: realtime protocol and notification contract.

- [ ] Migrate dependent and administrative surfaces last.
  - Files: dashboard, finance, analytics, settings, info, partner and public
    link modules.
  - Change: replace each data dependency only once its source entity is
    authoritative; preserve all redirects and public URLs.
  - Tests: route guards, cross-role navigation and public-link regressions.
  - Depends: source verticals above.

## Verification

- For every changed vertical, start with focused failing tests, then run its
  focused suite, TypeScript check and the ERP unit suite from `apps/erp-web`.
- Check the changed routes under each relevant role in a local browser before
  declaring a UI flow ready.
- Record which source powers list, detail, mutation and publication separately;
  a screen is not migrated merely because its route renders.

## Risks

- Legacy and Platform IDs can be confused in shared screens; a migration must
  not pass a legacy property ID to an asset endpoint.
- Cookie sessions require same-origin/proxy configuration; never restore a
  browser-held token as a shortcut.
- Actuality windows, duplicate override rules, MLS policy, commissions and
  commercial taxonomy are business decisions, not frontend defaults.
- The repository contains parallel uncommitted work. Each task must be narrow
  and must not revert or fold unrelated changes into its result.

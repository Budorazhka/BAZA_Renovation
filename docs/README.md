# Документация BAZA Platform

Указатель по документам репозитория. Заведён 01.09.2026: до него единственным
способом узнать, что где описано, было перечисление каталога `operations/`
(31 файл без группировки).

## С чего начинать

| Документ | Когда нужен |
| --- | --- |
| [BAZA_MASTER_PLAN.md](BAZA_MASTER_PLAN.md) | Источник объёма работ: решения владельца продукта, целевая модель, план этапов 0–12, бэклог с критериями приёмки, журнал решений. Перенесён сюда из корня рабочей папки 01.09.2026. |
| [roadmap-2026-09.md](roadmap-2026-09.md) | Куда двигаемся дальше: волны работ, что взято в работу и какие решения ждут владельца. |
| [architecture.md](architecture.md) | Перед любой задачей. Карта владения кодом, правила зависимостей, чек-лист изменения, правило про три уровня тестов. |
| [progress-report-2026-09-01.md](progress-report-2026-09-01.md) | Что сделано, чего нет, и **процент готовности по этапам плана** (раздел 2). |
| [api/conventions.md](api/conventions.md) | Перед добавлением или изменением эндпоинта. |
| [api/error-catalog.md](api/error-catalog.md) | При выборе кода ошибки. |
| [api/v1-first-vertical-slice.yaml](api/v1-first-vertical-slice.yaml) | OpenAPI-контракт. Источник для `packages/api-client`. |

## Документы-основания находятся вне этого репозитория

**Это известный разрыв, а не особенность организации.** Канонические решения по
архитектуре платформы лежат в `BAZA_Renovation/docs/` — снаружи поставляемого
репозитория, и там этот каталог не отслеживается git. То есть они не под
контролем версий нигде.

**Переносим модульно**, по мере завершения работ по теме документа (решение
владельца от 01.09.2026, порядок очереди — в
[roadmap-2026-09.md](roadmap-2026-09.md)). Документ, переезжающий вместе с
закрытой работой, приезжает уже выверенным.

Уже здесь:

| Документ | Приехал вместе с |
| --- | --- |
| [BAZA_MASTER_PLAN.md](BAZA_MASTER_PLAN.md) | отчётом о ходе работ и подсчётом готовности |
| [architecture/adr/002-mongodb-tenancy.md](architecture/adr/002-mongodb-tenancy.md) | стражем `tenant-scope`: 18 запросов без `organizationId` разобраны, утечек нет |
| [architecture/adr/006-transactions-outbox-workers.md](architecture/adr/006-transactions-outbox-workers.md) | стражем `idempotency-coverage`: противоречие §4/§8 conventions.md разрешено |
| [security/permission-matrix.md](security/permission-matrix.md) | стражем `permission-grants`: все три мёртвых гранта включены |

Ещё снаружи, в `BAZA_Renovation/docs/`:

| Документ | Ждёт |
| --- | --- |
| ADR-005, ADR-008 | чистки тихих подмен данных в ERP |
| `domain-model.md`, `mongodb-schema.md` | закрытия мок-долга CRM |
| `threat-model.md`, ADR-004, ADR-009 | следующего прохода по безопасности |
| ADR-001, 003, 007, 010 | по мере затрагивания своих областей |

Практическое следствие: строка 4 файла `api/conventions.md` заявляет
«Опирается на: все 10 ADR, domain-model.md, mongodb-schema.md,
permission-matrix.md», и ни один из четырёх читателю этого репозитория
недоступен. Рекомендация — внести их сюда и удалить внешние копии, чтобы не
плодить расхождение (одно такое, противоречие §4 и §8 в `conventions.md`, уже
пришлось разрешать вручную).

Там же, в `BAZA_Renovation/docs/operations/`, лежит 41 документ ранней эпохи
проекта (`d01`–`d07`, `team-*`, `prop-001`, `auth-login-*`, `backup-restore`,
`observability`, `environments`). Они описывают фундамент, который здесь уже не
документируется, и с документами ниже почти не пересекаются.

## operations/ — по темам

Каждый документ описывает одну завершённую работу: что сделано, почему так и что
осталось открытым.

### CRM

- [crm-lead-read-path.md](operations/crm-lead-read-path.md) — чтение лидов, курсорная пагинация, фильтры, события.
- [crm-contacts-read-path.md](operations/crm-contacts-read-path.md) — чтение контактов, tenant- и own-скоуп.
- [crm-tasks-next-action.md](operations/crm-tasks-next-action.md) — задачи и индикатор следующего действия.
- [crm-task-events.md](operations/crm-task-events.md) — outbox-события жизненного цикла задачи.
- [erp-tasks-live-api.md](operations/erp-tasks-live-api.md) — реестр задач ERP снят с мока: чтение, завершение и создание через Platform API.
- [erp-tasks-mock-debt-closed.md](operations/erp-tasks-mock-debt-closed.md) — статус «В работе» стал достижим, виджет дашборда снят с мока, `hasOpenNextAction` перестал гаснуть при взятии задачи в работу.
- [erp-tasks-actions-parity.md](operations/erp-tasks-actions-parity.md) — экран догнал сервер: взять в работу, отметить подзадачу, сменить исполнителя.
- [task-model-audit-followup.md](operations/task-model-audit-followup.md) — три вердикта аудита применены: приоритет парой признаков, связь без дубля, провенанс только от сервера.
- [crm-pipeline-activity-timeline.md](operations/crm-pipeline-activity-timeline.md) — таймлайн активности, детект залипших лидов.
- [crm-deal-core.md](operations/crm-deal-core.md) — ядро сделок, оптимистическая блокировка.
- [deal-client-reassign.md](operations/deal-client-reassign.md) — передача сделки, включение гранта `client.reassign`.
- [lead-create-manual.md](operations/lead-create-manual.md) — ручное создание лида.
- [export-run.md](operations/export-run.md) — `GET /exports/:entity`, грант `export.run`.

### Marketplace и публичный контур

- [frontend-marketplace-vertical.md](operations/frontend-marketplace-vertical.md) — сквозная вертикаль публичного каталога.
- [marketplace-publishing-wizard.md](operations/marketplace-publishing-wizard.md) — мастер публикации листинга.
- [marketplace-map.md](operations/marketplace-map.md) — карта, публичные гео-точки, конфигурация стиля.
- [marketplace-figma-parity.md](operations/marketplace-figma-parity.md) — соответствие макету.
- [marketplace-functional-acceptance.md](operations/marketplace-functional-acceptance.md) — функциональная приёмка.
- [marketplace-public-api-gap-closure.md](operations/marketplace-public-api-gap-closure.md) — закрытие расхождений публичного API.
- [marketplace-operational-hardening-runbook.md](operations/marketplace-operational-hardening-runbook.md) — runbook эксплуатации.
- [public-listing-leads.md](operations/public-listing-leads.md) — раскрытие контакта и создание лида.
- [property-asset-media.md](operations/property-asset-media.md) — загрузка медиа и публичная галерея.
- [media-upload-grant.md](operations/media-upload-grant.md) — грант `media_asset.upload` проверялся, но не был выдан никому; плюс страж `permission-grants`.

### Брони

- [book-001-atomic-booking.md](operations/book-001-atomic-booking.md) — атомарная бронь юнита.
- [book-001-decision-memo-2026-08-31.md](operations/book-001-decision-memo-2026-08-31.md) — разбор принятых решений по BOOK-001.

### Админ-контур

- [admin-control-plane.md](operations/admin-control-plane.md) — панель: аккаунты, гранты, аудит.
- [admin-duplicate-candidates-review.md](operations/admin-duplicate-candidates-review.md) — очередь модерации дублей.
- [first-super-admin-bootstrap.md](operations/first-super-admin-bootstrap.md) — создание первого супер-админа.
- [team-user-atomicity.md](operations/team-user-atomicity.md) — создание сотрудника: позиция, гранты, назначение и профиль одной транзакцией.

### ЖК и шахматка

- [chessboard-export.md](operations/chessboard-export.md) — выгрузка шахматки в XLSX, грант `chessboard.export`.

### CI, сборка, эксплуатация

- [ci-quality-gate.md](operations/ci-quality-gate.md) — быстрый гейт: typecheck и lint.
- [ci-integration-gate.md](operations/ci-integration-gate.md) — интеграционный гейт на `mongodb-memory-server`.
- [runtime-release-gate.md](operations/runtime-release-gate.md) — воспроизводимый релизный гейт.
- [d07-runtime-e2e-gate.md](operations/d07-runtime-e2e-gate.md) — Playwright против живых HTTP-процессов.
- [nest11-fastify5-migration.md](operations/nest11-fastify5-migration.md) — миграция Nest 10→11 и Fastify 4→5, уязвимости 19 → 0.
- [openapi-route-coverage.md](operations/openapi-route-coverage.md) — страж соответствия контракта маршрутам: 132 маршрута против 81 пути в спеке, 49 пробелов измерены и закреплены.
- [marketplace-contract-gap-closed.md](operations/marketplace-contract-gap-closed.md) — marketplace-контур объектов описан зеркалом ERP-контура: пробелов 49 → 30.

### Асинхронный контур

- [outbox-dead-letter-noise.md](operations/outbox-dead-letter-noise.md) — семь типов событий уходили в `dead_letter` без единой попытки; обработчик подтверждаемых событий и страж покрытия.

### Сверки состояния

- [current-state-reconciliation-2026-08-31.md](operations/current-state-reconciliation-2026-08-31.md) — что реально реализовано в CRM на 31.08.
- [current-state-reconciliation-2026-09-02.md](operations/current-state-reconciliation-2026-09-02.md) — сверка на конец 02.09: стражей 4 → 7, пробелов контракта 49 → 30, задачи ERP без мока.
- [consolidation-2026-08-31.md](operations/consolidation-2026-08-31.md) — сведение веток в `codex/integration`.

## Прочее

- [architecture/screen-as-spec-boundary-audit-2026-09-02.md](architecture/screen-as-spec-boundary-audit-2026-09-02.md) — аудит правила «экран — спецификация»: где граница между контрактом чтения и схемой хранения, вердикты по двенадцати полям задачи, предсказания к 02.11.

- [discovery/figma-local-handoff.md](discovery/figma-local-handoff.md) — передача макетов.
- [codex/plans/](codex/plans/) — планы отдельных работ, писавшиеся до реализации.

## Правило пополнения

Завершённая работа документируется одним файлом в `operations/` и одной строкой
в разделе выше. Документ отвечает на три вопроса: что сделано, почему выбран
такой путь, что осталось открытым. Третий пункт обязателен: документ без раздела
об открытых вопросах обычно означает, что их не искали.

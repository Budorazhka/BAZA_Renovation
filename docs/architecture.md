# BAZA Platform — карта архитектуры и контекста

Статус: текущая рабочая модель на 2026-08-28.

Этот документ нужен как короткая карта владения кодом. Перед задачей достаточно
прочитать карту и целевой модуль, а не сканировать весь монорепозиторий.

## Текущая форма системы

Репозиторий — монорепо с модульным монолитом и отдельными deployable-приложениями:

```text
ERP web ───────┐
Marketplace web ─┼─ HTTP ─> apps/api ──> MongoDB
Admin web ──────┘              │
                               └─ transactional outbox ─> apps/worker ─> MongoDB/storage
```

- `apps/api` принимает HTTP-команды и запросы, применяет authentication,
  tenant/audience guards, транзакции и записывает outbox-события.
- `apps/worker` не поднимает HTTP-сервер. Он опрашивает outbox, запускает
  идемпотентные side-effect handlers и строит публикационные проекции.
- `apps/erp-web`, `apps/marketplace-web` и `apps/admin-web` — отдельные клиенты.
  Их UI-код не должен становиться источником доменных инвариантов.
- `packages/*` содержат общие контракты, схемы, репозитории, конфигурацию и
  инфраструктурные адаптеры. Они не должны импортировать код из `apps/*`.

Это не набор микросервисов: API и worker разделяют MongoDB и доменные пакеты,
но могут масштабироваться и деплоиться независимо.

## Владение кодом

| Контур | Основное владение | Правило изменения |
| --- | --- | --- |
| Identity/auth/sessions | `apps/api/src/modules/identity` | Контекст identity и audience; не добавлять tenant-логику в auth service без необходимости. |
| Organizations/ERP access | `apps/api/src/modules/organizations`, `authorization`, `tenant-scope` | ERP-доступ только через organization/tenant context и grants. |
| Developments | `apps/api/src/modules/developments`, `packages/development` | Иерархия ЖК/корпус/секция/этаж/юнит; не смешивать с marketplace listing. |
| CRM | `apps/api/src/modules/crm` | Lead/contact privacy и reveal-политики остаются внутри CRM. |
| Property assets/listings | `apps/api/src/modules/property-assets`, `packages/property-assets` | Scope, lifecycle, dedupe и actuality проверяются на сервере и в репозитории. |
| Publication | `apps/api/src/modules/publication`, `packages/publication` | Команда publish/unpublish и состояние публикации; side effects идут через outbox. |
| Admin/moderation | `apps/api/src/modules/admin` | Admin grant/policy checks и audit; не обходить доменные сервисы прямой записью. |
| Async side effects | `apps/worker/src/outbox`, `apps/worker/src/handlers` | Worker не вызывает API-контроллеры; принимает только версионируемые event payloads. |
| Shared contracts | `packages/contracts`, `packages/domain-events`, `packages/api-client` | Изменение контракта требует обновления producer, consumer и тестов. |

## Auth и ownership-контексты

`Identity` — это учётная запись аутентификации, а не автоматически ERP-владелец.
Для объектов с владельцем используется discriminated union `OwnerScope`:

```ts
{ type: 'organization'; organizationId: ObjectId }
{ type: 'marketplace_account'; identityId: ObjectId }
```

Новые endpoint'ы должны получать scope из серверного контекста сессии. Нельзя
принимать `organizationId` или `identityId` из body/query как источник прав.
ERP- и marketplace-audience должны оставаться разными guard-контекстами; наличие
одной identity в двух контурах не объединяет их данные автоматически.

Публичная publication projection — отдельная read-модель. В неё попадает только
явно разрешённый whitelist полей; внутренние scope-поля и приватные контакты не
должны протекать через mapper.

## Правила зависимостей

1. Контроллер занимается transport/DTO/status code. Доменные проверки находятся
   в service/repository, а не во frontend.
2. Сервис модуля не читает чужие MongoDB-коллекции напрямую. Для общего сценария
   используется публичный сервис или пакетный repository API.
3. Транзакционные команды, меняющие canonical state и outbox, используют один
   `ClientSession`.
4. Worker-обработчики идемпотентны: повтор события безопасен, устаревшая версия
   не затирает новую projection.
5. Между bounded contexts сначала добавляется typed contract/event. Новый
   синхронный HTTP-вызов между локальными приложениями не вводится без отдельного
   решения о deployment boundary.

## Как экономить контекст при работе

### Задача в API

Читать в таком порядке: `apps/api/src/app.module.ts`, целевой module/controller,
целевой service и только используемые repository/schema из соответствующего
`packages/*`. Для auth/scope дополнительно читать соответствующий middleware и
guard. Полный `apps/api/src` обычно не нужен.

### Задача в worker

Читать `apps/worker/src/main.worker.ts`, outbox poller, registry и один handler,
который обрабатывает нужный `eventType`. Для схемы события достаточно
`packages/domain-events` и producer в API.

### Проверка

```text
API unit:        pnpm --filter @baza/api test
API integration: pnpm --filter @baza/api test:integration -- --runInBand
Worker unit:     pnpm --filter @baza/worker test
Typecheck:       pnpm --filter <workspace-name> typecheck
```

API integration suite использует `mongodb-memory-server` с replica set и не
требует Docker. Worker runtime E2E с настоящим процессом/инфраструктурой — это
отдельная задача и не заменяется вызовом handler из API-теста.

## Когда выделять отдельный сервис или репозиторий

Пока сохраняется общая MongoDB-транзакция и одна команда разработки, остаёмся в
монорепо. Выделение оправдано только при наличии хотя бы одного устойчивого
сигнала:

- независимое масштабирование или тяжёлый runtime (например, media processing);
- отдельный владелец данных и чёткий контракт между командами;
- независимый release cadence/доступы, которые нельзя безопасно разделить;
- измеримая проблема надёжности API из-за нагрузки worker.

Само желание уменьшить AI-контекст не является причиной для микросервисов.
Для этого достаточно работать по app/module ownership и поддерживать эту карту.

## Чек-лист изменения

- [ ] Определён один владелец изменения из таблицы выше.
- [ ] Не добавлен импорт из `apps/*` в `packages/*`.
- [ ] Проверены оба релевантных auth/scope-контекста.
- [ ] Для события обновлены producer, consumer и idempotency/version checks.
- [ ] Для публичного ответа проверен whitelist, включая приватные поля.
- [ ] Запущены минимальные targeted tests и соответствующий typecheck.

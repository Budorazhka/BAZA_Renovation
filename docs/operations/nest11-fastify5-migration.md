# Миграция Nest 10 → 11 и Fastify 4 → 5 (закрытие уязвимостей)

Статус: implemented (01.09.2026)

## Зачем

`pnpm audit --prod` показывал **19 уязвимостей** в продовых зависимостях: 1 critical, 9 high,
8 moderate, 1 low. Ключевое: **патч-версиями это не чинилось**. Проект стоял на Nest 10.4.22 /
Fastify 4.28.1, а исправления жили только в Nest 11.1.18+/11.1.24+ и Fastify 5.7.2+/5.8.3+ — то есть
единственным лечением была мажорная миграция фреймворка.

Основная масса critical/high — класс «middleware bypass» (`@fastify/middie`,
`@nestjs/platform-fastify`): обход middleware подделкой пути, URL-кодированием, trailing slash,
HEAD-запросом. Для этого приложения это особенно неприятный класс, потому что вся аутентификация и
tenant-контекст живут в `onRequest`-хуках.

Предшествующий коммит (`skipMiddie`) уже убрал middie из пайплайна и снял этот класс с поверхности
атаки без миграции. Эта миграция закрывает остаток — то, что реально достижимо: обход валидации тела
через таб в `Content-Type` (high), подделку `request.protocol`/`host` через `X-Forwarded` (moderate,
актуально потому что `trustProxy` включается из env), DoS на неограниченной аллокации (low) и
экранирование вывода в `@nestjs/core` (moderate).

**Результат: `pnpm audit --prod` → `No known vulnerabilities found` (19 → 0).**

## Что изменено

Версии подняты во всех восьми `package.json` (`apps/api`, `apps/worker`, пять `packages/*`):

| Пакет | Было | Стало |
|---|---|---|
| `@nestjs/common` / `core` / `platform-fastify` / `testing` | ^10.4.0 | ^11.2.3 |
| `@nestjs/cli` | ^10.4.0 | ^11.0.24 |
| `@nestjs/config` | ^3.3.0 | ^4.0.4 |
| `@nestjs/mongoose` | ^10.1.0 | ^11.0.4 |
| `fastify` | ^4.28.1 | ^5.12.1 |
| `@fastify/helmet` | ^11.1.1 | ^13.1.1 |
| `@fastify/cookie` | ^9.4.0 | ^10.0.1 (не 11, см. ниже) |
| `@nestjs/throttler` | ^6.5.0 | **удалён** |

Взята линия Nest **11**, а не вышедшая 12: адвизори закрываются на 11.1.24+, а меньший скачок при той
же цели безопаснее.

`@nestjs/throttler` удалён как мёртвая зависимость — в исходниках он не импортируется нигде, только
упоминается в комментариях как «заменён собственным Redis-рейт-лимитером».

### Две ловушки, найденные по пути

**1. Две копии fastify в дереве.** `@nestjs/platform-fastify@11.2.3` пиннит **точную** версию
`fastify: "5.11.3"`, которая соседствовала с нашей прямой `^5.12.1`. Разные копии — это разные типы
`FastifyRequest`/`FastifyInstance`, и `tsc` отказывался передавать `request` из Fastify-хука в наш же
middleware («missing properties: correlationId, cookies, signCookie…»). Обе версии закрывают
адвизори, проблема была только в дубле — схлопнуто оверрайдом `fastify: ^5.12.1` в
`pnpm-workspace.yaml`.

**2. `@fastify/cookie@11` несовместим с Jest.** Пакет `cookie` стал ESM-only, поэтому
`@fastify/cookie@11` грузит его динамическим импортом (`await import('cookie')`). Jest в CJS-режиме
падает на этом с `TypeError: A dynamic import callback was invoked without --experimental-vm-modules`
— рушились ВСЕ интеграционные тесты, регистрирующие куки. В проде проблемы нет (Node умеет
динамический импорт), ломается только тестовая среда.

Взята линия **`@fastify/cookie@10.0.1`**: это первая линия под Fastify 5 (`fastify-plugin@^5`), и она
ESM-`cookie` не тянет вовсе (зависимости — только `cookie-signature`). Альтернатива —
`NODE_OPTIONS=--experimental-vm-modules` в тестовом скрипте — отвергнута: на Windows такая передача
переменной через pnpm-скрипт не работает без дополнительной зависимости (`cross-env`), то есть
сломала бы локальный прогон у владельца ради обхода проблемы, которой в проде нет.

### Оверрайды в `pnpm-workspace.yaml`

pnpm 11 больше не читает поле `pnpm` из `package.json` — все оверрайды заданы в
`pnpm-workspace.yaml`:

```yaml
overrides:
  lodash@<4.18.1: ^4.18.1       # prototype pollution + code injection, из @nestjs/config
  file-type@<21.3.2: ^22.0.2    # ASF-цикл и ZIP-бомба, из @nestjs/common
  fastify: ^5.12.1              # схлопывание дубля, см. выше
  uuid@<11.1.1: ^11.1.1         # buffer bounds check, из exceljs
```

## Verification

Регрессий не обнаружено.

- **Typecheck**: 24/24 пакета монорепозитория.
- **Build**: 14/14 задач.
- **Unit**: 914 тестов зелёные — API 736, worker 73, пакеты 105 (development 9, domain-events 7,
  media-storage 22, property-assets 49, publication 18).
- **Integration**: прогнаны все 33 файла по одному (вместе в этом окружении они виснут на
  teardown между файлами — у каждого свой `MongoMemoryReplSet`). **25 файлов полностью зелёные**,
  включая весь HTTP-путь: `auth-session` (куки), `skip-middie-boot`, `admin-http`, `crm-deals`,
  `bookings`, `chessboard-export`.
- **Оставшиеся 11 файлов с падениями сверены с состоянием ДО миграции** (коммит `e4cb702`,
  с переустановкой зависимостей) — цифры совпали **тест в тест** во всех одиннадцати. Это
  предсуществующие падения, не регрессия миграции.

### Предсуществующая проблема: тесты требуют живого Redis

Одиннадцать интеграционных файлов (~85 тестов) не проходят локально и до, и после миграции с
`MaxRetriesPerRequestError` → 503: `RedisRateLimitGuard` намеренно «падает закрыто» на
privacy-sensitive эндпоинтах, а локального Redis нет. Список: `dedupe-actuality`,
`development-reveal-lead` (1 из 7), `lead-stage-change-race`, `listing-reveal-lead` (1 из 11),
`marketplace-property-assets` (24 из 25), `mkt-002-listing-publication`, `organization-onboarding`,
`property-asset-media`, `property-assets-listings`, `publish-idempotency-race`,
`publish-to-published-projection`.

Это отдельная задача (поднимать Redis в тестовом окружении либо мокать guard), не входит в объём
этой миграции — но означает, что зелёный локальный прогон интеграционных тестов сейчас недостижим
без внешней инфраструктуры.

## Что НЕ делалось

- **Nest 12** — вышел, но адвизори закрываются на 11.x; лишний мажорный скачок без цели.
- **Правки прикладного кода** — не потребовались вообще: удалённые в Fastify 5 API
  (`request.routerPath`, `reply.getResponseTime`, `request.req`) в проекте не использовались,
  `ConfigModule.forRoot({isGlobal:true})` и `reply.setCookie/clearCookie` в новых мажорах не
  изменились. Единственная правка вне зависимостей — этот документ.

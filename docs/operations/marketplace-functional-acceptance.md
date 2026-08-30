# Marketplace Functional Hardening & Acceptance

Документ ведётся по проходам. Каждый раздел ниже — отдельная сессия работы, самая новая — сверху. Более ранние разделы не переписаны при последующих проходах — история сохраняется. Между «Проход 1» и «Проход 2» была отдельная сессия по закрытию API-контрактных разрывов (resumable media retry, сортировка/count/session-check gap analysis) — задокументирована отдельно в `docs/operations/marketplace-public-api-gap-closure.md`, не дублируется здесь.

---

## Проход 2 (2026-08-30): Production acceptance gate — backend/API/runtime/integration

**Ветка:** `codex/marketplace-production-gate`
**База:** `codex/marketplace-integration-gate` @ `4a1f493` (локальный HEAD этой ветки на момент старта — три коммита впереди origin: `8e4ba7a` Figma-адаптация, `984d51d` функциональный/security-hardening проход = «Проход 1» ниже, `4a1f493` resumable media retry = промежуточная сессия, см. `marketplace-public-api-gap-closure.md`).
**Объём:** только backend/API/runtime/integration/тесты/документация. Визуальный слой (Figma-адаптация `8e4ba7a`, `apps/marketplace-web/src/styles/**`, hero/карточки/layout/JSX-редизайн) не тронут ни строкой.

### 1. Методология

Перед любой правкой — параллельный аудит четырьмя независимыми read-only исследовательскими агентами по четырём областям (публичный каталог/detail, media lifecycle/publication idempotency, reveal-contact/leads + auth/sessions, карта/bbox), каждый с инструкцией цитировать точный file:line и явно указывать, что подтверждено тестом, а что нет. Каждая находка агентов перепроверена лично чтением реального кода на момент фикса (не принята на веру) перед решением что чинить.

### 2. Реально закрытые дефекты

| # | Область | Файл(ы) | Дефект | Исправление | Тест |
|---|---|---|---|---|---|
| 1 | **Non-disclosure detail** | `apps/api/src/modules/publication/public.controller.ts` | `GET /public/developments/:slug` не проверял `sourceType` — в отличие от `PublicListingsController`, слаг листинга, запрошенный через developments-эндпоинт, не давал 404, а рендерился как ЖК с пустыми полями (`name`/`classType` undefined) через `toPublicCard`. | Добавлена проверка `publication.sourceType !== 'development'` перед `toPublicCard`, зеркалирует уже существующую проверку в `PublicListingsController.getPublicListing`. | Unit: `public.controller.spec.ts` — новый тест на wrong-sourceType 404. |
| 2 | **Non-disclosure whitelist** | `apps/api/src/modules/publication/public.controller.ts` | `toPublicCard` передавал `publication.seo` целиком без whitelist — в отличие от `toPublicListingCard`, у которой уже есть `toPublicSeo()` re-pick как второй, независимый рубеж защиты. Живой утечки не было (worker всегда кладёт чистый `seo`), но гарантия «даже если worker сломается» не держалась для этого поля. | Добавлена `toPublicSeo()` в `public.controller.ts`, зеркалирует одноимённую функцию в `public-listings.controller.ts`. | Unit: fixture теста загрязнена `seo.internalNotes/organizationId/randomArbitraryField`, assertion проверяет их отсутствие в ответе. |
| 3 | **Non-disclosure list** | `packages/publication/src/repository/marketplace-publication.repository.ts` | `listPublished` (используется только `GET /public/developments`) фильтровал ТОЛЬКО по `status:'published'`, без `sourceType`. `PublicationSourceType` включает `'unit'` помимо `'development'`/`'listing'` — сегодня безвредно (worker помечает `unit`-события `build_failed`, mapper не реализован), но структурная брешь: как только появится unit-mapper, unit-публикации начали бы незаметно попадать в список ЖК. | Добавлен `sourceType:'development'` в фильтр `listPublished`, зеркалирует уже существующий паттерн `listPublishedByFilter` (listings-сторона). | Unit: `marketplace-publication.repository.spec.ts` — обновлён assertion на точный фильтр-объект. Integration: `public-developments-list.integration-spec.ts` (16 тестов) остались зелёными без изменений — подтверждают отсутствие регрессии на реальных seed-фикстурах. |
| 4 | **Data integrity / race condition** | `packages/property-assets/src/repository/property-asset.repository.ts`, `apps/api/src/modules/property-assets/{property-assets,marketplace-property-assets}.service.ts` | `PropertyAsset.media[]` мутировался паттерном "прочитать весь массив → изменить в памяти → `updateOne({_id}, {$set:{media}})` без версии" — идентично в 8 местах (confirm/delete/update/reorder × ERP + marketplace). Два подлинно конкурентных вызова на ОДНОМ asset (например, confirm двух разных фото одновременно, или confirm параллельно с delete) читали один и тот же стартовый массив, и чей `$set` коммитился последним — тихо перезаписывал изменение соперника без ошибки ни одной из сторон. | `PropertyAssetDocument.version` (существовавшее, но нигде не используемое поле) теперь реальный CAS: новый `PropertyAssetRepository.mutateMedia(id, mutator)` — читает текущий `media[]` + `version`, применяет mutator, пишет `updateOne({_id,version},{$set:{media},$inc:{version:1}})`, при проигранной гонке (`modifiedCount:0`) повторяет цикл заново (до 5 попыток) против уже актуального состояния. Все 8 call site переведены на этот метод; чистая функция-трансформация массива в каждом осталась неизменной — изменился только механизм записи. | Integration (НОВЫЕ тесты, реальный HTTP + реальный `Promise.all` + реальная MongoDB, не мок): `property-asset-media.integration-spec.ts` — «два конкурентных confirm разных фото на одном asset оба выживают» и «конкурентный confirm+delete на одном asset оба применяются» — оба теста явно проверяют, что оба конкурентных изменения реально сохранились (до фикса один из двух терялся бы). |
| 5 | **Auth consistency (401 vs 403)** | `apps/api/src/shared/tenant/{tenant.guard,tenant-context.middleware}.ts`, `apps/api/src/shared/marketplace-account/{marketplace-account.guard,marketplace-account-context.middleware}.ts` | `AdminGuard` уже различает «нет cookie вообще» (401 `AUTH_NO_SESSION`) от «cookie есть, не резолвится» (403 `FORBIDDEN`, non-disclosure) — задокументированное решение для честного `POST /auth/logout → следующий запрос 401`. `TenantGuard`/`MarketplaceAccountGuard` этого различия не имели — всегда бросали generic 403 независимо от наличия cookie, асимметрично относительно admin-аудиенса. | Тот же паттерн (`hadSessionCookie*`-флаг, устанавливаемый middleware независимо от резолва сессии) применён к `TenantContextMiddleware`/`MarketplaceAccountContextMiddleware` и соответствующим guard'ам. Поля названы раздельно (`hadSessionCookieErp`, `hadSessionCookieMarketplace`) — не переиспользуют admin-овское имя поля, чтобы исключить случайное кросс-аудиенс пересечение на одном request-объекте. | Unit: новый `tenant.guard.spec.ts` (не существовал вообще), переписанный `marketplace-account.guard.spec.ts` (был неполным — асимметрия не была протестирована ни в одну сторону), обновлённый `marketplace-account-context.middleware.spec.ts` (добавлен мок `getRawTokenFromRequest`, иначе падал с TypeError — плюс новый тест на сам факт установки флага). Integration: `marketplace-property-assets.integration-spec.ts` — переименован и обновлён тест «запрос без marketplace-сессии» (был 403 для обоих случаев "ERP-сессия или гость", теперь корректно разделён: гость без cookie → 401, ERP-cookie на marketplace-endpoint → отдельный уже существующий тест на 403, не тронут). |
| 6 | **Тестовое покрытие (не код-дефект)** | Новый файл `apps/api/test/integration/development-reveal-lead.integration-spec.ts` | `GET /public/developments/:slug/reveal-contact` (development-сторона CRM lead flow) не имел НИ ОДНОГО реального HTTP-интеграционного теста — только unit-моки в `crm.service.spec.ts`. Листинговая сторона (`listing-reveal-lead.integration-spec.ts`) уже имела полный набор (rate-limit, dedup, 404-варианты, UTM/referrer). | Новый файл, зеркалирует структуру `listing-reveal-lead.integration-spec.ts` 1:1 для development-flow: успешный reveal (Contact/Lead/LeadEvent/audit + UTM/referrer в реальной MongoDB), повтор с тем же телефоном (dedup Contact, новый Lead), 404 (неизвестный slug / чужой sourceType / неопубликован), 400 (без телефона), 429 (rate-limit, тот же лимит 5/60с). | 7/7 новых тестов проходят реальным HTTP через `app.inject()` + `MongoMemoryReplSet`. |
| 7 | **Устаревший комментарий (не код-дефект)** | `apps/api/src/modules/identity/session.service.ts` | Комментарий утверждал, что фикс NestJS+Fastify middleware-бага (`TenantContextMiddleware`/`AdminContextMiddleware` не долетают до Guards) «найден, НЕ применён, приостановлен». Проверено по текущему `main.api.ts` — фикс РЕАЛЬНО применён (все четыре middleware зарегистрированы как нативные Fastify `onRequest` hooks). Устаревший комментарий мог ввести в заблуждение будущего разработчика/агента, заставив «повторно применять» уже сделанный фикс. | Комментарий обновлён на актуальное состояние с явной пометкой «ОБНОВЛЕНО (проверено по текущему коду 2026-08-30)». | Не применимо (документация, не поведение). |

### 3. Проверено и подтверждено корректным без изменений (по каждому направлению ТЗ)

Список ниже — то, что четыре read-only агента проверили по реальному коду и существующим тестам и НЕ нашли дефекта. Не переисследовано заново вручную построчно (агентские находки уже цитируют файл/строку), но каждый пункт лично перепроверен минимум чтением исходного файла в критичных местах перед принятием решения не чинить.

**Публичный каталог/detail:**
- Курсор-пагинация: `$gt` (строго исключающий) + стабильная сортировка `_id:1` — математически исключает дубли/пропуски на границе страницы. Проверено N+1-boundary тестом для developments (уже существовал); для listings такого выделенного теста нет, но механизм идентичен (тот же repository-метод).
- `city`/`dealType`/`propertyType`/`commercialSubtype`/`bbox` фильтры реально применяются на уровне Mongo-запроса (внутри объекта `filter`, до `.limit()`), не в памяти после фетча — подтверждено чтением `listPublishedByFilter`.
- Список и detail для одного и того же ресурса используют ОДНУ функцию маппинга (`toPublicCard`/`toPublicListingCard`) — структурно исключает расхождение shape между списком и деталкой.

**Media lifecycle / publication idempotency:**
- `MediaAsset.status` переход (confirm) защищён CAS (`status:'pending'` фильтр) — конкурентный повторный confirm НЕ создаёт вторую audit/outbox запись. Подтверждено существующим integration-тестом.
- Failed/hung media (`pending`/`rejected`/недостроенный derivative-вариант) НЕ попадает в публичную галерею — `PublicationRequestedHandler`'s `buildPublicMediaList` фильтрует по `status==='verified'` и наличию варианта. Подтверждено unit-тестом.
- Stale worker result / cross-session protection: `markPublished` CAS на `{status:'publication_pending', version:expectedVersion}` — устаревшее/повторное событие корректно отклоняется (`modifiedCount:0`, не throw), не откатывает `published`/`unpublished` состояние обратно. Подтверждено двумя integration-тестами (включая буквальный повторный вызов `handler.handle()` на том же событии).
- Publish/override под настоящей конкуренцией (`Promise.all`, не последовательный retry): подтверждено интеграционными тестами на ВСЕХ трёх publish-путях (ERP-development, ERP-listing, marketplace-listing) — задокументированный `MKT-002-IDEMP-RACE-001` фикс (`IdempotencyService.awaitReplay`) реально закрывает гонку check-then-write, не только theoretically.
- Ошибки API идут через единый `AppException`/`ErrorCode` фильтр — ни один raw Mongo/library error/stack trace не долетает до клиента (проверено конструкцией `AppExceptionFilter`, unhandled-исключения всегда превращаются в generic `INTERNAL_ERROR`).

**Reveal-contact / leads:**
- Rate limit — 5/60с, идентично на обоих контроллерах (developments/listings), реально применяется через `@UseGuards(ThrottlerGuard)` на каждом контроллере (не глобально).
- Contact dedup — по `{organizationId, phone}`, не по одному `phone` — подтверждено индексом схемы и unit-тестом репозитория; кросс-организационная изоляция структурно гарантирована фильтром (не протестирована явным сценарием «тот же телефон, две организации», но не является дефектом).
- Lead/LeadEvent/audit создаются атомарно в одной Mongo-транзакции (`runInTransaction`) — сбой на любом шаге откатывает всё целиком (доказано тем же примитивом на соседнем сценарии `assignLead`).
- `publicationId`/`route`/`utm`/`referrer` — все четыре реально сохраняются; `referrer` берётся из настоящего HTTP `Referer`-заголовка (`req.headers.referer`), не из клиентского body-поля (которого в DTO физически нет).
- Единый 404 без утечки — подтверждено для всех проверенных случаев (неизвестный slug, неопубликован, orphaned Listing/PropertyAsset, `publisherScope!==organization`).
- Ответ reveal-contact — строго `{phone, whatsapp?, telegram?, leadId}`, без spread внутренних полей.

**Auth / сессии:**
- Login → cookie → защищённый запрос работает; `getActiveSessionFromRequest` атомарно проверяет существование+audience+non-revoked+non-expired одним Mongo-запросом.
- Logout реально отзывает серверную сессию (`revokedAt` в БД), не только чистит cookie — подтверждено тестом с намеренно сохранённым старым токеном после logout.
- Истёкшая/отозванная/мусорная cookie — все три схлопываются в один и тот же `null` из `getActiveSessionFromRequest`, единообразно превращаются в 403 (или 401 для «нет cookie вообще», после фикса #5 — одинаково для всех трёх аудиенсов). Ни один путь не бросает unhandled exception (хеширование и Mongo-lookup — тотальные функции над любой строкой).
- Кросс-аудиенс изоляция logout: `revokeByTokenHash` фильтрует ТОЛЬКО по уникальному `tokenHash` — структурно не может задеть сессию другого audience (не `identityId`-scoped).
- Publication-status polling: авторизация проверяется свежим Mongo-запросом с `identityId` из ТЕКУЩЕЙ сессии на каждый вызов — structurally невозможно, чтобы устаревший ответ применился к другой сессии (нет кеша/session-scoped state).

**Карта / bbox:**
- bbox проходит весь путь (map viewport → App.tsx state → URL → API client query-string → DTO validation → Mongo `$geoWithin`/`$box`) с идентичным порядком полей `minLng,minLat,maxLng,maxLat` на каждом хопе — сверено байт-в-байт на обоих концах.
- Отсутствие `VITE_MAP_STYLE_URL` не ломает страницу — честное «не подключено» состояние, не крашится.
- Карта не выдаёт внутренние координаты/приватные данные — тот же публичный whitelist-маппер, что и список/detail; маркер `aria-label` показывает только уже публичные `name`/`address`.
- Список и карта используют ОДИН и тот же `state.items` — структурно не могут разойтись по данным.
- Нет захардкоженных секретов/URL, нет фейкового OSM fallback.

### 4. Backend-gap'ы, сознательно НЕ реализованные (техническое заключение)

Ни один из пунктов ниже не был реализован фиктивно/частично. Каждый — реальный компромисс между текущей моделью и полноценным решением.

1. **Rate limiter хранится только in-memory (`@nestjs/throttler`'s default storage), не в Redis.** При горизонтальном масштабировании (>1 инстанс API) каждый инстанс держит свой независимый счётчик — эффективный лимит становится `5×N` запросов вместо 5, для гостевого/неаутентифицированного endpoint'а (reveal-contact). Почему не исправлено: добавление `@nestjs/throttler-storage-redis` — новая зависимость + реальная Redis-инфраструктура, которых явно не было в текущем окружении сессии (Docker daemon недоступен) и которую я не уполномочен вводить в рамках функционального фикса без отдельного архитектурного решения. Индексы/схема: не требуются (это конфигурация хранилища throttler'а, не модель данных). Риск изменения: подключение нового внешнего сервиса как SPOF для rate-limiting — требует отдельного deployment-решения (managed Redis vs self-hosted), не тривиальная точечная правка. Следующий этап: подключить Redis-backed storage при первом реальном горизонтальном развёртывании API за пределы одного инстанса.
2. **Orphaned pending `MediaAsset` записи (фаза 1 upload-intent без последующего confirm) накапливаются бессрочно — нет cleanup-механизма.** Подтверждено чтением: единственные операции записи над `MediaAsset` — `markVerified`/`markRejected`/`appendVariant`, ни одна не является TTL/GC job. Почему не исправлено: в кодовой базе НЕТ ни одного cron/scheduler-пакета вообще (задокументировано отдельным существующим комментарием в `actuality.service.ts` про `expireOverdueListings` — тот же класс разрыва). Индексы/схема: TTL-индекс на Mongo (`expireAfterSeconds`) технически решил бы это без scheduler-пакета — но это новое поведение схемы (когда именно считать intent «протухшим»?), требующее отдельного продуктового решения о временном окне, не тривиальный побочный фикс внутри этой задачи. Риск: без явного окна TTL-индекс мог бы удалить legitimate in-progress upload. Следующий этап: добавить `expireAfterSeconds` TTL-индекс на `MediaAssetDocument.createdAt` для `status:'pending'` после того, как продукт определит разумное окно (например, 24ч).
3. **`overrideDuplicate` (DEDUPE-001) не обёрнут в `Idempotency-Key`, в отличие от publish.** CAS (`status:'detected'` фильтр) уже гарантирует, что повторное применение override НЕ произойдёт дважды (второй вызов честно получает 409, не тихо переприменяет) — это НЕ баг целостности данных. Но клиентский UX не идеален: настоящий сетевой retry после потерянного ответа получит 409 на успешно выполнившуюся первую попытку, вместо replay сохранённого успешного ответа. Почему не исправлено: добавление `Idempotency-Key` на этот endpoint — реальное (хоть и небольшое) изменение контракта (новый обязательный/опциональный заголовок), для которого нет подтверждённого решения владельца добавлять именно сейчас — по инструкции задачи «запрещено изобретать поля... только ради отчёта» решено задокументировать, не реализовывать. Следующий этап: если продукт подтвердит частые сетевые сбои именно на override-запросах, добавить тот же `IdempotencyService.checkReplay`/`record` паттерн, что уже используется для publish — механизм уже существует и проверен, добавление — низкий риск, но требует явного решения добавить header в контракт.

### 5. Ограничения окружения (Docker/Redis/MinIO), реально повлиявшие

- **Docker daemon недоступен локально** (`docker info` не подключается к `dockerDesktopLinuxEngine`) — как и в предыдущих проходах. **НЕ помешало** ни одному из требований этого прохода: `apps/api`'s `pnpm test:integration` поднимает полноценный `MongoMemoryReplSet` (реальный single-node MongoDB replica set) через `mongodb-memory-server`, полностью in-process, без Docker. Все новые/изменённые тесты в этом проходе — реальные HTTP-интеграционные тесты через `app.inject()` (Fastify) против этого реального MongoDB, не моки репозитория.
- **MinIO/S3 не запущен реально** — `MediaStorageService` в integration-тестах явно замокан (`overrideProvider`) на всех файлах, где используется media-вертикаль (`property-asset-media.integration-spec.ts` и другие) — так было и до этого прохода, задокументированный паттерн, не новое ограничение. Реальная presigned-URL/бинарная PUT логика верифицирована только на уровне unit-тестов сервиса, не сквозным сетевым прогоном к реальному S3-совместимому хранилищу.
- **Redis не запущен** — напрямую относится к находке #1 в разделе 4 выше (in-memory throttler storage). Не было возможности продемонстрировать распределённый rate-limit ни в каком виде без реальной Redis-инфраструктуры.

### 6. Команды верификации и результаты (из корня монорепозитория)

```bash
pnpm install --frozen-lockfile   # чисто, без drift lockfile
pnpm typecheck                    # turbo run typecheck — 23/23 задачи
pnpm build                        # turbo run build — 14/14 задач
pnpm test                         # turbo run test — 21/23 задачи (см. примечание ниже)
pnpm test:integration             # turbo run test:integration — 10/10 задач, apps/api: 21/21 файлов, 240/240 тестов
git diff --check                  # чисто
```

**Примечание к `pnpm test`:** `@baza/api-client:test` падает с сообщением «schema.ts устарел относительно OpenAPI-спеки» — это **предсуществующая, не связанная с этим проходом проблема** обнаружена ДО начала любых правок (baseline-прогон в начале сессии). Причина установлена точно: `packages/api-client/scripts/check-stale.mjs` делает строгое байт-в-байт сравнение (`committed !== fresh`) регенерированной схемы с закоммиченной — генератор (`openapi-typescript` CLI) всегда пишет LF-переводы строк, а Git на этой Windows-машине (`core.autocrlf=true`, без `.gitattributes`-переопределения для `.ts`) конвертирует закоммиченный файл в CRLF при checkout. Проверено напрямую: посимвольное сравнение показывает первое расхождение на `\r\n` vs `\n`, семантическое содержимое идентично. Это ударило бы по любому контрибьютору, впервые клонирующему репозиторий на Windows с дефолтными настройками Git — не специфично для этой сессии и не результат каких-либо изменений в этом проходе (OpenAPI-спека и `schema.ts` не тронуты ни строкой). Не исправлено намеренно — правка `.gitattributes`/`core.autocrlf` — это изменение репозиторной line-ending политики за пределами полномочий этой задачи (затронуло бы весь монорепозиторий, не только marketplace-контур), и явно не было запрошено.

**apps/api изолированно (без turbo-кэша, для полной уверенности):**
- `pnpm test` (Jest unit) — **55/55 файлов, 497/497 тестов**.
- `pnpm test:integration` — **21/21 файл, 240/240 тестов**, включая 2 новых файла/расширения (`development-reveal-lead.integration-spec.ts` — новый, 7 тестов; `property-asset-media.integration-spec.ts` — расширен 2 новыми race-тестами).
- Повторный прогон гонко-чувствительных тестов (`property-asset-media`, `marketplace-property-assets`, `publish-idempotency-race`, `development-reveal-lead`) — стабильно зелёный на двух независимых запусках подряд, без флаки.

**apps/marketplace-web** — не изменён в этом проходе, прогнан для подтверждения отсутствия побочного эффекта: `pnpm test` — 20/20 файлов, 89/89 тестов, без изменений от baseline.

### 7. Изменённые/новые файлы (17 изменённых + 2 новых)

```
apps/api/src/modules/identity/session.service.ts
apps/api/src/modules/property-assets/marketplace-property-assets.service.ts
apps/api/src/modules/property-assets/property-assets.service.spec.ts
apps/api/src/modules/property-assets/property-assets.service.ts
apps/api/src/modules/publication/public.controller.spec.ts
apps/api/src/modules/publication/public.controller.ts
apps/api/src/shared/marketplace-account/marketplace-account-context.middleware.spec.ts
apps/api/src/shared/marketplace-account/marketplace-account-context.middleware.ts
apps/api/src/shared/marketplace-account/marketplace-account.guard.spec.ts
apps/api/src/shared/marketplace-account/marketplace-account.guard.ts
apps/api/src/shared/tenant/tenant-context.middleware.ts
apps/api/src/shared/tenant/tenant.guard.ts
apps/api/src/shared/tenant/tenant.guard.spec.ts                         [новый]
apps/api/test/integration/development-reveal-lead.integration-spec.ts   [новый]
apps/api/test/integration/marketplace-property-assets.integration-spec.ts
apps/api/test/integration/property-asset-media.integration-spec.ts
packages/property-assets/src/repository/property-asset.repository.ts
packages/publication/src/repository/marketplace-publication.repository.spec.ts
packages/publication/src/repository/marketplace-publication.repository.ts
docs/operations/frontend-marketplace-vertical.md
docs/operations/marketplace-functional-acceptance.md (этот файл)
docs/operations/marketplace-publishing-wizard.md
docs/operations/marketplace-public-api-gap-closure.md
```

### 8. Подтверждение визуального слоя

Visual/Figma-слой (`8e4ba7a`) не тронут ни строкой. Файлы `apps/marketplace-web/src/styles/**`, `apps/marketplace-web/src/App.tsx` (hero-секция), любой JSX marketplace-web компонентов — не входят в diff этого прохода (см. раздел 7 — ни один файл под `apps/marketplace-web` не изменён). Figma/Stitch не подключались и не запрашивались. Единственный marketplace-web build/test прогон в этом проходе — верификационный (подтвердить отсутствие побочного эффекта), не изменение.

---

## Проход 1 (No-Figma Pass, 2026-08-30)

**Ветка:** `codex/marketplace-functional-hardening`
**База:** `origin/codex/marketplace-integration-gate` @ `6c619b5`
**Объём:** только функциональное упрочнение `apps/marketplace-web` и его тестов. Визуальная структура, палитра, шрифты, карточки, hero-блоки и layout не изменялись — эта работа выполнена **без доступа к Figma** и намеренно не подменяет визуальный parity-проход, который делает Codex отдельно.

### 1. Что было изучено перед началом работы

- `BAZA_MASTER_PLAN.md`, `CLAUDE_HANDOFF_TZ.md` — архитектурный контекст, включая явный gate «marketplace UI делается только по Figma» (раздел 5.1) и уже задокументированный инфраструктурный разрыв D-07 (Docker daemon недоступен локально).
- `docs/operations/frontend-marketplace-vertical.md`, `docs/operations/marketplace-publishing-wizard.md`, `docs/operations/public-listing-leads.md` — контракты состояния, URL-синхронизации, безопасности и API.
- Весь код `apps/marketplace-web/src/**` и существующие тесты `apps/marketplace-web/tests/**` (20 файлов, 78 тестов на момент старта).
- Соответствующие серверные модули (`apps/api/src/modules/crm/**`, `identity/auth.controller.ts`) — для проверки, что фронтенд-контракт и реальный backend-контракт совпадают буквально, а не только по документации.

### 2. Проверенные маршруты

| Маршрут | Проверено |
|---|---|
| `/` (каталог, `tab=developments` / `tab=listings`) | Да — фильтры, URL-синхронизация, cursor-пагинация, list/map переключение |
| `/developments/:slug` | Да — состояния loading/ready/not-found/error, SEO/JSON-LD |
| `/listings/:slug` | Да — состояния, медиагалерея, reveal-contact форма, SEO/JSON-LD |
| `/publish` | Да — все 8 шагов визарда (`auth → location → characteristics → deal → media → review → publishing → published`) |

### 3. Проверенные сценарии (по требованиям ТЗ)

**Каталог:**
- Синхронизация `tab`, `city`, `dealType`, `propertyType`, `commercialSubtype`, `view`, `bbox` с URL через `useSearchParams` — подтверждено чтением кода и существующими тестами `urlFilterSync.test.tsx`.
- Cursor-пагинация: `requestIdRef` + `AbortController` в `useCatalogue`/`useListingsCatalogue` корректно отбрасывают устаревшие ответы; дедупликация по `slug`/`name` подтверждена в `cursorPagination.test.tsx`.
- Retry для основной загрузки и для `loadMore` — раздельные, не сбрасывают уже загруженные элементы при ошибке следующей страницы.
- Browser back/forward: `setSearchParams(..., { replace: false })` создаёт новую запись истории при смене фильтра — подтверждено.

**Карта:**
- `MarketplaceMap` рендерит честное состояние `marketplace-map--unconfigured` при отсутствии `VITE_MAP_STYLE_URL`, без фейкового OSM fallback — подтверждено чтением кода (нет захардкоженного style URL нигде в файле) и тестом `mapRuntime.test.tsx`.
- Map click и marker selection реально подключены (`onSelectRef.current?.(item)` на маркере, `map.on('click', ...)` в publishing-picker) — не заглушки.
- Список и карта используют один и тот же `state.items` (один и тот же fetch, один и тот же `limit=12`) — расхождение данных структурно невозможно, отдельно проверено.
- `queueMicrotask(handleReady)` рядом с `map.on('load'/'idle', handleReady)` — намеренный паттерн для провайдеров, не всегда испускающих событие `load`; `syncMarkers()` использует только `map.getCenter()`/`Marker.addTo()`, которые не зависят от загрузки тайлов/стиля в реальном MapLibre GL. Прочитано и подтверждено по исходному коду, отдельного фикса не требовалось.

**Карточка объявления:**
- Загрузка через `useListingDetail` с `AbortController`, без второго параллельного запроса при смене slug.
- 404 не раскрывает внутренние данные — единое сообщение «Объект не найден или было снято с публикации».
- Медиагалерея: клавиатурная навигация (ArrowLeft/Right, Home/End, Escape), broken-image fallback без бесконечного цикла, пустой `media: []` — обработаны и покрыты `listingMediaGallery.test.tsx`.
- `tel:` ссылка рендерится только после реального `200 OK` от backend (`response.phone` из `RevealContactResponse`), не раньше.
- UTM/referrer: `utm_*` параметры собираются из `location.search` и уходят в теле запроса; `referrer` **не нужно** дублировать на фронтенде — backend уже читает его из реального HTTP-заголовка `Referer` (`req.headers.referer` в `listing-crm.controller.ts`/`crm.controller.ts`), который браузер выставляет автоматически из `document.referrer`. Проверено по серверному коду, чтобы не внести дублирующую и потенциально расходящуюся логику на клиенте.

**Publishing wizard:**
- Login/register используют реальный `authApi` (`/api/v1/auth/login`, `/register`, `/logout`) без localStorage/sessionStorage — подтверждено grep по всему `src/features/publishing/**`.
- Ошибки авторизации видны пользователю (`role="alert"` в `AuthStep`).
- Идентификаторы (`assetId`/`listingId`) появляются в состоянии только после реального успешного backend-вызова; шаги `characteristics → deal → media → review` не проходимы без него (проверено по коду `usePublishingWizard`, не только по disabled-кнопке).
- Owner override дубликата: причина ≥10 символов валидируется и на клиенте (`ReviewDedupeStep`), и повторно в хуке (`usePublishingWizard.submitDuplicateOverride`) — defense in depth.
- `confirmed_duplicate`/публикация при активном блоке невозможна: кнопка `disabled={isPublishing || hasDuplicateBlock}` **и** `publishListing` сам перепроверяет `state.hasDuplicateBlock` перед вызовом API.
- Idempotency-Key стабилен: генерируется один раз на `listingId`, хранится в `useRef`, переиспользуется при повторном вызове `publishListing` для того же листинга.
- Polling ограничен 60 секундами реального времени (`Date.now() - pollingStartedAtRef.current > 60_000`), не количеством попыток — честно завершается сообщением, если worker не ответил.
- Media upload: 3-фазная загрузка (intent → S3 PUT → confirm) с прогрессом; retry для сети реализован повторной попыткой всей фотографии (не резюмирует конкретную фазу — закрыто в промежуточной сессии, см. `marketplace-public-api-gap-closure.md`).

### 4. Найденные и исправленные дефекты

Все дефекты ниже — функциональные или связанные с безопасностью данных, найдены сквозным чтением кода (не только запуском существующих тестов, которые все были зелёными и до начала работы) и закрыты минимальными, точечными правками. Ни один не требовал нового backend endpoint или изменения модели авторизации.

| # | Серьёзность | Файл | Дефект | Исправление |
|---|---|---|---|---|
| 1 | **Высокая** (утечка PII между пользователями) | `wizard-reducer.ts` | `SET_AUTH_STATUS` при логауте не очищал `location`, `characteristics` (включая `representativePhone`), `deal`, `mediaItems`, `assetId`/`listingId` и т.д. Если пользователь А вводил данные и выходил без отправки, пользователь B, входящий в том же табе, видел предзаполненные адрес/телефон/фото пользователя А. | `SET_AUTH_STATUS` с `isAuthenticated: false` теперь полностью сбрасывает состояние до `initialWizardState` (сохраняя только `isAuthenticated`/`step`). Аутентификация подтверждения сессии (`isAuthenticated: true` без смены identity) больше не сбрасывает шаг/данные, если пользователь уже в процессе — только реальный логаут очищает. |
| 2 | **Высокая** (гонка при логауте) | `usePublishingWizard.ts` | Логаут не останавливал активный `setInterval` поллинга публикации. Отложенный ответ (`published`) мог применить `SET_PUBLICATION_STATUS`/`SET_STEP: 'published'` к уже сброшенному состоянию **следующего** пользователя, показав ему чужой `publishedSlug`. | Добавлен `useEffect`, реагирующий на `isAuthenticated === false`: останавливает поллинг (`stopPolling()`), сбрасывает `idempotencyKeyRef` и оба реентерабельность-лока (см. #5, #6). |
| 3 | **Средняя** | `usePublishingWizard.ts` | При таймауте поллинга (60с) и при `build_failed` состояние `step` оставалось `'publishing'` — визард не возвращал пользователя в `review`, в отличие от остальных путей ошибки публикации (409-дубликат, generic catch). Несогласованно с явным требованием документации «publish error возвращает пользователя в review». | Добавлен `dispatch({ type: 'SET_STEP', step: 'review' })` в обе ветки (timeout, `build_failed`), синхронно с остальными путями ошибки. |
| 4 | **Средняя** | `ListingContactForm.tsx` | Защита от двойной отправки была основана только на React state (`status === 'submitting'`), который обновляется асинхронно. Два `submit`-события, отправленные до коммита первого ре-рендера, оба проходили guard и оба уходили в реальный `revealListingContact` — потенциальное создание двух лидов на одно действие пользователя. | Добавлен синхронный `useRef`-лок (`isSubmittingRef`), проверяемый и выставляемый немедленно, до любого `await`/`setState`. |
| 5 | **Средняя** | `usePublishingWizard.ts` | `submitDuplicateOverride` не имел реентерабельность-guard внутри самого колбэка — быстрый двойной клик до коммита `disabled` мог отправить два `overrideDuplicate` запроса. | Добавлен `isOverrideInFlightRef`, зеркалирующий паттерн из #4. |
| 6 | **Средняя** | `usePublishingWizard.ts` | `publishListing` не имел внутреннего реентерабельность-guard (только внешний `disabled` на кнопке) — тот же класс гонки, что и #5, но для публикации и `confirmActuality`. | Добавлен `isPublishInFlightRef`, снимается синхронно на каждом терминальном пути (успех/таймаут/`build_failed`/catch/логаут/`resetWizard`). |
| 7 | **Низкая-средняя** | `useSeoMetadata.ts` | `<link rel="canonical">` создавался (`setCanonical`), но никогда не удалялся при unmount — не было парной `removeCanonical`. При переходе с `/listings/:slug` на `/` (которая не вызывает `useSeoMetadata`) в `<head>` оставался канонический URL уже покинутой карточки. | Добавлена `removeCanonical()`, вызывается в cleanup-функции хука наравне с остальными тегами. |
| 8 | **Низкая** | `useSeoMetadata.ts` | Захватывалась неиспользуемая переменная `previousTitle`, вводящая в заблуждение (создавала видимость restore-семантики, которой не было — хук всегда жёстко сбрасывает на `DEFAULT_TITLE`). Мёртвый код, недостижимый баг при гипотетическом вложенном использовании хука, которого сейчас нет в приложении. | Удалена неиспользуемая переменная. Полноценная restore-семантика не добавлялась намеренно — текущее дерево маршрутов плоское, и добавление этой логики было бы избыточной абстракцией под гипотетический сценарий. |
| 9 | **Низкая** | `App.tsx` (`Shell`) | Плавающая кнопка переключения список/карта строила URL независимо от `CataloguePage.viewUrl()` и не удаляла `cursor`, в отличие от последней. Сегодня безвредно (`cursor` нигде не пишется в URL), но реальная рассинхронизация двух дублирующих URL-билдеров — потенциальная мина при будущем изменении. | `Shell`'s `mapQuery`/`listQuery` теперь тоже удаляют `cursor`, синхронно с `viewUrl()`. |
| 10 | **Низкая** | `usePublishingWizard.ts` (`deletePhoto`) | Удаление фото, для которого фаза 1 (upload-intent) провалилась (id всё ещё клиентский `temp-...`), вызывало `DELETE` к backend, который никогда не слышал об этом id — гарантированный спурьезный 404/ошибка после того, как локальное удаление уже успешно прошло. | `deletePhoto` теперь пропускает сетевой вызов для `mediaAssetId`, начинающегося с `temp-` — локальное удаление остаётся немедленным и единственным действием в этом случае. |

**Явно проверено и подтверждено корректным (без изменений):**
- Race conditions в `useCatalogue`/`useListingsCatalogue`/`useListingDetail`/`useDevelopmentDetail` — `requestIdRef`/`AbortController` защищают от применения устаревшего ответа.
- Список и карта не могут разойтись по данным (общий `state.items`, общий `limit`).
- Отсутствие фейкового OSM fallback при отсутствии `VITE_MAP_STYLE_URL`.
- JSON-LD (`buildListingJsonLd`/`buildDevelopmentJsonLd`) строится только из явно перечисленных публичных полей, без spread — `organizationId`/`identityId`/`storageKey` структурно не могут просочиться.
- Отсутствие mock/fixture-массивов в продакшн-коде (`no-mock-data.test.tsx` + отдельный ручной grep).
- `Idempotency-Key`: стабилен, хранится в `useRef`, переиспользуется при повторе, нигде не логируется.
- Step-skip защита: хотя примитив `SET_STEP` в редьюсере сам по себе не валидирует предусловия, каждый реальный переход шага в UI обёрнут в async-колбэк, требующий успешного backend-вызова (`submitCharacteristics`, `submitDealTerms`, `prepareReview` — все с ранним `return` при отсутствии нужного id). Прямого способа для пользователя обойти это через реальный UI не найдено; отдельного фикса не вносилось, чтобы не добавлять валидацию под нереализуемый сценарий.

### 5. Backend / инфраструктурные разрывы, которые НЕ были и не должны были трогаться

Как явно указано в задании, новые backend endpoints и изменения authorization model не вносились. Ниже — то, что упирается в существующий backend-контракт или внешнюю инфраструктуру, а не в код `marketplace-web`:

1. **Docker daemon недоступен в текущем локальном окружении** (`docker info`/`docker ps` не могут подключиться к `dockerDesktopLinuxEngine`). MongoDB replica set, Redis, MinIO — не подняты. Это тот же инфраструктурный разрыв, что уже задокументирован в `BAZA_MASTER_PLAN.md` для D-07. Следствие: полный сквозной прогон против реального API (login → wizard → publish → live listing card) в этой сессии не выполнялся, только: (а) автоматические тесты на jsdom/Testing Library, реально монтирующие компоненты и диспатчащие реальные DOM-события; (b) чтение серверного кода для сверки контракта; (c) статичный smoke дев-сервера без backend. Уточнено в промежуточной сессии: `apps/api`'s `test:integration` фактически не требует Docker вовсе — использует `mongodb-memory-server`.
2. **Отсутствие `total`/общего количества объектов в ответе `GET /public/listings`, `GET /public/developments`.** UI-счётчик «N объектов найдено» в каталоге фактически показывает количество уже загруженных элементов (`state.items.length`), не полное число по фильтру — потому что backend его не отдаёт. Проанализировано подробнее в `marketplace-public-api-gap-closure.md`.
3. **Сортировка каталога по цене/площади** — не относится к функциональному упрочнению текущего UI, backend отдаёт фиксированную сортировку. Проанализировано подробнее в `marketplace-public-api-gap-closure.md`.
4. **Media upload retry** — закрыто в промежуточной сессии (resumable retry с сохранением конкретной провалившейся фазы), см. `marketplace-public-api-gap-closure.md`.
5. **`checkSession()` в `auth-api.ts`** определяет статус авторизации побочным способом. Backend не предоставляет отдельного session-check роута. Проанализировано подробнее в `marketplace-public-api-gap-closure.md`.

### 6. Browser smoke: что было сделано и что нет (честно)

**Выполнено:**
- `apps/marketplace-web` собран (`vite build`) и раздаётся dev-сервером (`vite --port 3001`) без ошибок; корневой HTML/SPA-shell отдаётся корректно (`200`, валидный `<!doctype html>`, корректный `<title>BAZA.sale — недвижимость</title>`).
- Все 85 тестов в `apps/marketplace-web/tests/**` выполняются в реальном jsdom через `@testing-library/react`: реальный монтаж React-компонентов, реальные DOM-события (`fireEvent`), реальные ARIA-роли/`role="alert"`/`aria-live`, реальная клавиатурная навигация галереи, реальные асинхронные состояния (loading/error/success) с `waitFor`. Это не «моки логики» — это функциональный прогон компонентов в браузероподобной среде, включая специально добавленные тесты на найденные дефекты (double-submit, логаут-сброс, timeout-routing).
- Production build (`vite build`) проходит без ошибок; typecheck (`tsc -b`) чист.

**НЕ выполнено, и почему:**
- **Полноценный сквозной прогон в реальном Chromium/Playwright** против живого API не выполнялся. Причины: (а) в момент этой сессии не было живого `apps/api`; (б) в этом worktree не установлен Playwright и нет `playwright.config.*` — установка браузерных бинарей "с нуля" ради разового smoke-прохода — тяжеловесное, выходящее за пределы точечного функционального упрочнения действие, которое не было запрошено отдельно. Специализированный browser-automation инструмент (MCP) в этой сессии также не подключён.
- Следствие: **console errors, failed network requests и accessibility-проблемы в реальном браузере в этой сессии не зафиксированы** — только те, что обнаружимы статическим чтением кода и jsdom-тестами (которые уже покрывают `role="alert"`, `aria-live`, landmarks, keyboard nav — см. `accessibilitySmoke.test.tsx`). Desktop/mobile-375px адаптивность не проверена визуально; в CSS (`app.css`) изменений не вносилось, поэтому регрессии по этой части не ожидается, но не подтверждена данной сессией.
- Это ограничение, а не пропущенный шаг «для скорости» — фабриковать результаты browser smoke без реального браузера и без реального API означало бы нарушить тот самый принцип «никаких fake fallback состояний», которому посвящена вся эта задача.

**Рекомендация:** полноценный desktop/mobile smoke (guest flow, auth flow, wizard flow, reveal-contact, retry/error states) следует выполнить в сессии, где: (1) `apps/api` + MongoDB replica set + Redis + MinIO реально запущены (Docker не обязателен для API/Mongo части, см. промежуточную сессию), (2) доступен Playwright или эквивалентный browser-automation инструмент.

### 7. Команды верификации

Из `apps/marketplace-web/`:

```bash
pnpm install       # выполняется из корня монорепозитория (workspace)
pnpm typecheck      # tsc -b — чисто
pnpm test           # vitest run — 20 файлов, 85 тестов, все зелёные
pnpm build           # tsc -b && vite build — чисто, dist/ генерируется
```

Результаты на момент написания документа:
- `pnpm typecheck` → без ошибок.
- `pnpm test` → `Test Files 20 passed (20)`, `Tests 85 passed (85)`.
- `pnpm build` → `✓ built in ~4.6s` (единственное предупреждение — размер JS-чанка из-за MapLibre GL, не связано с этой задачей и не является регрессией).
- `git diff --check` (из корня монорепозитория) → чисто, без whitespace-ошибок.

### 8. Известные ограничения этого прохода

- Правки затрагивают только `apps/marketplace-web`. Backend (`apps/api`) не менялся ни строкой — все дефекты были устранены на уровне клиентского состояния/сетевого клиента.
- Визуальная структура, дизайн-токены, компоновка и копирайт-текст не менялись нигде, кроме случаев, где сообщение об ошибке уже существовало в коде и переиспользовалось как есть (ни одна строка UI-текста не добавлена и не переформулирована в рамках этой задачи).
- Figma, Stitch и любые визуальные дизайн-инструменты не использовались и не запрашивались в этой сессии — MCP-сервер `stitch` числится недоступным в окружении (ошибка подключения), но это не имеет отношения к данной задаче: подключать его не требовалось и не предпринималось.

## 9. Resilience pass (2026-08-30)

- Каталожные и detail-хуки передают `AbortSignal` во все публичные GET-запросы и отменяют предыдущий запрос при смене фильтра/slug или unmount. Устаревшие и abort-ошибки не переводят новый экран в ошибочное состояние и не применяют данные после ухода со страницы.
- Рендер-ошибка отдельного маршрута больше не ломает SPA-shell целиком: `RouteErrorBoundary` показывает доступный recovery-экран с действиями «Повторить» и «Вернуться в каталог».
- Добавлены регрессионные тесты для отмены `loadMore`/detail-запроса, распознавания abort-ошибок и восстановления после render failure. Backend/API-контракт и дизайн-модель не менялись.

## 10. Read-only auth session check (2026-08-30)

- Добавлен `GET /api/v1/auth/session`: audience определяется по `Origin`, а состояние cookie проверяется через существующий `SessionService`; endpoint не создаёт и не отзывает сессии.
- Ответ намеренно не раскрывает identity или внутренние поля: активная cookie даёт `{ authenticated: true }`, все guest/expired/revoked/wrong-audience варианты — `{ authenticated: false }`. Отсутствующий или неизвестный `Origin` получает стандартный `AUTH_AUDIENCE_MISMATCH`.
- Publishing wizard теперь проверяет сессию через этот read-only endpoint, а не через `GET /marketplace/property-assets`. Контракт добавлен в OpenAPI и regenerated `packages/api-client/src/schema.ts`.
- Проверено: API unit 3/3, HTTP integration 7/7 (marketplace/ERP/admin, revoke/expiry, non-disclosure), frontend 2/2.

# Marketplace Public API — Contract-Confirmed Gap Closure

**Дата:** 2026-08-30
**Ветка:** `codex/marketplace-functional-hardening`
**База этого прохода:** `48e8b64` (не переписан, не откачен)

Продолжение функционального упрочнения marketplace-вертикали. Задача: закрыть оставшиеся функциональные разрывы public marketplace, реализуя **только подтверждённые контрактом возможности** — без изобретения новых backend endpoints или изменения authorization model.

---

## 1. Что было исследовано перед реализацией

Полная проверка текущего API-контракта (`docs/api/v1-first-vertical-slice.yaml`), реализации (`apps/api/src/modules/publication/**`, `packages/publication/src/repository/marketplace-publication.repository.ts`), Mongoose-схемы (`packages/publication/src/schemas/marketplace-publication.schema.ts`) и всех существующих integration-тестов, покрывающих `GET /public/listings`/`GET /public/developments`, до написания единой строки кода.

---

## 2. Что было реализовано

### 2.1. Возобновляемый retry media upload с сохранением фазы

**Единственный пункт из ТЗ, безопасно реализуемый без изменения backend-контракта** — все 3 фазы (`upload-intent` → S3 PUT → `confirm`) уже существуют как отдельные API-вызовы; недостающей была только клиентская логика возобновления.

**Было:** отклонённая фотография (`status: 'rejected'`) не несла информации о том, какая именно фаза провалилась. Единственное действие — «Удалить» и выбрать файл заново, что для сбоя на фазе 2 (S3 PUT) или 3 (Confirm) означало повторный вызов `createMediaUploadIntent`, хотя backend уже выдал валидный `mediaAssetId`/`uploadUrl` на предыдущей попытке.

**Стало:**
- `WizardMediaItem` получил поле `failedPhase?: 'intent' | 'upload' | 'confirm'` (`src/features/publishing/model/types.ts`).
- `usePublishingWizard.ts`: `uploadPhoto` разделён на `pendingUploadsRef` (Map, хранит `File` + результат фазы 1 вне сериализуемого reducer-состояния — тот же паттерн, что уже применён к `idempotencyKeyRef`) и `runUploadPhases(tempId, fromPhase)` — общую функцию, параметризованную точкой входа. `currentPhase` обновляется непосредственно перед `await` каждой фазы, поэтому `catch`-блок всегда точно знает, какая фаза бросила исключение — без вывода по косвенным признакам.
- Новая функция `retryPhoto(tempId)` вызывает `runUploadPhases` с `item.failedPhase` — пропуская уже успешные фазы.
- `MediaUploadStep.tsx`: кнопка «Повторить» (переиспользует существующий класс `wizard-btn-link`, ничего нового в `src/styles` не добавлено) появляется только для `status: 'rejected'`, рядом отображается конкретная причина сбоя (`role="alert"`, класс `wizard-field-error` — уже существующий в `ReviewDedupeStep.tsx`).
- `deletePhoto` теперь ищет элемент по стабильному `id` (не по `mediaAssetId`, который переприсваивается после успеха фазы 1) и удаляет соответствующую запись из `pendingUploadsRef`, чтобы заброшенный `File` не мог быть «воскрешён» случайным повторным вызовом retry.
- `pendingUploadsRef` очищается на логауте и `resetWizard()`, синхронно с остальными in-flight ref'ами, закрытыми в предыдущем проходе (`idempotencyKeyRef`, `isPublishInFlightRef`, `isOverrideInFlightRef`).

**Backend не изменён.** Использованы исключительно уже существующие 3 эндпоинта; новый API-контракт не добавлен, OpenAPI-спека не тронута (нет реального изменения контракта — только клиентская оркестрация уже существующих вызовов).

---

## 3. Что НЕ было реализовано и почему (зафиксированные gaps, не изобретённые API)

### 3.1. Серверная сортировка `newest/price/area`

**Не реализовано.** Подтверждено сквозной проверкой контракта:

1. **Курсор структурно завязан на единственный порядок.** `MarketplacePublicationRepository.listPublished`/`listPublishedByFilter` (`packages/publication/src/repository/marketplace-publication.repository.ts:113-187`) применяют `filter._id = {$gt: cursor}` в паре с жёстко заданным `.sort({_id:1})`. Курсор — это сырой `_id.toString()` (`public-listings.controller.ts:28`, `public.controller.ts:44`), не составной ключ. Добавление `sort=price` при неизменном курсоре либо тихо ломает семантику пагинации для существующего курсора в полёте (пропуск/дублирование объектов относительно нового порядка), либо требует составного курсора (`{sortValue, _id}`) — а это redesign контракта пагинации, не добавление query-параметра.
2. **Цена и площадь физически неиндексируемы сегодня.** `MarketplacePublicationDocument` (`packages/publication/src/schemas/marketplace-publication.schema.ts:53-119`) хранит цену/площадь внутри `denormalizedFields`/`searchProjection` — оба `Mixed`/`Object`, без статической подсхемы и без индекса. Существующие индексы покрывают только `status`, `{status,_id}`, `slug`, `{sourceType,sourceId}`, `2dsphere` на `searchProjection.geo`. Сортировка по цене сегодня означала бы полный in-memory sort без индекса на каждый запрос каталога.
3. **Для новостроек (`Development`) цены в `searchProjection` нет вовсе.** Комментарий воркер-маппера (`apps/worker/src/handlers/development-publication.mapper.ts:12-17`) явно откладывает `priceFrom` до появления агрегации по Unit-коллекции.
4. **OpenAPI не декларирует `sort`/`sortBy` ни для одного эндпоинта во всей спеке** (проверено полным просмотром `docs/api/v1-first-vertical-slice.yaml`) — это не забытая деталь спеки, а действительно отсутствующая часть контракта.

Это реальная backend-задача (схема + индексы + курсор), а не UI-доработка. Реализация «наполовину» (например, `sort` только для `newest`, являющегося текущим поведением по умолчанию) не даёт функциональной ценности и рискует создать иллюзию поддержки сортировки там, где её на самом деле нет — решено не делать даже минимальной заглушки. Зафиксировано в `docs/operations/frontend-marketplace-vertical.md`, раздел 7, п.2 (расширено).

### 3.2. `total`/`count` в ответе каталога

**Не реализовано.** Ни одна `*List`-схема в OpenAPI-спеке (`PublicListingList`, `PublicDevelopmentList` и все остальные списочные схемы файла) не объявляет `total`/`count` — только `{items, nextCursor}`, проверено полным просмотром файла. `countDocuments()`/`.count()`/`estimatedDocumentCount()` не используется нигде в кодовой базе против `marketplace_publications` или смежных коллекций; единственный прецедент (`admin-account.repository.ts::countActiveSuperAdmins`) — equality-фильтр на маленькой административной коллекции, не аналог фильтрованного публичного поиска. Поля `city`/`dealType`/`propertyType`/`commercialSubtype`, используемые как фильтры в `listPublishedByFilter`, не имеют собственных индексов на `marketplace_publications` — наивный `countDocuments()` с теми же фильтрами на каждой загрузке каталога означал бы дополнительный неиндексированный скан на каждый запрос списка, что является реальным риском деградации производительности, а не бесплатным добавлением поля.

UI-счётчик каталога честно продолжает показывать количество уже загруженных элементов (как и в предыдущем проходе), а не переименован/подменён оценочным числом. Зафиксировано в `docs/operations/frontend-marketplace-vertical.md`, раздел 7, новый п.3.

### 3.3. Независимый read-only session check

**Не реализовано.** `apps/api/src/modules/identity/auth.controller.ts` содержит только `POST /auth/login`, `/register`, `/logout` — ни GET-маршрута `/auth/session`/`/auth/me`, ни соответствующей записи в OpenAPI-спеке не существует. `SessionService.getActiveSessionFromRequest` (используемый как раз для этой цели) подключён только к middleware трёх контекстов (`admin-context.middleware.ts`, `tenant-context.middleware.ts`, `marketplace-account-context.middleware.ts`), но не выставлен ни одним публичным HTTP-маршрутом. Среди всех routes под `MarketplaceAccountGuard` (`MarketplacePropertyAssetsController`) `GET /marketplace/property-assets` (то, что `checkSession()` уже использует) — уже самый дешёвый вариант: простой indexed-lookup список без побочных эффектов; более лёгкого read-only маршрута в существующем контракте нет.

Условие задачи — «если в API уже есть подходящий контракт» — не выполнено: подходящего контракта нет. Оставлено как есть; добавление нового эндпоинта было бы добавлением новой backend-поверхности, не санкционированным этой задачей. Зафиксировано в `docs/operations/frontend-marketplace-vertical.md`, раздел 7, новый п.4.

---

## 4. OpenAPI и api-client

**Не изменены.** Ни одно из перечисленных выше ограничений (3.1–3.3) не было реализовано — контракт `docs/api/v1-first-vertical-slice.yaml` и клиенты (`apps/marketplace-web/src/api/marketplace-api.ts`, `apps/marketplace-web/src/features/publishing/api/publishing-api.ts`) остаются без изменений. Единственная реализованная возможность (2.1, retry media upload) оркеструет уже существующие 3 эндпоинта клиентской логикой — реального изменения контракта нет, поэтому обновление OpenAPI не требовалось согласно самой формулировке задачи («обнови OpenAPI и api-client только при реальном изменении контракта»).

---

## 5. Тесты

### 5.1. Новые/усиленные тесты (marketplace-web)

- `tests/publishingWizardFlow.test.tsx` — 3 новых сценария:
  - retry после сбоя на фазе S3 PUT повторяет **только** эту фазу (`createMediaUploadIntent` вызван 1 раз, `uploadBinaryFile` — 2 раза, второй успешно).
  - retry после сбоя на фазе Intent запускает загрузку заново с нуля (`createMediaUploadIntent` вызван 2 раза).
  - удаление отклонённого элемента убирает его из `pendingUploadsRef` — повторный клик на несуществующий retry невозможен, элемент реально исчезает из UI.
- `tests/publishingReducer.test.ts` — 1 новый тест: `failedPhase` корректно записывается при `UPDATE_MEDIA_ITEM` и сбрасывается при переходе обратно в `uploading` (retry не путает фазу нового сбоя со старой).

### 5.2. Существующие тесты — backwards compatibility, cursor pagination, invalid params, empty states

Не переписаны (задача явно требует не менять authorization model и не трогать backend) — проверены прогоном как подтверждение отсутствия регрессии:

- **`apps/marketplace-web`**: `pnpm test` — 20 файлов, **89/89** тестов (85 из прошлого прохода + 4 новых: 3 в `publishingWizardFlow.test.tsx`, 1 в `publishingReducer.test.ts`). `pnpm typecheck`, `pnpm build` — чисто.
- **`apps/api`**: `pnpm test` (Jest unit) — **54/54 файла, 490/490 тестов**. `pnpm test:integration` — **20/20 файлов, 231/231 тестов**, включая:
  - `public-developments-list.integration-spec.ts` — курсор-пагинация (limit+1 boundary, точный limit без лишней пустой страницы), `400` для невалидного `cursor`/`limit`/`bbox`, `400` для неизвестного query-параметра (`forbidNonWhitelisted`), фильтрация по `bbox`/`city`, только `status:'published'` попадает в выдачу, `{items:[],nextCursor:null}` для пустого результата — locked-in контракт не нарушен, потому что не тронут.
  - `mkt-002-listing-publication.integration-spec.ts` — включает проверки `GET /public/listings` после публикации/анпаблиша.
  - Все остальные integration-сьюты, покрывающие marketplace/admin/identity — без изменений и без регрессий.

**Уточнение к предыдущему проходу:** в прошлой сессии было зафиксировано, что «Docker daemon недоступен → полноценный `test:integration` не выполним». Это оказалось верно только для **live full-stack сервера + Playwright** сценария — `apps/api`'s `test:integration` фактически поднимает `mongodb-memory-server` (объявлен в `pnpm-workspace.yaml`'s `allowBuilds`) и не требует Docker вовсе. В этой сессии `pnpm test:integration` для `apps/api` выполнен полностью и успешно; это исправляет неточность предыдущего отчёта, не переписывая его историю.

---

## 6. Известные ограничения этого прохода

- Media upload retry резюмируется **в пределах текущей сессии визарда** (пока `PublishingWizard` смонтирован) — `pendingUploadsRef` живёт в памяти компонента, не переживает `refresh`/повторный вход. Это не регрессия: до этого прохода retry не работал вообще ни в каком виде (только «удалить и выбрать заново»), и per-file resumable upload через `refresh` потребовал бы либо IndexedDB для хранения `File`, либо серверного эндпоинта проверки уже загруженного в S3/MinIO объекта — оба варианта выходят за рамки точечного клиентского фикса, отмечается как естественная граница текущего решения, а не недоделка.
- Пункты 3.1–3.3 (сортировка, total/count, session check) остаются открытыми backend-задачами. Ни один не является ошибкой в существующем коде — все три либо явно запланированы «в следующем релизе» (сортировка, согласно уже существующей формулировке в документации), либо структурно требуют нового backend-контракта, которого явно не санкционировала эта задача.

---

## 7. Изменённые файлы

- `apps/marketplace-web/src/features/publishing/model/types.ts`
- `apps/marketplace-web/src/features/publishing/model/usePublishingWizard.ts`
- `apps/marketplace-web/src/features/publishing/components/PublishingWizard.tsx`
- `apps/marketplace-web/src/features/publishing/components/steps/MediaUploadStep.tsx`
- `apps/marketplace-web/tests/publishingWizardFlow.test.tsx`
- `apps/marketplace-web/tests/publishingReducer.test.ts`
- `docs/operations/frontend-marketplace-vertical.md` (раздел 7 — расширен пп.2, добавлены пп.3–4)
- `docs/operations/marketplace-publishing-wizard.md` (п.5 — добавлено описание resumable retry)

---

## 8. Связанные находки следующего прохода (2026-08-30, production acceptance gate)

Отдельная сессия (`docs/operations/marketplace-functional-acceptance.md`, «Проход 2») зафиксировала три дополнительных backend-gap'а того же класса, что пп.3.1–3.3 выше (реальный контрактный/инфраструктурный разрыв, не изобретённое решение): in-memory rate limiter storage (не Redis-backed, риск при горизонтальном масштабировании), orphaned pending `MediaAsset` записи без TTL/cleanup, `overrideDuplicate` без `Idempotency-Key`-обёртки. Полные детали — в `frontend-marketplace-vertical.md` раздел 7 пп.6–8 и `marketplace-functional-acceptance.md` раздел 4 «Проход 2» — не дублируются здесь, чтобы не разойтись при будущих правках.
- `docs/operations/marketplace-public-api-gap-closure.md` (новый — этот документ)

## 9. Закрытие gaps раздела 8 (2026-08-30, `codex/marketplace-operational-hardening`, база `a465245`)

Два из трёх backend-gap'ов раздела 8 закрыты этим проходом; третий (`overrideDuplicate` idempotency) вне scope — это была отдельная команда с уже существующим ADR-006-механизмом, не связанная с гостевым reveal-contact flow, который был предметом этого прохода.

- **In-memory rate limiter storage** — закрыто. `reveal-contact` (оба варианта) переведён на Redis-backed distributed limiter, shared между всеми API-инстансами. Полное описание — `docs/operations/marketplace-operational-hardening-runbook.md` раздел 2.
- **Orphaned pending `MediaAsset` без TTL/cleanup** — закрыто. `MediaAssetRepository.findStalePending()` (существовал с ADR-08, был без вызывающего кода) теперь используется в `apps/worker/src/jobs/media-cleanup.service.ts`, race-safe относительно конкурентного `confirmUpload`, TTL по умолчанию 24ч. Полное описание — `docs/operations/marketplace-operational-hardening-runbook.md` раздел 3.
- **`reveal-contact` idempotency** (дополнительно к трём исходным gap'ам, отдельный запрос на этот проход) — закрыто. Гостевой idempotency-механизм (отдельный от ADR-006, без требования `identityId`), опциональный `Idempotency-Key` header, не ослабляет non-disclosure/единый 404. Полное описание — `docs/operations/marketplace-operational-hardening-runbook.md` раздел 1.

Backend-контракт (`docs/api/v1-first-vertical-slice.yaml`) получил минимальное точечное изменение: опциональный `Idempotency-Key` header parameter на обоих `reveal-contact` operations и `409`-response для конфликта. `packages/api-client/src/schema.ts` регенерирован, `check-stale.mjs`/`verify-contract-layout.mjs` проходят.

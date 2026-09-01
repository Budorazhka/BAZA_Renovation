# Admin duplicate-candidates review queue (DEDUPE-001 follow-up)

Статус: implemented (31.08.2026)

## Контекст

`DuplicateCandidateRepository.listForReview`/`markConfirmedDuplicate` существовали
в `@baza/property-assets` (mongodb-schema.md явно описывает `{status:1}` индекс
как обслуживающий "admin-очередь detected/override_not_duplicate для ручной
проверки"), но не были подключены ни к одному HTTP/service-пути ни на owner-,
ни на admin-стороне — честный gap, найденный чтением кода.

## Delivered

- `GET /api/v1/admin/duplicate-candidates` — очередь на модерацию с
  денормализованной парой `PropertyAsset` (город/адрес/характеристики/
  представительский телефон/publisherScope) для визуального сравнения без
  дополнительных запросов. Без `?status` — `detected` + `override_not_duplicate`
  (то, что реально требует проверки); явный `?status=confirmed_duplicate` —
  просмотр уже закрытых записей отдельно.
- `duplicate_candidate.read`/`duplicate_candidate.confirm` — global scope
  (не city-scoped, в отличие от publications: пара может involve organizations
  из разных городов). Отсутствие гранта — `403 ADMIN_SCOPE_INSUFFICIENT`, НЕ
  пустой список (отличие от `adminListPublications`, где отсутствие read-scope
  даёт пустой результат — здесь единственный grant либо есть, либо нет).
- `POST /api/v1/admin/duplicate-candidates/:id/confirm` — переводит
  `detected`/`override_not_duplicate` → `confirmed_duplicate`. Admin —
  единственный actor, который может confirm ИЗ `override_not_duplicate`
  (отменяет решение владельца "не дубль"). `paid`-аналога здесь нет — единственное
  ограничение: нельзя confirm уже `confirmed_duplicate` (`409`).
- Схема `duplicate_candidates` дополнена `confirmReason`/`confirmByAdminAccountId`/
  `confirmedAt` — тот же уровень audit-контекста на самом документе, что уже
  было у `override*` полей (не только в отдельной `audit_events` записи).
- `AdminModule` теперь импортирует `PropertyAssetsModule` и переиспользует
  уже экспортированный `DedupeService` (не читает
  `DuplicateCandidateRepository`/`PropertyAssetRepository` напрямую —
  `test/architecture/module-boundaries.test.ts` запрещает cross-module
  repository reach-through).

## Побочный эффект: ConfigModule regression fix

`AdminModule` → `PropertyAssetsModule` → `MediaModule` → `MediaStorageService`
требует `ConfigService` в конструкторе (реальный `S3Client`). Три существующих
integration-теста, собиравшие `AdminModule` вручную без `ConfigModule.forRoot`
(`admin-unpublish.integration-spec.ts`, `admin-accounts.integration-spec.ts`),
сломались бы этим изменением — исправлены тем же паттерном, что уже применён в
`developments-transactions.integration-spec.ts` (`ConfigModule.forRoot({isGlobal:true})`
+ синтаксически валидные фиктивные `MINIO_*`/`REDIS_URL`).

## Intentionally out of scope

- Реактивный unpublish уже опубликованных объектов при confirm — confirm
  влияет только на БУДУЩИЕ попытки публикации (publish-gate уже проверяет
  `findBlockingCandidates` при каждом publish); ретроактивная реакция на confirm
  для уже опубликованного — отдельная задача, не специфицированная нигде.
- Admin-web UI-экран для этой очереди — backend-контракт готов
  (`GET`/`POST` + `AdminDuplicateCandidate` OpenAPI-схема), UI не входит в этот
  проход.

## Verification

- API unit: `dedupe.service.spec.ts` (+5), `admin-duplicate-candidate.service.spec.ts`
  (8 новых, весь файл), `duplicate-candidate.repository.spec.ts` (+4).
- Mongo replica-set integration: `admin-duplicate-candidates.integration-spec.ts`
  (10 тестов — grant-проверки, статус-фильтрация, override→confirm переход,
  повторный confirm, короткий reason).
- OpenAPI (`GET /admin/duplicate-candidates`, `POST .../confirm`,
  `AdminDuplicateCandidate`/`AdminDuplicateCandidateAsset` схемы) и
  `packages/api-client/src/schema.ts` синхронизированы (`check-stale` проходит).

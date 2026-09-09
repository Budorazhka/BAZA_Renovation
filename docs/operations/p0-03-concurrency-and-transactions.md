# P0-03 — конкурентные брони, перевод в сделку, транзакции и обработка событий

Дата: 07.09.2026. Статус: закрыто в рамках локального quality gate текущего workspace.

## Проблема и изменения

1. **Конкурентный перевод брони в сделку и идемпотентность (`convertToDeal`)**:
   - В `apps/api/src/modules/bookings/bookings.service.ts`:
     - Добавлена ранняя проверка кэша идемпотентности (`idempotencyService.checkReplay`) до выполнения валидаций состояния.
     - Добавлена проверка срока действия брони (`booking.dateRange?.expiresAt && booking.dateRange.expiresAt.getTime() <= Date.now()`), выбрасывающая `BOOKING_INVALID_STATE_TRANSITION`.
     - Перевод статуса брони в `paid` выполняется атомарно через `markPaidIfActive` внутри MongoDB-транзакции.
     - Внутри транзакции сохраняется сделка, регистрируется ключ идемпотентности и формируется outbox-событие `deal.created.v1`.
     - При возникновении конфликтов уникального ключа, `BOOKING_INVALID_STATE_TRANSITION` или `VERSION_CONFLICT` в параллельных запросах сервис ожидает завершения первой транзакции через `awaitReplay` и возвращает ответ выигравшего запроса для идентичного ключа, либо выбрасывает 409 Conflict при разных ключах/пейлоадах.

2. **Атомарность пакетных операций (`batchUpdatePrices`)**:
   - В `apps/api/src/modules/developments/developments.service.ts`:
     - Метод `batchUpdatePrices` выполняется строго в сессии транзакции.
     - Для каждого юнита проверяется `{ modifiedCount }` от `unitRepository.updatePriceWithVersionCheck(...)`.
     - При несовпадении версии хотя бы одного юнита (in-flight version conflict) выбрасывается `ConflictException`, что приводит к полному откату транзакции (`abortTransaction`). Ни одно изменение не фиксируется частично.

3. **Оптимистические блокировки и CAS-повторы в проекциях маркетплейса**:
   - В `packages/publication/src/repository/marketplace-publication.repository.ts`:
     - Метод `updateProjection` расширен параметром `options?: { expectedVersion?: number }`.
     - При указании `expectedVersion` обновление выполняется через атомарный фильтр `{ _id: id, status: 'published', version: expectedVersion }`. При несовпадении версий метод возвращает `null`.
   - В `apps/worker/src/handlers/unit-price-changed.handler.ts` и `unit-status-changed.handler.ts`:
     - Реализован цикл безопасного CAS-обновления проекций (до 3 попыток) с перезагрузкой актуального состояния ЖК и юнитов при несовпадении версий.

4. **Тестирование**:
   - Создан комплексный интеграционный тест на реальном MongoDB replica set:
     - `apps/api/test/integration/p0-03-concurrency-transactions.integration-spec.ts` (9 тестов):
       1. Конкурентный вызов `convertToDeal` с одним ключом идемпотентности — создается ровно 1 сделка, оба запроса получают replay.
       2. Повтор с тем же ключом и тем же телом возвращает replay, с другим телом — 409 Conflict.
       3. Конкурентный вызов с разными ключами — первая транзакция создает сделку, вторая отклоняется со статусом 409.
       4. Просроченная бронь отклоняется и не переводится в сделку.
       5. Отклоненная бронь (`rejected`) не может быть переведена в сделку.
       6. Попытка перевода чужой брони возвращает 404.
       7. Ошибка внутри транзакции откатывает все операции (0 сделок, 0 outbox-событий).
       8. Конфликт версий в `batchUpdatePrices` атомарно откатывает весь пакет.
       9. `updateProjection` с устаревшей версией возвращает `null` и защищает проекцию от затирания.
   - Обновлены модульные тесты:
     - `apps/api/src/modules/bookings/bookings.service.spec.ts` (35 тестов).
     - `apps/api/src/modules/developments/developments.service.spec.ts` (71 тест).
     - `apps/worker/src/handlers/unit-price-changed.handler.spec.ts` и `unit-status-changed.handler.spec.ts`.

## Проверка Quality Gate

1. `pnpm lint` — 21/21 пакетов успешно (0 ошибок).
2. `pnpm run typecheck --force` — 24/24 задач успешно (0 ошибок).
3. `pnpm run test --force` — 23/23 задач успешно, 101 test suite, 1058 тестов в API, все worker-тесты зеленые.
4. `pnpm run build --force` — 14/14 пакетов собраны успешно.
5. `node packages/api-client/scripts/check-stale.mjs` — актуален.
6. `git diff --check` — чисто.

# P0-02 — согласованность цен, валют и поисковой выдачи проекций

Дата: 07.09.2026. Статус: закрыто в рамках локального quality gate текущего workspace.

## Проблема и изменения

1. **Разнородные валюты и вычисление `priceFrom`**:
   - Реализована функция `computeDevelopmentPriceFrom(units)` в `apps/worker/src/handlers/development-publication.mapper.ts`.
   - Если в ЖК нет доступных юнитов или у доступных юнитов разные валюты (например, часть в `USD`, часть в `EUR`), `priceFrom` выставляется в `null` (безопасное правило без автоматических кросс-курсов валют).
   - Если все доступные юниты имеют одну валюту, вычисляется минимальный `amountMinorUnits` и сохраняется их общая `currency`.
   - Создана функция `computeDevelopmentPublicSummary({ development, buildings, availableUnits })`, являющаяся единым источником правды для формирования `priceFrom`, списка `publicUnits`, `denormalizedFields` и `searchProjection`.

2. **Синхронизация поисковых проекций и обработчики событий**:
   - `publication-requested.handler.ts`:
     - Для ЖК используется `computeDevelopmentPublicSummary`.
     - Для юнита поле `floorPlan` добавляется в проекцию только при наличии планировки, а `planImageUrl` формируется через `storage.getPublicUrl(...)` при наличии `imageAssetId`.
   - `unit-price-changed.handler.ts`:
     - Синхронно обновляет `searchProjection` самого юнита (`priceAmountMinorUnits`, `priceCurrency`) в `publicationRepository`.
     - Пересчитывает проекцию ЖК (`denormalizedFields` и `searchProjection`) через `computeDevelopmentPublicSummary`.
   - `unit-status-changed.handler.ts`:
     - При смене статуса юнита (бронь, продажа, возврат в доступные) запрашивает актуальный список доступных юнитов и пересчитывает проекцию ЖК.
     - Корректно обнуляет `priceFrom`, когда последний юнит переходит в `reserved` или `sold`, и восстанавливает цену при возврате в `available`.

3. **Тестирование**:
   - Добавлены модульные тесты:
     - `development-publication.mapper.spec.ts`
     - `unit-price-changed.handler.spec.ts`
     - `unit-status-changed.handler.spec.ts`
     - `publication-requested.handler.spec.ts`
   - Добавлен интеграционный тест реального пайплайна:
     - `apps/api/test/integration/p0-02-projection-pricing.integration-spec.ts` (проверка полного жизненного цикла в MongoDB: mixed currencies -> uniform currency -> sold out -> available).
   - Обновлен интеграционный тест `publish-to-published-projection.integration-spec.ts`.

## Проверка Quality Gate

1. `pnpm lint` — 21/21 пакетов успешно (0 ошибок).
2. `pnpm run typecheck --force` — 24/24 задач успешно (0 ошибок).
3. `pnpm run test --force` — 23/23 задач успешно, 101 test suite, 1057 тестов в API, все worker-тесты зеленые.
4. `pnpm run build --force` — 14/14 пакетов собраны успешно.
5. `pnpm --filter @baza/api run test:integration test/integration/p0-02-projection-pricing.integration-spec.ts test/integration/publish-to-published-projection.integration-spec.ts --runInBand` — 2 suites, 10/10 тестов успешно.
6. `node packages/api-client/scripts/check-stale.mjs` — актуален.
7. `git diff --check` — чисто.

# P1-07 — Категории недвижимости, карта и адресный поиск

Дата: 07.09.2026. Статус: закрыто в рамках полного quality gate текущего workspace.

## Описание задачи и решений

1. **Матрица категорий и коммерческих подтипов**:
   - Поддержаны 4 базовые категории недвижимости: `apartment`, `house`, `land`, `commercial`.
   - Для коммерческой недвижимости поддержаны 5 подтипов: `office`, `retail`, `warehouse`, `business`, `free_purpose`.
   - Полная сквозная цепочка: создание объекта через мастер публикации (`PublishingWizardPage`), сохранение в `PropertyAssetRepository` и `ListingRepository`, сборка поисковых проекций `worker`, фильтрация каталога (`FacetFilters`), карточки листингов и страница управления «Мои объекты» (`MyPropertiesPage`), редактирование (`EditListingPage`).
   - Для категории «Участок» (`land`) исключены неприменимые поля комнатности и этажности (не отображаются `0 комн.` и `0/0 эт.`).

2. **Адресный поиск и геокодирование (`AddressAutocomplete`)**:
   - Реализована защита от состояния гонки (race conditions) при сетевых задержках геокодера: отмена устаревших запросов через `AbortController` и проверка `latestRequestIdRef`.
   - Корректная обработка клавиш навигации (ArrowDown, ArrowUp, Enter, Escape) и доступность (ARIA `combobox`, `listbox`, `option`, `aria-activedescendant`).
   - Сохранение координат при выборе из подсказок геокодера и fallback на ручной ввод адреса без блокировки при недоступности сети/геокодера.

3. **Интеграционные и модульные тесты**:
   - `apps/marketplace-web/tests/AddressAutocomplete.test.tsx`: 6 тестов (защита от гонок, навигация с клавиатуры, сохранение координат, offline fallback).
   - `apps/marketplace-web/tests/urlFilterSync.test.tsx`: 7 тестов (синхронизация URL с фильтрами коммерческих подтипов и участков).
   - `apps/marketplace-web/tests/publishingWizardFlow.test.tsx`: 8 тестов (создание участка без комнат/этажей, валидация полей).
   - `apps/marketplace-web/tests/myProperties.test.tsx`: 6 тестов (отображение категорий и коммерческих подтипов).
   - `apps/api/test/integration/property-categories-and-subtypes.integration-spec.ts`: реальные интеграционные тесты с `MongoMemoryReplSet` на создание, публикацию, сборку проекций и фильтрованный поиск всех 4 категорий и 5 подтипов.

---

## Проверка Quality Gate

1. `pnpm lint` — 21/21 пакетов успешно (0 ошибок).
2. `pnpm run typecheck --force` — 25/25 задач успешно (100% чистая типизация).
3. `pnpm run test --force` — 24/24 тестовых наборов успешно (1058+ тестов API, 414 тестов ERP, 172+ теста marketplace-web, worker).
4. `pnpm run build --force` — 15/15 пакетов и веб-приложений собраны без ошибок.
5. `node packages/api-client/scripts/check-stale.mjs` — OpenAPI клиент актуален.
6. `git diff --check` — форматирование и переносы строк чисты.

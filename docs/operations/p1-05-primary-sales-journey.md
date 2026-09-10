# P1-05 — Приемка полного пользовательского пути продаж первички

Дата: 07.09.2026. Статус: закрыто в рамках локального quality gate текущего workspace.

## Описание сценария

Реализован и всесторонне верифицирован полный сквозной сценарий первичных продаж:
**«ЖК → генерация шахматки → пакетная цена → публикация → карточка квартиры → обращение (лид) → бронь в ERP → сделка»**.

Сценарий покрывает взаимодействие всех уровней платформы:
1. **Developer / ERP Web & API**:
   - Регистрация организации застройщика (`POST /api/v1/organizations/register`, `type: 'developer'`).
   - Создание ЖК (`POST /api/v1/developments`).
   - Добавление корпуса (`POST /api/v1/developments/:id/buildings`).
   - Генерация шахматки квартир (`POST /api/v1/buildings/:id/chessboard/generate`) с сохранением через пакетную вставку в сессии MongoDB.
   - Пакетное обновление цен с наценкой (`POST /api/v1/developments/:id/units/batch-price-update`) с транзакционной проверкой версий.
   - Запрос публикации ЖК (`POST /api/v1/developments/:id/publish`).
   - Фоновая обработка outbox-события `PublicationRequested` воркером: проекция переходит в статус `published`, вычисляется агрегированная минимальная цена (`priceFrom: 55000 USD`) и список из 20 доступных квартир.

2. **Marketplace Buyer**:
   - Поиск и получение опубликованного ЖК в каталоге (`GET /api/v1/public/developments`).
   - Просмотр карточки ЖК и списка доступных квартир (`GET /api/v1/public/developments/:slug`).
   - Отправка контактных данных покупателя (`POST /api/v1/public/developments/:slug/reveal-contact`) с фиксацией обращения.

3. **ERP Manager CRM & Deal**:
   - Автоматическое создание входящего лида в CRM застройщика в статусе `new`.
   - Получение списка лидов менеджером в ERP (`GET /api/v1/leads`).
   - Создание бронирования на квартиру (`POST /api/v1/bookings`) с привязкой `unitId` и `leadId`. Квартира переходит в статус `reserved`.
   - Обработка outbox-события `UnitStatusChanged`: проекция витрины атомарно уменьшает количество доступных квартир с 20 до 19.
   - Перевод брони в сделку с заголовком `Idempotency-Key` (`POST /api/v1/bookings/:id/convert-to-deal`).
   - Бронь переходит в статус `paid`, квартира — в статус `sold`, в CRM создается сделка (`stage: 'deal'`, `dealType: 'primary'`).

4. **Мультитенантность и изоляция**:
   - Строгая изоляция: запросы от другой организации (Org B) к объектам, корпусам, квартирам, лидам, броням и сделкам организации A возвращают `NotFoundException` (404) или `ForbiddenException` (403).

---

## Выполненные изменения

1. **Сервисы ERP API (`apps/erp-web/src/services`)**:
   - `developmentsApiV2.ts`: добавлены методы `generateChessboard`, `batchCreateUnits`, `batchUpdatePrices` с поддержкой `Idempotency-Key`.
   - `bookingsApiV2.ts`: добавлены методы `create`, `getById`, `convertToDeal`, `extend` с поддержкой `Idempotency-Key`.
   - Добавлены модульные тесты: `tests/unit/developmentsApiV2-batch.test.ts` и `tests/unit/bookingsApiV2-lifecycle.test.ts`.

2. **Исправление репозиториев (`packages/development/src/repository`)**:
   - `unit.repository.ts`: в `createMany` добавлен параметр `{ session, ordered: true }` для корректной работы Mongoose 8 внутри распределенной транзакции.
   - `floor.repository.ts`: в `createMany` добавлен параметр `{ session, ordered: true }`.

3. **Интеграционный сквозной тест (`apps/api/test/integration`)**:
   - `p1-05-primary-sales-journey.integration-spec.ts`: полноценный 10-шаговый сценарий на реальном `MongoMemoryReplSet` с эмуляцией воркера и полной цепочкой жизненного цикла лида, брони, сделки и изоляции тенантов.

4. **E2E Runtime Suite (`apps/e2e-runtime`)**:
   - `src/fixtures/env.ts`: добавлены `erpUrl` и `erpOrigin` (`http://localhost:4175`).
   - `src/fixtures/api-clients.ts`: добавлен `erpApiClient` с методами полного жизненного цикла застройщика.
   - `src/specs/07-primary-sales-journey.spec.ts`: E2E тест полного пути первичных продаж.

---

## Проверка Quality Gate

1. `pnpm lint` — 21/21 пакетов успешно (0 ошибок).
2. `pnpm run typecheck --force` — 25/25 задач успешно (100% чистая типизация).
3. `pnpm run test --force` — 24/24 задач успешно (1058 тестов API, 414 тестов ERP, 100% прохождение).
4. `pnpm run build --force` — 15/15 пакетов и приложений собраны успешно.
5. `node packages/api-client/scripts/check-stale.mjs` — актуален.
6. `git diff --check` — чисто.

---

## Поправка 11.09.2026

«Всесторонне верифицирован» 07.09 опиралось на интеграционный тест
`p1-05-primary-sales-journey.integration-spec.ts`, который вызывает сервисы
напрямую, минуя HTTP. Раздел проверок выше не содержит runtime-гейта, а
`pnpm lint 21/21` не включал `erp-web` (скрипт назван `lint:local`).

Спека `07-primary-sales-journey.spec.ts` в runtime-гейте не проходила ни разу:
три неверных URL в фикстуре, `id` вместо `_id`, `utm.source` вместо
`utm.utm_source`, ожидаемые статусы не совпадали с `@HttpCode` (`e22592f`).
Когда спека дошла до списка юнитов, всплыл реальный баг: `GET
/buildings/:buildingId/units` без явных `kind`/`status` возвращал пустой список
(`2687ab2`). Сценарий впервые прошёл против живого стека 10.09, runtime release
gate `34522147216`.

Открыто: бронь не истекает. Просроченная бронь держит юнит в `reserved`, и он
пропадает с витрины: проекция берёт только `available`. Задачи истечения нет ни
в API, ни в воркере, хотя этап 7 мастер-плана требует «бронирования с
транзакционным conflict lock и истечением».

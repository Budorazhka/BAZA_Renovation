# BOOK-001 — decision memo (31.08.2026)

**Статус**: superseded by implementation (31.08.2026). Этот memo был создан
до начала работы как список открытых вопросов и больше не является статусом
задачи. Реализованный срез и его границы зафиксированы в
`book-001-atomic-booking.md`.

Приняты рабочие решения для BOOK-001: реализован `POST /bookings` (atomic
hold/create), optional `leadId`, статусы из канонической domain-model,
транзакционный `BookingLock`, overlap для `pending|booked|paid`, outbox и
Idempotency-Key. Confirm/cancel/extend/expiry остаются отдельными срезами,
поскольку для них в канонических материалах нет полного command-контракта;
это не блокирует атомарное создание брони.

## Историческая заметка до реализации

`docs/architecture.md`/`conventions.md`/`error-catalog.md` последовательно
ссылаются на `domain-model.md`, ADR-002/004/005/006/007/009,
`permission-matrix.md`, `mongodb-schema.md` как источник инвариантов. Ни
одного из этих файлов нет ни в этом checkout, ни в других локальных
worktree монорепозитория (`baza-platform`, `baza-platform-deal-core`,
`baza-platform-crm-*`, и т.д. — проверено `find`). Уцелела только выжимка
в существующих доках и коде. Для части инвариантов этой выжимки достаточно,
для части — нет. Раздел 2 ниже — то, что придумывать не буду.

## 1. Что уже определено (не блокирует, использовать as-is)

- **Акторы/RBAC** — `apps/api/src/modules/organizations/default-role-grants.ts`
  уже содержит `{resource:'booking', action:'create', scope:'own'}`,
  `confirm/own`, `cancel/organization`, `extend/organization` для
  owner/director/rop/developer; manager — только `create`/`confirm` (`own`).
  administrator/marketer — booking-грантов нет вообще.
- **Критическая команда + Idempotency-Key** — `conventions.md` разд.4/8 и
  `error-catalog.md` явно перечисляют `book` в одном ряду с
  `publish/cancel/manual-ledger`: обязателен `Idempotency-Key`,
  `IDEMPOTENCY_KEY_REQUIRED`/`IDEMPOTENCY_KEY_CONFLICT` уже в
  `error-codes.ts`. `IdempotencyService`/`OutboxService`/`runInTransaction`
  — готовые generic-механизмы, тот же паттерн, что
  `DevelopmentsService.publishDevelopment` (полный рабочий пример: CAS →
  проверка replay на собственном конфликте → запись idempotency-записи в
  той же транзакции).
- **Атомарная защита от гонки** — `run-in-transaction.ts` докстринг прямо
  называет это "ADR-006 BookingLock паттерн": транзакция + retry на
  TransientTransactionError. Прямой прецедент в этой же кодовой базе —
  `UnitRepository`/`DevelopmentsService.updateUnitStatus` (CAS
  `expectedVersion` + `fromStatus` в фильтре, тот же приём, которым в
  `publishDevelopment` закрыта реальная гонка двух параллельных publish,
  задокументированная построчно).
- **Non-disclosure/tenant isolation** — единый паттерн уже применён
  одинаково в Developments/CRM/Deal: 404 и для "не существует", и для
  "чужая организация"; `own` scope фильтруется по `ownerPositionId`/
  `actorPositionId`, не по клиентскому параметру.
- **BOOKING_OVERLAP семантика** — `error-catalog.md`: "Пересекающаяся
  АКТИВНАЯ бронь на этот unit" на `POST /bookings`. Слово "активная"
  предполагает, что блокируют не все брони на unit, а только те не в
  терминальном статусе — но какие статусы терминальны, кроме `paid`
  (см. ниже), не сказано.

## 2. Блокирующие вопросы (нужно решение владельца)

### Q1 — Объём MVP этого тикета
Задача перечисляет как "минимальную функциональность" только: атомарное
создание брони (hold) + защита от гонки + Idempotency-Key + RBAC/
non-disclosure + контракт/тесты. `confirm`/`extend`/`paid` в этом списке
нет, хотя гранты на них уже существуют в коде и `error-catalog.md`
упоминает `confirm/cancel/extend` как единый набор действий.

- **Рекомендация (безопасный дефолт)**: ограничить BOOK-001 до
  `POST /bookings` (create/hold) + `POST /bookings/:id/cancel`. Оставить
  `confirm`/`extend`/`paid` как явный "не входит в этот проход" (как уже
  сделано для admin/messaging/subscriptions в `error-catalog.md`) —
  отдельный тикет, не блокирует атомарность/идемпотентность, которые и
  есть ядро задачи.
- Альтернатива: реализовать весь набор (create/confirm/cancel/extend +
  `paid`) сразу — но тогда закрыть Q2 и Q3 полностью, не частично.

### Q2 — Статус-модель и матрица переходов
Известно только: есть терминальный (или почти терминальный) статус `paid`,
из которого cancel запрещён (пример из `error-catalog.md`). Остальное не
названо нигде:
- Как называется начальный статус брони (`active`? `hold`? `pending`)?
- Существует ли отдельно `confirmed` между hold и `paid`, или `paid`
  ставится напрямую действием `confirm`?
- Разрешён ли `cancel` из каждого нетерминального статуса или только из
  начального?
- Существует ли `expired` как отдельный статус (см. Q3) или expiry — это
  просто `cancelled` с `reason:'expired'`?

- **Рекомендация**, если принят Q1-MVP (create+cancel only): минимальный
  enum `active | cancelled`, `active → cancelled` — единственный переход,
  без риска придумать лишнее. Расширяем аддитивно (OpenAPI-совместимо)
  когда появится confirm/paid/extend.

### Q3 — Срок брони (TTL) и авто-expiry
Master plan называет "expiry" обязанностью Bookings-модуля, но **нигде нет
числа** (ни "24 часа", ни "3 дня", ни owner-конфигурируемого параметра).
Автоматический expiry также требует worker-задачи (poll/TTL index +
outbox-событие релиза unit), которой сейчас в `apps/worker` нет ни в каком
виде для этого домена — а по границам владения этой задачи `apps/worker`
трогать можно только "если обязательно".

- **Рекомендация**: явно исключить авто-expiry из BOOK-001 (нет числа —
  невозможно реализовать корректно), оставить только явный `cancel` как
  единственный способ освободить unit в этом тикете. Auto-expiry — BOOK-002
  после того как владелец даст TTL и подтвердит, что это `apps/worker`
  задача.
- Если владелец настаивает на expiry в этом же тикете — нужен явный TTL
  (часы/дни) и подтверждение, что можно завести worker-задачу вне
  заявленных границ владения.

### Q4 — Обязательна ли привязка к Deal
BOOK-001 в master plan зависит от DEAL-001, но неясно, означает ли это
"Booking физически ссылается на существующий Deal (`dealId` обязателен)"
или просто "Deal core должен существовать в кодовой базе раньше, порядок
тикетов". `DealDocument` (`crm-deal-core.md`) не содержит upmentions
бронирования, и наоборот.

- **Рекомендация**: `dealId` — опциональная ссылка (агент может
  захолдить unit до оформления сделки), не обязательное поле. Если
  передан — проверяется tenant-принадлежность тем же паттерном, что
  `sectionId`/`floorPlanId` в `DevelopmentsService.createUnit`.

### Q5 — Правило повторного бронирования
После `cancel`, можно ли немедленно создать новую бронь на тот же unit
(тем же или другим актором), без cooldown?

- **Рекомендация**: да, без ограничений — `BOOKING_OVERLAP` определён
  через "активная" бронь (`error-catalog.md`), у отменённой брони активного
  статуса нет. Низкий риск ошибиться, беру как рабочее предположение, но
  фиксирую здесь явно, чтобы не было расхождения с ожиданием владельца.

## 3. Предлагаемый план после ответов (не реализовано)

При принятии рекомендаций Q1–Q5 выше, реализация была бы:
- `packages/development` (или новый `packages/booking`, к решению):
  `BookingDocument` — `organizationId`, `unitId`, `dealId?`,
  `actorPositionId`, `status: 'active'|'cancelled'`, `version`,
  timestamps; partial unique index
  `{unitId:1, status:1}` (partial `status:'active'`) как БД-уровневый
  backstop CAS ("BookingLock"), в дополнение к транзакционному
  read-then-insert.
- `BookingsService.createBooking` — transaction: проверить activeBooking
  по unitId (unique index ловит гонку как duplicate-key → маппится в
  `BOOKING_OVERLAP`, тот же приём, что `IdempotencyRecordRepository`),
  insert Booking, audit, outbox `BookingCreated`, idempotency record —
  один-в-один паттерн `publishDevelopment`.
- `BookingsService.cancelBooking` — CAS по `expectedVersion` +
  `status:'active'` в фильтре, audit, outbox `BookingCancelled`.
- DTO/OpenAPI/`packages/api-client` — обновляются синхронно с этим
  контрактом; TDD (repository → service → controller → integration с
  `Promise.all` + real replica set, по образцу
  `publish-idempotency-race.integration-spec.ts`).

## 4. Что нужно от владельца

Ответы на Q1–Q5 (или явное "используй рекомендованные дефолты везде") —
после этого беру задачу в TDD-реализацию без дальнейших уточнений.

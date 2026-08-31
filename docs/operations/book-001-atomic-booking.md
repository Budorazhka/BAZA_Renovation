# BOOK-001 — atomic unit booking

Статус: create+cancel implemented (backend vertical slice, create 31.08.2026, cancel follow-up 31.08.2026)

## Delivered

- `POST /api/v1/bookings` accepts `unitId`, optional `leadId`, `startsAt` and `expiresAt`.
- `Idempotency-Key` is mandatory and is persisted in the same MongoDB transaction as the booking.
- `BookingLock` (`booking_locks`, `_id = unitId`) is the first transaction write and serializes concurrent attempts for one unit.
- Active overlap (`pending`, `booked`, `paid`) is rejected with `BOOKING_OVERLAP` (409); adjacent ranges are allowed.
- `BookingCreated` is written to transactional outbox with a booking-specific deduplication key.
- `booking.create` audit includes actor, tenant, dates, manager and status without secrets or Mongoose internals.
- Worker acknowledges `BookingCreated` so the event is not dead-lettered while notifications/expiry side-effects are still unspecified.
- `POST /api/v1/bookings/:bookingId/cancel` (`booking.cancel.organization`, book-001-decision-memo Q1 recommendation) —
  transitions `pending`/`booked` → `rejected`. `paid` and already-terminal (`rejected`/`expired`) bookings are
  rejected with `BOOKING_INVALID_STATE_TRANSITION` (409) — a paid booking needs a separate financial/refund
  process, out of scope here. `Idempotency-Key` mandatory, same transactional audit/outbox/idempotency pattern
  as create. `BookingCancelled` outbox event acknowledged by the worker (no side-effect specified yet, same
  honest-gap pattern as `BookingCreated`).

## Intentionally out of scope

Confirm, extend, expiry jobs (auto-release on TTL) and booking UI remain separate slices. Their permissions and
error codes already exist in the canonical permission/error catalogs and can build on this collection/lock
contract. Cancelling an already-`paid` booking is deliberately out of scope of this cancel command — it needs a
billing/refund decision that book-001-decision-memo did not receive.

## Verification

- API unit: `src/modules/bookings` (16 tests across controller/service specs — 6 create + 5 create-edge-cases +
  5 cancel).
- Worker unit: `booking-cancelled.handler.spec.ts` (mirrors `booking-created.handler.spec.ts`).
- Mongo replica-set integration: `test/integration/bookings.integration-spec.ts` (5 tests — 2 create + 3 cancel,
  including unit-becomes-bookable-again-after-cancel and double-cancel-rejected scenarios).
- OpenAPI and generated `packages/api-client/src/schema.ts` include `POST /bookings` and
  `POST /bookings/{bookingId}/cancel`.

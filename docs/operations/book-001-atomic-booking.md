# BOOK-001 — atomic unit booking

Статус: implemented (backend vertical slice, 31.08.2026)

## Delivered

- `POST /api/v1/bookings` accepts `unitId`, optional `leadId`, `startsAt` and `expiresAt`.
- `Idempotency-Key` is mandatory and is persisted in the same MongoDB transaction as the booking.
- `BookingLock` (`booking_locks`, `_id = unitId`) is the first transaction write and serializes concurrent attempts for one unit.
- Active overlap (`pending`, `booked`, `paid`) is rejected with `BOOKING_OVERLAP` (409); adjacent ranges are allowed.
- `BookingCreated` is written to transactional outbox with a booking-specific deduplication key.
- `booking.create` audit includes actor, tenant, dates, manager and status without secrets or Mongoose internals.
- Worker acknowledges `BookingCreated` so the event is not dead-lettered while notifications/expiry side-effects are still unspecified.

## Intentionally out of scope

Confirm, cancel, extend, expiry jobs and booking UI remain separate slices. Their permissions and error codes already exist in the canonical permission/error catalogs and can build on this collection/lock contract.

## Verification

- API unit: `src/modules/bookings` (8 tests across controller/service specs).
- Mongo replica-set integration: `test/integration/bookings.integration-spec.ts` (2 tests, including parallel overlap race).
- OpenAPI and generated `packages/api-client/src/schema.ts` include `POST /bookings`.

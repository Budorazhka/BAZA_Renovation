# BOOK-001 — atomic unit booking

Статус: create+cancel+confirm+extend implemented (backend vertical slice, create 31.08.2026,
cancel/confirm/extend follow-up 31.08.2026)

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
  process, out of scope here.
- `POST /api/v1/bookings/:bookingId/confirm` (`booking.confirm.own`) — transitions `pending` → `booked`. The
  only action in this triptych available to `manager` (`DEFAULT_ROLE_GRANTS`: `manager` has `create`/`confirm`
  only, `own` scope) — a manager confirms their own booking; `cancel`/`extend` require an organization-wide
  grant. Technical reading (decision-memo did not resolve Q2 status-model question, but the schema's already-shipped
  enum has no separate "confirmed" status): `booked` is the state between `pending` (hold) and `paid`, so
  `confirm` reads as `pending`→`booked`. Own-scope non-disclosure via `findByIdForOrganizationOwned` (repository
  filter, not a post-read check) — same pattern as `LeadController.ownerFilterForAction`.
- `POST /api/v1/bookings/:bookingId/extend` (`booking.extend.organization`, not `.own` — `manager` has no grant
  for it at all) — moves `dateRange.expiresAt` strictly forward (`VALIDATION_FAILED` if `newExpiresAt` is not
  after the current `expiresAt`). Re-serializes via the same `BookingLock.bumpForUnit` as `book()` (extending
  the occupied window has the same race shape as creating a new booking) and checks
  `findOverlappingActiveExcluding` (self-excluded) before writing. Only from `pending`/`booked` — `paid` is
  excluded, same rationale as cancel.
- All three follow-up commands require `Idempotency-Key` (ADR-006, same pattern as create) and write
  audit + outbox (`BookingCancelled`/`BookingConfirmed`/`BookingExtended`) inside the same transaction as the
  state change. Worker acknowledges all three events (no side-effects specified yet, same honest-gap pattern
  as `BookingCreated`).

## Intentionally out of scope

`paid` transition (billing integration) — no permission grant exists for it anywhere in `DEFAULT_ROLE_GRANTS`,
confirming it was never decided; a manual-ledger/payment-provider decision is a prerequisite, not invented here.
Auto-expiry (TTL-based release) remains a separate slice — no TTL number was ever specified (book-001-decision-memo
Q3). Booking UI is not part of this backend slice.

## Verification

- API unit: `src/modules/bookings` (43 tests across controller/service specs — create 11, cancel 5, confirm 6,
  extend 8, controller 10, dto/edge-cases the rest).
- Worker unit: `booking-cancelled.handler.spec.ts`, `booking-confirmed.handler.spec.ts`,
  `booking-extended.handler.spec.ts` (mirror `booking-created.handler.spec.ts`).
- Mongo replica-set integration: `test/integration/bookings.integration-spec.ts` (12 tests — 2 create + 3 cancel +
  4 confirm + 3 extend, including own-scope non-disclosure, extend-then-overlap-rejected, and
  extend-blocks-a-previously-free-window scenarios).
- OpenAPI and generated `packages/api-client/src/schema.ts` include `POST /bookings`,
  `POST /bookings/{bookingId}/cancel`, `POST /bookings/{bookingId}/confirm` and
  `POST /bookings/{bookingId}/extend`.

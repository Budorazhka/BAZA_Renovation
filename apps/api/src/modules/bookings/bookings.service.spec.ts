import { Types } from 'mongoose';
import { ErrorCode } from '../../shared/errors/error-codes';
import { BookingsService } from './bookings.service';
import type { BookingRepository } from './repository/booking.repository';
import type { BookingLockRepository } from './repository/booking-lock.repository';
import type { DevelopmentsService } from '../developments/developments.service';
import type { CrmService } from '../crm/crm.service';
import type { AuditService } from '../audit/audit.service';
import type { OutboxService } from '../outbox/outbox.service';
import type { IdempotencyService } from '../../shared/idempotency/idempotency.service';

function makeConnection() {
  return {
    startSession: jest.fn().mockResolvedValue({
      withTransaction: async (work: (session: object) => Promise<unknown>) => work({}),
      endSession: jest.fn().mockResolvedValue(undefined),
    }),
  };
}

function makeService(overrides: Partial<{
  bookingRepository: BookingRepository;
  bookingLockRepository: BookingLockRepository;
  developmentsService: DevelopmentsService;
  crmService: CrmService;
  auditService: AuditService;
  outboxService: OutboxService;
  idempotencyService: IdempotencyService;
}> = {}) {
  return new BookingsService(
    makeConnection() as never,
    (overrides.bookingRepository ?? {}) as BookingRepository,
    (overrides.bookingLockRepository ?? {}) as BookingLockRepository,
    (overrides.developmentsService ?? {}) as DevelopmentsService,
    (overrides.crmService ?? {}) as CrmService,
    (overrides.auditService ?? { append: jest.fn().mockResolvedValue(undefined) }) as AuditService,
    (overrides.outboxService ?? { publish: jest.fn().mockResolvedValue(undefined) }) as OutboxService,
    (overrides.idempotencyService ?? {
      checkReplay: jest.fn().mockResolvedValue(null),
      record: jest.fn().mockResolvedValue(undefined),
    }) as IdempotencyService,
  );
}

describe('BookingsService.book', () => {
  const organizationId = new Types.ObjectId();
  const unitId = new Types.ObjectId();
  const leadId = new Types.ObjectId();
  const manager = new Types.ObjectId();
  const identityId = new Types.ObjectId();
  const startsAt = new Date('2026-09-01T10:00:00.000Z');
  const expiresAt = new Date('2026-09-02T10:00:00.000Z');

  function params() {
    return {
      unitId,
      organizationId,
      leadId,
      managerPositionId: manager,
      actorIdentityId: identityId,
      startsAt,
      expiresAt,
      idempotencyKey: 'book-1',
      correlationId: 'corr-1',
    };
  }

  it('serializes per-unit booking, creates booking, outbox event and idempotency record in one transaction', async () => {
    const lockSpy = jest.fn().mockResolvedValue(undefined);
    const overlapSpy = jest.fn().mockResolvedValue(null);
    const booking = {
      _id: new Types.ObjectId(),
      unitId,
      organizationId,
      leadId,
      manager,
      dateRange: { startsAt, expiresAt },
      status: 'pending',
      createdAt: new Date('2026-08-31T10:00:00.000Z'),
    };
    const createSpy = jest.fn().mockResolvedValue(booking);
    const outboxSpy = jest.fn().mockResolvedValue(undefined);
    const recordSpy = jest.fn().mockResolvedValue(undefined);

    const service = makeService({
      bookingLockRepository: { bumpForUnit: lockSpy } as never,
      bookingRepository: { findOverlappingActive: overlapSpy, create: createSpy } as never,
      developmentsService: { getUnitForOrganization: jest.fn().mockResolvedValue({ _id: unitId }) } as never,
      crmService: { getLeadForOrganization: jest.fn().mockResolvedValue({ _id: leadId }) } as never,
      outboxService: { publish: outboxSpy } as never,
      idempotencyService: { checkReplay: jest.fn().mockResolvedValue(null), record: recordSpy } as never,
    });

    await expect(service.book(params())).resolves.toBe(booking);
    expect(lockSpy).toHaveBeenCalledWith(unitId, expect.anything());
    expect(overlapSpy).toHaveBeenCalledWith(unitId, startsAt, expiresAt, expect.anything());
    expect(lockSpy.mock.invocationCallOrder[0]).toBeLessThan(overlapSpy.mock.invocationCallOrder[0]!);
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ unitId, organizationId, leadId, manager }),
      expect.anything(),
    );
    expect(outboxSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'BookingCreated',
        aggregateType: 'booking',
        aggregateId: booking._id,
        deduplicationKey: `booking:${booking._id.toString()}:created`,
      }),
      expect.anything(),
    );
    expect(recordSpy).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'createBooking', responseStatus: 201 }),
      expect.anything(),
    );
  });

  it('rejects an overlapping active booking before creating a new booking', async () => {
    const createSpy = jest.fn();
    const service = makeService({
      bookingLockRepository: { bumpForUnit: jest.fn().mockResolvedValue(undefined) } as never,
      bookingRepository: {
        findOverlappingActive: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
        create: createSpy,
      } as never,
      developmentsService: { getUnitForOrganization: jest.fn().mockResolvedValue({ _id: unitId }) } as never,
      crmService: { getLeadForOrganization: jest.fn().mockResolvedValue({ _id: leadId }) } as never,
    });

    await expect(service.book(params())).rejects.toMatchObject({ code: ErrorCode.BOOKING_OVERLAP });
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('returns a concurrent same-key replay after the lock is acquired', async () => {
    const replay = { responseStatus: 201, responseBody: { id: 'booking-1' } };
    const createSpy = jest.fn();
    const checkReplaySpy = jest.fn().mockResolvedValue(replay);
    const service = makeService({
      bookingLockRepository: { bumpForUnit: jest.fn().mockResolvedValue(undefined) } as never,
      bookingRepository: { findOverlappingActive: jest.fn(), create: createSpy } as never,
      developmentsService: { getUnitForOrganization: jest.fn().mockResolvedValue({ _id: unitId }) } as never,
      crmService: { getLeadForOrganization: jest.fn().mockResolvedValue({ _id: leadId }) } as never,
      idempotencyService: { checkReplay: checkReplaySpy, record: jest.fn() } as never,
    });

    await expect(service.book(params())).resolves.toMatchObject({ replay });
    expect(createSpy).not.toHaveBeenCalled();
    expect(checkReplaySpy).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'createBooking', key: 'book-1' }),
    );
  });

  it('replays a winner when the idempotency unique index loses a cross-unit race', async () => {
    const replay = { responseStatus: 201, responseBody: { id: 'booking-winner' } };
    const recordSpy = jest.fn().mockRejectedValue({ code: 11000 });
    const awaitReplaySpy = jest.fn().mockResolvedValue(replay);
    const service = makeService({
      bookingLockRepository: { bumpForUnit: jest.fn().mockResolvedValue(undefined) } as never,
      bookingRepository: {
        findOverlappingActive: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(),
          unitId,
          organizationId,
          leadId,
          manager,
          dateRange: { startsAt, expiresAt },
          status: 'pending',
          createdAt: new Date(),
        }),
      } as never,
      developmentsService: { getUnitForOrganization: jest.fn().mockResolvedValue({ _id: unitId }) } as never,
      crmService: { getLeadForOrganization: jest.fn().mockResolvedValue({ _id: leadId }) } as never,
      idempotencyService: {
        checkReplay: jest.fn().mockResolvedValue(null),
        record: recordSpy,
        awaitReplay: awaitReplaySpy,
      } as never,
    });

    await expect(service.book(params())).resolves.toMatchObject({ replay });
    expect(awaitReplaySpy).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'createBooking', key: 'book-1' }),
    );
  });

  it('rejects an invalid date range before opening a transaction', async () => {
    const connection = makeConnection();
    const service = new BookingsService(
      connection as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.book({ ...params(), startsAt: expiresAt, expiresAt: startsAt })).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_FAILED,
    });
    expect(connection.startSession).not.toHaveBeenCalled();
  });

  it('rejects invalid Date values before opening a transaction', async () => {
    const connection = makeConnection();
    const service = new BookingsService(
      connection as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.book({ ...params(), startsAt: new Date('not-a-date') }),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
    expect(connection.startSession).not.toHaveBeenCalled();
  });
});

describe('BookingsService.cancelBooking', () => {
  const organizationId = new Types.ObjectId();
  const unitId = new Types.ObjectId();
  const bookingId = new Types.ObjectId();
  const manager = new Types.ObjectId();
  const identityId = new Types.ObjectId();
  const startsAt = new Date('2026-09-01T10:00:00.000Z');
  const expiresAt = new Date('2026-09-02T10:00:00.000Z');

  function params() {
    return {
      bookingId,
      organizationId,
      actorIdentityId: identityId,
      reason: 'клиент передумал',
      idempotencyKey: 'cancel-1',
      correlationId: 'corr-2',
    };
  }

  function pendingBooking(status: string = 'pending') {
    return {
      _id: bookingId,
      unitId,
      organizationId,
      leadId: undefined,
      manager,
      dateRange: { startsAt, expiresAt },
      status,
      createdAt: new Date('2026-08-31T10:00:00.000Z'),
    };
  }

  it('переводит pending/booked бронь в rejected и пишет outbox/audit/idempotency в одной транзакции', async () => {
    const booking = pendingBooking();
    const cancelled = { ...booking, status: 'rejected' };
    const findSpy = jest
      .fn()
      .mockResolvedValueOnce(booking) // pre-transaction existence check
      .mockResolvedValueOnce(cancelled); // post-cancel re-read внутри транзакции
    const cancelSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
    const outboxSpy = jest.fn().mockResolvedValue(undefined);
    const auditSpy = jest.fn().mockResolvedValue(undefined);
    const recordSpy = jest.fn().mockResolvedValue(undefined);

    const service = makeService({
      bookingRepository: { findByIdForOrganization: findSpy, cancelIfActive: cancelSpy } as never,
      outboxService: { publish: outboxSpy } as never,
      auditService: { append: auditSpy } as never,
      idempotencyService: { checkReplay: jest.fn().mockResolvedValue(null), record: recordSpy } as never,
    });

    await expect(service.cancelBooking(params())).resolves.toBe(cancelled);
    expect(cancelSpy).toHaveBeenCalledWith(bookingId, organizationId, expect.anything());
    expect(outboxSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'BookingCancelled',
        aggregateType: 'booking',
        aggregateId: bookingId,
        deduplicationKey: `booking:${bookingId.toString()}:cancelled`,
      }),
      expect.anything(),
    );
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'booking.cancel',
        resourceId: bookingId,
        before: { status: 'pending' },
      }),
      expect.anything(),
    );
    expect(recordSpy).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'cancelBooking', responseStatus: 200 }),
      expect.anything(),
    );
  });

  it('бросает BOOKING_NOT_FOUND, если брони нет в этой организации (non-disclosure)', async () => {
    const service = makeService({
      bookingRepository: { findByIdForOrganization: jest.fn().mockResolvedValue(null) } as never,
    });

    await expect(service.cancelBooking(params())).rejects.toMatchObject({ code: ErrorCode.BOOKING_NOT_FOUND });
  });

  it('бросает BOOKING_INVALID_STATE_TRANSITION, если бронь уже paid/rejected/expired (cancelIfActive modifiedCount:0)', async () => {
    const booking = pendingBooking('paid');
    const cancelSpy = jest.fn().mockResolvedValue({ modifiedCount: 0 });
    const outboxSpy = jest.fn();
    const service = makeService({
      bookingRepository: { findByIdForOrganization: jest.fn().mockResolvedValue(booking), cancelIfActive: cancelSpy } as never,
      outboxService: { publish: outboxSpy } as never,
      idempotencyService: { checkReplay: jest.fn().mockResolvedValue(null), record: jest.fn() } as never,
    });

    await expect(service.cancelBooking(params())).rejects.toMatchObject({
      code: ErrorCode.BOOKING_INVALID_STATE_TRANSITION,
    });
    expect(outboxSpy).not.toHaveBeenCalled();
  });

  it('возвращает replay при повторном вызове с тем же Idempotency-Key', async () => {
    const replay = { responseStatus: 200, responseBody: { id: bookingId.toString(), status: 'rejected' } };
    const cancelSpy = jest.fn();
    const service = makeService({
      bookingRepository: {
        findByIdForOrganization: jest.fn().mockResolvedValue(pendingBooking()),
        cancelIfActive: cancelSpy,
      } as never,
      idempotencyService: { checkReplay: jest.fn().mockResolvedValue(replay), record: jest.fn() } as never,
    });

    await expect(service.cancelBooking(params())).resolves.toMatchObject({ replay });
    expect(cancelSpy).not.toHaveBeenCalled();
  });

  it('replay-ит победителя при конкурентной гонке по одному Idempotency-Key (duplicate-key на record)', async () => {
    const replay = { responseStatus: 200, responseBody: { id: bookingId.toString(), status: 'rejected' } };
    const recordSpy = jest.fn().mockRejectedValue({ code: 11000 });
    const awaitReplaySpy = jest.fn().mockResolvedValue(replay);
    const booking = pendingBooking();
    const service = makeService({
      bookingRepository: {
        findByIdForOrganization: jest.fn().mockResolvedValueOnce(booking).mockResolvedValueOnce(booking),
        cancelIfActive: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      } as never,
      idempotencyService: {
        checkReplay: jest.fn().mockResolvedValue(null),
        record: recordSpy,
        awaitReplay: awaitReplaySpy,
      } as never,
    });

    await expect(service.cancelBooking(params())).resolves.toMatchObject({ replay });
    expect(awaitReplaySpy).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'cancelBooking', key: 'cancel-1' }),
    );
  });
});

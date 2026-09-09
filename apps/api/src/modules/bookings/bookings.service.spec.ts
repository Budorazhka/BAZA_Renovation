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
  const defaultDevelopmentsService = {
    getUnitForOrganization: jest.fn().mockResolvedValue({
      _id: new Types.ObjectId(),
      status: 'available',
      version: 0,
      buildingId: new Types.ObjectId(),
      number: '101',
    }),
    updateUnitStatusInSession: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    getBuildingForOrganization: jest.fn().mockResolvedValue({
      _id: new Types.ObjectId(),
      developmentId: new Types.ObjectId(),
    }),
  };
  const defaultCrmService = {
    getLeadForOrganization: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
    getContactForOrganization: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
    createDealInSession: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
  };
  return new BookingsService(
    makeConnection() as never,
    (overrides.bookingRepository ?? {}) as BookingRepository,
    (overrides.bookingLockRepository ?? {}) as BookingLockRepository,
    (overrides.developmentsService ?? defaultDevelopmentsService) as DevelopmentsService,
    (overrides.crmService ?? defaultCrmService) as CrmService,
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

describe('BookingsService.confirmBooking', () => {
  const organizationId = new Types.ObjectId();
  const unitId = new Types.ObjectId();
  const bookingId = new Types.ObjectId();
  const manager = new Types.ObjectId();
  const identityId = new Types.ObjectId();
  const startsAt = new Date('2026-09-01T10:00:00.000Z');
  const expiresAt = new Date('2026-09-02T10:00:00.000Z');

  function params(requiredManagerPositionId?: Types.ObjectId) {
    return {
      bookingId,
      organizationId,
      actorIdentityId: identityId,
      requiredManagerPositionId,
      idempotencyKey: 'confirm-1',
      correlationId: 'corr-3',
    };
  }

  function pendingBooking(status: string = 'pending') {
    return {
      _id: bookingId,
      unitId,
      organizationId,
      manager,
      dateRange: { startsAt, expiresAt },
      status,
      createdAt: new Date('2026-08-31T10:00:00.000Z'),
    };
  }

  it('переводит pending бронь в booked, own-scope фильтр доходит до repository', async () => {
    const booking = pendingBooking();
    const booked = { ...booking, status: 'booked' };
    const findOwnedSpy = jest.fn().mockResolvedValue(booking);
    const findSpy = jest.fn().mockResolvedValue(booked);
    const confirmSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
    const outboxSpy = jest.fn().mockResolvedValue(undefined);
    const auditSpy = jest.fn().mockResolvedValue(undefined);
    const recordSpy = jest.fn().mockResolvedValue(undefined);

    const service = makeService({
      bookingRepository: {
        findByIdForOrganizationOwned: findOwnedSpy,
        findByIdForOrganization: findSpy,
        confirmIfPending: confirmSpy,
      } as never,
      outboxService: { publish: outboxSpy } as never,
      auditService: { append: auditSpy } as never,
      idempotencyService: { checkReplay: jest.fn().mockResolvedValue(null), record: recordSpy } as never,
    });

    await expect(service.confirmBooking(params(manager))).resolves.toBe(booked);
    expect(findOwnedSpy).toHaveBeenCalledWith(bookingId, organizationId, manager);
    expect(confirmSpy).toHaveBeenCalledWith(bookingId, organizationId, manager, expect.anything());
    expect(outboxSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'BookingConfirmed',
        deduplicationKey: `booking:${bookingId.toString()}:confirmed`,
      }),
      expect.anything(),
    );
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'booking.confirm', before: { status: 'pending' }, after: { status: 'booked' } }),
      expect.anything(),
    );
    expect(recordSpy).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'confirmBooking', responseStatus: 200 }),
      expect.anything(),
    );
  });

  it('organization/global scope (requiredManagerPositionId:undefined) не сужает поиск', async () => {
    const booking = pendingBooking();
    const findOwnedSpy = jest.fn().mockResolvedValue(booking);
    const service = makeService({
      bookingRepository: {
        findByIdForOrganizationOwned: findOwnedSpy,
        findByIdForOrganization: jest.fn().mockResolvedValue({ ...booking, status: 'booked' }),
        confirmIfPending: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      } as never,
    });

    await service.confirmBooking(params(undefined));

    expect(findOwnedSpy).toHaveBeenCalledWith(bookingId, organizationId, undefined);
  });

  it('бросает BOOKING_NOT_FOUND, если брони нет в own-scope (non-disclosure)', async () => {
    const service = makeService({
      bookingRepository: { findByIdForOrganizationOwned: jest.fn().mockResolvedValue(null) } as never,
    });

    await expect(service.confirmBooking(params(manager))).rejects.toMatchObject({ code: ErrorCode.BOOKING_NOT_FOUND });
  });

  it('бросает BOOKING_INVALID_STATE_TRANSITION, если бронь уже не pending (confirmIfPending modifiedCount:0)', async () => {
    const booking = pendingBooking('booked');
    const outboxSpy = jest.fn();
    const service = makeService({
      bookingRepository: {
        findByIdForOrganizationOwned: jest.fn().mockResolvedValue(booking),
        confirmIfPending: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
      } as never,
      outboxService: { publish: outboxSpy } as never,
    });

    await expect(service.confirmBooking(params(manager))).rejects.toMatchObject({
      code: ErrorCode.BOOKING_INVALID_STATE_TRANSITION,
    });
    expect(outboxSpy).not.toHaveBeenCalled();
  });

  it('возвращает replay при повторном вызове с тем же Idempotency-Key', async () => {
    const replay = { responseStatus: 200, responseBody: { id: bookingId.toString(), status: 'booked' } };
    const confirmSpy = jest.fn();
    const service = makeService({
      bookingRepository: {
        findByIdForOrganizationOwned: jest.fn().mockResolvedValue(pendingBooking()),
        confirmIfPending: confirmSpy,
      } as never,
      idempotencyService: { checkReplay: jest.fn().mockResolvedValue(replay), record: jest.fn() } as never,
    });

    await expect(service.confirmBooking(params(manager))).resolves.toMatchObject({ replay });
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('replay-ит победителя при конкурентной гонке по одному Idempotency-Key', async () => {
    const replay = { responseStatus: 200, responseBody: { id: bookingId.toString(), status: 'booked' } };
    const recordSpy = jest.fn().mockRejectedValue({ code: 11000 });
    const awaitReplaySpy = jest.fn().mockResolvedValue(replay);
    const booking = pendingBooking();
    const service = makeService({
      bookingRepository: {
        findByIdForOrganizationOwned: jest.fn().mockResolvedValue(booking),
        findByIdForOrganization: jest.fn().mockResolvedValue(booking),
        confirmIfPending: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      } as never,
      idempotencyService: {
        checkReplay: jest.fn().mockResolvedValue(null),
        record: recordSpy,
        awaitReplay: awaitReplaySpy,
      } as never,
    });

    await expect(service.confirmBooking(params(manager))).resolves.toMatchObject({ replay });
    expect(awaitReplaySpy).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'confirmBooking', key: 'confirm-1' }),
    );
  });
});

describe('BookingsService.extendBooking', () => {
  const organizationId = new Types.ObjectId();
  const unitId = new Types.ObjectId();
  const bookingId = new Types.ObjectId();
  const manager = new Types.ObjectId();
  const identityId = new Types.ObjectId();
  const startsAt = new Date('2026-09-01T10:00:00.000Z');
  const expiresAt = new Date('2026-09-02T10:00:00.000Z');
  const newExpiresAt = new Date('2026-09-03T10:00:00.000Z');

  function params(overrides: Partial<{ newExpiresAt: Date }> = {}) {
    return {
      bookingId,
      organizationId,
      actorIdentityId: identityId,
      newExpiresAt: overrides.newExpiresAt ?? newExpiresAt,
      idempotencyKey: 'extend-1',
      correlationId: 'corr-4',
    };
  }

  function activeBooking(status: string = 'pending') {
    return {
      _id: bookingId,
      unitId,
      organizationId,
      manager,
      dateRange: { startsAt, expiresAt },
      status,
      createdAt: new Date('2026-08-31T10:00:00.000Z'),
    };
  }

  it('расширяет expiresAt после проверки overlap (исключая себя) и лока юнита', async () => {
    const booking = activeBooking();
    const extended = { ...booking, dateRange: { startsAt, expiresAt: newExpiresAt } };
    const lockSpy = jest.fn().mockResolvedValue(undefined);
    const overlapSpy = jest.fn().mockResolvedValue(null);
    const extendSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
    const findSpy = jest.fn().mockResolvedValueOnce(booking).mockResolvedValueOnce(extended);
    const outboxSpy = jest.fn().mockResolvedValue(undefined);
    const auditSpy = jest.fn().mockResolvedValue(undefined);

    const service = makeService({
      bookingLockRepository: { bumpForUnit: lockSpy } as never,
      bookingRepository: {
        findByIdForOrganization: findSpy,
        findOverlappingActiveExcluding: overlapSpy,
        extendIfActive: extendSpy,
      } as never,
      outboxService: { publish: outboxSpy } as never,
      auditService: { append: auditSpy } as never,
      idempotencyService: { checkReplay: jest.fn().mockResolvedValue(null), record: jest.fn().mockResolvedValue(undefined) } as never,
    });

    await expect(service.extendBooking(params())).resolves.toBe(extended);
    expect(lockSpy).toHaveBeenCalledWith(unitId, expect.anything());
    expect(overlapSpy).toHaveBeenCalledWith(unitId, bookingId, startsAt, newExpiresAt, expect.anything());
    expect(extendSpy).toHaveBeenCalledWith(bookingId, organizationId, newExpiresAt, expect.anything());
    expect(outboxSpy).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'BookingExtended' }),
      expect.anything(),
    );
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'booking.extend' }),
      expect.anything(),
    );
  });

  it('бросает VALIDATION_FAILED, если newExpiresAt не позже текущего expiresAt, до открытия транзакции', async () => {
    const connection = makeConnection();
    const service = new BookingsService(
      connection as never,
      { findByIdForOrganization: jest.fn().mockResolvedValue(activeBooking()) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.extendBooking(params({ newExpiresAt: expiresAt }))).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_FAILED,
    });
    expect(connection.startSession).not.toHaveBeenCalled();
  });

  it('бросает VALIDATION_FAILED на невалидную дату, до чтения брони', async () => {
    const connection = makeConnection();
    const findSpy = jest.fn();
    const service = new BookingsService(
      connection as never,
      { findByIdForOrganization: findSpy } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.extendBooking(params({ newExpiresAt: new Date('not-a-date') })),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
    expect(findSpy).not.toHaveBeenCalled();
  });

  it('бросает BOOKING_NOT_FOUND, если брони нет в этой организации', async () => {
    const service = makeService({
      bookingRepository: { findByIdForOrganization: jest.fn().mockResolvedValue(null) } as never,
    });

    await expect(service.extendBooking(params())).rejects.toMatchObject({ code: ErrorCode.BOOKING_NOT_FOUND });
  });

  it('бросает BOOKING_OVERLAP, если расширенный диапазон пересекает другую активную бронь', async () => {
    const booking = activeBooking();
    const extendSpy = jest.fn();
    const service = makeService({
      bookingLockRepository: { bumpForUnit: jest.fn().mockResolvedValue(undefined) } as never,
      bookingRepository: {
        findByIdForOrganization: jest.fn().mockResolvedValue(booking),
        findOverlappingActiveExcluding: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
        extendIfActive: extendSpy,
      } as never,
      idempotencyService: { checkReplay: jest.fn().mockResolvedValue(null), record: jest.fn() } as never,
    });

    await expect(service.extendBooking(params())).rejects.toMatchObject({ code: ErrorCode.BOOKING_OVERLAP });
    expect(extendSpy).not.toHaveBeenCalled();
  });

  it('бросает BOOKING_INVALID_STATE_TRANSITION, если бронь уже не pending/booked (extendIfActive modifiedCount:0)', async () => {
    const booking = activeBooking('paid');
    const outboxSpy = jest.fn();
    const service = makeService({
      bookingLockRepository: { bumpForUnit: jest.fn().mockResolvedValue(undefined) } as never,
      bookingRepository: {
        findByIdForOrganization: jest.fn().mockResolvedValue(booking),
        findOverlappingActiveExcluding: jest.fn().mockResolvedValue(null),
        extendIfActive: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
      } as never,
      outboxService: { publish: outboxSpy } as never,
      idempotencyService: { checkReplay: jest.fn().mockResolvedValue(null), record: jest.fn() } as never,
    });

    await expect(service.extendBooking(params())).rejects.toMatchObject({
      code: ErrorCode.BOOKING_INVALID_STATE_TRANSITION,
    });
    expect(outboxSpy).not.toHaveBeenCalled();
  });

  it('возвращает replay при повторном вызове с тем же Idempotency-Key', async () => {
    const replay = { responseStatus: 200, responseBody: { id: bookingId.toString() } };
    const extendSpy = jest.fn();
    const service = makeService({
      bookingLockRepository: { bumpForUnit: jest.fn().mockResolvedValue(undefined) } as never,
      bookingRepository: {
        findByIdForOrganization: jest.fn().mockResolvedValue(activeBooking()),
        extendIfActive: extendSpy,
      } as never,
      idempotencyService: { checkReplay: jest.fn().mockResolvedValue(replay), record: jest.fn() } as never,
    });

    await expect(service.extendBooking(params())).resolves.toMatchObject({ replay });
    expect(extendSpy).not.toHaveBeenCalled();
  });
});

describe('BookingsService.listBookings', () => {
  const organizationId = new Types.ObjectId();
  const unitId = new Types.ObjectId();
  const buildingId = new Types.ObjectId();
  const developmentId = new Types.ObjectId();
  const managerPositionId = new Types.ObjectId();

  it('unitId — валидирует принадлежность юнита организации и фильтрует по точному unitId', async () => {
    const listSpy = jest.fn().mockResolvedValue([]);
    const getUnitSpy = jest.fn().mockResolvedValue({ _id: unitId });
    const service = makeService({
      bookingRepository: { listForOrganization: listSpy } as never,
      developmentsService: { getUnitForOrganization: getUnitSpy } as never,
    });

    await service.listBookings({ organizationId, unitId, limit: 20 });

    expect(getUnitSpy).toHaveBeenCalledWith(unitId, organizationId);
    expect(listSpy).toHaveBeenCalledWith(
      organizationId,
      expect.objectContaining({ unitId, unitIds: undefined, limit: 20 }),
    );
  });

  it('buildingId (без unitId) — резолвит unitIds через DevelopmentsService.listUnitIdsForBuilding', async () => {
    const listSpy = jest.fn().mockResolvedValue([]);
    const unitIds = [new Types.ObjectId(), new Types.ObjectId()];
    const listUnitIdsSpy = jest.fn().mockResolvedValue(unitIds);
    const service = makeService({
      bookingRepository: { listForOrganization: listSpy } as never,
      developmentsService: { listUnitIdsForBuilding: listUnitIdsSpy } as never,
    });

    await service.listBookings({ organizationId, buildingId, limit: 20 });

    expect(listUnitIdsSpy).toHaveBeenCalledWith(buildingId, organizationId);
    expect(listSpy).toHaveBeenCalledWith(
      organizationId,
      expect.objectContaining({ unitId: undefined, unitIds, limit: 20 }),
    );
  });

  it('developmentId (без buildingId/unitId) — резолвит unitIds через DevelopmentsService.listUnitIdsForDevelopment', async () => {
    const listSpy = jest.fn().mockResolvedValue([]);
    const unitIds = [new Types.ObjectId()];
    const listUnitIdsSpy = jest.fn().mockResolvedValue(unitIds);
    const service = makeService({
      bookingRepository: { listForOrganization: listSpy } as never,
      developmentsService: { listUnitIdsForDevelopment: listUnitIdsSpy } as never,
    });

    await service.listBookings({ organizationId, developmentId, limit: 20 });

    expect(listUnitIdsSpy).toHaveBeenCalledWith(developmentId, organizationId);
    expect(listSpy).toHaveBeenCalledWith(
      organizationId,
      expect.objectContaining({ unitIds, limit: 20 }),
    );
  });

  it('unitId побеждает buildingId/developmentId, если переданы все три', async () => {
    const listSpy = jest.fn().mockResolvedValue([]);
    const getUnitSpy = jest.fn().mockResolvedValue({ _id: unitId });
    const listUnitIdsForBuildingSpy = jest.fn();
    const listUnitIdsForDevelopmentSpy = jest.fn();
    const service = makeService({
      bookingRepository: { listForOrganization: listSpy } as never,
      developmentsService: {
        getUnitForOrganization: getUnitSpy,
        listUnitIdsForBuilding: listUnitIdsForBuildingSpy,
        listUnitIdsForDevelopment: listUnitIdsForDevelopmentSpy,
      } as never,
    });

    await service.listBookings({ organizationId, unitId, buildingId, developmentId, limit: 20 });

    expect(getUnitSpy).toHaveBeenCalledWith(unitId, organizationId);
    expect(listUnitIdsForBuildingSpy).not.toHaveBeenCalled();
    expect(listUnitIdsForDevelopmentSpy).not.toHaveBeenCalled();
  });

  it('без единого filter — организация целиком, managerPositionId передаётся дальше как own-scope сужение', async () => {
    const items = [{ _id: new Types.ObjectId() }];
    const listSpy = jest.fn().mockResolvedValue(items);
    const service = makeService({
      bookingRepository: { listForOrganization: listSpy } as never,
    });

    await expect(
      service.listBookings({ organizationId, managerPositionId, status: 'pending', limit: 20 }),
    ).resolves.toBe(items);
    expect(listSpy).toHaveBeenCalledWith(
      organizationId,
      expect.objectContaining({ unitId: undefined, unitIds: undefined, managerPositionId, status: 'pending', limit: 20 }),
    );
  });
});

describe('BookingsService.convertToDeal', () => {
  const organizationId = new Types.ObjectId();
  const bookingId = new Types.ObjectId();
  const unitId = new Types.ObjectId();
  const buildingId = new Types.ObjectId();
  const developmentId = new Types.ObjectId();
  const leadId = new Types.ObjectId();
  const contactId = new Types.ObjectId();
  const manager = new Types.ObjectId();
  const identityId = new Types.ObjectId();

  function params() {
    return {
      bookingId,
      organizationId,
      actorIdentityId: identityId,
      managerPositionId: manager,
      title: 'Deal 1',
      contactId,
      idempotencyKey: 'conv-1',
      correlationId: 'corr-1',
    };
  }

  it('конвертирует active booking в deal: переводит booking в paid, unit в sold, создаёт deal и публикует события', async () => {
    const booking = {
      _id: bookingId,
      unitId,
      organizationId,
      leadId,
      manager,
      dateRange: { startsAt: new Date('2026-09-01'), expiresAt: new Date(Date.now() + 86400000) },
      status: 'booked',
      createdAt: new Date('2026-08-31'),
    };
    const paidBooking = { ...booking, status: 'paid' };
    const unit = {
      _id: unitId,
      buildingId,
      status: 'reserved',
      version: 1,
      number: '42',
    };
    const building = { _id: buildingId, developmentId };
    const deal = { _id: new Types.ObjectId() };

    const markPaidSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
    const updateUnitStatusSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
    const createDealSpy = jest.fn().mockResolvedValue(deal);
    const outboxSpy = jest.fn().mockResolvedValue(undefined);
    const auditSpy = jest.fn().mockResolvedValue(undefined);
    const recordSpy = jest.fn().mockResolvedValue(undefined);

    const service = makeService({
      bookingRepository: {
        findByIdForOrganization: jest.fn().mockResolvedValue(booking).mockResolvedValueOnce(booking).mockResolvedValueOnce(paidBooking),
        markPaidIfActive: markPaidSpy,
      } as never,
      developmentsService: {
        getUnitForOrganization: jest.fn().mockResolvedValue(unit),
        getBuildingForOrganization: jest.fn().mockResolvedValue(building),
        updateUnitStatusInSession: updateUnitStatusSpy,
      } as never,
      crmService: {
        getContactForOrganization: jest.fn().mockResolvedValue({ _id: contactId }),
        createDealInSession: createDealSpy,
      } as never,
      outboxService: { publish: outboxSpy } as never,
      auditService: { append: auditSpy } as never,
      idempotencyService: { checkReplay: jest.fn().mockResolvedValue(null), record: recordSpy } as never,
    });

    const result = await service.convertToDeal(params());
    expect('booking' in result).toBe(true);
    if ('booking' in result) {
      expect(result.booking.status).toBe('paid');
      expect(result.deal).toBe(deal);
    }
    expect(markPaidSpy).toHaveBeenCalledWith(bookingId, organizationId, expect.anything());
    expect(updateUnitStatusSpy).toHaveBeenCalledWith(
      unitId,
      organizationId,
      1,
      'sold',
      ['available', 'reserved'],
      expect.anything(),
    );
    expect(createDealSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        contactId,
        unitId,
        developmentId,
        ownerPositionId: manager,
      }),
      expect.anything(),
    );
    expect(outboxSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'BookingConvertedToDeal',
        aggregateId: bookingId,
      }),
      expect.anything(),
    );
    expect(outboxSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'UnitStatusChanged',
        aggregateId: unitId,
        payload: expect.objectContaining({ newStatus: 'sold' }),
      }),
      expect.anything(),
    );
  });

  it('бросает BOOKING_NOT_FOUND если бронь не найдена', async () => {
    const service = makeService({
      bookingRepository: { findByIdForOrganization: jest.fn().mockResolvedValue(null) } as never,
    });

    await expect(service.convertToDeal(params())).rejects.toMatchObject({
      code: ErrorCode.BOOKING_NOT_FOUND,
    });
  });

  it('бросает BOOKING_INVALID_STATE_TRANSITION если бронь уже paid/rejected', async () => {
    const booking = {
      _id: bookingId,
      unitId,
      organizationId,
      status: 'rejected',
    };
    const service = makeService({
      bookingRepository: { findByIdForOrganization: jest.fn().mockResolvedValue(booking) } as never,
    });

    await expect(service.convertToDeal(params())).rejects.toMatchObject({
      code: ErrorCode.BOOKING_INVALID_STATE_TRANSITION,
    });
  });

  it('бросает UNIT_INVALID_STATUS_TRANSITION если юнит уже sold', async () => {
    const booking = {
      _id: bookingId,
      unitId,
      organizationId,
      status: 'booked',
    };
    const service = makeService({
      bookingRepository: { findByIdForOrganization: jest.fn().mockResolvedValue(booking) } as never,
      developmentsService: {
        getUnitForOrganization: jest.fn().mockResolvedValue({ _id: unitId, status: 'sold' }),
      } as never,
    });

    await expect(service.convertToDeal(params())).rejects.toMatchObject({
      code: ErrorCode.UNIT_INVALID_STATUS_TRANSITION,
    });
  });

  it('бросает BOOKING_INVALID_STATE_TRANSITION если бронь просрочена (expiresAt в прошлом)', async () => {
    const booking = {
      _id: bookingId,
      unitId,
      organizationId,
      status: 'booked',
      dateRange: { startsAt: new Date(Date.now() - 100000), expiresAt: new Date(Date.now() - 1000) },
    };
    const service = makeService({
      bookingRepository: { findByIdForOrganization: jest.fn().mockResolvedValue(booking) } as never,
    });

    await expect(service.convertToDeal(params())).rejects.toMatchObject({
      code: ErrorCode.BOOKING_INVALID_STATE_TRANSITION,
    });
  });

  it('возвращает сохранённый replay при ранней проверке checkReplay', async () => {
    const replay = { responseStatus: 201, responseBody: { dealId: 'saved-deal' } };
    const service = makeService({
      idempotencyService: {
        checkReplay: jest.fn().mockResolvedValue(replay),
      } as never,
    });

    const result = await service.convertToDeal(params());
    expect(result).toEqual({ replay });
  });
});

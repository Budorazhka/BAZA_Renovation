import { Types } from 'mongoose';
import { BookingsController } from './bookings.controller';
import type { BookingsService } from './bookings.service';
import type { IdempotencyService } from '../../shared/idempotency/idempotency.service';
import type { PolicyEvaluatorService } from '../authorization/policy-evaluator.service';

function makeRequest() {
  return {
    correlationId: 'corr-booking',
    tenantContext: {
      identityId: new Types.ObjectId().toString(),
      organizationId: new Types.ObjectId().toString(),
      positionId: new Types.ObjectId().toString(),
    },
  } as never;
}

/** По умолчанию — organization scope (весь tenant, ownerFilterForAction возвращает undefined). */
function makePolicyEvaluator(scopes: string[] = ['organization']) {
  return { matchingScopes: jest.fn().mockResolvedValue(scopes) } as unknown as PolicyEvaluatorService;
}

describe('BookingsController.createBooking', () => {
  it('requires Idempotency-Key before invoking the service', async () => {
    const service = { book: jest.fn() } as unknown as BookingsService;
    const idempotency = { checkReplay: jest.fn() } as unknown as IdempotencyService;
    const controller = new BookingsController(service, idempotency, makePolicyEvaluator());

    await expect(
      controller.createBooking(
        makeRequest(),
        { status: jest.fn() } as never,
        {
          unitId: new Types.ObjectId().toString(),
          startsAt: '2026-09-01T10:00:00.000Z',
          expiresAt: '2026-09-01T12:00:00.000Z',
        },
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
    expect(service.book).not.toHaveBeenCalled();
    expect(idempotency.checkReplay).not.toHaveBeenCalled();
  });

  it('returns an idempotent replay without invoking the booking command', async () => {
    const service = { book: jest.fn() } as unknown as BookingsService;
    const idempotency = {
      checkReplay: jest.fn().mockResolvedValue({ responseStatus: 201, responseBody: { id: 'saved' } }),
    } as unknown as IdempotencyService;
    const controller = new BookingsController(service, idempotency, makePolicyEvaluator());
    const reply = { status: jest.fn() };

    await expect(
      controller.createBooking(
        makeRequest(),
        reply as never,
        {
          unitId: new Types.ObjectId().toString(),
          startsAt: '2026-09-01T10:00:00.000Z',
          expiresAt: '2026-09-01T12:00:00.000Z',
        },
        'same-key',
      ),
    ).resolves.toEqual({ id: 'saved' });
    expect(reply.status).toHaveBeenCalledWith(201);
    expect(service.book).not.toHaveBeenCalled();
  });
});

describe('BookingsController.cancelBooking', () => {
  it('requires Idempotency-Key before invoking the service', async () => {
    const service = { cancelBooking: jest.fn() } as unknown as BookingsService;
    const idempotency = { checkReplay: jest.fn() } as unknown as IdempotencyService;
    const controller = new BookingsController(service, idempotency, makePolicyEvaluator());

    await expect(
      controller.cancelBooking(makeRequest(), { status: jest.fn() } as never, new Types.ObjectId(), {}),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
    expect(service.cancelBooking).not.toHaveBeenCalled();
    expect(idempotency.checkReplay).not.toHaveBeenCalled();
  });

  it('returns an idempotent replay without invoking the cancel command', async () => {
    const service = { cancelBooking: jest.fn() } as unknown as BookingsService;
    const idempotency = {
      checkReplay: jest.fn().mockResolvedValue({ responseStatus: 200, responseBody: { id: 'cancelled' } }),
    } as unknown as IdempotencyService;
    const controller = new BookingsController(service, idempotency, makePolicyEvaluator());
    const reply = { status: jest.fn() };

    await expect(
      controller.cancelBooking(makeRequest(), reply as never, new Types.ObjectId(), {}, 'same-key'),
    ).resolves.toEqual({ id: 'cancelled' });
    expect(reply.status).toHaveBeenCalledWith(200);
    expect(service.cancelBooking).not.toHaveBeenCalled();
  });

  it('delegates to BookingsService.cancelBooking with tenant-scoped params and returns 200', async () => {
    const bookingId = new Types.ObjectId();
    const cancelled = {
      _id: bookingId,
      unitId: new Types.ObjectId(),
      organizationId: new Types.ObjectId(),
      leadId: undefined,
      manager: new Types.ObjectId(),
      dateRange: { startsAt: new Date('2026-09-01T10:00:00.000Z'), expiresAt: new Date('2026-09-02T10:00:00.000Z') },
      status: 'rejected',
      createdAt: new Date('2026-08-31T10:00:00.000Z'),
    };
    const cancelSpy = jest.fn().mockResolvedValue(cancelled);
    const service = { cancelBooking: cancelSpy } as unknown as BookingsService;
    const idempotency = { checkReplay: jest.fn().mockResolvedValue(null) } as unknown as IdempotencyService;
    const controller = new BookingsController(service, idempotency, makePolicyEvaluator());
    const reply = { status: jest.fn() };

    const result = await controller.cancelBooking(
      makeRequest(),
      reply as never,
      bookingId,
      { reason: 'клиент передумал' },
      'cancel-key',
    );

    expect(cancelSpy).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId, reason: 'клиент передумал', idempotencyKey: 'cancel-key' }),
    );
    expect(reply.status).toHaveBeenCalledWith(200);
    expect(result).toMatchObject({ id: bookingId.toString(), status: 'rejected' });
  });
});

describe('BookingsController.confirmBooking', () => {
  it('requires Idempotency-Key before invoking the service', async () => {
    const service = { confirmBooking: jest.fn() } as unknown as BookingsService;
    const idempotency = { checkReplay: jest.fn() } as unknown as IdempotencyService;
    const controller = new BookingsController(service, idempotency, makePolicyEvaluator());

    await expect(
      controller.confirmBooking(makeRequest(), { status: jest.fn() } as never, new Types.ObjectId()),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
    expect(service.confirmBooking).not.toHaveBeenCalled();
  });

  it('organization/global scope — ownerFilterForAction resolves undefined (весь tenant, не own-scope)', async () => {
    const confirmSpy = jest.fn().mockResolvedValue({
      _id: new Types.ObjectId(),
      unitId: new Types.ObjectId(),
      organizationId: new Types.ObjectId(),
      manager: new Types.ObjectId(),
      dateRange: { startsAt: new Date(), expiresAt: new Date() },
      status: 'booked',
      createdAt: new Date(),
    });
    const service = { confirmBooking: confirmSpy } as unknown as BookingsService;
    const idempotency = { checkReplay: jest.fn().mockResolvedValue(null) } as unknown as IdempotencyService;
    const controller = new BookingsController(service, idempotency, makePolicyEvaluator(['organization']));

    await controller.confirmBooking(makeRequest(), { status: jest.fn() } as never, new Types.ObjectId(), 'key-1');

    expect(confirmSpy).toHaveBeenCalledWith(expect.objectContaining({ requiredManagerPositionId: undefined }));
  });

  it('own scope — ownerFilterForAction сужает до вызывающей Position', async () => {
    const confirmSpy = jest.fn().mockResolvedValue({
      _id: new Types.ObjectId(),
      unitId: new Types.ObjectId(),
      organizationId: new Types.ObjectId(),
      manager: new Types.ObjectId(),
      dateRange: { startsAt: new Date(), expiresAt: new Date() },
      status: 'booked',
      createdAt: new Date(),
    });
    const service = { confirmBooking: confirmSpy } as unknown as BookingsService;
    const idempotency = { checkReplay: jest.fn().mockResolvedValue(null) } as unknown as IdempotencyService;
    const controller = new BookingsController(service, idempotency, makePolicyEvaluator(['own']));
    const req = makeRequest() as unknown as { tenantContext: { positionId: string } };

    await controller.confirmBooking(req as never, { status: jest.fn() } as never, new Types.ObjectId(), 'key-1');

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.objectContaining({ requiredManagerPositionId: new Types.ObjectId(req.tenantContext.positionId) }),
    );
  });
});

describe('BookingsController.extendBooking', () => {
  it('requires Idempotency-Key before invoking the service', async () => {
    const service = { extendBooking: jest.fn() } as unknown as BookingsService;
    const idempotency = { checkReplay: jest.fn() } as unknown as IdempotencyService;
    const controller = new BookingsController(service, idempotency, makePolicyEvaluator());

    await expect(
      controller.extendBooking(makeRequest(), { status: jest.fn() } as never, new Types.ObjectId(), {
        newExpiresAt: '2026-09-05T00:00:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
    expect(service.extendBooking).not.toHaveBeenCalled();
  });

  it('delegates to BookingsService.extendBooking with the parsed newExpiresAt', async () => {
    const bookingId = new Types.ObjectId();
    const extended = {
      _id: bookingId,
      unitId: new Types.ObjectId(),
      organizationId: new Types.ObjectId(),
      manager: new Types.ObjectId(),
      dateRange: { startsAt: new Date('2026-09-01T10:00:00.000Z'), expiresAt: new Date('2026-09-05T00:00:00.000Z') },
      status: 'booked',
      createdAt: new Date('2026-08-31T10:00:00.000Z'),
    };
    const extendSpy = jest.fn().mockResolvedValue(extended);
    const service = { extendBooking: extendSpy } as unknown as BookingsService;
    const idempotency = { checkReplay: jest.fn().mockResolvedValue(null) } as unknown as IdempotencyService;
    const controller = new BookingsController(service, idempotency, makePolicyEvaluator());
    const reply = { status: jest.fn() };

    const result = await controller.extendBooking(
      makeRequest(),
      reply as never,
      bookingId,
      { newExpiresAt: '2026-09-05T00:00:00.000Z' },
      'extend-key',
    );

    expect(extendSpy).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId, newExpiresAt: new Date('2026-09-05T00:00:00.000Z'), idempotencyKey: 'extend-key' }),
    );
    expect(reply.status).toHaveBeenCalledWith(200);
    expect(result).toMatchObject({ id: bookingId.toString(), status: 'booked' });
  });
});

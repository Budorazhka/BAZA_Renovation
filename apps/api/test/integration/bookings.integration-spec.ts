import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { DevelopmentRepository } from '@baza/development';
import { BookingsModule } from '../../src/modules/bookings/bookings.module';
import { BookingsService } from '../../src/modules/bookings/bookings.service';
import { UnitRepository } from '../../src/modules/developments/repository/unit.repository';
import { BuildingRepository } from '../../src/modules/developments/repository/building.repository';
import { FloorRepository } from '../../src/modules/developments/repository/floor.repository';

describe('BOOK-001 atomic booking (real MongoDB transaction)', () => {
  let replSet: MongoMemoryReplSet;
  let connection: Connection;
  let bookingsService: BookingsService;
  let unitRepository: UnitRepository;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await replSet.waitUntilRunning();

    process.env.MINIO_ENDPOINT ??= 'http://localhost:9000';
    process.env.MINIO_ACCESS_KEY ??= 'test-access-key';
    process.env.MINIO_SECRET_KEY ??= 'test-secret-key';
    process.env.MINIO_BUCKET_PRIVATE ??= 'test-private';
    process.env.MINIO_BUCKET_PUBLIC ??= 'test-public';
    process.env.REDIS_URL ??= 'redis://localhost:6379';

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), MongooseModule.forRoot(replSet.getUri()), BookingsModule],
    }).compile();

    connection = moduleRef.get<Connection>(getConnectionToken());
    bookingsService = moduleRef.get(BookingsService);
    unitRepository = moduleRef.get(UnitRepository);
  }, 120_000);

  afterAll(async () => {
    await connection?.close();
    await replSet?.stop();
  });

  afterEach(async () => {
    for (const collection of ['bookings', 'booking_locks', 'outbox_events', 'idempotency_records', 'audit_events', 'units']) {
      await connection.collection(collection).deleteMany({});
    }
  });

  it('allows non-overlapping bookings but rejects parallel overlapping requests', async () => {
    const organizationId = new Types.ObjectId();
    const unit = await unitRepository.create({
      buildingId: new Types.ObjectId(),
      floorId: new Types.ObjectId(),
      organizationId,
      number: 'A-101',
      kind: 'apartment',
      area: 42,
      price: { amountMinorUnits: 100_000, currency: 'USD' },
    });

    const common = {
      unitId: unit._id,
      organizationId,
      managerPositionId: new Types.ObjectId(),
      startsAt: new Date('2026-09-01T10:00:00.000Z'),
      expiresAt: new Date('2026-09-01T12:00:00.000Z'),
      correlationId: 'booking-integration',
    };
    const first = bookingsService.book({
      ...common,
      actorIdentityId: new Types.ObjectId(),
      idempotencyKey: 'booking-key-a',
    });
    const second = bookingsService.book({
      ...common,
      actorIdentityId: new Types.ObjectId(),
      idempotencyKey: 'booking-key-b',
      startsAt: new Date('2026-09-01T11:00:00.000Z'),
      expiresAt: new Date('2026-09-01T13:00:00.000Z'),
    });

    const results = await Promise.allSettled([first, second]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({ reason: { code: 'BOOKING_OVERLAP' } });

    expect(await connection.collection('bookings').countDocuments({ unitId: unit._id })).toBe(1);
    expect(await connection.collection('booking_locks').countDocuments({ _id: unit._id })).toBe(1);
    expect(await connection.collection('outbox_events').countDocuments({ eventType: 'BookingCreated' })).toBe(1);
    expect(await connection.collection('idempotency_records').countDocuments({ operation: 'createBooking' })).toBe(1);
  });

  it('permits sequential non-overlapping date ranges for the same unit', async () => {
    const organizationId = new Types.ObjectId();
    const unit = await unitRepository.create({
      buildingId: new Types.ObjectId(),
      floorId: new Types.ObjectId(),
      organizationId,
      number: 'A-102',
      kind: 'apartment',
      area: 42,
      price: { amountMinorUnits: 100_000, currency: 'USD' },
    });

    const base = {
      unitId: unit._id,
      organizationId,
      managerPositionId: new Types.ObjectId(),
      actorIdentityId: new Types.ObjectId(),
      correlationId: 'booking-integration',
    };
    await expect(
      bookingsService.book({
        ...base,
        idempotencyKey: 'booking-key-c',
        startsAt: new Date('2026-09-01T10:00:00.000Z'),
        expiresAt: new Date('2026-09-01T12:00:00.000Z'),
      }),
    ).resolves.toBeDefined();
    await expect(
      bookingsService.book({
        ...base,
        actorIdentityId: new Types.ObjectId(),
        idempotencyKey: 'booking-key-d',
        startsAt: new Date('2026-09-01T12:00:00.000Z'),
        expiresAt: new Date('2026-09-01T14:00:00.000Z'),
      }),
    ).resolves.toBeDefined();

    expect(await connection.collection('bookings').countDocuments({ unitId: unit._id })).toBe(2);
  });

});

describe('BOOK-001 follow-up: cancelBooking (real MongoDB transaction)', () => {
  let replSet: MongoMemoryReplSet;
  let connection: Connection;
  let bookingsService: BookingsService;
  let unitRepository: UnitRepository;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await replSet.waitUntilRunning();

    process.env.MINIO_ENDPOINT ??= 'http://localhost:9000';
    process.env.MINIO_ACCESS_KEY ??= 'test-access-key';
    process.env.MINIO_SECRET_KEY ??= 'test-secret-key';
    process.env.MINIO_BUCKET_PRIVATE ??= 'test-private';
    process.env.MINIO_BUCKET_PUBLIC ??= 'test-public';
    process.env.REDIS_URL ??= 'redis://localhost:6379';

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), MongooseModule.forRoot(replSet.getUri()), BookingsModule],
    }).compile();

    connection = moduleRef.get<Connection>(getConnectionToken());
    bookingsService = moduleRef.get(BookingsService);
    unitRepository = moduleRef.get(UnitRepository);
  }, 120_000);

  afterAll(async () => {
    await connection?.close();
    await replSet?.stop();
  });

  afterEach(async () => {
    for (const collection of ['bookings', 'booking_locks', 'outbox_events', 'idempotency_records', 'audit_events', 'units']) {
      await connection.collection(collection).deleteMany({});
    }
  });

  async function createUnitAndBooking(organizationId: Types.ObjectId) {
    const unit = await unitRepository.create({
      buildingId: new Types.ObjectId(),
      floorId: new Types.ObjectId(),
      organizationId,
      number: 'B-101',
      kind: 'apartment',
      area: 42,
      price: { amountMinorUnits: 100_000, currency: 'USD' },
    });
    const booking = await bookingsService.book({
      unitId: unit._id,
      organizationId,
      managerPositionId: new Types.ObjectId(),
      actorIdentityId: new Types.ObjectId(),
      startsAt: new Date('2026-09-01T10:00:00.000Z'),
      expiresAt: new Date('2026-09-01T12:00:00.000Z'),
      idempotencyKey: `booking-key-${unit._id.toString()}`,
      correlationId: 'booking-integration',
    });
    if (!('_id' in booking)) throw new Error('expected a real booking, not a replay');
    return { unit, booking };
  }

  it('переводит бронь в rejected и освобождает unit для новой пересекающейся брони', async () => {
    const organizationId = new Types.ObjectId();
    const { unit, booking } = await createUnitAndBooking(organizationId);

    const cancelled = await bookingsService.cancelBooking({
      bookingId: booking._id,
      organizationId,
      actorIdentityId: new Types.ObjectId(),
      reason: 'клиент передумал',
      idempotencyKey: 'cancel-key-a',
      correlationId: 'booking-integration',
    });
    expect(cancelled).not.toHaveProperty('replay');
    if ('replay' in cancelled) throw new Error('unreachable');
    expect(cancelled.status).toBe('rejected');
    // 11.09.2026: раньше тест проверял только, что бронь снова проходит, но
    // не статус самого юнита — а book() бронирует и reserved-юнит, так что
    // «застрявший» reserved этим тестом не ловился.
    expect((await unitRepository.findById(unit._id))?.status).toBe('available');

    // Unit теперь свободен — пересекающаяся бронь на те же даты проходит.
    await expect(
      bookingsService.book({
        unitId: unit._id,
        organizationId,
        managerPositionId: new Types.ObjectId(),
        actorIdentityId: new Types.ObjectId(),
        startsAt: new Date('2026-09-01T10:00:00.000Z'),
        expiresAt: new Date('2026-09-01T12:00:00.000Z'),
        idempotencyKey: 'booking-key-after-cancel',
        correlationId: 'booking-integration',
      }),
    ).resolves.toBeDefined();

    expect(await connection.collection('outbox_events').countDocuments({ eventType: 'BookingCancelled' })).toBe(1);
    expect(await connection.collection('audit_events').countDocuments({ action: 'booking.cancel' })).toBe(1);
    expect(
      await connection.collection('idempotency_records').countDocuments({ operation: 'cancelBooking' }),
    ).toBe(1);
  });

  it('бросает BOOKING_NOT_FOUND при попытке отменить бронь чужой организации', async () => {
    const { booking } = await createUnitAndBooking(new Types.ObjectId());

    await expect(
      bookingsService.cancelBooking({
        bookingId: booking._id,
        organizationId: new Types.ObjectId(),
        actorIdentityId: new Types.ObjectId(),
        idempotencyKey: 'cancel-key-b',
        correlationId: 'booking-integration',
      }),
    ).rejects.toMatchObject({ code: 'BOOKING_NOT_FOUND' });
  });

  it('бросает BOOKING_INVALID_STATE_TRANSITION при повторной отмене уже rejected брони', async () => {
    const organizationId = new Types.ObjectId();
    const { booking } = await createUnitAndBooking(organizationId);

    await bookingsService.cancelBooking({
      bookingId: booking._id,
      organizationId,
      actorIdentityId: new Types.ObjectId(),
      idempotencyKey: 'cancel-key-c1',
      correlationId: 'booking-integration',
    });

    await expect(
      bookingsService.cancelBooking({
        bookingId: booking._id,
        organizationId,
        actorIdentityId: new Types.ObjectId(),
        idempotencyKey: 'cancel-key-c2',
        correlationId: 'booking-integration',
      }),
    ).rejects.toMatchObject({ code: 'BOOKING_INVALID_STATE_TRANSITION' });
  });
});

describe('Истечение броней по сроку (real MongoDB transaction)', () => {
  let replSet: MongoMemoryReplSet;
  let connection: Connection;
  let bookingsService: BookingsService;
  let unitRepository: UnitRepository;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await replSet.waitUntilRunning();

    process.env.MINIO_ENDPOINT ??= 'http://localhost:9000';
    process.env.MINIO_ACCESS_KEY ??= 'test-access-key';
    process.env.MINIO_SECRET_KEY ??= 'test-secret-key';
    process.env.MINIO_BUCKET_PRIVATE ??= 'test-private';
    process.env.MINIO_BUCKET_PUBLIC ??= 'test-public';
    process.env.REDIS_URL ??= 'redis://localhost:6379';

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), MongooseModule.forRoot(replSet.getUri()), BookingsModule],
    }).compile();

    connection = moduleRef.get<Connection>(getConnectionToken());
    bookingsService = moduleRef.get(BookingsService);
    unitRepository = moduleRef.get(UnitRepository);
  }, 120_000);

  afterAll(async () => {
    await connection?.close();
    await replSet?.stop();
  });

  afterEach(async () => {
    for (const collection of ['bookings', 'booking_locks', 'outbox_events', 'idempotency_records', 'audit_events', 'units']) {
      await connection.collection(collection).deleteMany({});
    }
  });

  async function createUnit(organizationId: Types.ObjectId) {
    return unitRepository.create({
      buildingId: new Types.ObjectId(),
      floorId: new Types.ObjectId(),
      organizationId,
      number: 'E-101',
      kind: 'apartment',
      area: 42,
      price: { amountMinorUnits: 100_000, currency: 'USD' },
    });
  }

  async function book(unitId: Types.ObjectId, organizationId: Types.ObjectId, startsAt: string, expiresAt: string) {
    const booking = await bookingsService.book({
      unitId,
      organizationId,
      managerPositionId: new Types.ObjectId(),
      actorIdentityId: new Types.ObjectId(),
      startsAt: new Date(startsAt),
      expiresAt: new Date(expiresAt),
      idempotencyKey: `expiry-${unitId.toString()}-${startsAt}`,
      correlationId: 'booking-expiry-integration',
    });
    if (!('_id' in booking)) throw new Error('expected a real booking, not a replay');
    return booking;
  }

  async function statusOf(bookingId: Types.ObjectId) {
    return (await connection.collection('bookings').findOne({ _id: bookingId }))?.status;
  }

  it('истёкшая бронь переходит в expired, юнит снова available и возвращается на витрину событием; повтор ничего не меняет', async () => {
    const organizationId = new Types.ObjectId();
    const unit = await createUnit(organizationId);
    const booking = await book(unit._id, organizationId, '2026-09-01T10:00:00.000Z', '2026-09-01T12:00:00.000Z');
    expect((await unitRepository.findById(unit._id))?.status).toBe('reserved');

    await expect(
      bookingsService.expireOverdueBookings({ now: new Date('2026-09-01T12:01:00.000Z') }),
    ).resolves.toEqual({ expiredCount: 1, releasedUnits: 1, errors: 0 });

    expect(await statusOf(booking._id)).toBe('expired');
    expect((await unitRepository.findById(unit._id))?.status).toBe('available');
    expect(await connection.collection('outbox_events').countDocuments({ eventType: 'BookingExpired' })).toBe(1);
    // Этим событием воркер пересобирает проекцию ЖК — юнит снова в каталоге.
    expect(
      await connection
        .collection('outbox_events')
        .countDocuments({ eventType: 'UnitStatusChanged', 'payload.newStatus': 'available' }),
    ).toBe(1);
    expect(
      await connection.collection('audit_events').countDocuments({ action: 'booking.expire', 'actor.type': 'system' }),
    ).toBe(1);

    await expect(
      bookingsService.expireOverdueBookings({ now: new Date('2026-09-01T13:00:00.000Z') }),
    ).resolves.toEqual({ expiredCount: 0, releasedUnits: 0, errors: 0 });
    expect(await connection.collection('outbox_events').countDocuments({ eventType: 'BookingExpired' })).toBe(1);
  });

  it('бронь, срок которой ещё не истёк, не трогается', async () => {
    const organizationId = new Types.ObjectId();
    const unit = await createUnit(organizationId);
    const booking = await book(unit._id, organizationId, '2026-09-01T10:00:00.000Z', '2026-09-01T12:00:00.000Z');

    await expect(
      bookingsService.expireOverdueBookings({ now: new Date('2026-09-01T11:59:00.000Z') }),
    ).resolves.toEqual({ expiredCount: 0, releasedUnits: 0, errors: 0 });
    expect(await statusOf(booking._id)).toBe('pending');
    expect((await unitRepository.findById(unit._id))?.status).toBe('reserved');
  });

  it('юнит остаётся reserved, пока на нём есть другая активная бронь, и освобождается с последней', async () => {
    const organizationId = new Types.ObjectId();
    const unit = await createUnit(organizationId);
    const early = await book(unit._id, organizationId, '2026-09-01T10:00:00.000Z', '2026-09-01T12:00:00.000Z');
    const late = await book(unit._id, organizationId, '2026-09-01T14:00:00.000Z', '2026-09-01T16:00:00.000Z');

    await expect(
      bookingsService.expireOverdueBookings({ now: new Date('2026-09-01T12:30:00.000Z') }),
    ).resolves.toEqual({ expiredCount: 1, releasedUnits: 0, errors: 0 });
    expect(await statusOf(early._id)).toBe('expired');
    expect(await statusOf(late._id)).toBe('pending');
    expect((await unitRepository.findById(unit._id))?.status).toBe('reserved');

    await expect(
      bookingsService.expireOverdueBookings({ now: new Date('2026-09-01T16:30:00.000Z') }),
    ).resolves.toEqual({ expiredCount: 1, releasedUnits: 1, errors: 0 });
    expect((await unitRepository.findById(unit._id))?.status).toBe('available');
  });

  it('проходит брони всех организаций за один прогон', async () => {
    const orgA = new Types.ObjectId();
    const orgB = new Types.ObjectId();
    const unitA = await createUnit(orgA);
    const unitB = await createUnit(orgB);
    await book(unitA._id, orgA, '2026-09-01T10:00:00.000Z', '2026-09-01T12:00:00.000Z');
    await book(unitB._id, orgB, '2026-09-01T10:00:00.000Z', '2026-09-01T12:00:00.000Z');

    await expect(
      bookingsService.expireOverdueBookings({ now: new Date('2026-09-02T00:00:00.000Z'), limit: 1 }),
    ).resolves.toEqual({ expiredCount: 2, releasedUnits: 2, errors: 0 });
  });
});

describe('BOOK-001 follow-up: confirmBooking (real MongoDB transaction)', () => {
  let replSet: MongoMemoryReplSet;
  let connection: Connection;
  let bookingsService: BookingsService;
  let unitRepository: UnitRepository;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await replSet.waitUntilRunning();

    process.env.MINIO_ENDPOINT ??= 'http://localhost:9000';
    process.env.MINIO_ACCESS_KEY ??= 'test-access-key';
    process.env.MINIO_SECRET_KEY ??= 'test-secret-key';
    process.env.MINIO_BUCKET_PRIVATE ??= 'test-private';
    process.env.MINIO_BUCKET_PUBLIC ??= 'test-public';
    process.env.REDIS_URL ??= 'redis://localhost:6379';

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), MongooseModule.forRoot(replSet.getUri()), BookingsModule],
    }).compile();

    connection = moduleRef.get<Connection>(getConnectionToken());
    bookingsService = moduleRef.get(BookingsService);
    unitRepository = moduleRef.get(UnitRepository);
  }, 120_000);

  afterAll(async () => {
    await connection?.close();
    await replSet?.stop();
  });

  afterEach(async () => {
    for (const collection of ['bookings', 'booking_locks', 'outbox_events', 'idempotency_records', 'audit_events', 'units']) {
      await connection.collection(collection).deleteMany({});
    }
  });

  async function createUnitAndBooking(organizationId: Types.ObjectId, managerPositionId: Types.ObjectId) {
    const unit = await unitRepository.create({
      buildingId: new Types.ObjectId(),
      floorId: new Types.ObjectId(),
      organizationId,
      number: 'C-101',
      kind: 'apartment',
      area: 42,
      price: { amountMinorUnits: 100_000, currency: 'USD' },
    });
    const booking = await bookingsService.book({
      unitId: unit._id,
      organizationId,
      managerPositionId,
      actorIdentityId: new Types.ObjectId(),
      startsAt: new Date('2026-09-01T10:00:00.000Z'),
      expiresAt: new Date('2026-09-01T12:00:00.000Z'),
      idempotencyKey: `booking-key-${unit._id.toString()}`,
      correlationId: 'booking-integration',
    });
    if (!('_id' in booking)) throw new Error('expected a real booking, not a replay');
    return booking;
  }

  it('переводит pending бронь в booked (organization-scope, requiredManagerPositionId:undefined)', async () => {
    const organizationId = new Types.ObjectId();
    const manager = new Types.ObjectId();
    const booking = await createUnitAndBooking(organizationId, manager);

    const confirmed = await bookingsService.confirmBooking({
      bookingId: booking._id,
      organizationId,
      actorIdentityId: new Types.ObjectId(),
      idempotencyKey: 'confirm-key-a',
      correlationId: 'booking-integration',
    });

    if ('replay' in confirmed) throw new Error('unreachable');
    expect(confirmed.status).toBe('booked');
    expect(await connection.collection('outbox_events').countDocuments({ eventType: 'BookingConfirmed' })).toBe(1);
    expect(await connection.collection('audit_events').countDocuments({ action: 'booking.confirm' })).toBe(1);
  });

  it('own-scope: чужая Position (не manager брони) получает BOOKING_NOT_FOUND, не видит чужую бронь', async () => {
    const organizationId = new Types.ObjectId();
    const manager = new Types.ObjectId();
    const stranger = new Types.ObjectId();
    const booking = await createUnitAndBooking(organizationId, manager);

    await expect(
      bookingsService.confirmBooking({
        bookingId: booking._id,
        organizationId,
        actorIdentityId: new Types.ObjectId(),
        requiredManagerPositionId: stranger,
        idempotencyKey: 'confirm-key-b',
        correlationId: 'booking-integration',
      }),
    ).rejects.toMatchObject({ code: 'BOOKING_NOT_FOUND' });
  });

  it('own-scope: сам manager брони может confirm свою бронь', async () => {
    const organizationId = new Types.ObjectId();
    const manager = new Types.ObjectId();
    const booking = await createUnitAndBooking(organizationId, manager);

    const confirmed = await bookingsService.confirmBooking({
      bookingId: booking._id,
      organizationId,
      actorIdentityId: new Types.ObjectId(),
      requiredManagerPositionId: manager,
      idempotencyKey: 'confirm-key-c',
      correlationId: 'booking-integration',
    });

    if ('replay' in confirmed) throw new Error('unreachable');
    expect(confirmed.status).toBe('booked');
  });

  it('бросает BOOKING_INVALID_STATE_TRANSITION при повторном confirm уже booked брони', async () => {
    const organizationId = new Types.ObjectId();
    const manager = new Types.ObjectId();
    const booking = await createUnitAndBooking(organizationId, manager);

    await bookingsService.confirmBooking({
      bookingId: booking._id,
      organizationId,
      actorIdentityId: new Types.ObjectId(),
      idempotencyKey: 'confirm-key-d1',
      correlationId: 'booking-integration',
    });

    await expect(
      bookingsService.confirmBooking({
        bookingId: booking._id,
        organizationId,
        actorIdentityId: new Types.ObjectId(),
        idempotencyKey: 'confirm-key-d2',
        correlationId: 'booking-integration',
      }),
    ).rejects.toMatchObject({ code: 'BOOKING_INVALID_STATE_TRANSITION' });
  });
});

describe('BOOK-001 follow-up: extendBooking (real MongoDB transaction)', () => {
  let replSet: MongoMemoryReplSet;
  let connection: Connection;
  let bookingsService: BookingsService;
  let unitRepository: UnitRepository;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await replSet.waitUntilRunning();

    process.env.MINIO_ENDPOINT ??= 'http://localhost:9000';
    process.env.MINIO_ACCESS_KEY ??= 'test-access-key';
    process.env.MINIO_SECRET_KEY ??= 'test-secret-key';
    process.env.MINIO_BUCKET_PRIVATE ??= 'test-private';
    process.env.MINIO_BUCKET_PUBLIC ??= 'test-public';
    process.env.REDIS_URL ??= 'redis://localhost:6379';

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), MongooseModule.forRoot(replSet.getUri()), BookingsModule],
    }).compile();

    connection = moduleRef.get<Connection>(getConnectionToken());
    bookingsService = moduleRef.get(BookingsService);
    unitRepository = moduleRef.get(UnitRepository);
  }, 120_000);

  afterAll(async () => {
    await connection?.close();
    await replSet?.stop();
  });

  afterEach(async () => {
    for (const collection of ['bookings', 'booking_locks', 'outbox_events', 'idempotency_records', 'audit_events', 'units']) {
      await connection.collection(collection).deleteMany({});
    }
  });

  it('расширяет expiresAt и блокирует новую бронь в расширенном окне', async () => {
    const organizationId = new Types.ObjectId();
    const unit = await unitRepository.create({
      buildingId: new Types.ObjectId(),
      floorId: new Types.ObjectId(),
      organizationId,
      number: 'D-101',
      kind: 'apartment',
      area: 42,
      price: { amountMinorUnits: 100_000, currency: 'USD' },
    });
    const booking = await bookingsService.book({
      unitId: unit._id,
      organizationId,
      managerPositionId: new Types.ObjectId(),
      actorIdentityId: new Types.ObjectId(),
      startsAt: new Date('2026-09-01T10:00:00.000Z'),
      expiresAt: new Date('2026-09-01T12:00:00.000Z'),
      idempotencyKey: 'booking-key-extend-a',
      correlationId: 'booking-integration',
    });
    if (!('_id' in booking)) throw new Error('expected a real booking, not a replay');

    const extended = await bookingsService.extendBooking({
      bookingId: booking._id,
      organizationId,
      actorIdentityId: new Types.ObjectId(),
      newExpiresAt: new Date('2026-09-01T18:00:00.000Z'),
      idempotencyKey: 'extend-key-a',
      correlationId: 'booking-integration',
    });
    if ('replay' in extended) throw new Error('unreachable');
    expect(extended.dateRange.expiresAt.toISOString()).toBe('2026-09-01T18:00:00.000Z');
    expect(await connection.collection('outbox_events').countDocuments({ eventType: 'BookingExtended' })).toBe(1);

    // Расширенное окно (10:00-18:00) теперь блокирует бронь на 13:00-15:00,
    // которая раньше (12:00 expiresAt) была бы свободна.
    await expect(
      bookingsService.book({
        unitId: unit._id,
        organizationId,
        managerPositionId: new Types.ObjectId(),
        actorIdentityId: new Types.ObjectId(),
        startsAt: new Date('2026-09-01T13:00:00.000Z'),
        expiresAt: new Date('2026-09-01T15:00:00.000Z'),
        idempotencyKey: 'booking-key-extend-conflict',
        correlationId: 'booking-integration',
      }),
    ).rejects.toMatchObject({ code: 'BOOKING_OVERLAP' });
  });

  it('бросает BOOKING_OVERLAP, если расширение пересекает уже существующую соседнюю бронь', async () => {
    const organizationId = new Types.ObjectId();
    const unit = await unitRepository.create({
      buildingId: new Types.ObjectId(),
      floorId: new Types.ObjectId(),
      organizationId,
      number: 'D-102',
      kind: 'apartment',
      area: 42,
      price: { amountMinorUnits: 100_000, currency: 'USD' },
    });
    const first = await bookingsService.book({
      unitId: unit._id,
      organizationId,
      managerPositionId: new Types.ObjectId(),
      actorIdentityId: new Types.ObjectId(),
      startsAt: new Date('2026-09-01T10:00:00.000Z'),
      expiresAt: new Date('2026-09-01T12:00:00.000Z'),
      idempotencyKey: 'booking-key-extend-b1',
      correlationId: 'booking-integration',
    });
    if (!('_id' in first)) throw new Error('expected a real booking, not a replay');
    await bookingsService.book({
      unitId: unit._id,
      organizationId,
      managerPositionId: new Types.ObjectId(),
      actorIdentityId: new Types.ObjectId(),
      startsAt: new Date('2026-09-01T13:00:00.000Z'),
      expiresAt: new Date('2026-09-01T15:00:00.000Z'),
      idempotencyKey: 'booking-key-extend-b2',
      correlationId: 'booking-integration',
    });

    await expect(
      bookingsService.extendBooking({
        bookingId: first._id,
        organizationId,
        actorIdentityId: new Types.ObjectId(),
        newExpiresAt: new Date('2026-09-01T14:00:00.000Z'),
        idempotencyKey: 'extend-key-b',
        correlationId: 'booking-integration',
      }),
    ).rejects.toMatchObject({ code: 'BOOKING_OVERLAP' });

    const doc = await connection.collection('bookings').findOne({ _id: first._id });
    expect(doc?.dateRange.expiresAt.toISOString()).toBe('2026-09-01T12:00:00.000Z');
  });

  it('бросает VALIDATION_FAILED, если newExpiresAt не позже текущего expiresAt', async () => {
    const organizationId = new Types.ObjectId();
    const unit = await unitRepository.create({
      buildingId: new Types.ObjectId(),
      floorId: new Types.ObjectId(),
      organizationId,
      number: 'D-103',
      kind: 'apartment',
      area: 42,
      price: { amountMinorUnits: 100_000, currency: 'USD' },
    });
    const booking = await bookingsService.book({
      unitId: unit._id,
      organizationId,
      managerPositionId: new Types.ObjectId(),
      actorIdentityId: new Types.ObjectId(),
      startsAt: new Date('2026-09-01T10:00:00.000Z'),
      expiresAt: new Date('2026-09-01T12:00:00.000Z'),
      idempotencyKey: 'booking-key-extend-c',
      correlationId: 'booking-integration',
    });
    if (!('_id' in booking)) throw new Error('expected a real booking, not a replay');

    await expect(
      bookingsService.extendBooking({
        bookingId: booking._id,
        organizationId,
        actorIdentityId: new Types.ObjectId(),
        newExpiresAt: new Date('2026-09-01T11:00:00.000Z'),
        idempotencyKey: 'extend-key-c',
        correlationId: 'booking-integration',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});

describe('BOOK-002 listBookings (real MongoDB)', () => {
  let replSet: MongoMemoryReplSet;
  let connection: Connection;
  let bookingsService: BookingsService;
  let unitRepository: UnitRepository;
  let buildingRepository: BuildingRepository;
  let floorRepository: FloorRepository;
  let developmentRepository: DevelopmentRepository;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await replSet.waitUntilRunning();

    process.env.MINIO_ENDPOINT ??= 'http://localhost:9000';
    process.env.MINIO_ACCESS_KEY ??= 'test-access-key';
    process.env.MINIO_SECRET_KEY ??= 'test-secret-key';
    process.env.MINIO_BUCKET_PRIVATE ??= 'test-private';
    process.env.MINIO_BUCKET_PUBLIC ??= 'test-public';
    process.env.REDIS_URL ??= 'redis://localhost:6379';

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), MongooseModule.forRoot(replSet.getUri()), BookingsModule],
    }).compile();

    connection = moduleRef.get<Connection>(getConnectionToken());
    bookingsService = moduleRef.get(BookingsService);
    unitRepository = moduleRef.get(UnitRepository);
    buildingRepository = moduleRef.get(BuildingRepository);
    floorRepository = moduleRef.get(FloorRepository);
    developmentRepository = moduleRef.get(DevelopmentRepository);
  }, 120_000);

  afterAll(async () => {
    await connection?.close();
    await replSet?.stop();
  });

  afterEach(async () => {
    for (const collection of [
      'bookings',
      'booking_locks',
      'outbox_events',
      'idempotency_records',
      'audit_events',
      'units',
      'buildings',
      'developments',
      'floors',
    ]) {
      await connection.collection(collection).deleteMany({});
    }
  });

  async function seedUnit(organizationId: Types.ObjectId, developmentId?: Types.ObjectId) {
    const development =
      developmentId !== undefined
        ? undefined
        : await developmentRepository.create({
            organizationId,
            name: 'ЖК BOOK-002',
            location: { country: 'Georgia', city: 'Batumi', geo: { type: 'Point', coordinates: [41.6, 41.6] } },
            contact: { phone: '+995500000000' },
          });
    const building = await buildingRepository.create({
      developmentId: developmentId ?? development!._id,
      organizationId,
      name: 'Корпус BOOK-002',
      floorsCount: 5,
    });
    const floor = await floorRepository.create({ buildingId: building._id, organizationId, floorNumber: 1 });
    const unit = await unitRepository.create({
      buildingId: building._id,
      floorId: floor._id,
      organizationId,
      number: '1',
      kind: 'apartment',
      area: 40,
      price: { amountMinorUnits: 10_000_000, currency: 'USD' },
    });
    return { development: development ?? { _id: developmentId! }, building, unit };
  }

  async function bookUnit(
    organizationId: Types.ObjectId,
    unitId: Types.ObjectId,
    managerPositionId: Types.ObjectId,
    idempotencyKey: string,
  ) {
    const booking = await bookingsService.book({
      unitId,
      organizationId,
      managerPositionId,
      actorIdentityId: new Types.ObjectId(),
      startsAt: new Date('2026-09-01T10:00:00.000Z'),
      expiresAt: new Date('2026-09-01T12:00:00.000Z'),
      idempotencyKey,
      correlationId: 'booking-list-integration',
    });
    if (!('_id' in booking)) throw new Error('expected a real booking, not a replay');
    return booking;
  }

  it('изолирует брони по organizationId — tenant A не видит брони tenant B', async () => {
    const orgA = new Types.ObjectId();
    const orgB = new Types.ObjectId();
    const { unit: unitA } = await seedUnit(orgA);
    const { unit: unitB } = await seedUnit(orgB);
    await bookUnit(orgA, unitA._id, new Types.ObjectId(), 'list-key-a');
    await bookUnit(orgB, unitB._id, new Types.ObjectId(), 'list-key-b');

    const resultA = await bookingsService.listBookings({ organizationId: orgA, limit: 20 });

    expect(resultA).toHaveLength(1);
    expect(resultA[0]!.unitId.toString()).toBe(unitA._id.toString());
  });

  it('unitId — сужает точно до одного юнита (чужой unitId → BOOKING по нему не найден в результате)', async () => {
    const organizationId = new Types.ObjectId();
    const { unit: unitA } = await seedUnit(organizationId);
    const { unit: unitB } = await seedUnit(organizationId);
    await bookUnit(organizationId, unitA._id, new Types.ObjectId(), 'list-key-c');
    await bookUnit(organizationId, unitB._id, new Types.ObjectId(), 'list-key-d');

    const result = await bookingsService.listBookings({ organizationId, unitId: unitA._id, limit: 20 });

    expect(result).toHaveLength(1);
    expect(result[0]!.unitId.toString()).toBe(unitA._id.toString());
  });

  it('unitId чужой организации → безопасный 404, не утечка чужого юнита (тот же принцип, что getUnitForOrganization)', async () => {
    const organizationId = new Types.ObjectId();
    const { unit } = await seedUnit(new Types.ObjectId());

    await expect(
      bookingsService.listBookings({ organizationId, unitId: unit._id, limit: 20 }),
    ).rejects.toThrow();
  });

  it('buildingId — резолвит все unitId этого building и фильтрует брони по ним', async () => {
    const organizationId = new Types.ObjectId();
    const { building, unit: unitInBuilding } = await seedUnit(organizationId);
    const { unit: unitInOtherBuilding } = await seedUnit(organizationId);
    await bookUnit(organizationId, unitInBuilding._id, new Types.ObjectId(), 'list-key-e');
    await bookUnit(organizationId, unitInOtherBuilding._id, new Types.ObjectId(), 'list-key-f');

    const result = await bookingsService.listBookings({ organizationId, buildingId: building._id, limit: 20 });

    expect(result).toHaveLength(1);
    expect(result[0]!.unitId.toString()).toBe(unitInBuilding._id.toString());
  });

  it('developmentId — резолвит unitId всех buildings этого ЖК (несколько корпусов)', async () => {
    const organizationId = new Types.ObjectId();
    const { development, unit: unitInFirstBuilding } = await seedUnit(organizationId);
    const { unit: unitInSecondBuilding } = await seedUnit(organizationId, development._id);
    const { unit: unitInOtherDevelopment } = await seedUnit(organizationId);
    await bookUnit(organizationId, unitInFirstBuilding._id, new Types.ObjectId(), 'list-key-g');
    await bookUnit(organizationId, unitInSecondBuilding._id, new Types.ObjectId(), 'list-key-h');
    await bookUnit(organizationId, unitInOtherDevelopment._id, new Types.ObjectId(), 'list-key-i');

    const result = await bookingsService.listBookings({ organizationId, developmentId: development._id, limit: 20 });

    expect(result.map((b) => b.unitId.toString()).sort()).toEqual(
      [unitInFirstBuilding._id.toString(), unitInSecondBuilding._id.toString()].sort(),
    );
  });

  it('status — фильтрует по статусу брони', async () => {
    const organizationId = new Types.ObjectId();
    const { unit: unitA } = await seedUnit(organizationId);
    const { unit: unitB } = await seedUnit(organizationId);
    const bookingA = await bookUnit(organizationId, unitA._id, new Types.ObjectId(), 'list-key-j');
    await bookUnit(organizationId, unitB._id, new Types.ObjectId(), 'list-key-k');
    await bookingsService.cancelBooking({
      bookingId: bookingA._id,
      organizationId,
      actorIdentityId: new Types.ObjectId(),
      idempotencyKey: 'list-cancel-a',
      correlationId: 'booking-list-integration',
    });

    const result = await bookingsService.listBookings({ organizationId, status: 'rejected', limit: 20 });

    expect(result).toHaveLength(1);
    expect(result[0]!.unitId.toString()).toBe(unitA._id.toString());
  });

  it('managerPositionId (own-scope) — сужает до броней конкретной Position', async () => {
    const organizationId = new Types.ObjectId();
    const managerA = new Types.ObjectId();
    const managerB = new Types.ObjectId();
    const { unit: unitA } = await seedUnit(organizationId);
    const { unit: unitB } = await seedUnit(organizationId);
    await bookUnit(organizationId, unitA._id, managerA, 'list-key-l');
    await bookUnit(organizationId, unitB._id, managerB, 'list-key-m');

    const result = await bookingsService.listBookings({ organizationId, managerPositionId: managerA, limit: 20 });

    expect(result).toHaveLength(1);
    expect(result[0]!.manager.toString()).toBe(managerA.toString());
  });

  it('cursor-пагинация — сортировка по _id, cursor исключает уже прочитанные', async () => {
    const organizationId = new Types.ObjectId();
    const { unit } = await seedUnit(organizationId);
    const bookingIds: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const { unit: iterationUnit } = await seedUnit(organizationId);
      const booking = await bookUnit(organizationId, i === 0 ? unit._id : iterationUnit._id, new Types.ObjectId(), `list-key-page-${i}`);
      bookingIds.push(booking._id.toString());
    }
    bookingIds.sort();

    const firstPage = await bookingsService.listBookings({ organizationId, limit: 2 });
    expect(firstPage).toHaveLength(2);
    expect(firstPage.map((b) => b._id.toString())).toEqual(bookingIds.slice(0, 2));

    const secondPage = await bookingsService.listBookings({
      organizationId,
      cursor: firstPage[firstPage.length - 1]!._id,
      limit: 2,
    });
    expect(secondPage.map((b) => b._id.toString())).toEqual(bookingIds.slice(2));
  });
});

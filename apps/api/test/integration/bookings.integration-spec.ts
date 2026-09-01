import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { BookingsModule } from '../../src/modules/bookings/bookings.module';
import { BookingsService } from '../../src/modules/bookings/bookings.service';
import { UnitRepository } from '../../src/modules/developments/repository/unit.repository';

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

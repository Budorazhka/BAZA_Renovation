import { Test } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { AppModule } from '../../src/app.module';
import { RedisService } from '../../src/shared/redis/redis.service';
import { createRedisMockService } from './support/redis-mock';
import { BookingsService } from '../../src/modules/bookings/bookings.service';
import { BookingRepository } from '../../src/modules/bookings/repository/booking.repository';
import { DevelopmentsService } from '../../src/modules/developments/developments.service';
import {
  DevelopmentRepository,
  BuildingRepository,
  FloorRepository,
  UnitRepository,
} from '@baza/development';
import { CrmService } from '../../src/modules/crm/crm.service';
import { MarketplacePublicationRepository } from '@baza/publication';
import { ErrorCode } from '../../src/shared/errors/error-codes';
import { ConflictException } from '@nestjs/common';

describe('P0-03: Concurrency, transactions, idempotency, and projection CAS', () => {
  let replSet: MongoMemoryReplSet;
  let connection: Connection;
  let bookingsService: BookingsService;
  let bookingRepository: BookingRepository;
  let developmentsService: DevelopmentsService;
  let developmentRepository: DevelopmentRepository;
  let buildingRepository: BuildingRepository;
  let floorRepository: FloorRepository;
  let unitRepository: UnitRepository;
  let crmService: CrmService;
  let publicationRepository: MarketplacePublicationRepository;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await replSet.waitUntilRunning();
    process.env.MONGO_URI = replSet.getUri();

    process.env.MINIO_ENDPOINT ??= 'http://localhost:9000';
    process.env.MINIO_ACCESS_KEY ??= 'test-access-key';
    process.env.MINIO_SECRET_KEY ??= 'test-secret-key';
    process.env.MINIO_BUCKET_PRIVATE ??= 'test-private';
    process.env.MINIO_BUCKET_PUBLIC ??= 'test-public';
    process.env.REDIS_URL ??= 'redis://localhost:6379';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RedisService)
      .useValue(createRedisMockService())
      .compile();

    connection = moduleRef.get<Connection>(getConnectionToken());
    bookingsService = moduleRef.get(BookingsService);
    bookingRepository = moduleRef.get(BookingRepository);
    developmentsService = moduleRef.get(DevelopmentsService);
    developmentRepository = moduleRef.get(DevelopmentRepository);
    buildingRepository = moduleRef.get(BuildingRepository);
    floorRepository = moduleRef.get(FloorRepository);
    unitRepository = moduleRef.get(UnitRepository);
    crmService = moduleRef.get(CrmService);
    publicationRepository = moduleRef.get(MarketplacePublicationRepository);
  }, 120_000);

  afterAll(async () => {
    await connection?.close();
    await replSet?.stop();
  });

  afterEach(async () => {
    await connection.collection('developments').deleteMany({});
    await connection.collection('buildings').deleteMany({});
    await connection.collection('floors').deleteMany({});
    await connection.collection('units').deleteMany({});
    await connection.collection('bookings').deleteMany({});
    await connection.collection('deals').deleteMany({});
    await connection.collection('contacts').deleteMany({});
    await connection.collection('leads').deleteMany({});
    await connection.collection('marketplace_publications').deleteMany({});
    await connection.collection('outbox_events').deleteMany({});
    await connection.collection('idempotency_records').deleteMany({});
    await connection.collection('organizations').deleteMany({});
    await connection.collection('positions').deleteMany({});
  });

  async function seedHierarchy(orgId: Types.ObjectId) {
    await connection.collection('organizations').insertOne({
      _id: orgId,
      name: 'Тестовый Застройщик',
      type: 'developer',
      createdAt: new Date(),
    });

    const development = await developmentRepository.create({
      organizationId: orgId,
      name: 'ЖК Батуми Бич',
      location: {
        country: 'Georgia',
        city: 'Batumi',
        address: 'Rustaveli 1',
        geo: { type: 'Point', coordinates: [41.64, 41.63] },
      },
      contact: { phone: '+995500000001' },
    });

    const building = await buildingRepository.create({
      developmentId: development._id,
      organizationId: orgId,
      name: 'Корпус 1',
      floorsCount: 10,
    });

    const floor = await floorRepository.create({
      buildingId: building._id,
      organizationId: orgId,
      floorNumber: 1,
    });

    const contact = await connection.collection('contacts').insertOne({
      organizationId: orgId,
      name: 'Иван Покупатель',
      phone: '+995599000111',
      createdAt: new Date(),
    });

    return { development, building, floor, contactId: contact.insertedId };
  }

  describe('1. Конкурентные convert-to-deal с одним Idempotency-Key', () => {
    it('два конкурентных convert-to-deal дают одну сделку и оба возвращают валидный результат', async () => {
      const orgId = new Types.ObjectId();
      const managerId = new Types.ObjectId();
      const identityId = new Types.ObjectId();
      const { building, floor, contactId } = await seedHierarchy(orgId);

      const [unit] = await unitRepository.createMany(
        [
          {
            buildingId: building._id,
            floorId: floor._id,
            organizationId: orgId,
            number: '101',
            kind: 'apartment',
            area: 50,
            price: { amountMinorUnits: 5000000, currency: 'USD' },
          },
        ],
        undefined as never,
      );

      // Бронь на квартиру
      const booking = await bookingRepository.create(
        {
          unitId: unit!._id,
          organizationId: orgId,
          manager: managerId,
          dateRange: { startsAt: new Date(), expiresAt: new Date(Date.now() + 86400000) },
        },
        undefined as never,
      );

      const idempotencyKey = 'conv-race-same-key';
      const correlationId = 'cid-race-1';

      // Два параллельных запроса с ОДНИМ Idempotency-Key
      const runCall = () =>
        bookingsService.convertToDeal({
          bookingId: booking._id,
          organizationId: orgId,
          actorIdentityId: identityId,
          managerPositionId: managerId,
          contactId,
          title: 'Сделка по квартире 101',
          idempotencyKey,
          correlationId,
        });

      const [res1, res2] = await Promise.all([runCall(), runCall()]);

      // Проверяем, что в БД ровно одна сделка
      const dealsCount = await connection.collection('deals').countDocuments({ organizationId: orgId });
      expect(dealsCount).toBe(1);

      // Оба вызова должны вернуть сделку (один напрямую, второй через replay)
      const dealId1 = 'deal' in res1 ? res1.deal._id.toString() : (res1.replay.responseBody.dealId as string);
      const dealId2 = 'deal' in res2 ? res2.deal._id.toString() : (res2.replay.responseBody.dealId as string);
      expect(dealId1).toBeDefined();
      expect(dealId2).toBe(dealId1);

      // Проверяем состояние брони и юнита в БД
      const updatedBooking = await connection.collection('bookings').findOne({ _id: booking._id });
      expect(updatedBooking?.status).toBe('paid');

      const updatedUnit = await connection.collection('units').findOne({ _id: unit!._id });
      expect(updatedUnit?.status).toBe('sold');
    });

    it('повтор Idempotency-Key с тем же телом возвращает replay, а с другим телом отклоняется (409)', async () => {
      const orgId = new Types.ObjectId();
      const managerId = new Types.ObjectId();
      const identityId = new Types.ObjectId();
      const { building, floor, contactId } = await seedHierarchy(orgId);

      const [unit] = await unitRepository.createMany(
        [
          {
            buildingId: building._id,
            floorId: floor._id,
            organizationId: orgId,
            number: '102',
            kind: 'apartment',
            area: 55,
            price: { amountMinorUnits: 5500000, currency: 'USD' },
          },
        ],
        undefined as never,
      );

      const booking = await bookingRepository.create(
        {
          unitId: unit!._id,
          organizationId: orgId,
          manager: managerId,
          dateRange: { startsAt: new Date(), expiresAt: new Date(Date.now() + 86400000) },
        },
        undefined as never,
      );

      const idempotencyKey = 'conv-replay-key';
      const correlationId = 'cid-replay-1';

      const initial = await bookingsService.convertToDeal({
        bookingId: booking._id,
        organizationId: orgId,
        actorIdentityId: identityId,
        managerPositionId: managerId,
        contactId,
        title: 'Первоначальная сделка',
        idempotencyKey,
        correlationId,
      });

      expect('deal' in initial).toBe(true);

      // Повторный вызов с тем же ключом и тем же телом (бронь уже paid!)
      const replayResult = await bookingsService.convertToDeal({
        bookingId: booking._id,
        organizationId: orgId,
        actorIdentityId: identityId,
        managerPositionId: managerId,
        contactId,
        title: 'Первоначальная сделка',
        idempotencyKey,
        correlationId,
      });

      expect('replay' in replayResult).toBe(true);
      if ('replay' in replayResult) {
        expect(replayResult.replay.responseStatus).toBe(201);
      }

      // Повторный вызов с тем же ключом, но ДРУГИМ телом
      await expect(
        bookingsService.convertToDeal({
          bookingId: booking._id,
          organizationId: orgId,
          actorIdentityId: identityId,
          managerPositionId: managerId,
          contactId,
          title: 'ИЗМЕНЁННОЕ НАЗВАНИЕ СДЕЛКИ',
          idempotencyKey,
          correlationId,
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.IDEMPOTENCY_KEY_CONFLICT,
      });
    });
  });

  describe('2. Конкурентные convert-to-deal с разными ключами', () => {
    it('только один запрос переводит бронь в сделку, второй отклоняется с BOOKING_INVALID_STATE_TRANSITION', async () => {
      const orgId = new Types.ObjectId();
      const managerId = new Types.ObjectId();
      const identityId = new Types.ObjectId();
      const { building, floor, contactId } = await seedHierarchy(orgId);

      const [unit] = await unitRepository.createMany(
        [
          {
            buildingId: building._id,
            floorId: floor._id,
            organizationId: orgId,
            number: '103',
            kind: 'apartment',
            area: 60,
            price: { amountMinorUnits: 6000000, currency: 'USD' },
          },
        ],
        undefined as never,
      );

      const booking = await bookingRepository.create(
        {
          unitId: unit!._id,
          organizationId: orgId,
          manager: managerId,
          dateRange: { startsAt: new Date(), expiresAt: new Date(Date.now() + 86400000) },
        },
        undefined as never,
      );

      const runCallA = () =>
        bookingsService.convertToDeal({
          bookingId: booking._id,
          organizationId: orgId,
          actorIdentityId: identityId,
          managerPositionId: managerId,
          contactId,
          title: 'Сделка A',
          idempotencyKey: 'key-diff-A',
          correlationId: 'cid-diff-A',
        });

      const runCallB = () =>
        bookingsService.convertToDeal({
          bookingId: booking._id,
          organizationId: orgId,
          actorIdentityId: identityId,
          managerPositionId: managerId,
          contactId,
          title: 'Сделка B',
          idempotencyKey: 'key-diff-B',
          correlationId: 'cid-diff-B',
        });

      const results = await Promise.allSettled([runCallA(), runCallB()]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      if (rejected[0]?.status === 'rejected') {
        expect((rejected[0].reason as { code?: string }).code).toBe(ErrorCode.BOOKING_INVALID_STATE_TRANSITION);
      }

      // В БД ровно 1 сделка
      const dealsCount = await connection.collection('deals').countDocuments({ organizationId: orgId });
      expect(dealsCount).toBe(1);
    });
  });

  describe('3. Отклонение невалидных броней и чужих организаций', () => {
    it('просроченная бронь (expiresAt в прошлом) отклоняется', async () => {
      const orgId = new Types.ObjectId();
      const managerId = new Types.ObjectId();
      const identityId = new Types.ObjectId();
      const { building, floor, contactId } = await seedHierarchy(orgId);

      const [unit] = await unitRepository.createMany(
        [
          {
            buildingId: building._id,
            floorId: floor._id,
            organizationId: orgId,
            number: '104',
            kind: 'apartment',
            area: 40,
            price: { amountMinorUnits: 4000000, currency: 'USD' },
          },
        ],
        undefined as never,
      );

      const booking = await bookingRepository.create(
        {
          unitId: unit!._id,
          organizationId: orgId,
          manager: managerId,
          dateRange: { startsAt: new Date(Date.now() - 100000), expiresAt: new Date(Date.now() - 1000) },
        },
        undefined as never,
      );

      await expect(
        bookingsService.convertToDeal({
          bookingId: booking._id,
          organizationId: orgId,
          actorIdentityId: identityId,
          managerPositionId: managerId,
          contactId,
          idempotencyKey: 'expired-key',
          correlationId: 'cid-expired',
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.BOOKING_INVALID_STATE_TRANSITION,
      });
    });

    it('отменённая/отклонённая бронь отклоняется', async () => {
      const orgId = new Types.ObjectId();
      const managerId = new Types.ObjectId();
      const identityId = new Types.ObjectId();
      const { building, floor, contactId } = await seedHierarchy(orgId);

      const [unit] = await unitRepository.createMany(
        [
          {
            buildingId: building._id,
            floorId: floor._id,
            organizationId: orgId,
            number: '105',
            kind: 'apartment',
            area: 42,
            price: { amountMinorUnits: 4200000, currency: 'USD' },
          },
        ],
        undefined as never,
      );

      const booking = await bookingRepository.create(
        {
          unitId: unit!._id,
          organizationId: orgId,
          manager: managerId,
          dateRange: { startsAt: new Date(), expiresAt: new Date(Date.now() + 86400000) },
        },
        undefined as never,
      );
      await connection.collection('bookings').updateOne({ _id: booking._id }, { $set: { status: 'rejected' } });

      await expect(
        bookingsService.convertToDeal({
          bookingId: booking._id,
          organizationId: orgId,
          actorIdentityId: identityId,
          managerPositionId: managerId,
          contactId,
          idempotencyKey: 'rejected-key',
          correlationId: 'cid-rejected',
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.BOOKING_INVALID_STATE_TRANSITION,
      });
    });

    it('чужая организация отвергается с 404 (non-disclosure)', async () => {
      const orgId = new Types.ObjectId();
      const otherOrgId = new Types.ObjectId();
      const managerId = new Types.ObjectId();
      const identityId = new Types.ObjectId();
      const { building, floor, contactId } = await seedHierarchy(orgId);

      const [unit] = await unitRepository.createMany(
        [
          {
            buildingId: building._id,
            floorId: floor._id,
            organizationId: orgId,
            number: '106',
            kind: 'apartment',
            area: 45,
            price: { amountMinorUnits: 4500000, currency: 'USD' },
          },
        ],
        undefined as never,
      );

      const booking = await bookingRepository.create(
        {
          unitId: unit!._id,
          organizationId: orgId,
          manager: managerId,
          dateRange: { startsAt: new Date(), expiresAt: new Date(Date.now() + 86400000) },
        },
        undefined as never,
      );

      await expect(
        bookingsService.convertToDeal({
          bookingId: booking._id,
          organizationId: otherOrgId,
          actorIdentityId: identityId,
          managerPositionId: managerId,
          contactId,
          idempotencyKey: 'other-org-key',
          correlationId: 'cid-other-org',
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.BOOKING_NOT_FOUND,
      });
    });
  });

  describe('4. Откат транзакции при сбое внутри convertToDeal', () => {
    it('сбой внутри транзакции не оставляет частичных записей или событий', async () => {
      const orgId = new Types.ObjectId();
      const managerId = new Types.ObjectId();
      const identityId = new Types.ObjectId();
      const { building, floor, contactId } = await seedHierarchy(orgId);

      const [unit] = await unitRepository.createMany(
        [
          {
            buildingId: building._id,
            floorId: floor._id,
            organizationId: orgId,
            number: '107',
            kind: 'apartment',
            area: 48,
            price: { amountMinorUnits: 4800000, currency: 'USD' },
          },
        ],
        undefined as never,
      );

      const booking = await bookingRepository.create(
        {
          unitId: unit!._id,
          organizationId: orgId,
          manager: managerId,
          dateRange: { startsAt: new Date(), expiresAt: new Date(Date.now() + 86400000) },
        },
        undefined as never,
      );

      // Имитируем падение создания сделки
      jest.spyOn(crmService, 'createDealInSession').mockRejectedValueOnce(new Error('Simulated DB failure'));

      await expect(
        bookingsService.convertToDeal({
          bookingId: booking._id,
          organizationId: orgId,
          actorIdentityId: identityId,
          managerPositionId: managerId,
          contactId,
          idempotencyKey: 'fail-key',
          correlationId: 'cid-fail',
        }),
      ).rejects.toThrow('Simulated DB failure');

      // Проверяем полный откат: бронь по-прежнему pending, юнит available, сделок 0, outbox 0
      const bookingInDb = await connection.collection('bookings').findOne({ _id: booking._id });
      expect(bookingInDb?.status).toBe('pending');

      const unitInDb = await connection.collection('units').findOne({ _id: unit!._id });
      expect(unitInDb?.status).toBe('available');

      const dealsCount = await connection.collection('deals').countDocuments({ organizationId: orgId });
      expect(dealsCount).toBe(0);

      const outboxCount = await connection.collection('outbox_events').countDocuments({});
      expect(outboxCount).toBe(0);
    });
  });

  describe('5. Атомарность batchUpdatePrices при конфликте версий', () => {
    it('при конфликте версии одного юнита вся пакетная операция откатывается', async () => {
      const orgId = new Types.ObjectId();
      const identityId = new Types.ObjectId();
      const positionId = new Types.ObjectId();
      const { development, building, floor } = await seedHierarchy(orgId);

      const [unit1, unit2] = await unitRepository.createMany(
        [
          {
            buildingId: building._id,
            floorId: floor._id,
            organizationId: orgId,
            number: '201',
            kind: 'apartment',
            area: 50,
            price: { amountMinorUnits: 5000000, currency: 'USD' },
          },
          {
            buildingId: building._id,
            floorId: floor._id,
            organizationId: orgId,
            number: '202',
            kind: 'apartment',
            area: 60,
            price: { amountMinorUnits: 6000000, currency: 'USD' },
          },
        ],
        undefined as never,
      );

      // Имитируем параллельное изменение unit2 во время выполнения транзакции
      const origUpdate = unitRepository.updatePriceWithVersionCheck.bind(unitRepository);
      jest.spyOn(unitRepository, 'updatePriceWithVersionCheck').mockImplementation(async (id, orgId, expVer, p, session) => {
        if (id.equals(unit1!._id)) {
          // Пока unit1 обновляется в сессии, внешний запрос изменяет unit2 вне сессии
          await connection.collection('units').updateOne({ _id: unit2!._id }, { $inc: { version: 1 } });
        }
        return origUpdate(id, orgId, expVer, p, session);
      });

      await expect(
        developmentsService.batchUpdatePrices({
          developmentId: development._id,
          organizationId: orgId,
          operationType: 'percentage',
          value: 10,
          actorIdentityId: identityId,
          actorPositionId: positionId,
          correlationId: 'cid-batch-conflict',
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      // Проверяем, что unit1 НЕ изменился (транзакция полностью откатилась)
      const unit1InDb = await connection.collection('units').findOne({ _id: unit1!._id });
      expect(unit1InDb?.price?.amountMinorUnits).toBe(5000000);
      expect(unit1InDb?.version).toBe(0);

      // Никаких outbox событий
      const outboxCount = await connection.collection('outbox_events').countDocuments({});
      expect(outboxCount).toBe(0);
    });
  });

  describe('6. CAS в updateProjection (MarketplacePublicationRepository)', () => {
    it('updateProjection с устаревшим expectedVersion возвращает null и не перезаписывает данные', async () => {
      const pubId = new Types.ObjectId();
      const devId = new Types.ObjectId();
      const orgId = new Types.ObjectId();

      await connection.collection('marketplace_publications').insertOne({
        _id: pubId,
        sourceType: 'development',
        sourceId: devId,
        publisherScope: { organizationId: orgId },
        status: 'published',
        version: 2,
        denormalizedFields: { name: 'Sunset 2', priceFrom: { amountMinorUnits: 2000000, currency: 'USD' } },
        searchProjection: { priceAmountMinorUnits: 2000000, priceCurrency: 'USD' },
        createdAt: new Date(),
      });

      // Попытка обновить с expectedVersion: 1 (устаревшая версия)
      const staleResult = await publicationRepository.updateProjection(
        pubId,
        {
          searchProjection: { priceAmountMinorUnits: 9999999, priceCurrency: 'USD' },
        },
        { expectedVersion: 1 },
      );

      expect(staleResult).toBeNull();

      // В БД данные не изменились, версия не увеличилась
      const pubAfterStale = await connection.collection('marketplace_publications').findOne({ _id: pubId });
      expect(pubAfterStale?.version).toBe(2);
      expect(pubAfterStale?.searchProjection?.priceAmountMinorUnits).toBe(2000000);

      // Теперь вызов с правильным expectedVersion: 2
      const freshResult = await publicationRepository.updateProjection(
        pubId,
        {
          searchProjection: { priceAmountMinorUnits: 3000000, priceCurrency: 'USD' },
        },
        { expectedVersion: 2 },
      );

      expect(freshResult).not.toBeNull();
      expect(freshResult?.version).toBe(3);
      expect(freshResult?.searchProjection?.priceAmountMinorUnits).toBe(3000000);
    });
  });
});

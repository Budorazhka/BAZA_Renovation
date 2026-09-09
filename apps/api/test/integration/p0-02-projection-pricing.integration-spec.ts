import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import fastifyCookie from '@fastify/cookie';
import { AppModule } from '../../src/app.module';
import { AppExceptionFilter } from '../../src/shared/errors/app-exception.filter';
import { CorrelationIdMiddleware } from '../../src/shared/errors/correlation-id.middleware';
import { TenantContextMiddleware } from '../../src/shared/tenant/tenant-context.middleware';
import { AdminContextMiddleware } from '../../src/shared/admin/admin-context.middleware';
import { RedisService } from '../../src/shared/redis/redis.service';
import { createRedisMockService } from './support/redis-mock';
import {
  DevelopmentRepository,
  BuildingRepository,
  UnitRepository,
  FloorPlanRepository,
} from '@baza/development';
import { ListingRepository, PropertyAssetRepository } from '@baza/property-assets';
import { MarketplacePublicationRepository } from '@baza/publication';
import { MediaAssetRepository, MediaStorageService } from '@baza/media-storage';
import { PublicationRequestedHandler } from '../../../worker/src/handlers/publication-requested.handler';
import { UnitPriceChangedHandler } from '../../../worker/src/handlers/unit-price-changed.handler';
import { UnitStatusChangedHandler } from '../../../worker/src/handlers/unit-status-changed.handler';

describe('P0-02: Public projection pricing, currency consistency, and status transitions', () => {
  let replSet: MongoMemoryReplSet;
  let app: NestFastifyApplication;
  let connection: Connection;
  let developmentRepository: DevelopmentRepository;
  let buildingRepository: BuildingRepository;
  let unitRepository: UnitRepository;
  let floorPlanRepository: FloorPlanRepository;
  let publicationRepository: MarketplacePublicationRepository;
  let publicationHandler: PublicationRequestedHandler;
  let unitPriceHandler: UnitPriceChangedHandler;
  let unitStatusHandler: UnitStatusChangedHandler;

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

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.register(fastifyCookie);

    const fastifyInstance = app.getHttpAdapter().getInstance();
    const correlationIdMiddleware = app.get(CorrelationIdMiddleware);
    const tenantContextMiddleware = app.get(TenantContextMiddleware);
    const adminContextMiddleware = app.get(AdminContextMiddleware);
    fastifyInstance.addHook('onRequest', async (req, reply) => {
      await correlationIdMiddleware.use(req, reply, () => {});
    });
    fastifyInstance.addHook('onRequest', async (req, reply) => {
      await tenantContextMiddleware.use(req, reply, () => {});
    });
    fastifyInstance.addHook('onRequest', async (req, reply) => {
      await adminContextMiddleware.use(req, reply, () => {});
    });

    app.useGlobalFilters(new AppExceptionFilter());
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    connection = moduleRef.get<Connection>(getConnectionToken());
    developmentRepository = moduleRef.get(DevelopmentRepository);
    buildingRepository = moduleRef.get(BuildingRepository);
    unitRepository = moduleRef.get(UnitRepository);
    floorPlanRepository = moduleRef.get(FloorPlanRepository);
    publicationRepository = moduleRef.get(MarketplacePublicationRepository);

    publicationHandler = new PublicationRequestedHandler(
      publicationRepository,
      developmentRepository,
      moduleRef.get(ListingRepository),
      moduleRef.get(PropertyAssetRepository),
      moduleRef.get(MediaAssetRepository),
      moduleRef.get(MediaStorageService),
      buildingRepository,
      unitRepository,
      floorPlanRepository,
    );

    unitPriceHandler = new UnitPriceChangedHandler(
      unitRepository,
      buildingRepository,
      publicationRepository,
      developmentRepository,
    );

    unitStatusHandler = new UnitStatusChangedHandler(
      unitRepository,
      buildingRepository,
      publicationRepository,
      developmentRepository,
    );
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await replSet?.stop();
  });

  afterEach(async () => {
    await connection.collection('developments').deleteMany({});
    await connection.collection('buildings').deleteMany({});
    await connection.collection('units').deleteMany({});
    await connection.collection('marketplace_publications').deleteMany({});
    await connection.collection('outbox_events').deleteMany({});
    await connection.collection('identities').deleteMany({});
    await connection.collection('organizations').deleteMany({});
    await connection.collection('positions').deleteMany({});
    await connection.collection('position_assignments').deleteMany({});
    await connection.collection('sessions').deleteMany({});
    await connection.collection('permission_grants').deleteMany({});
  });

  async function seedAuthenticatedDeveloperOwner(name = 'Застройщик Батуми') {
    const login = `owner-${new Types.ObjectId().toString()}@example.test`;
    const password = 'correct horse battery staple';
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { login, password },
    });
    const orgRes = await app.inject({
      method: 'POST',
      url: '/api/v1/organizations/register',
      payload: { login, password, type: 'developer', name },
    });
    expect(orgRes.statusCode).toBe(201);
    const raw = orgRes.headers['set-cookie'];
    const cookie = (Array.isArray(raw) ? raw[0] : raw)?.match(/baza_session=[^;]+/)?.[0];
    if (!cookie) throw new Error('session cookie missing');
    return { cookie, organizationId: new Types.ObjectId(orgRes.json().organizationId as string) };
  }

  it('полный жизненный цикл цены: смешанные валюты → единая валюта → распродажа → возврат доступности', async () => {
    const { cookie, organizationId } = await seedAuthenticatedDeveloperOwner();

    // 1. Создаём ЖК
    const development = await developmentRepository.create({
      organizationId,
      name: 'ЖК Батуми Сансет',
      location: { country: 'Georgia', city: 'Batumi', geo: { type: 'Point', coordinates: [41.65, 41.64] } },
      contact: { phone: '+995500000010' },
    });
    const developmentId = development._id;

    // 2. Создаём корпус
    const buildingDoc = await connection.collection('buildings').insertOne({
      _id: new Types.ObjectId(),
      developmentId,
      organizationId,
      name: 'Корпус А',
      floorsCount: 10,
      createdAt: new Date(),
    });
    const buildingId = buildingDoc.insertedId;

    // 3. Создаём две квартиры в РАЗНЫХ валютах (смешанные валюты: USD и GEL)
    const unit1Id = new Types.ObjectId();
    const unit2Id = new Types.ObjectId();
    await connection.collection('units').insertMany([
      {
        _id: unit1Id,
        buildingId,
        organizationId,
        number: '101',
        kind: 'apartment',
        rooms: 1,
        area: 45,
        price: { amountMinorUnits: 4500000, currency: 'USD' },
        status: 'available',
        createdAt: new Date(),
      },
      {
        _id: unit2Id,
        buildingId,
        organizationId,
        number: '102',
        kind: 'apartment',
        rooms: 2,
        area: 65,
        price: { amountMinorUnits: 12000000, currency: 'GEL' },
        status: 'available',
        createdAt: new Date(),
      },
    ]);

    // 4. Публикуем ЖК через API
    const publishRes = await app.inject({
      method: 'POST',
      url: `/api/v1/developments/${developmentId.toString()}/publish`,
      headers: { cookie, 'idempotency-key': `publish-${developmentId.toString()}` },
    });
    expect(publishRes.statusCode).toBe(202);

    // Извлекаем OutboxEvent и передаём PublicationRequestedHandler
    const pubEvent = await connection.collection('outbox_events').findOne({ aggregateType: 'development', eventType: 'PublicationRequested' });
    expect(pubEvent).not.toBeNull();
    await publicationHandler.handle(pubEvent as never);

    const pubDoc = await publicationRepository.findBySource('development', developmentId);
    expect(pubDoc?.status).toBe('published');
    const slug = pubDoc!.slug!;

    // 5. Проверяем карточку ЖК (GET /public/developments/:slug):
    // Правило: при смешанных валютах priceFrom НЕ публикуется (undefined), но у квартир цены в исходных валютах
    const cardRes1 = await app.inject({
      method: 'GET',
      url: `/api/v1/public/developments/${slug}`,
    });
    expect(cardRes1.statusCode).toBe(200);
    const cardBody1 = JSON.parse(cardRes1.body);
    expect(cardBody1.priceFrom).toBeUndefined();
    expect(cardBody1.units).toHaveLength(2);
    expect(cardBody1.units).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ number: '101', price: { amountMinorUnits: 4500000, currency: 'USD' } }),
        expect.objectContaining({ number: '102', price: { amountMinorUnits: 12000000, currency: 'GEL' } }),
      ]),
    );

    // 6. Проверяем каталог (GET /public/developments)
    const listRes1 = await app.inject({
      method: 'GET',
      url: '/api/v1/public/developments',
    });
    expect(listRes1.statusCode).toBe(200);
    const listBody1 = JSON.parse(listRes1.body);
    const item1 = listBody1.items.find((i: { slug: string }) => i.slug === slug);
    expect(item1).toBeDefined();
    expect(item1.priceFrom).toBeUndefined();

    // 7. Смена валюты: квартира 102 переведена из GEL в USD (5 500 000 USD-cents)
    await connection.collection('units').updateOne(
      { _id: unit2Id },
      { $set: { 'price.currency': 'USD', 'price.amountMinorUnits': 5500000 } },
    );
    // Запускаем UnitPriceChangedHandler
    await unitPriceHandler.handle({
      aggregateId: unit2Id,
      eventType: 'UnitPriceChanged',
      payload: { amountMinorUnits: 5500000, currency: 'USD' },
    } as never);

    // Проверяем карточку: теперь обе квартиры в USD, priceFrom = 45 000 USD
    const cardRes2 = await app.inject({
      method: 'GET',
      url: `/api/v1/public/developments/${slug}`,
    });
    expect(cardRes2.statusCode).toBe(200);
    const cardBody2 = JSON.parse(cardRes2.body);
    expect(cardBody2.priceFrom).toEqual({ amountMinorUnits: 4500000, currency: 'USD' });

    // Проверяем каталог: поисковая цена и карточка согласованы
    const listRes2 = await app.inject({
      method: 'GET',
      url: '/api/v1/public/developments',
    });
    const item2 = JSON.parse(listRes2.body).items.find((i: { slug: string }) => i.slug === slug);
    expect(item2.priceFrom).toEqual({ amountMinorUnits: 4500000, currency: 'USD' });

    // 8. Снятие доступности: обе квартиры забронированы/проданы (status: reserved / sold)
    await connection.collection('units').updateOne({ _id: unit1Id }, { $set: { status: 'reserved' } });
    await connection.collection('units').updateOne({ _id: unit2Id }, { $set: { status: 'sold' } });

    await unitStatusHandler.handle({
      aggregateId: unit1Id,
      eventType: 'UnitStatusChanged',
      payload: { status: 'reserved' },
    } as never);

    // Проверяем карточку: нет доступных квартир, priceFrom очищен, нет старой цены!
    const cardRes3 = await app.inject({
      method: 'GET',
      url: `/api/v1/public/developments/${slug}`,
    });
    expect(cardRes3.statusCode).toBe(200);
    const cardBody3 = JSON.parse(cardRes3.body);
    expect(cardBody3.priceFrom).toBeUndefined();
    expect(cardBody3.units).toBeUndefined();

    // Проверяем в БД: в searchProjection нет старых цен
    const pubDocSold = await publicationRepository.findBySlug(slug);
    expect(pubDocSold?.searchProjection.priceAmountMinorUnits).toBeUndefined();
    expect(pubDocSold?.searchProjection.priceCurrency).toBeUndefined();

    // 9. Возврат доступности: бронь квартиры 101 отменена (status снова available)
    await connection.collection('units').updateOne({ _id: unit1Id }, { $set: { status: 'available' } });
    await unitStatusHandler.handle({
      aggregateId: unit1Id,
      eventType: 'UnitStatusChanged',
      payload: { status: 'available' },
    } as never);

    const cardRes4 = await app.inject({
      method: 'GET',
      url: `/api/v1/public/developments/${slug}`,
    });
    expect(cardRes4.statusCode).toBe(200);
    const cardBody4 = JSON.parse(cardRes4.body);
    expect(cardBody4.priceFrom).toEqual({ amountMinorUnits: 4500000, currency: 'USD' });
    expect(cardBody4.units).toHaveLength(1);
    expect(cardBody4.units[0]?.number).toBe('101');
  });
});

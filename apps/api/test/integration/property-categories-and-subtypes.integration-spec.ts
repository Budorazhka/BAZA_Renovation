import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import fastifyCookie from '@fastify/cookie';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppModule } from '../../src/app.module';
import { AppExceptionFilter } from '../../src/shared/errors/app-exception.filter';
import { CorrelationIdMiddleware } from '../../src/shared/errors/correlation-id.middleware';
import { TenantContextMiddleware } from '../../src/shared/tenant/tenant-context.middleware';
import { AdminContextMiddleware } from '../../src/shared/admin/admin-context.middleware';
import { MarketplaceAccountContextMiddleware } from '../../src/shared/marketplace-account/marketplace-account-context.middleware';
import { DevelopmentRepository } from '@baza/development';
import { ListingRepository, PropertyAssetRepository } from '@baza/property-assets';
import { MarketplacePublicationRepository } from '@baza/publication';
import { MediaAssetRepository, MediaStorageService } from '@baza/media-storage';
import { RedisService } from '../../src/shared/redis/redis.service';
import { createRedisMockService } from './support/redis-mock';
import { PublicationRequestedHandler } from '../../../worker/src/handlers/publication-requested.handler';

const MARKETPLACE_ORIGIN = 'https://marketplace.test.local';

describe('P1-07: Property categories (apartment/house/land/commercial), commercial subtypes and search projections', () => {
  let replSet: MongoMemoryReplSet;
  let app: NestFastifyApplication;
  let connection: Connection;
  let publicationRepository: MarketplacePublicationRepository;
  let publicationHandler: PublicationRequestedHandler;

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
    process.env.CORS_ALLOWED_ORIGIN_MARKETPLACE = MARKETPLACE_ORIGIN;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RedisService)
      .useValue(createRedisMockService())
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.register(fastifyCookie);
    const fastify = app.getHttpAdapter().getInstance();
    fastify.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => app.get(CorrelationIdMiddleware).use(req, reply, () => {}));
    fastify.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => app.get(TenantContextMiddleware).use(req, reply, () => {}));
    fastify.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => app.get(AdminContextMiddleware).use(req, reply, () => {}));
    fastify.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => app.get(MarketplaceAccountContextMiddleware).use(req, reply, () => {}));
    app.useGlobalFilters(new AppExceptionFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    await app.init();
    await fastify.ready();

    connection = moduleRef.get<Connection>(getConnectionToken());
    publicationRepository = moduleRef.get(MarketplacePublicationRepository);
    publicationHandler = new PublicationRequestedHandler(
      publicationRepository,
      moduleRef.get(DevelopmentRepository),
      moduleRef.get(ListingRepository),
      moduleRef.get(PropertyAssetRepository),
      moduleRef.get(MediaAssetRepository),
      moduleRef.get(MediaStorageService),
    );
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await replSet?.stop();
  });

  afterEach(async () => {
    for (const collection of [
      'listings',
      'property_assets',
      'duplicate_candidates',
      'marketplace_publications',
      'outbox_events',
      'idempotency_records',
      'sessions',
      'identities',
    ]) {
      await connection.collection(collection).deleteMany({});
    }
  });

  async function registerMarketplaceUser(prefix: string) {
    const login = `${prefix}-${new Types.ObjectId().toString()}@example.test`;
    const password = 'correct horse battery staple';
    const regRes = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { login, password } });
    expect(regRes.statusCode).toBe(201);

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: MARKETPLACE_ORIGIN },
      payload: { login, password },
    });
    expect(loginRes.statusCode).toBe(200);
    const raw = loginRes.headers['set-cookie'];
    const cookie = (Array.isArray(raw) ? raw[0] : raw)?.match(/baza_session=[^;]+/)?.[0];
    if (!cookie) throw new Error('Session cookie missing');
    return { cookie, identityId: loginRes.json().identityId as string };
  }

  async function createAndPublishListing(
    account: { cookie: string },
    payload: {
      propertyType: 'apartment' | 'house' | 'land' | 'commercial';
      commercialSubtype?: 'office' | 'warehouse' | 'retail' | 'business' | 'free_purpose';
      address: string;
      area: number;
      rooms?: number;
      floor?: number;
      totalFloors?: number;
      priceAmountMinorUnits: number;
      phone: string;
    },
  ) {
    // 1. Create Property Asset
    const assetRes = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/property-assets',
      headers: { 'idempotency-key': new Types.ObjectId().toString(), cookie: account.cookie },
      payload: {
        propertyType: payload.propertyType,
        commercialSubtype: payload.commercialSubtype,
        location: {
          country: 'GE',
          city: 'Batumi',
          address: payload.address,
          geo: { type: 'Point', coordinates: [41.64, 41.64] },
        },
        characteristics: {
          area: payload.area,
          rooms: payload.rooms,
          floor: payload.floor,
          totalFloors: payload.totalFloors,
        },
        representativePhone: payload.phone,
      },
    });
    expect(assetRes.statusCode).toBe(201);
    const asset = assetRes.json();

    // 2. Create Listing
    const listingRes = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/property-assets/${asset._id}/listings`,
      headers: { 'idempotency-key': new Types.ObjectId().toString(), cookie: account.cookie },
      payload: {
        dealType: 'sale',
        price: { amountMinorUnits: payload.priceAmountMinorUnits, currency: 'USD' },
      },
    });
    expect(listingRes.statusCode).toBe(201);
    const listing = listingRes.json();

    // 3. Activate Listing
    const actRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/marketplace/property-assets/${asset._id}/listings/${listing._id}/activate`,
      headers: { cookie: account.cookie },
    });
    expect(actRes.statusCode).toBe(200);

    // 4. Publish Listing
    const pubRes = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/property-assets/${asset._id}/listings/${listing._id}/publish`,
      headers: { cookie: account.cookie, 'idempotency-key': `pub-${listing._id}` },
    });
    expect(pubRes.statusCode).toBe(202);

    // 5. Worker builds public projection
    const outboxEvent = await connection.collection('outbox_events').findOne({
      eventType: 'PublicationRequested',
      aggregateId: new Types.ObjectId(listing._id),
    });
    expect(outboxEvent).not.toBeNull();
    await publicationHandler.handle(outboxEvent as never);

    const publication = await publicationRepository.findBySource('listing', new Types.ObjectId(listing._id));
    expect(publication?.status).toBe('published');

    return { asset, listing, publication };
  }

  it('полная матрица 4 категорий + 5 коммерческих подтипов: создание, публикация, раздельная поисковая фильтрация', async () => {
    const account = await registerMarketplaceUser('category-matrix-user');

    // 1. Apartment
    const apt = await createAndPublishListing(account, {
      propertyType: 'apartment',
      address: 'ул. Руставели, 10, кв. 42',
      area: 65,
      rooms: 2,
      floor: 4,
      totalFloors: 12,
      priceAmountMinorUnits: 8_500_000,
      phone: '+995555100001',
    });

    // 2. House
    const house = await createAndPublishListing(account, {
      propertyType: 'house',
      address: 'ул. Горгиладзе, 5',
      area: 220,
      rooms: 5,
      floor: 2,
      totalFloors: 2,
      priceAmountMinorUnits: 25_000_000,
      phone: '+995555100002',
    });

    // 3. Land (without rooms / floor / totalFloors)
    const land = await createAndPublishListing(account, {
      propertyType: 'land',
      address: 'Махинджаури, участок 15',
      area: 1500,
      priceAmountMinorUnits: 12_000_000,
      phone: '+995555100003',
    });

    // 4. Commercial: Office
    const office = await createAndPublishListing(account, {
      propertyType: 'commercial',
      commercialSubtype: 'office',
      address: 'БЦ Плаза, офис 301',
      area: 140,
      rooms: 3,
      floor: 3,
      totalFloors: 8,
      priceAmountMinorUnits: 18_000_000,
      phone: '+995555100004',
    });

    // 5. Commercial: Warehouse
    const warehouse = await createAndPublishListing(account, {
      propertyType: 'commercial',
      commercialSubtype: 'warehouse',
      address: 'Промзона, Складской терминал 2',
      area: 800,
      priceAmountMinorUnits: 30_000_000,
      phone: '+995555100005',
    });

    // 6. Commercial: Retail
    const retail = await createAndPublishListing(account, {
      propertyType: 'commercial',
      commercialSubtype: 'retail',
      address: 'ТЦ Гранд, павильон 12',
      area: 90,
      priceAmountMinorUnits: 14_000_000,
      phone: '+995555100006',
    });

    // 7. Commercial: Business
    const business = await createAndPublishListing(account, {
      propertyType: 'commercial',
      commercialSubtype: 'business',
      address: 'Кафе-пекарня на набережной',
      area: 110,
      priceAmountMinorUnits: 22_000_000,
      phone: '+995555100007',
    });

    // 8. Commercial: Free Purpose
    const freePurpose = await createAndPublishListing(account, {
      propertyType: 'commercial',
      commercialSubtype: 'free_purpose',
      address: 'Помещение свободного назначения 1 эт.',
      area: 75,
      priceAmountMinorUnits: 9_500_000,
      phone: '+995555100008',
    });

    // --- Query 1: All published listings without filter ---
    const allRes = await app.inject({ method: 'GET', url: '/api/v1/public/listings' });
    expect(allRes.statusCode).toBe(200);
    const allItems = allRes.json().items;
    expect(allItems).toHaveLength(8);

    // --- Query 2: Filter by apartment ---
    const aptRes = await app.inject({ method: 'GET', url: '/api/v1/public/listings?propertyType=apartment' });
    expect(aptRes.statusCode).toBe(200);
    const aptItems = aptRes.json().items;
    expect(aptItems).toHaveLength(1);
    expect(aptItems[0].slug).toBe(apt.publication?.slug);
    expect(aptItems[0].propertyType).toBe('apartment');

    // --- Query 3: Filter by house ---
    const houseRes = await app.inject({ method: 'GET', url: '/api/v1/public/listings?propertyType=house' });
    expect(houseRes.statusCode).toBe(200);
    const houseItems = houseRes.json().items;
    expect(houseItems).toHaveLength(1);
    expect(houseItems[0].slug).toBe(house.publication?.slug);
    expect(houseItems[0].propertyType).toBe('house');

    // --- Query 4: Filter by land ---
    const landRes = await app.inject({ method: 'GET', url: '/api/v1/public/listings?propertyType=land' });
    expect(landRes.statusCode).toBe(200);
    const landItems = landRes.json().items;
    expect(landItems).toHaveLength(1);
    expect(landItems[0].slug).toBe(land.publication?.slug);
    expect(landItems[0].propertyType).toBe('land');
    expect(landItems[0].characteristics?.rooms == null).toBe(true);

    // --- Query 5: Filter by commercial (all commercial subtypes) ---
    const commRes = await app.inject({ method: 'GET', url: '/api/v1/public/listings?propertyType=commercial' });
    expect(commRes.statusCode).toBe(200);
    const commItems = commRes.json().items;
    expect(commItems).toHaveLength(5);
    const commSubtypes = commItems.map((i: { commercialSubtype?: string }) => i.commercialSubtype).sort();
    expect(commSubtypes).toEqual(['business', 'free_purpose', 'office', 'retail', 'warehouse']);

    // --- Query 6: Commercial Subtype -> office ---
    const officeRes = await app.inject({
      method: 'GET',
      url: '/api/v1/public/listings?propertyType=commercial&commercialSubtype=office',
    });
    expect(officeRes.statusCode).toBe(200);
    const officeItems = officeRes.json().items;
    expect(officeItems).toHaveLength(1);
    expect(officeItems[0].slug).toBe(office.publication?.slug);
    expect(officeItems[0].commercialSubtype).toBe('office');

    // --- Query 7: Commercial Subtype -> warehouse ---
    const warehouseRes = await app.inject({
      method: 'GET',
      url: '/api/v1/public/listings?propertyType=commercial&commercialSubtype=warehouse',
    });
    expect(warehouseRes.statusCode).toBe(200);
    const warehouseItems = warehouseRes.json().items;
    expect(warehouseItems).toHaveLength(1);
    expect(warehouseItems[0].slug).toBe(warehouse.publication?.slug);
    expect(warehouseItems[0].commercialSubtype).toBe('warehouse');

    // --- Query 8: Commercial Subtype -> retail ---
    const retailRes = await app.inject({
      method: 'GET',
      url: '/api/v1/public/listings?propertyType=commercial&commercialSubtype=retail',
    });
    expect(retailRes.statusCode).toBe(200);
    const retailItems = retailRes.json().items;
    expect(retailItems).toHaveLength(1);
    expect(retailItems[0].slug).toBe(retail.publication?.slug);
    expect(retailItems[0].commercialSubtype).toBe('retail');

    // --- Query 9: Commercial Subtype -> business ---
    const businessRes = await app.inject({
      method: 'GET',
      url: '/api/v1/public/listings?propertyType=commercial&commercialSubtype=business',
    });
    expect(businessRes.statusCode).toBe(200);
    const businessItems = businessRes.json().items;
    expect(businessItems).toHaveLength(1);
    expect(businessItems[0].slug).toBe(business.publication?.slug);
    expect(businessItems[0].commercialSubtype).toBe('business');

    // --- Query 10: Commercial Subtype -> free_purpose ---
    const freeRes = await app.inject({
      method: 'GET',
      url: '/api/v1/public/listings?propertyType=commercial&commercialSubtype=free_purpose',
    });
    expect(freeRes.statusCode).toBe(200);
    const freeItems = freeRes.json().items;
    expect(freeItems).toHaveLength(1);
    expect(freeItems[0].slug).toBe(freePurpose.publication?.slug);
    expect(freeItems[0].commercialSubtype).toBe('free_purpose');

    // --- Validation: Invalid commercial subtype returns 400 ---
    const invalidSubtypeRes = await app.inject({
      method: 'GET',
      url: '/api/v1/public/listings?propertyType=commercial&commercialSubtype=invalid_subtype',
    });
    expect(invalidSubtypeRes.statusCode).toBe(400);
  });

  it('редактирование характеристик земельного участка не требует этажей и комнат', async () => {
    const account = await registerMarketplaceUser('land-edit-user');
    const { asset, listing } = await createAndPublishListing(account, {
      propertyType: 'land',
      address: 'Чакви, участок 9',
      area: 2000,
      priceAmountMinorUnits: 15_000_000,
      phone: '+995555900000',
    });

    // Patch listing with updated area and phone (no rooms / floor)
    const updateRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/marketplace/property-assets/${asset._id}/listings/${listing._id}`,
      headers: { cookie: account.cookie },
      payload: {
        characteristics: { area: 2500 },
        representativePhone: '+995555900001',
      },
    });
    expect(updateRes.statusCode).toBe(200);

    const assetDoc = await connection.collection('property_assets').findOne({ _id: new Types.ObjectId(asset._id) });
    expect(assetDoc?.characteristics.area).toBe(2500);
    expect(assetDoc?.characteristics.rooms).toBeUndefined();
    expect(assetDoc?.characteristics.floor).toBeUndefined();
    expect(assetDoc?.representativePhone).toBe('+995555900001');
  });
});

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
import { RedisService } from '../../src/shared/redis/redis.service';
import { createRedisMockService } from './support/redis-mock';

describe('PropertyAsset + sale/rent Listing (real HTTP)', () => {
  let replSet: MongoMemoryReplSet;
  let app: NestFastifyApplication;
  let connection: Connection;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
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
    const fastify = app.getHttpAdapter().getInstance();
    fastify.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => app.get(CorrelationIdMiddleware).use(req, reply, () => {}));
    fastify.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => app.get(TenantContextMiddleware).use(req, reply, () => {}));
    fastify.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => app.get(AdminContextMiddleware).use(req, reply, () => {}));
    app.useGlobalFilters(new AppExceptionFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    await app.init();
    await fastify.ready();
    connection = moduleRef.get<Connection>(getConnectionToken());
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await replSet?.stop();
  });

  afterEach(async () => {
    for (const collection of ['listings', 'property_assets', 'duplicate_candidates', 'permission_grants', 'sessions', 'position_assignments', 'positions', 'organizations', 'identities']) {
      await connection.collection(collection).deleteMany({});
    }
  });

  async function ownerCookie(prefix: string) {
    const login = `${prefix}-${new Types.ObjectId().toString()}@example.test`;
    const password = 'correct horse battery staple';
    await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { login, password } });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/organizations/register',
      payload: { login, password, type: 'agency', name: `${prefix} agency` },
    });
    expect(response.statusCode).toBe(201);
    const raw = response.headers['set-cookie'];
    const cookie = (Array.isArray(raw) ? raw[0] : raw)?.match(/baza_session=[^;]+/)?.[0];
    if (!cookie) throw new Error('session cookie missing');
    return { cookie, organizationId: response.json().organizationId as string };
  }

  // DEDUPE-001: representativePhone/address теперь участвуют в dedupe-скане
  // при каждом createAsset — уникальный suffix на каждый вызов, иначе
  // разные тестовые сценарии (разные организации/сценарии в одном файле)
  // непреднамеренно создавали бы друг для друга DuplicateCandidate записи,
  // не относящиеся к тому, что тест хочет проверить (PROP-001 CRUD, не
  // dedupe-поведение — то отдельно покрыто dedupe-focused integration-тестом).
  function makeAssetPayload(uniqueSuffix: string) {
    return {
      propertyType: 'apartment' as const,
      location: { country: 'GE', city: 'Batumi', address: `1 Rustaveli St ${uniqueSuffix}`, geo: { type: 'Point' as const, coordinates: [41.6, 41.64] } },
      characteristics: { area: 55, rooms: 2 },
      representativePhone: `+9955${uniqueSuffix.padStart(8, '0')}`,
    };
  }

  it('one asset supports independent sale and rent listings', async () => {
    const owner = await ownerCookie('prop');
    const assetResponse = await app.inject({ method: 'POST', url: '/api/v1/property-assets', headers: { cookie: owner.cookie }, payload: makeAssetPayload('1') });
    expect(assetResponse.statusCode).toBe(201);
    const asset = assetResponse.json();
    expect(asset.publisherScope.organizationId).toBe(owner.organizationId);

    const sale = await app.inject({ method: 'POST', url: `/api/v1/property-assets/${asset._id}/listings`, headers: { cookie: owner.cookie }, payload: { dealType: 'sale', price: { amountMinorUnits: 10000000, currency: 'USD' } } });
    const rent = await app.inject({ method: 'POST', url: `/api/v1/property-assets/${asset._id}/listings`, headers: { cookie: owner.cookie }, payload: { dealType: 'rent_long', price: { amountMinorUnits: 150000, currency: 'GEL' } } });
    expect(sale.statusCode).toBe(201);
    expect(rent.statusCode).toBe(201);
    expect((await app.inject({ method: 'GET', url: `/api/v1/property-assets/${asset._id}/listings`, headers: { cookie: owner.cookie } })).json()).toHaveLength(2);
  });

  it('does not expose an asset to another organization', async () => {
    const first = await ownerCookie('first');
    const second = await ownerCookie('second');
    const created = await app.inject({ method: 'POST', url: '/api/v1/property-assets', headers: { cookie: first.cookie }, payload: makeAssetPayload('2') });
    const foreignRead = await app.inject({ method: 'GET', url: `/api/v1/property-assets/${created.json()._id}`, headers: { cookie: second.cookie } });
    expect(foreignRead.statusCode).toBe(404);
  });

  it('allows one active listing per deal type, while rejecting a second active one', async () => {
    const owner = await ownerCookie('active');
    const asset = (await app.inject({ method: 'POST', url: '/api/v1/property-assets', headers: { cookie: owner.cookie }, payload: makeAssetPayload('3') })).json();
    const first = (await app.inject({ method: 'POST', url: `/api/v1/property-assets/${asset._id}/listings`, headers: { cookie: owner.cookie }, payload: { dealType: 'sale', price: { amountMinorUnits: 100, currency: 'USD' } } })).json();
    const second = (await app.inject({ method: 'POST', url: `/api/v1/property-assets/${asset._id}/listings`, headers: { cookie: owner.cookie }, payload: { dealType: 'sale', price: { amountMinorUnits: 200, currency: 'USD' } } })).json();
    expect((await app.inject({ method: 'PATCH', url: `/api/v1/property-assets/${asset._id}/listings/${first._id}/activate`, headers: { cookie: owner.cookie } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'PATCH', url: `/api/v1/property-assets/${asset._id}/listings/${second._id}/activate`, headers: { cookie: owner.cookie } })).statusCode).toBe(409);
  });
});

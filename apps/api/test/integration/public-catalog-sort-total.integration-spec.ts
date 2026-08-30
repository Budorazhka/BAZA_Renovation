import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import fastifyCookie from '@fastify/cookie';
import { AppModule } from '../../src/app.module';
import { AppExceptionFilter } from '../../src/shared/errors/app-exception.filter';
import { CorrelationIdMiddleware } from '../../src/shared/errors/correlation-id.middleware';

describe('public catalog sort + total (real HTTP + MongoDB)', () => {
  let replSet: MongoMemoryReplSet;
  let app: NestFastifyApplication;
  let connection: Connection;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await replSet.waitUntilRunning();
    process.env.MONGO_URI = replSet.getUri();
    process.env.MINIO_ENDPOINT ??= 'http://localhost:9000';
    process.env.MINIO_ACCESS_KEY ??= 'test-access-key';
    process.env.MINIO_SECRET_KEY ??= 'test-secret-key';
    process.env.MINIO_BUCKET_PRIVATE ??= 'test-private';
    process.env.MINIO_BUCKET_PUBLIC ??= 'test-public';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.register(fastifyCookie);
    const fastify = app.getHttpAdapter().getInstance();
    fastify.addHook('onRequest', async (req, reply) => app.get(CorrelationIdMiddleware).use(req, reply, () => {}));
    app.useGlobalFilters(new AppExceptionFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    await app.init();
    await fastify.ready();
    connection = moduleRef.get<Connection>(getConnectionToken());
  }, 120_000);

  afterEach(async () => {
    await connection.collection('marketplace_publications').deleteMany({});
  });

  afterAll(async () => {
    await app?.close();
    await replSet?.stop();
  });

  async function seedListings() {
    const docs = [100, 200, 300].map((price, index) => ({
      _id: new Types.ObjectId(),
      sourceType: 'listing',
      sourceId: new Types.ObjectId(),
      publisherScope: { type: 'marketplace_account', identityId: new Types.ObjectId() },
      slug: `listing-${price}`,
      version: 1,
      status: 'published',
      denormalizedFields: {
        dealType: 'sale',
        price: { amountMinorUnits: price, currency: 'USD' },
        propertyType: 'apartment',
        location: { country: 'GE', city: 'Batumi', address: `Address ${index}` },
        characteristics: { area: 60 + index, rooms: 2 },
        media: [],
      },
      searchProjection: {
        city: 'Batumi',
        priceAmountMinorUnits: price,
        area: 60 + index,
        geo: { type: 'Point', coordinates: [41.6 + index * 0.01, 41.64] },
      },
      createdAt: new Date(Date.now() + index),
    }));
    await connection.collection('marketplace_publications').insertMany(docs);
  }

  it('sorts listings in the database order, returns total, and resumes with an opaque cursor', async () => {
    await seedListings();

    const first = await app.inject({ method: 'GET', url: '/api/v1/public/listings?sort=price_asc&limit=2' });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ price: { amountMinorUnits: 100, currency: 'USD' } }),
        expect.objectContaining({ price: { amountMinorUnits: 200, currency: 'USD' } }),
      ]),
      total: 3,
    });
    const firstBody = first.json();
    expect(firstBody.nextCursor).toBeTruthy();
    expect(firstBody.nextCursor).not.toContain('listing-200');

    const second = await app.inject({
      method: 'GET',
      url: `/api/v1/public/listings?sort=price_asc&limit=2&cursor=${encodeURIComponent(firstBody.nextCursor)}`,
    });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({
      items: [expect.objectContaining({ price: { amountMinorUnits: 300, currency: 'USD' } })],
      total: 3,
      nextCursor: null,
    });
  });

  it('rejects unsupported development sorts and malformed cursors with validation 400', async () => {
    const unsupported = await app.inject({ method: 'GET', url: '/api/v1/public/developments?sort=price_asc' });
    expect(unsupported.statusCode).toBe(400);

    const malformed = await app.inject({ method: 'GET', url: '/api/v1/public/listings?sort=price_asc&cursor=garbage' });
    expect(malformed.statusCode).toBe(400);
  });
});

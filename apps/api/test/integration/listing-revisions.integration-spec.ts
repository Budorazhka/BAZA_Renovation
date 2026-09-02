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
import { DevelopmentRepository } from '@baza/development';
import { ListingRepository, PropertyAssetRepository } from '@baza/property-assets';
import { MarketplacePublicationRepository } from '@baza/publication';
import { MediaAssetRepository, MediaStorageService } from '@baza/media-storage';
// D-03/MKT-002 паттерн (см. mkt-002-listing-publication.integration-spec.ts):
// реальный worker handler внутри тестового файла, чтобы publish дошёл до
// status:'published', иначе unpublish (требует именно этот статус) вернул
// бы 409 — что и произошло при первом проходе без обработки outbox-события.
import { PublicationRequestedHandler } from '../../../worker/src/handlers/publication-requested.handler';

/**
 * Часть 1 (хвост Этапа 3: "недельная история версий карточки") — сквозной
 * сценарий через реальный HTTP + реальную MongoDB: create asset → create
 * listing → activate → publish → unpublish, каждый шаг оставляет снапшот в
 * `listing_revisions`, доступный через GET /property-assets/:assetId/revisions.
 * Тот же bootstrap-паттерн, что property-assets-listings.integration-spec.ts.
 */
describe('ListingRevision history (real HTTP + real MongoDB)', () => {
  let replSet: MongoMemoryReplSet;
  let app: NestFastifyApplication;
  let connection: Connection;
  let publicationHandler: PublicationRequestedHandler;

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
    publicationHandler = new PublicationRequestedHandler(
      moduleRef.get(MarketplacePublicationRepository),
      moduleRef.get(DevelopmentRepository),
      moduleRef.get(ListingRepository),
      moduleRef.get(PropertyAssetRepository),
      moduleRef.get(MediaAssetRepository),
      moduleRef.get(MediaStorageService),
    );
  }, 120_000);

  async function processPendingEvent(listingId: string) {
    const event = await connection.collection('outbox_events').findOne({ eventType: 'PublicationRequested', aggregateId: new Types.ObjectId(listingId) });
    expect(event).not.toBeNull();
    await publicationHandler.handle(event as never);
  }

  afterAll(async () => {
    await app?.close();
    await replSet?.stop();
  });

  afterEach(async () => {
    for (const collection of [
      'listings',
      'property_assets',
      'listing_revisions',
      'duplicate_candidates',
      'marketplace_publications',
      'outbox_events',
      'idempotency_records',
      'permission_grants',
      'sessions',
      'position_assignments',
      'positions',
      'organizations',
      'identities',
    ]) {
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

  function makeAssetPayload(uniqueSuffix: string) {
    return {
      propertyType: 'apartment' as const,
      location: { country: 'GE', city: 'Batumi', address: `1 Rustaveli St ${uniqueSuffix}`, geo: { type: 'Point' as const, coordinates: [41.6, 41.64] } },
      characteristics: { area: 55, rooms: 2 },
      representativePhone: `+9955${uniqueSuffix.padStart(8, '0')}`,
    };
  }

  it('create → activate → publish → unpublish оставляют упорядоченную историю снапшотов', async () => {
    const owner = await ownerCookie('rev');
    const assetResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/property-assets',
      headers: { 'idempotency-key': new Types.ObjectId().toString(), cookie: owner.cookie },
      payload: makeAssetPayload('1'),
    });
    expect(assetResponse.statusCode).toBe(201);
    const asset = assetResponse.json();

    const listingResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/property-assets/${asset._id}/listings`,
      headers: { 'idempotency-key': new Types.ObjectId().toString(), cookie: owner.cookie },
      payload: { dealType: 'sale', price: { amountMinorUnits: 10_000_000, currency: 'USD' } },
    });
    expect(listingResponse.statusCode).toBe(201);
    const listing = listingResponse.json();

    const activateResponse = await app.inject({
      method: 'PATCH',
      url: `/api/v1/property-assets/${asset._id}/listings/${listing._id}/activate`,
      headers: { cookie: owner.cookie },
    });
    expect(activateResponse.statusCode).toBe(200);

    const publishResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/property-assets/${asset._id}/listings/${listing._id}/publish`,
      headers: { cookie: owner.cookie, 'idempotency-key': new Types.ObjectId().toString() },
    });
    expect(publishResponse.statusCode).toBe(202);
    await processPendingEvent(listing._id);

    const unpublishResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/property-assets/${asset._id}/listings/${listing._id}/unpublish`,
      headers: { cookie: owner.cookie },
      payload: { reason: 'Owner decided to remove the listing from the market' },
    });
    // Контроллер не задаёт @HttpCode на unpublish — реальный ответ 201
    // (getListingPublicationStatus-тело), не "создание ресурса" семантически
    // (тот же нюанс, что mkt-002-listing-publication.integration-spec.ts
    // явно проверяет 201, а не выдуманный 200).
    expect(unpublishResponse.statusCode).toBe(201);

    const revisionsResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/property-assets/${asset._id}/revisions`,
      headers: { cookie: owner.cookie },
    });
    expect(revisionsResponse.statusCode).toBe(200);
    const revisions = revisionsResponse.json() as Array<{ changeType: string; listingId?: string; status?: string }>;

    // Newest-first (changedAt: -1) — unpublished — самая свежая запись.
    expect(revisions.map((r) => r.changeType)).toEqual([
      'listing_unpublished',
      'listing_published',
      'listing_activated',
      'listing_created',
      'asset_created',
    ]);
    expect(revisions[3]!.listingId).toBe(listing._id);
    expect(revisions[4]!.listingId).toBeUndefined();

    // Фильтр по listingId исключает asset_created (у него ещё не было listingId).
    const filteredResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/property-assets/${asset._id}/revisions?listingId=${listing._id}`,
      headers: { cookie: owner.cookie },
    });
    expect(filteredResponse.statusCode).toBe(200);
    const filtered = filteredResponse.json() as Array<{ changeType: string }>;
    expect(filtered).toHaveLength(4);
    expect(filtered.every((r) => r.changeType !== 'asset_created')).toBe(true);
  });

  it('чужая организация получает единый 404 на GET revisions, не раскрывает существование карточки', async () => {
    const owner = await ownerCookie('rev-owner');
    const stranger = await ownerCookie('rev-stranger');
    const asset = (
      await app.inject({
        method: 'POST',
        url: '/api/v1/property-assets',
        headers: { 'idempotency-key': new Types.ObjectId().toString(), cookie: owner.cookie },
        payload: makeAssetPayload('2'),
      })
    ).json();

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/property-assets/${asset._id}/revisions`,
      headers: { cookie: stranger.cookie },
    });

    expect(response.statusCode).toBe(404);
  });
});

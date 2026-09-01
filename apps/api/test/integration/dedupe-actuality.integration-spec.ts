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
import { DuplicateCandidateRepository } from '@baza/property-assets';
import { MarketplacePublicationRepository } from '@baza/publication';
import { ActualityService } from '../../src/modules/property-assets/actuality.service';
import { RedisService } from '../../src/shared/redis/redis.service';
import { createRedisMockService } from './support/redis-mock';
// D-03/MKT-002 паттерн: прямой кросс-app импорт реального worker handler'а
// внутри тестового файла — доказывает полную цепочку publish → outbox →
// worker → published projection против одной и той же реальной MongoDB.
import { DevelopmentRepository } from '@baza/development';
import { ListingRepository, PropertyAssetRepository } from '@baza/property-assets';
import { PublicationRequestedHandler } from '../../../worker/src/handlers/publication-requested.handler';
import { MediaAssetRepository, MediaStorageService } from '@baza/media-storage';

describe('DEDUPE-001 + ACT-001: duplicate candidates and actuality workflow (real HTTP + real MongoDB)', () => {
  let replSet: MongoMemoryReplSet;
  let app: NestFastifyApplication;
  let connection: Connection;
  let duplicateCandidateRepository: DuplicateCandidateRepository;
  let publicationRepository: MarketplacePublicationRepository;
  let actualityService: ActualityService;
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
    duplicateCandidateRepository = moduleRef.get(DuplicateCandidateRepository);
    publicationRepository = moduleRef.get(MarketplacePublicationRepository);
    actualityService = moduleRef.get(ActualityService);
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
      'audit_events',
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
    return { cookie, organizationId: response.json().organizationId as string, identityId: response.json().identityId as string | undefined };
  }

  function makeAssetPayload(overrides: Partial<{ address: string; phone: string; area: number; rooms: number; floor: number }> = {}) {
    return {
      propertyType: 'apartment' as const,
      location: { country: 'GE', city: 'Batumi', address: overrides.address ?? '1 Rustaveli St', geo: { type: 'Point' as const, coordinates: [41.6, 41.64] } },
      characteristics: { area: overrides.area ?? 55, rooms: overrides.rooms ?? 2, floor: overrides.floor ?? 5 },
      representativePhone: overrides.phone ?? '+995500000001',
    };
  }

  async function createAsset(owner: { cookie: string }, overrides: Parameters<typeof makeAssetPayload>[0] = {}) {
    const response = await app.inject({ method: 'POST', url: '/api/v1/property-assets', headers: { cookie: owner.cookie }, payload: makeAssetPayload(overrides) });
    expect(response.statusCode).toBe(201);
    return response.json();
  }

  async function createActiveListing(owner: { cookie: string }, assetId: string, dealType: 'sale' | 'rent_long' | 'rent_short' = 'sale') {
    const listing = (
      await app.inject({
        method: 'POST',
        url: `/api/v1/property-assets/${assetId}/listings`,
        headers: { cookie: owner.cookie },
        payload: { dealType, price: { amountMinorUnits: 10_000_000, currency: 'USD' } },
      })
    ).json();
    const activateResponse = await app.inject({
      method: 'PATCH',
      url: `/api/v1/property-assets/${assetId}/listings/${listing._id}/activate`,
      headers: { cookie: owner.cookie },
    });
    expect(activateResponse.statusCode).toBe(200);
    // activate() бампает version (draft→active, ListingRepository.activate) —
    // возвращаем ПОСТ-активационный документ, не исходный draft-ответ,
    // иначе caller получил бы устаревшую version и любой последующий CAS
    // (confirmActuality/publish) видел бы version conflict.
    return activateResponse.json();
  }

  async function publish(owner: { cookie: string }, assetId: string, listingId: string, idempotencyKey = `key-${listingId}`) {
    return app.inject({
      method: 'POST',
      url: `/api/v1/property-assets/${assetId}/listings/${listingId}/publish`,
      headers: { cookie: owner.cookie, 'idempotency-key': idempotencyKey },
    });
  }

  describe('DEDUPE-001', () => {
    it('createAsset с совпадающим телефоном создаёт DuplicateCandidate detected (даже в разных организациях)', async () => {
      const orgA = await ownerCookie('dedupe-a');
      const orgB = await ownerCookie('dedupe-b');
      const phone = '+995500111222';

      const assetA = await createAsset(orgA, { phone, address: 'Address A' });
      const assetB = await createAsset(orgB, { phone, address: 'Address B' });

      const candidate = await duplicateCandidateRepository.findByPair(new Types.ObjectId(assetA._id), new Types.ObjectId(assetB._id));
      expect(candidate?.status).toBe('detected');
      expect(candidate?.signals.phoneMatch).toBe(true);
    });

    it('createAsset с совпадающим адресом+характеристиками (разный телефон) создаёт DuplicateCandidate detected', async () => {
      const orgA = await ownerCookie('dedupe-c');
      const orgB = await ownerCookie('dedupe-d');

      const assetA = await createAsset(orgA, { phone: '+995500000010', address: 'Same Address 1', area: 60, rooms: 3, floor: 2 });
      const assetB = await createAsset(orgB, { phone: '+995500000011', address: 'Same Address 1', area: 60, rooms: 3, floor: 2 });

      const candidate = await duplicateCandidateRepository.findByPair(new Types.ObjectId(assetA._id), new Types.ObjectId(assetB._id));
      expect(candidate?.status).toBe('detected');
      expect(candidate?.signals.addressMatch).toBe(true);
      expect(candidate?.signals.roomsAreaFloorMatch).toBe(true);
    });

    it('явный дубль (phoneMatch) блокирует publish обеих сторон', async () => {
      const orgA = await ownerCookie('dedupe-e');
      const orgB = await ownerCookie('dedupe-f');
      const phone = '+995500222333';

      const assetA = await createAsset(orgA, { phone, address: 'Blocking Address A' });
      const assetB = await createAsset(orgB, { phone, address: 'Blocking Address B' });
      const listingA = await createActiveListing(orgA, assetA._id);
      const listingB = await createActiveListing(orgB, assetB._id);

      const publishA = await publish(orgA, assetA._id, listingA._id);
      const publishB = await publish(orgB, assetB._id, listingB._id);

      expect(publishA.statusCode).toBe(409);
      expect(publishB.statusCode).toBe(409);
    });

    it('слабый сигнал (только addressMatch, БЕЗ roomsAreaFloorMatch) НЕ блокирует publish (тот же дом, другая квартира)', async () => {
      const orgA = await ownerCookie('dedupe-g');
      const orgB = await ownerCookie('dedupe-h');

      const assetA = await createAsset(orgA, { phone: '+995500000020', address: 'Same Building St', area: 50, rooms: 2, floor: 3 });
      // assetB существует только чтобы триггернуть dedupe-скан со слабым
      // сигналом (тот же адрес, другие характеристики) — сам объект дальше
      // не используется, важен факт его создания.
      await createAsset(orgB, { phone: '+995500000021', address: 'Same Building St', area: 80, rooms: 4, floor: 7 });
      const listingA = await createActiveListing(orgA, assetA._id);

      const publishA = await publish(orgA, assetA._id, listingA._id);

      expect(publishA.statusCode).toBe(202);
    });

    it('owner override (xlsx #70) снимает блокировку — publish разрешён после override', async () => {
      const orgA = await ownerCookie('dedupe-i');
      const orgB = await ownerCookie('dedupe-j');
      const phone = '+995500333444';

      const assetA = await createAsset(orgA, { phone, address: 'Override Address A' });
      const assetB = await createAsset(orgB, { phone, address: 'Override Address B' });
      const listingA = await createActiveListing(orgA, assetA._id);

      const blockedPublish = await publish(orgA, assetA._id, listingA._id);
      expect(blockedPublish.statusCode).toBe(409);

      const candidate = await duplicateCandidateRepository.findByPair(new Types.ObjectId(assetA._id), new Types.ObjectId(assetB._id));
      expect(candidate).not.toBeNull();

      const overrideResponse = await app.inject({
        method: 'POST',
        url: `/api/v1/property-assets/duplicate-candidates/${candidate!._id.toString()}/override`,
        headers: { cookie: orgA.cookie },
        payload: { reason: 'Verified in person — different unit, owner has multiple listings under one phone' },
      });
      expect(overrideResponse.statusCode).toBe(201);

      const publishAfterOverride = await publish(orgA, assetA._id, listingA._id, `key-after-override-${listingA._id}`);
      expect(publishAfterOverride.statusCode).toBe(202);

      const candidateAfterOverride = await duplicateCandidateRepository.findByPair(new Types.ObjectId(assetA._id), new Types.ObjectId(assetB._id));
      expect(candidateAfterOverride?.status).toBe('override_not_duplicate');

      const auditEvent = await connection.collection('audit_events').findOne({ action: 'duplicate_candidate.override' });
      expect(auditEvent).not.toBeNull();
      expect(auditEvent?.reason).toContain('Verified in person');
    });

    it('override уже confirmed_duplicate запись отклоняется (только owner может override ТОЛЬКО из detected)', async () => {
      const orgA = await ownerCookie('dedupe-k');
      const orgB = await ownerCookie('dedupe-l');
      const phone = '+995500444555';

      const assetA = await createAsset(orgA, { phone, address: 'Confirmed Address A' });
      const assetB = await createAsset(orgB, { phone, address: 'Confirmed Address B' });
      const candidate = await duplicateCandidateRepository.findByPair(new Types.ObjectId(assetA._id), new Types.ObjectId(assetB._id));
      await duplicateCandidateRepository.markConfirmedDuplicate(candidate!._id, {
        reason: 'Подтверждено админом при разборе очереди дублей',
        confirmByAdminAccountId: new Types.ObjectId(),
      });

      const overrideResponse = await app.inject({
        method: 'POST',
        url: `/api/v1/property-assets/duplicate-candidates/${candidate!._id.toString()}/override`,
        headers: { cookie: orgA.cookie },
        payload: { reason: 'Trying to override an admin-confirmed duplicate' },
      });

      expect(overrideResponse.statusCode).toBe(409);
    });

    it('посторонняя организация (не владеющая ни одной из сторон candidate) получает 404 при попытке override', async () => {
      const orgA = await ownerCookie('dedupe-stranger-a');
      const orgB = await ownerCookie('dedupe-stranger-b');
      const orgC = await ownerCookie('dedupe-stranger-c');
      const phone = '+995500444999';

      const assetA = await createAsset(orgA, { phone, address: 'Org A Address' });
      const assetB = await createAsset(orgB, { phone, address: 'Org B Address' });
      const candidate = await duplicateCandidateRepository.findByPair(new Types.ObjectId(assetA._id), new Types.ObjectId(assetB._id));
      expect(candidate).not.toBeNull();

      const overrideResponse = await app.inject({
        method: 'POST',
        url: `/api/v1/property-assets/duplicate-candidates/${candidate!._id.toString()}/override`,
        headers: { cookie: orgC.cookie },
        payload: { reason: 'Stranger org trying to override' },
      });

      expect(overrideResponse.statusCode).toBe(404);
      const candidateDoc = await duplicateCandidateRepository.findById(candidate!._id);
      expect(candidateDoc?.status).toBe('detected');
    });

    it('GET /property-assets/:assetId/duplicate-candidates возвращает кандидатов для актива и 404 для чужого актива', async () => {
      const orgA = await ownerCookie('dedupe-list-cand-a');
      const orgB = await ownerCookie('dedupe-list-cand-b');
      const orgC = await ownerCookie('dedupe-list-cand-c');
      const phone = '+995500444888';

      const assetA = await createAsset(orgA, { phone, address: 'Org A List Candidates Address' });
      await createAsset(orgB, { phone, address: 'Org B List Candidates Address' });

      const listResponseA = await app.inject({
        method: 'GET',
        url: `/api/v1/property-assets/${assetA._id}/duplicate-candidates`,
        headers: { cookie: orgA.cookie },
      });
      expect(listResponseA.statusCode).toBe(200);
      const candidatesA = JSON.parse(listResponseA.body) as Array<{ id: string; status: string; signals: { phoneMatch: boolean } }>;
      expect(candidatesA.length).toBe(1);
      expect(candidatesA[0]?.signals.phoneMatch).toBe(true);
      expect(candidatesA[0]?.status).toBe('detected');

      const listResponseC = await app.inject({
        method: 'GET',
        url: `/api/v1/property-assets/${assetA._id}/duplicate-candidates`,
        headers: { cookie: orgC.cookie },
      });
      expect(listResponseC.statusCode).toBe(404);
    });

    it('не создаёт дублирующую DuplicateCandidate запись при повторном createAsset-скане той же пары (unique index на паре)', async () => {
      const orgA = await ownerCookie('dedupe-m');
      const orgB = await ownerCookie('dedupe-n');
      const phone = '+995500555666';

      const assetA = await createAsset(orgA, { phone, address: 'Repeat Scan Address A' });
      await createAsset(orgB, { phone, address: 'Repeat Scan Address B' });

      // Второй asset той же организации A с тем же телефоном — сканирует
      // ПРОТИВ assetA (найдёт совпадение) и против organizationB asset,
      // проверяем, что для пары (A, эта новая) запись ровно одна.
      const assetA2 = await createAsset(orgA, { phone, address: 'Different Address Entirely' });

      const candidates = await connection
        .collection('duplicate_candidates')
        .find({ $or: [{ propertyAssetIdA: new Types.ObjectId(assetA._id) }, { propertyAssetIdB: new Types.ObjectId(assetA._id) }] })
        .toArray();
      // assetA участвует минимум в паре с assetA2 (тот же phone) — не дублируется.
      const pairWithA2 = candidates.filter(
        (c) => c.propertyAssetIdA.equals(new Types.ObjectId(assetA2._id)) || c.propertyAssetIdB.equals(new Types.ObjectId(assetA2._id)),
      );
      expect(pairWithA2).toHaveLength(1);
    });
  });

  describe('ACT-001', () => {
    it('activate проставляет lastConfirmedAt — GET actuality сразу после активации возвращает up_to_date', async () => {
      const owner = await ownerCookie('actuality-a');
      const asset = await createAsset(owner, { phone: '+995500666777', address: 'Actuality Address A' });
      const listing = await createActiveListing(owner, asset._id, 'sale');

      const actualityResponse = await app.inject({
        method: 'GET',
        url: `/api/v1/property-assets/${asset._id}/listings/${listing._id}/actuality`,
        headers: { cookie: owner.cookie },
      });

      expect(actualityResponse.statusCode).toBe(200);
      const body = actualityResponse.json();
      expect(body.category).toBe('secondary');
      expect(body.thresholds).toEqual({ warningDays: 28, overdueDays: 60 });
      expect(body.state).toBe('up_to_date');
    });

    it('rent_long listing использует rent-пороги (14/21), не secondary', async () => {
      const owner = await ownerCookie('actuality-b');
      const asset = await createAsset(owner, { phone: '+995500666778', address: 'Actuality Address B' });
      const listing = await createActiveListing(owner, asset._id, 'rent_long');

      const actualityResponse = await app.inject({
        method: 'GET',
        url: `/api/v1/property-assets/${asset._id}/listings/${listing._id}/actuality`,
        headers: { cookie: owner.cookie },
      });

      expect(actualityResponse.json().thresholds).toEqual({ warningDays: 14, overdueDays: 21 });
    });

    it('sale + commercial propertyType использует "other" пороги (10/15)', async () => {
      const owner = await ownerCookie('actuality-c');
      const assetResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/property-assets',
        headers: { cookie: owner.cookie },
        payload: { propertyType: 'commercial', location: { country: 'GE', city: 'Batumi', address: 'Commercial Address', geo: { type: 'Point', coordinates: [41.6, 41.64] } }, characteristics: { area: 100 }, representativePhone: '+995500666779' },
      });
      const asset = assetResponse.json();
      const listing = await createActiveListing(owner, asset._id, 'sale');

      const actualityResponse = await app.inject({
        method: 'GET',
        url: `/api/v1/property-assets/${asset._id}/listings/${listing._id}/actuality`,
        headers: { cookie: owner.cookie },
      });

      expect(actualityResponse.json().thresholds).toEqual({ warningDays: 10, overdueDays: 15 });
    });

    it('confirmActuality сбрасывает lastConfirmedAt, listing остаётся active', async () => {
      const owner = await ownerCookie('actuality-d');
      const asset = await createAsset(owner, { phone: '+995500666780', address: 'Actuality Address D' });
      const listing = await createActiveListing(owner, asset._id, 'sale');

      const confirmResponse = await app.inject({
        method: 'PATCH',
        url: `/api/v1/property-assets/${asset._id}/listings/${listing._id}/confirm-actuality`,
        headers: { cookie: owner.cookie },
        payload: { expectedVersion: listing.version },
      });

      expect(confirmResponse.statusCode).toBe(200);
      expect(confirmResponse.json().state).toBe('up_to_date');

      const listingDoc = await connection.collection('listings').findOne({ _id: new Types.ObjectId(listing._id) });
      expect(listingDoc?.status).toBe('active');
      expect(listingDoc?.version).toBeGreaterThan(listing.version);
    });

    it('confirmActuality с устаревшей expectedVersion даёт 409 (version conflict)', async () => {
      const owner = await ownerCookie('actuality-e');
      const asset = await createAsset(owner, { phone: '+995500666781', address: 'Actuality Address E' });
      const listing = await createActiveListing(owner, asset._id, 'sale');

      const staleConfirm = await app.inject({
        method: 'PATCH',
        url: `/api/v1/property-assets/${asset._id}/listings/${listing._id}/confirm-actuality`,
        headers: { cookie: owner.cookie },
        payload: { expectedVersion: listing.version + 99 },
      });

      expect(staleConfirm.statusCode).toBe(409);
    });

    it('expireOverdueListings переводит просроченный active listing в expired И unpublish published-публикацию (owner decision xlsx #57)', async () => {
      const owner = await ownerCookie('actuality-f');
      const asset = await createAsset(owner, { phone: '+995500666782', address: 'Actuality Address F' });
      const listing = await createActiveListing(owner, asset._id, 'sale');
      const publishResponse = await publish(owner, asset._id, listing._id);
      expect(publishResponse.statusCode).toBe(202);

      const event = await connection.collection('outbox_events').findOne({ eventType: 'PublicationRequested', aggregateId: new Types.ObjectId(listing._id) });
      await publicationHandler.handle(event as never);
      const publicationBefore = await publicationRepository.findBySource('listing', new Types.ObjectId(listing._id));
      expect(publicationBefore?.status).toBe('published');

      // Искусственно "состаривает" lastConfirmedAt глубоко за overdue-порог
      // secondary (60 дней) — прямая запись в БД, тот же честный workaround,
      // что другие integration-тесты используют для симуляции времени
      // (Date.now()/faketimers недоступны в среде выполнения этого прогона).
      await connection.collection('listings').updateOne(
        { _id: new Types.ObjectId(listing._id) },
        { $set: { lastConfirmedAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000) } },
      );

      const result = await actualityService.expireOverdueListings();
      expect(result.expiredCount).toBe(1);
      expect(result.errors).toBe(0);

      const listingDoc = await connection.collection('listings').findOne({ _id: new Types.ObjectId(listing._id) });
      expect(listingDoc?.status).toBe('expired');

      const publicationAfter = await publicationRepository.findBySource('listing', new Types.ObjectId(listing._id));
      expect(publicationAfter?.status).toBe('unpublished');

      const publicListResponse = await app.inject({ method: 'GET', url: '/api/v1/public/listings' });
      expect((publicListResponse.json().items as unknown[]).length).toBe(0);
    });

    it('expireOverdueListings НЕ трогает listing, не достигший своего overdue-порога', async () => {
      const owner = await ownerCookie('actuality-g');
      const asset = await createAsset(owner, { phone: '+995500666783', address: 'Actuality Address G' });
      const listing = await createActiveListing(owner, asset._id, 'sale');

      const result = await actualityService.expireOverdueListings();

      expect(result.expiredCount).toBe(0);
      const listingDoc = await connection.collection('listings').findOne({ _id: new Types.ObjectId(listing._id) });
      expect(listingDoc?.status).toBe('active');
    });

    it('publish отклоняется для expired listing, но confirmActuality реактивирует его (expired→active, owner decision xlsx #57 "требуется подтвердить"), после чего publish снова разрешён', async () => {
      const owner = await ownerCookie('actuality-h');
      const asset = await createAsset(owner, { phone: '+995500666784', address: 'Actuality Address H' });
      const listing = await createActiveListing(owner, asset._id, 'sale');
      await connection.collection('listings').updateOne({ _id: new Types.ObjectId(listing._id) }, { $set: { status: 'expired' } });

      const blockedPublish = await publish(owner, asset._id, listing._id);
      expect(blockedPublish.statusCode).toBe(409);

      const confirmResponse = await app.inject({
        method: 'PATCH',
        url: `/api/v1/property-assets/${asset._id}/listings/${listing._id}/confirm-actuality`,
        headers: { cookie: owner.cookie },
        payload: { expectedVersion: listing.version },
      });
      expect(confirmResponse.statusCode).toBe(200);
      expect(confirmResponse.json().state).toBe('up_to_date');

      const listingAfterConfirm = await connection.collection('listings').findOne({ _id: new Types.ObjectId(listing._id) });
      expect(listingAfterConfirm?.status).toBe('active');

      const publishAfterConfirm = await publish(owner, asset._id, listing._id, `key-after-confirm-${listing._id}`);
      expect(publishAfterConfirm.statusCode).toBe(202);
    });

    it('confirmActuality отклоняется для archived listing (терминальный статус, вне scope ACT-001)', async () => {
      const owner = await ownerCookie('actuality-i');
      const asset = await createAsset(owner, { phone: '+995500666785', address: 'Actuality Address I' });
      const listing = await createActiveListing(owner, asset._id, 'sale');
      await connection.collection('listings').updateOne({ _id: new Types.ObjectId(listing._id) }, { $set: { status: 'archived' } });

      const confirmResponse = await app.inject({
        method: 'PATCH',
        url: `/api/v1/property-assets/${asset._id}/listings/${listing._id}/confirm-actuality`,
        headers: { cookie: owner.cookie },
        payload: { expectedVersion: listing.version },
      });
      expect(confirmResponse.statusCode).toBe(409);
    });
  });
});

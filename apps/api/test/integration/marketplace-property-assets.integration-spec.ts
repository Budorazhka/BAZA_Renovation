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
import { DuplicateCandidateRepository, ListingRepository, PropertyAssetRepository } from '@baza/property-assets';
import { MarketplacePublicationRepository } from '@baza/publication';
import { AdminPublicationService } from '../../src/modules/admin/admin-publication.service';
import type { AdminContext } from '../../src/shared/admin/admin-context';
import { PublicationRequestedHandler } from '../../../worker/src/handlers/publication-requested.handler';

const MARKETPLACE_ORIGIN = 'https://marketplace.test.local';

/**
 * Owner/realtor marketplace publishing wizard: реальный HTTP + реальная
 * MongoDB (MongoMemoryReplSet, тот же паттерн, что MKT-002/DEDUPE-001/
 * ACT-001 integration-тесты) — доказывает, что marketplace identity (БЕЗ
 * Organization/Position вообще) может через отдельный
 * MarketplaceAccountContext-контур создать PropertyAsset+Listing,
 * активировать и опубликовать, переиспользуя publication pipeline (MKT-002)
 * и dedupe/actuality gates (DEDUPE-001/ACT-001) без единой правки в них.
 */
describe('Owner/realtor marketplace publishing wizard (real HTTP + real MongoDB)', () => {
  let replSet: MongoMemoryReplSet;
  let app: NestFastifyApplication;
  let connection: Connection;
  let publicationRepository: MarketplacePublicationRepository;
  let publicationHandler: PublicationRequestedHandler;
  let adminPublicationService: AdminPublicationService;
  let duplicateCandidateRepository: DuplicateCandidateRepository;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await replSet.waitUntilRunning();
    process.env.MONGO_URI = replSet.getUri();
    process.env.MINIO_ENDPOINT ??= 'http://localhost:9000';
    process.env.MINIO_ACCESS_KEY ??= 'test-access-key';
    process.env.MINIO_SECRET_KEY ??= 'test-secret-key';
    process.env.MINIO_BUCKET_PRIVATE ??= 'test-private';
    process.env.MINIO_BUCKET_PUBLIC ??= 'test-public';
    // resolveProductAudienceFromOrigin (ADR-004) сравнивает req.headers.origin
    // с этой env-переменной — тесты используют реальный /auth/login flow, не
    // прямой session-bootstrap, поэтому она должна быть установлена ДО того,
    // как AppModule/AuthController её прочитают.
    process.env.CORS_ALLOWED_ORIGIN_MARKETPLACE = MARKETPLACE_ORIGIN;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
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
    adminPublicationService = moduleRef.get(AdminPublicationService);
    duplicateCandidateRepository = moduleRef.get(DuplicateCandidateRepository);
    publicationHandler = new PublicationRequestedHandler(
      publicationRepository,
      moduleRef.get(DevelopmentRepository),
      moduleRef.get(ListingRepository),
      moduleRef.get(PropertyAssetRepository),
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
      'sessions',
      'identities',
      'organizations',
      'positions',
      'position_assignments',
      'permission_grants',
    ]) {
      await connection.collection(collection).deleteMany({});
    }
  });

  function makeSuperAdminContext(): AdminContext {
    return {
      identityId: new Types.ObjectId().toString(),
      adminAccountId: new Types.ObjectId().toString(),
      isSuperAdmin: true,
    };
  }

  let assetPayloadCounter = 0;
  function makeAssetPayload() {
    assetPayloadCounter += 1;
    return {
      propertyType: 'apartment' as const,
      location: { country: 'GE', city: 'Batumi', address: `Wizard Address ${assetPayloadCounter}`, geo: { type: 'Point' as const, coordinates: [41.6, 41.64] } },
      characteristics: { area: 60, rooms: 3, floor: 4 },
      representativePhone: `+995500${String(assetPayloadCounter).padStart(6, '0')}`,
    };
  }

  /** Реальный ERP onboarding: /organizations/register ставит ERP-audience сессию сама (тот же паттерн, что property-assets-listings.integration-spec.ts). */
  async function erpOwnerCookie(prefix: string) {
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
    if (!cookie) throw new Error('ERP session cookie missing');
    return { cookie };
  }

  /** Реальная marketplace-регистрация: /auth/register + /auth/login с Origin marketplace — БЕЗ Organization/Position вообще. */
  async function marketplaceAccountCookie(prefix: string) {
    const login = `${prefix}-${new Types.ObjectId().toString()}@example.test`;
    const password = 'correct horse battery staple';
    const registerResponse = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { login, password } });
    expect(registerResponse.statusCode).toBe(201);

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: MARKETPLACE_ORIGIN },
      payload: { login, password },
    });
    expect(loginResponse.statusCode).toBe(200);
    const raw = loginResponse.headers['set-cookie'];
    const cookie = (Array.isArray(raw) ? raw[0] : raw)?.match(/baza_session=[^;]+/)?.[0];
    if (!cookie) throw new Error('marketplace session cookie missing');
    return { cookie, identityId: loginResponse.json().identityId as string };
  }

  async function createActiveListing(account: { cookie: string }, dealType: 'sale' | 'rent_long' | 'rent_short' = 'sale') {
    const assetResponse = await app.inject({ method: 'POST', url: '/api/v1/marketplace/property-assets', headers: { cookie: account.cookie }, payload: makeAssetPayload() });
    expect(assetResponse.statusCode).toBe(201);
    const asset = assetResponse.json();

    const listingResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/property-assets/${asset._id}/listings`,
      headers: { cookie: account.cookie },
      payload: { dealType, price: { amountMinorUnits: 15_000_000, currency: 'USD' } },
    });
    expect(listingResponse.statusCode).toBe(201);
    const listing = listingResponse.json();

    const activateResponse = await app.inject({
      method: 'PATCH',
      url: `/api/v1/marketplace/property-assets/${asset._id}/listings/${listing._id}/activate`,
      headers: { cookie: account.cookie },
    });
    expect(activateResponse.statusCode).toBe(200);

    return { asset, listing: activateResponse.json() };
  }

  async function publish(account: { cookie: string }, assetId: string, listingId: string, idempotencyKey = `key-${listingId}`) {
    return app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/property-assets/${assetId}/listings/${listingId}/publish`,
      headers: { cookie: account.cookie, 'idempotency-key': idempotencyKey },
    });
  }

  it('marketplace-аккаунт без ERP-организации создаёт PropertyAsset с publisherScope:marketplace_account', async () => {
    const account = await marketplaceAccountCookie('wizard-a');

    const response = await app.inject({ method: 'POST', url: '/api/v1/marketplace/property-assets', headers: { cookie: account.cookie }, payload: makeAssetPayload() });

    expect(response.statusCode).toBe(201);
    const asset = response.json();
    expect(asset.publisherScope).toEqual({ type: 'marketplace_account', identityId: account.identityId });
  });

  it('запрос вообще без cookie (гость) получает 401 AUTH_NO_SESSION, не 403/500 — зеркалирует AdminGuard', async () => {
    // MarketplaceAccountGuard теперь различает "нет cookie вообще" (401 —
    // не было попытки аутентификации, безопасно раскрыть) от "cookie есть,
    // но не резолвится" (403, non-disclosure причины) — тот же паттерн,
    // что уже применён к AdminGuard. Случай "ERP-сессия против
    // marketplace-endpoint" (cookie ЕСТЬ, просто не тот audience) остаётся
    // 403 и отдельно покрыт ниже, см. "ERP-сессия ... НЕ проходит
    // MarketplaceAccountGuard".
    const response = await app.inject({ method: 'POST', url: '/api/v1/marketplace/property-assets', payload: makeAssetPayload() });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('AUTH_NO_SESSION');
  });

  it('другой marketplace-аккаунт не видит чужой PropertyAsset (единый 404, tenant isolation по identityId)', async () => {
    const first = await marketplaceAccountCookie('wizard-b');
    const second = await marketplaceAccountCookie('wizard-c');

    const created = await app.inject({ method: 'POST', url: '/api/v1/marketplace/property-assets', headers: { cookie: first.cookie }, payload: makeAssetPayload() });
    const foreignRead = await app.inject({ method: 'GET', url: `/api/v1/marketplace/property-assets/${created.json()._id}`, headers: { cookie: second.cookie } });

    expect(foreignRead.statusCode).toBe(404);
  });

  it('полный цикл: create asset → create listing → activate → publish → worker строит проекцию → появляется в GET /public/listings', async () => {
    const account = await marketplaceAccountCookie('wizard-d');
    const { asset, listing } = await createActiveListing(account, 'sale');

    const publishResponse = await publish(account, asset._id, listing._id);
    expect(publishResponse.statusCode).toBe(202);

    const event = await connection.collection('outbox_events').findOne({ eventType: 'PublicationRequested', aggregateId: new Types.ObjectId(listing._id) });
    expect(event).not.toBeNull();
    await publicationHandler.handle(event as never);

    const publication = await publicationRepository.findBySource('listing', new Types.ObjectId(listing._id));
    expect(publication?.status).toBe('published');
    expect(publication?.publisherScope.type).toBe('marketplace_account');
    expect((publication?.publisherScope as { identityId: Types.ObjectId }).identityId.toString()).toBe(account.identityId);

    const publicListResponse = await app.inject({ method: 'GET', url: '/api/v1/public/listings' });
    expect((publicListResponse.json().items as unknown[]).length).toBe(1);
  });

  it('DEDUPE-001 gate применяется одинаково к marketplace-аккаунтам: явный дубль (совпадающий телефон) блокирует publish', async () => {
    const accountA = await marketplaceAccountCookie('wizard-e');
    const accountB = await marketplaceAccountCookie('wizard-f');
    const phone = '+995500777888';

    const assetAResponse = await app.inject({ method: 'POST', url: '/api/v1/marketplace/property-assets', headers: { cookie: accountA.cookie }, payload: { ...makeAssetPayload(), representativePhone: phone } });
    const assetBResponse = await app.inject({ method: 'POST', url: '/api/v1/marketplace/property-assets', headers: { cookie: accountB.cookie }, payload: { ...makeAssetPayload(), representativePhone: phone } });
    const assetA = assetAResponse.json();
    void assetBResponse;

    const listingResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/property-assets/${assetA._id}/listings`,
      headers: { cookie: accountA.cookie },
      payload: { dealType: 'sale', price: { amountMinorUnits: 100, currency: 'USD' } },
    });
    const listing = listingResponse.json();
    await app.inject({ method: 'PATCH', url: `/api/v1/marketplace/property-assets/${assetA._id}/listings/${listing._id}/activate`, headers: { cookie: accountA.cookie } });

    const publishResponse = await publish(accountA, assetA._id, listing._id);

    expect(publishResponse.statusCode).toBe(409);
  });

  it('ACT-001: confirm-actuality/actuality endpoints работают identity-scoped, чужой identityId получает 404', async () => {
    const account = await marketplaceAccountCookie('wizard-g');
    const stranger = await marketplaceAccountCookie('wizard-h');
    const { asset, listing } = await createActiveListing(account, 'rent_long');

    const actualityResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/marketplace/property-assets/${asset._id}/listings/${listing._id}/actuality`,
      headers: { cookie: account.cookie },
    });
    expect(actualityResponse.statusCode).toBe(200);
    expect(actualityResponse.json().category).toBe('rent');

    const foreignActuality = await app.inject({
      method: 'GET',
      url: `/api/v1/marketplace/property-assets/${asset._id}/listings/${listing._id}/actuality`,
      headers: { cookie: stranger.cookie },
    });
    expect(foreignActuality.statusCode).toBe(404);
  });

  it('unpublish снимает listing marketplace-аккаунта с публичного списка', async () => {
    const account = await marketplaceAccountCookie('wizard-i');
    const { asset, listing } = await createActiveListing(account, 'sale');
    await publish(account, asset._id, listing._id);
    const event = await connection.collection('outbox_events').findOne({ eventType: 'PublicationRequested', aggregateId: new Types.ObjectId(listing._id) });
    await publicationHandler.handle(event as never);

    const unpublishResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/property-assets/${asset._id}/listings/${listing._id}/unpublish`,
      headers: { cookie: account.cookie },
      payload: { reason: 'Property sold outside the platform' },
    });
    expect(unpublishResponse.statusCode).toBe(201);

    const publicListResponse = await app.inject({ method: 'GET', url: '/api/v1/public/listings' });
    expect((publicListResponse.json().items as unknown[]).length).toBe(0);
  });

  // Независимый review (Gemini) — IDOR/audience-barrier чек-лист.
  describe('Data invariants', () => {
    it('active-per-dealType уникальность держится под реальной гонкой (Promise.all, unique partial index не завязан на publisherScope-ветку)', async () => {
      const account = await marketplaceAccountCookie('wizard-race');
      const assetResponse = await app.inject({ method: 'POST', url: '/api/v1/marketplace/property-assets', headers: { cookie: account.cookie }, payload: makeAssetPayload() });
      const asset = assetResponse.json();

      const first = (
        await app.inject({ method: 'POST', url: `/api/v1/marketplace/property-assets/${asset._id}/listings`, headers: { cookie: account.cookie }, payload: { dealType: 'sale', price: { amountMinorUnits: 100, currency: 'USD' } } })
      ).json();
      const second = (
        await app.inject({ method: 'POST', url: `/api/v1/marketplace/property-assets/${asset._id}/listings`, headers: { cookie: account.cookie }, payload: { dealType: 'sale', price: { amountMinorUnits: 200, currency: 'USD' } } })
      ).json();

      const [activateFirst, activateSecond] = await Promise.all([
        app.inject({ method: 'PATCH', url: `/api/v1/marketplace/property-assets/${asset._id}/listings/${first._id}/activate`, headers: { cookie: account.cookie } }),
        app.inject({ method: 'PATCH', url: `/api/v1/marketplace/property-assets/${asset._id}/listings/${second._id}/activate`, headers: { cookie: account.cookie } }),
      ]);

      const statusCodes = [activateFirst.statusCode, activateSecond.statusCode].sort();
      expect(statusCodes).toEqual([200, 409]);

      const activeCount = await connection.collection('listings').countDocuments({ propertyAssetId: new Types.ObjectId(asset._id), dealType: 'sale', status: 'active' });
      expect(activeCount).toBe(1);
    });
  });

  describe('IDOR: чужой identityId получает 404 на КАЖДОЙ мутации, не только read', () => {
    it('activate чужого listing даёт 404', async () => {
      const owner = await marketplaceAccountCookie('wizard-idor-a');
      const stranger = await marketplaceAccountCookie('wizard-idor-b');
      const assetResponse = await app.inject({ method: 'POST', url: '/api/v1/marketplace/property-assets', headers: { cookie: owner.cookie }, payload: makeAssetPayload() });
      const asset = assetResponse.json();
      const listingResponse = await app.inject({
        method: 'POST',
        url: `/api/v1/marketplace/property-assets/${asset._id}/listings`,
        headers: { cookie: owner.cookie },
        payload: { dealType: 'sale', price: { amountMinorUnits: 100, currency: 'USD' } },
      });
      const listing = listingResponse.json();

      const foreignActivate = await app.inject({
        method: 'PATCH',
        url: `/api/v1/marketplace/property-assets/${asset._id}/listings/${listing._id}/activate`,
        headers: { cookie: stranger.cookie },
      });

      expect(foreignActivate.statusCode).toBe(404);
      const listingDoc = await connection.collection('listings').findOne({ _id: new Types.ObjectId(listing._id) });
      expect(listingDoc?.status).toBe('draft');
    });

    it('publish чужого listing даёт 404, не создаёт публикацию', async () => {
      const owner = await marketplaceAccountCookie('wizard-idor-c');
      const stranger = await marketplaceAccountCookie('wizard-idor-d');
      const { asset, listing } = await createActiveListing(owner, 'sale');

      const foreignPublish = await app.inject({
        method: 'POST',
        url: `/api/v1/marketplace/property-assets/${asset._id}/listings/${listing._id}/publish`,
        headers: { cookie: stranger.cookie, 'idempotency-key': 'foreign-publish-key' },
      });

      expect(foreignPublish.statusCode).toBe(404);
      const publication = await publicationRepository.findBySource('listing', new Types.ObjectId(listing._id));
      expect(publication).toBeNull();
    });

    it('unpublish чужого published listing даёт 404, публикация остаётся published', async () => {
      const owner = await marketplaceAccountCookie('wizard-idor-e');
      const stranger = await marketplaceAccountCookie('wizard-idor-f');
      const { asset, listing } = await createActiveListing(owner, 'sale');
      await publish(owner, asset._id, listing._id);
      const event = await connection.collection('outbox_events').findOne({ eventType: 'PublicationRequested', aggregateId: new Types.ObjectId(listing._id) });
      await publicationHandler.handle(event as never);

      const foreignUnpublish = await app.inject({
        method: 'POST',
        url: `/api/v1/marketplace/property-assets/${asset._id}/listings/${listing._id}/unpublish`,
        headers: { cookie: stranger.cookie },
        payload: { reason: 'Trying to unpublish someone elses listing' },
      });

      expect(foreignUnpublish.statusCode).toBe(404);
      const publication = await publicationRepository.findBySource('listing', new Types.ObjectId(listing._id));
      expect(publication?.status).toBe('published');
    });

    it('confirm-actuality чужого listing даёт 404, version не меняется', async () => {
      const owner = await marketplaceAccountCookie('wizard-idor-g');
      const stranger = await marketplaceAccountCookie('wizard-idor-h');
      const { asset, listing } = await createActiveListing(owner, 'sale');

      const foreignConfirm = await app.inject({
        method: 'PATCH',
        url: `/api/v1/marketplace/property-assets/${asset._id}/listings/${listing._id}/confirm-actuality`,
        headers: { cookie: stranger.cookie },
        payload: { expectedVersion: listing.version },
      });

      expect(foreignConfirm.statusCode).toBe(404);
      const listingDoc = await connection.collection('listings').findOne({ _id: new Types.ObjectId(listing._id) });
      expect(listingDoc?.version).toBe(listing.version);
    });

    it('listListings/getAsset/publication-status чужого identityId дают единый 404', async () => {
      const owner = await marketplaceAccountCookie('wizard-idor-i');
      const stranger = await marketplaceAccountCookie('wizard-idor-j');
      const { asset, listing } = await createActiveListing(owner, 'sale');

      const foreignAssetRead = await app.inject({ method: 'GET', url: `/api/v1/marketplace/property-assets/${asset._id}`, headers: { cookie: stranger.cookie } });
      const foreignListingsRead = await app.inject({ method: 'GET', url: `/api/v1/marketplace/property-assets/${asset._id}/listings`, headers: { cookie: stranger.cookie } });
      const foreignPublicationStatus = await app.inject({
        method: 'GET',
        url: `/api/v1/marketplace/property-assets/${asset._id}/listings/${listing._id}/publication-status`,
        headers: { cookie: stranger.cookie },
      });

      expect(foreignAssetRead.statusCode).toBe(404);
      expect(foreignListingsRead.statusCode).toBe(404);
      expect(foreignPublicationStatus.statusCode).toBe(404);
    });
  });

  describe('Audience barrier (ADR-004): три сессионных контура физически не пересекаются', () => {
    it('ERP-сессия (organization TenantContext) НЕ проходит MarketplaceAccountGuard — 403 на marketplace-endpoint', async () => {
      const erpOwner = await erpOwnerCookie('wizard-audience-a');

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/marketplace/property-assets',
        headers: { cookie: erpOwner.cookie },
        payload: makeAssetPayload(),
      });

      expect(response.statusCode).toBe(403);
    });

    it('Marketplace-сессия НЕ проходит TenantGuard — 403 на ERP-endpoint', async () => {
      const marketplaceAccount = await marketplaceAccountCookie('wizard-audience-b');

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/property-assets',
        headers: { cookie: marketplaceAccount.cookie },
        payload: makeAssetPayload(),
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('Admin operations на marketplace-listing (D-06 generic unpublish/list — без единой правки)', () => {
    it('Admin unpublish marketplace-listing работает и пишет audit-запись', async () => {
      const account = await marketplaceAccountCookie('wizard-admin-a');
      const { asset, listing } = await createActiveListing(account, 'sale');
      await publish(account, asset._id, listing._id);
      const event = await connection.collection('outbox_events').findOne({ eventType: 'PublicationRequested', aggregateId: new Types.ObjectId(listing._id) });
      await publicationHandler.handle(event as never);

      const publicationBefore = await publicationRepository.findBySource('listing', new Types.ObjectId(listing._id));
      expect(publicationBefore?.status).toBe('published');

      const result = await adminPublicationService.unpublish(makeSuperAdminContext(), {
        publicationId: publicationBefore!._id,
        reason: 'Admin removed marketplace listing (independent review test)',
        correlationId: 'wizard-admin-unpublish-test',
      });

      expect(result.sourceType).toBe('listing');
      expect(result.status).toBe('unpublished');

      const auditEvent = await connection.collection('audit_events').findOne({ action: 'publication.unpublish', resourceId: new Types.ObjectId(listing._id) });
      expect(auditEvent).not.toBeNull();
      expect(auditEvent?.reason).toContain('Admin removed marketplace listing');
      expect(auditEvent?.actor?.type).toBe('admin_account');

      const publicListResponse = await app.inject({ method: 'GET', url: '/api/v1/public/listings' });
      expect((publicListResponse.json().items as unknown[]).length).toBe(0);
    });

    it('Admin list показывает identity-scoped публикацию с organizationId:null (не путает с organization-scope)', async () => {
      const account = await marketplaceAccountCookie('wizard-admin-b');
      const { asset, listing } = await createActiveListing(account, 'sale');
      await publish(account, asset._id, listing._id);
      const event = await connection.collection('outbox_events').findOne({ eventType: 'PublicationRequested', aggregateId: new Types.ObjectId(listing._id) });
      await publicationHandler.handle(event as never);

      const listResult = await adminPublicationService.list(makeSuperAdminContext(), { sourceType: 'listing', limit: 20 });

      const item = listResult.items.find((row) => row.sourceId === listing._id);
      expect(item).toBeDefined();
      expect(item?.organizationId).toBeNull();
    });
  });

  // Независимый review (Gemini) — два оставшихся пункта чек-листа:
  // ACT-001 confirmActualityForIdentity(expired→active) и DEDUPE-001
  // override(marketplace-endpoint) через реальный HTTP marketplace-контур
  // (ERP-эквиваленты этих сценариев уже покрыты
  // dedupe-actuality.integration-spec.ts, здесь — та же проверка для
  // *ForIdentity-веток, не молчаливое предположение, что зеркалирование
  // кода означает зеркалирование поведения).
  describe('ACT-001/DEDUPE-001 marketplace-endpoints (зеркало dedupe-actuality.integration-spec.ts)', () => {
    it('publish отклоняется для expired marketplace-listing, но confirmActualityForIdentity реактивирует его (expired→active), после чего publish снова разрешён', async () => {
      const account = await marketplaceAccountCookie('wizard-act-expired');
      const { asset, listing } = await createActiveListing(account, 'sale');
      await connection.collection('listings').updateOne({ _id: new Types.ObjectId(listing._id) }, { $set: { status: 'expired' } });

      const blockedPublish = await publish(account, asset._id, listing._id);
      expect(blockedPublish.statusCode).toBe(409);

      const confirmResponse = await app.inject({
        method: 'PATCH',
        url: `/api/v1/marketplace/property-assets/${asset._id}/listings/${listing._id}/confirm-actuality`,
        headers: { cookie: account.cookie },
        payload: { expectedVersion: listing.version },
      });
      expect(confirmResponse.statusCode).toBe(200);
      expect(confirmResponse.json().state).toBe('up_to_date');

      const listingAfterConfirm = await connection.collection('listings').findOne({ _id: new Types.ObjectId(listing._id) });
      expect(listingAfterConfirm?.status).toBe('active');

      const publishAfterConfirm = await publish(account, asset._id, listing._id, `key-after-confirm-${listing._id}`);
      expect(publishAfterConfirm.statusCode).toBe(202);
    });

    it('DEDUPE-001 override через marketplace-endpoint снимает блокировку — publish разрешён после override', async () => {
      const accountA = await marketplaceAccountCookie('wizard-dedupe-override-a');
      const accountB = await marketplaceAccountCookie('wizard-dedupe-override-b');
      const phone = '+995500888999';

      const assetAResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/marketplace/property-assets',
        headers: { cookie: accountA.cookie },
        payload: { ...makeAssetPayload(), representativePhone: phone },
      });
      const assetBResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/marketplace/property-assets',
        headers: { cookie: accountB.cookie },
        payload: { ...makeAssetPayload(), representativePhone: phone },
      });
      const assetA = assetAResponse.json();
      const assetB = assetBResponse.json();

      const listingResponse = await app.inject({
        method: 'POST',
        url: `/api/v1/marketplace/property-assets/${assetA._id}/listings`,
        headers: { cookie: accountA.cookie },
        payload: { dealType: 'sale', price: { amountMinorUnits: 100, currency: 'USD' } },
      });
      const listing = listingResponse.json();
      await app.inject({ method: 'PATCH', url: `/api/v1/marketplace/property-assets/${assetA._id}/listings/${listing._id}/activate`, headers: { cookie: accountA.cookie } });

      const blockedPublish = await publish(accountA, assetA._id, listing._id);
      expect(blockedPublish.statusCode).toBe(409);

      const candidate = await duplicateCandidateRepository.findByPair(new Types.ObjectId(assetA._id), new Types.ObjectId(assetB._id));
      expect(candidate).not.toBeNull();

      const overrideResponse = await app.inject({
        method: 'POST',
        url: `/api/v1/marketplace/property-assets/duplicate-candidates/${candidate!._id.toString()}/override`,
        headers: { cookie: accountA.cookie },
        payload: { reason: 'Verified in person — different unit, owner has multiple listings under one phone' },
      });
      expect(overrideResponse.statusCode).toBe(201);

      const publishAfterOverride = await publish(accountA, assetA._id, listing._id, `key-after-override-${listing._id}`);
      expect(publishAfterOverride.statusCode).toBe(202);

      const candidateAfterOverride = await duplicateCandidateRepository.findByPair(new Types.ObjectId(assetA._id), new Types.ObjectId(assetB._id));
      expect(candidateAfterOverride?.status).toBe('override_not_duplicate');

      const auditEvent = await connection.collection('audit_events').findOne({ action: 'duplicate_candidate.override' });
      expect(auditEvent).not.toBeNull();
      expect(auditEvent?.reason).toContain('Verified in person');
    });

    it('DEDUPE-001 override IDOR: чужой marketplace-аккаунт (не владеющий ни одной стороной) получает 404', async () => {
      const accountA = await marketplaceAccountCookie('wizard-dedupe-idor-a');
      const accountB = await marketplaceAccountCookie('wizard-dedupe-idor-b');
      const stranger = await marketplaceAccountCookie('wizard-dedupe-idor-stranger');
      const phone = '+995500123456';

      const assetAResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/marketplace/property-assets',
        headers: { cookie: accountA.cookie },
        payload: { ...makeAssetPayload(), representativePhone: phone },
      });
      const assetBResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/marketplace/property-assets',
        headers: { cookie: accountB.cookie },
        payload: { ...makeAssetPayload(), representativePhone: phone },
      });
      const assetA = assetAResponse.json();
      const assetB = assetBResponse.json();

      const candidate = await duplicateCandidateRepository.findByPair(new Types.ObjectId(assetA._id), new Types.ObjectId(assetB._id));
      expect(candidate).not.toBeNull();

      const overrideResponse = await app.inject({
        method: 'POST',
        url: `/api/v1/marketplace/property-assets/duplicate-candidates/${candidate!._id.toString()}/override`,
        headers: { cookie: stranger.cookie },
        payload: { reason: 'Stranger trying to override someone elses candidate' },
      });
      expect(overrideResponse.statusCode).toBe(404);

      const candidateDoc = await duplicateCandidateRepository.findById(candidate!._id);
      expect(candidateDoc?.status).toBe('detected');
    });

    it('DEDUPE-001 cross-scope (ERP Org X vs Marketplace User Y): обе стороны могут override, посторонние получают 404', async () => {
      const erpOrgX = await erpOwnerCookie('wizard-cross-erp');
      const erpOrgW = await erpOwnerCookie('wizard-cross-erp-stranger');
      const marketplaceY = await marketplaceAccountCookie('wizard-cross-mkt');
      const marketplaceZ = await marketplaceAccountCookie('wizard-cross-mkt-stranger');
      const phone = '+995500654321';

      // Asset 1: ERP Org X
      const erpAssetResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/property-assets',
        headers: { cookie: erpOrgX.cookie },
        payload: { ...makeAssetPayload(), representativePhone: phone },
      });
      expect(erpAssetResponse.statusCode).toBe(201);
      const erpAsset = erpAssetResponse.json();

      // Asset 2: Marketplace User Y
      const mktAssetResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/marketplace/property-assets',
        headers: { cookie: marketplaceY.cookie },
        payload: { ...makeAssetPayload(), representativePhone: phone },
      });
      expect(mktAssetResponse.statusCode).toBe(201);
      const mktAsset = mktAssetResponse.json();

      const candidate = await duplicateCandidateRepository.findByPair(new Types.ObjectId(erpAsset._id), new Types.ObjectId(mktAsset._id));
      expect(candidate).not.toBeNull();

      // 1. Посторонний Marketplace Z получает 404 на marketplace-endpoint
      const strangerMktOverride = await app.inject({
        method: 'POST',
        url: `/api/v1/marketplace/property-assets/duplicate-candidates/${candidate!._id.toString()}/override`,
        headers: { cookie: marketplaceZ.cookie },
        payload: { reason: 'Unauthorized marketplace override attempt' },
      });
      expect(strangerMktOverride.statusCode).toBe(404);

      // 2. Посторонняя ERP Org W получает 404 на ERP-endpoint
      const strangerErpOverride = await app.inject({
        method: 'POST',
        url: `/api/v1/property-assets/duplicate-candidates/${candidate!._id.toString()}/override`,
        headers: { cookie: erpOrgW.cookie },
        payload: { reason: 'Unauthorized ERP override attempt' },
      });
      expect(strangerErpOverride.statusCode).toBe(404);

      // 3. Владелец Marketplace Y успешно делает override через marketplace-endpoint
      const mktOverride = await app.inject({
        method: 'POST',
        url: `/api/v1/marketplace/property-assets/duplicate-candidates/${candidate!._id.toString()}/override`,
        headers: { cookie: marketplaceY.cookie },
        payload: { reason: 'Cross-scope legitimate override by marketplace owner' },
      });
      expect(mktOverride.statusCode).toBe(201);

      const candidateDoc = await duplicateCandidateRepository.findById(candidate!._id);
      expect(candidateDoc?.status).toBe('override_not_duplicate');
    });
  });

  /**
   * MKT-002-IDEMP-RACE-001: тот же race-class, что ERP-путь
   * (mkt-002-listing-publication.integration-spec.ts, тесты 11/11c/11d) —
   * marketplace publishListing раньше содержал одноразовую (не bounded-
   * retry) повторную проверку idempotency-записи после CAS-провала,
   * которая эмпирически тоже не успевала увидеть коммит соперника (~50%
   * ложных 409 VERSION_CONFLICT при верификации). Фикс в
   * MarketplacePropertyAssetsService.publishListing зеркалит ERP-сторону.
   */
  describe('MKT-002-IDEMP-RACE-001: конкурентный publish с одним Idempotency-Key (marketplace path)', () => {
    it('два параллельных publish с одним Idempotency-Key: оба 202, один и тот же id, ровно одна публикация/outbox-событие/idempotency-запись', async () => {
      const account = await marketplaceAccountCookie('idemp-race-a');
      const { asset, listing } = await createActiveListing(account, 'sale');
      const idempotencyKey = `marketplace-race-key-${listing._id}`;

      const [first, second] = await Promise.all([
        publish(account, asset._id, listing._id, idempotencyKey),
        publish(account, asset._id, listing._id, idempotencyKey),
      ]);

      expect(first.statusCode).toBe(202);
      expect(second.statusCode).toBe(202);
      expect(first.json()).toEqual(second.json());

      const publications = await connection.collection('marketplace_publications').find({ sourceType: 'listing', sourceId: new Types.ObjectId(listing._id) }).toArray();
      expect(publications).toHaveLength(1);

      const outboxEvents = await connection
        .collection('outbox_events')
        .find({ eventType: 'PublicationRequested', aggregateId: new Types.ObjectId(listing._id) })
        .toArray();
      expect(outboxEvents).toHaveLength(1);

      const idempotencyRecords = await connection.collection('idempotency_records').find({ key: idempotencyKey }).toArray();
      expect(idempotencyRecords).toHaveLength(1);
    });

    it('тот же Idempotency-Key с другим телом запроса (другой listingId) остаётся 409 IDEMPOTENCY_KEY_CONFLICT, не идемпотентный replay', async () => {
      const account = await marketplaceAccountCookie('idemp-race-b');
      const first = await createActiveListing(account, 'sale');
      const second = await createActiveListing(account, 'rent_long');
      const sharedKey = `shared-key-${first.listing._id}`;

      const firstPublish = await publish(account, first.asset._id, first.listing._id, sharedKey);
      expect(firstPublish.statusCode).toBe(202);

      const conflictingPublish = await publish(account, second.asset._id, second.listing._id, sharedKey);
      expect(conflictingPublish.statusCode).toBe(409);
      expect(conflictingPublish.json().error.code).toBe('IDEMPOTENCY_KEY_CONFLICT');

      const secondPublications = await connection.collection('marketplace_publications').find({ sourceType: 'listing', sourceId: new Types.ObjectId(second.listing._id) }).toArray();
      expect(secondPublications).toHaveLength(0);
    });

    it('повторный publish с тем же ключом ПОСЛЕ завершения (не concurrent) — идемпотентный replay, без повторной публикации', async () => {
      const account = await marketplaceAccountCookie('idemp-race-c');
      const { asset, listing } = await createActiveListing(account, 'sale');
      const idempotencyKey = `sequential-marketplace-key-${listing._id}`;

      const first = await publish(account, asset._id, listing._id, idempotencyKey);
      expect(first.statusCode).toBe(202);

      const second = await publish(account, asset._id, listing._id, idempotencyKey);
      expect(second.statusCode).toBe(202);
      expect(second.json()).toEqual(first.json());

      const publications = await connection.collection('marketplace_publications').find({ sourceType: 'listing', sourceId: new Types.ObjectId(listing._id) }).toArray();
      expect(publications).toHaveLength(1);
    });

    it('разные Idempotency-Key на уже опубликованный listing остаются заблокированы (текущая защита от повторной публикации не сломана фиксом)', async () => {
      const account = await marketplaceAccountCookie('idemp-race-d');
      const { asset, listing } = await createActiveListing(account, 'sale');

      const first = await publish(account, asset._id, listing._id, `key-1-${listing._id}`);
      expect(first.statusCode).toBe(202);

      const second = await publish(account, asset._id, listing._id, `key-2-${listing._id}`);
      expect(second.statusCode).toBe(409);

      const publications = await connection.collection('marketplace_publications').find({ sourceType: 'listing', sourceId: new Types.ObjectId(listing._id) }).toArray();
      expect(publications).toHaveLength(1);
    });
  });
});

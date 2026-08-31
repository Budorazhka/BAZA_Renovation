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
import { DevelopmentRepository } from '@baza/development';
import { ListingRepository, PropertyAssetRepository } from '@baza/property-assets';
import { MarketplacePublicationRepository } from '@baza/publication';
import { AdminPublicationService } from '../../src/modules/admin/admin-publication.service';
import type { AdminContext } from '../../src/shared/admin/admin-context';
import { RedisService } from '../../src/shared/redis/redis.service';
import { createRedisMockService } from './support/redis-mock';
// D-03 паттерн (см. publish-to-published-projection.integration-spec.ts):
// прямой кросс-app импорт реального worker handler'а внутри тестового
// файла — доказывает полную цепочку publish → outbox → worker → published
// projection против одной и той же реальной MongoDB, не дублирует
// mongodb-memory-server инфраструктуру в двух местах. OutboxPollerService
// сам не тестируется здесь (свой unit-тест в apps/worker).
import { PublicationRequestedHandler } from '../../../worker/src/handlers/publication-requested.handler';
import { MediaAssetRepository, MediaStorageService } from '@baza/media-storage';

describe('MKT-002: Listing publication + public secondary/rent data-layer (real HTTP + real MongoDB)', () => {
  let replSet: MongoMemoryReplSet;
  let app: NestFastifyApplication;
  let connection: Connection;
  let listingRepository: ListingRepository;
  let propertyAssetRepository: PropertyAssetRepository;
  let publicationRepository: MarketplacePublicationRepository;
  let publicationHandler: PublicationRequestedHandler;
  let adminPublicationService: AdminPublicationService;

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
    listingRepository = moduleRef.get(ListingRepository);
    propertyAssetRepository = moduleRef.get(PropertyAssetRepository);
    publicationRepository = moduleRef.get(MarketplacePublicationRepository);
    adminPublicationService = moduleRef.get(AdminPublicationService);
    // Реальный handler-класс, реальные repository-инстансы из того же
    // DI-графа (та же MongoDB-коллекция, что API-сторона только что
    // писала) — не мок. Этот describe-блок тестирует Listing-путь, но
    // handler конструктор требует все четыре repository (тот же класс,
    // что publish-to-published-projection.integration-spec.ts использует
    // для Development-пути).
    publicationHandler = new PublicationRequestedHandler(
      publicationRepository,
      moduleRef.get(DevelopmentRepository),
      listingRepository,
      propertyAssetRepository,
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
      'admin_accounts',
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

  function makeSuperAdminContext(): AdminContext {
    // Тот же паттерн, что admin-unpublish.integration-spec.ts
    // (makeSuperAdminContext) — AdminPublicationService.unpublish вызывается
    // напрямую через DI, не через HTTP/реальную admin-сессию. Прямой
    // MongoDB/DI bootstrap для super_admin — честный, задокументированный
    // workaround (d07-post-fix-production-gaps.md), поскольку apps/admin-web
    // пуст и HTTP-пути создания ПЕРВОГО super_admin не существует.
    return {
      identityId: new Types.ObjectId().toString(),
      adminAccountId: new Types.ObjectId().toString(),
      isSuperAdmin: true,
    };
  }

  // DEDUPE-001: representativePhone/address теперь участвуют в dedupe-скане
  // при каждом createAsset — этот файл проверяет publication pipeline, не
  // dedupe-поведение (то отдельно покрыто mkt-003/dedupe-focused тестом),
  // поэтому каждый asset получает уникальный phone/address, чтобы
  // ассеты, созданные в РАЗНЫХ test cases, никогда не становились
  // взаимными DuplicateCandidate и не блокировали publish() друг у друга.
  let assetPayloadCounter = 0;
  function makeAssetPayload() {
    assetPayloadCounter += 1;
    return {
      propertyType: 'apartment' as const,
      location: { country: 'GE', city: 'Batumi', address: `1 Rustaveli St, unit ${assetPayloadCounter}`, geo: { type: 'Point' as const, coordinates: [41.6, 41.64] } },
      characteristics: { area: 55, rooms: 2 },
      representativePhone: `+995500${String(assetPayloadCounter).padStart(6, '0')}`,
    };
  }

  async function createActiveListing(owner: { cookie: string }, dealType: 'sale' | 'rent_long' | 'rent_short' = 'sale') {
    const asset = (
      await app.inject({ method: 'POST', url: '/api/v1/property-assets', headers: { cookie: owner.cookie }, payload: makeAssetPayload() })
    ).json();
    const listing = (
      await app.inject({
        method: 'POST',
        url: `/api/v1/property-assets/${asset._id}/listings`,
        headers: { cookie: owner.cookie },
        payload: { dealType, price: { amountMinorUnits: 10_000_000, currency: 'USD' } },
      })
    ).json();
    const activateResponse = await app.inject({
      method: 'PATCH',
      url: `/api/v1/property-assets/${asset._id}/listings/${listing._id}/activate`,
      headers: { cookie: owner.cookie },
    });
    expect(activateResponse.statusCode).toBe(200);
    return { asset, listing };
  }

  async function publishListing(owner: { cookie: string }, assetId: string, listingId: string, idempotencyKey = `key-${listingId}`) {
    return app.inject({
      method: 'POST',
      url: `/api/v1/property-assets/${assetId}/listings/${listingId}/publish`,
      headers: { cookie: owner.cookie, 'idempotency-key': idempotencyKey },
    });
  }

  async function processPendingEvent(listingId: string) {
    const event = await connection.collection('outbox_events').findOne({ eventType: 'PublicationRequested', aggregateId: new Types.ObjectId(listingId) });
    expect(event).not.toBeNull();
    await publicationHandler.handle(event as never);
    return event as unknown as { payload: { version: number } };
  }

  // 1-2. organization создаёт asset и sale/rent listings; активирует и публикует sale listing.
  it('1-2. организация создаёт asset + sale/rent listings, активирует и публикует sale listing', async () => {
    const owner = await ownerCookie('flow1');
    const { asset, listing } = await createActiveListing(owner, 'sale');

    const publishResponse = await publishListing(owner, asset._id, listing._id);
    expect(publishResponse.statusCode).toBe(202);
    const body = publishResponse.json();
    expect(body.sourceType).toBe('listing');
    expect(body.status).toBe('publication_pending');
  });

  // 3. worker создаёт public projection.
  it('3. worker строит published projection после PublicationRequested', async () => {
    const owner = await ownerCookie('flow3');
    const { asset, listing } = await createActiveListing(owner, 'sale');
    await publishListing(owner, asset._id, listing._id);

    await processPendingEvent(listing._id);

    const publication = await publicationRepository.findBySource('listing', new Types.ObjectId(listing._id));
    expect(publication?.status).toBe('published');
    expect(publication?.slug).toBeTruthy();
    expect(publication?.denormalizedFields).toMatchObject({ dealType: 'sale', propertyType: 'apartment' });
  });

  // 4-5. public list возвращает только published listing; public detail возвращает whitelist response.
  it('4. public list возвращает только published listing (не draft/unpublished)', async () => {
    const owner = await ownerCookie('flow4');
    const { asset, listing } = await createActiveListing(owner, 'sale');
    const { listing: draftListing } = await (async () => {
      const draft = (
        await app.inject({
          method: 'POST',
          url: `/api/v1/property-assets/${asset._id}/listings`,
          headers: { cookie: owner.cookie },
          payload: { dealType: 'rent_short', price: { amountMinorUnits: 500_00, currency: 'GEL' } },
        })
      ).json();
      return { listing: draft };
    })();

    await publishListing(owner, asset._id, listing._id);
    await processPendingEvent(listing._id);

    const listResponse = await app.inject({ method: 'GET', url: '/api/v1/public/listings' });
    expect(listResponse.statusCode).toBe(200);
    const items = listResponse.json().items as Array<{ slug: string }>;
    expect(items.some((item) => item.slug)).toBe(true);
    expect(items.length).toBe(1);
    void draftListing;
  });

  it('5. public detail возвращает whitelist response без organizationId/publisherScope/contact', async () => {
    const owner = await ownerCookie('flow5');
    const { asset, listing } = await createActiveListing(owner, 'sale');
    await publishListing(owner, asset._id, listing._id);
    await processPendingEvent(listing._id);

    const publication = await publicationRepository.findBySource('listing', new Types.ObjectId(listing._id));
    const detailResponse = await app.inject({ method: 'GET', url: `/api/v1/public/listings/${publication!.slug}` });

    expect(detailResponse.statusCode).toBe(200);
    const body = detailResponse.json() as Record<string, unknown>;
    expect(body).not.toHaveProperty('organizationId');
    expect(body).not.toHaveProperty('publisherScope');
    expect(body).not.toHaveProperty('sourceId');
    expect(body).not.toHaveProperty('version');
    expect(body).not.toHaveProperty('contact');
    expect(body.dealType).toBe('sale');
    expect(body.propertyType).toBe('apartment');
    expect(body.location).toMatchObject({ geo: { type: 'Point', coordinates: [41.6, 41.64] } });
  });

  // 6. rent listing публикуется независимо от sale.
  it('6. sale и rent_long listing на одном asset публикуются независимо', async () => {
    const owner = await ownerCookie('flow6');
    const asset = (await app.inject({ method: 'POST', url: '/api/v1/property-assets', headers: { cookie: owner.cookie }, payload: makeAssetPayload() })).json();
    const sale = (
      await app.inject({ method: 'POST', url: `/api/v1/property-assets/${asset._id}/listings`, headers: { cookie: owner.cookie }, payload: { dealType: 'sale', price: { amountMinorUnits: 100, currency: 'USD' } } })
    ).json();
    const rent = (
      await app.inject({ method: 'POST', url: `/api/v1/property-assets/${asset._id}/listings`, headers: { cookie: owner.cookie }, payload: { dealType: 'rent_long', price: { amountMinorUnits: 200, currency: 'GEL' } } })
    ).json();
    await app.inject({ method: 'PATCH', url: `/api/v1/property-assets/${asset._id}/listings/${sale._id}/activate`, headers: { cookie: owner.cookie } });
    await app.inject({ method: 'PATCH', url: `/api/v1/property-assets/${asset._id}/listings/${rent._id}/activate`, headers: { cookie: owner.cookie } });

    const salePublish = await publishListing(owner, asset._id, sale._id, `key-sale-${sale._id}`);
    const rentPublish = await publishListing(owner, asset._id, rent._id, `key-rent-${rent._id}`);
    expect(salePublish.statusCode).toBe(202);
    expect(rentPublish.statusCode).toBe(202);

    await processPendingEvent(sale._id);
    await processPendingEvent(rent._id);

    const salePub = await publicationRepository.findBySource('listing', new Types.ObjectId(sale._id));
    const rentPub = await publicationRepository.findBySource('listing', new Types.ObjectId(rent._id));
    expect(salePub?.status).toBe('published');
    expect(rentPub?.status).toBe('published');
    expect(salePub?.slug).not.toBe(rentPub?.slug);
  });

  // 7. unpublished listing исчезает из public list.
  it('7. owner unpublish снимает listing с публичного списка', async () => {
    const owner = await ownerCookie('flow7');
    const { asset, listing } = await createActiveListing(owner, 'sale');
    await publishListing(owner, asset._id, listing._id);
    await processPendingEvent(listing._id);

    const beforeList = await app.inject({ method: 'GET', url: '/api/v1/public/listings' });
    expect((beforeList.json().items as unknown[]).length).toBe(1);

    const unpublishResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/property-assets/${asset._id}/listings/${listing._id}/unpublish`,
      headers: { cookie: owner.cookie },
      payload: { reason: 'Owner requested removal' },
    });
    // POST без явного @HttpCode по умолчанию 201 в Nest — контроллер
    // возвращает getListingPublicationStatus() тело (не "создание нового
    // ресурса" семантически, но переопределять статус-код не входило в
    // явные требования ТЗ; проверяем реальное поведение, не выдуманное 200).
    expect(unpublishResponse.statusCode).toBe(201);

    const afterList = await app.inject({ method: 'GET', url: '/api/v1/public/listings' });
    expect((afterList.json().items as unknown[]).length).toBe(0);
  });

  // 8. expired listing не публикуется.
  it('8. publish отклоняется, если listing не в статусе active (draft)', async () => {
    const owner = await ownerCookie('flow8');
    const asset = (await app.inject({ method: 'POST', url: '/api/v1/property-assets', headers: { cookie: owner.cookie }, payload: makeAssetPayload() })).json();
    const draft = (
      await app.inject({ method: 'POST', url: `/api/v1/property-assets/${asset._id}/listings`, headers: { cookie: owner.cookie }, payload: { dealType: 'sale', price: { amountMinorUnits: 100, currency: 'USD' } } })
    ).json();

    const publishResponse = await publishListing(owner, asset._id, draft._id);
    expect(publishResponse.statusCode).toBe(409);
  });

  it('8b. publish отклоняется для listing в статусе expired (actuality-выбытие, до ACT-001)', async () => {
    const owner = await ownerCookie('flow8b');
    const { asset, listing } = await createActiveListing(owner, 'sale');
    await connection.collection('listings').updateOne({ _id: new Types.ObjectId(listing._id) }, { $set: { status: 'expired' } });

    const publishResponse = await publishListing(owner, asset._id, listing._id);
    expect(publishResponse.statusCode).toBe(409);
  });

  // 9. duplicate-blocked listing не публикуется — DEDUPE-001 не реализован
  // (см. evidence-документ), эмулируется прямой записью status:'archived',
  // тем же lifecycle-инвариантом, что publish требует status:'active'.
  it('9. publish отклоняется для listing в статусе archived (эмуляция duplicate-block до DEDUPE-001)', async () => {
    const owner = await ownerCookie('flow9');
    const { asset, listing } = await createActiveListing(owner, 'sale');
    await connection.collection('listings').updateOne({ _id: new Types.ObjectId(listing._id) }, { $set: { status: 'archived' } });

    const publishResponse = await publishListing(owner, asset._id, listing._id);
    expect(publishResponse.statusCode).toBe(409);
  });

  // 10. чужая организация не может управлять listing.
  it('10. чужая организация получает единый 404 на publish/unpublish/publication-status', async () => {
    const owner = await ownerCookie('flow10a');
    const stranger = await ownerCookie('flow10b');
    const { asset, listing } = await createActiveListing(owner, 'sale');

    const foreignPublish = await app.inject({
      method: 'POST',
      url: `/api/v1/property-assets/${asset._id}/listings/${listing._id}/publish`,
      headers: { cookie: stranger.cookie, 'idempotency-key': 'foreign-key' },
    });
    expect(foreignPublish.statusCode).toBe(404);

    await publishListing(owner, asset._id, listing._id);
    const foreignUnpublish = await app.inject({
      method: 'POST',
      url: `/api/v1/property-assets/${asset._id}/listings/${listing._id}/unpublish`,
      headers: { cookie: stranger.cookie },
      payload: { reason: 'trying to unpublish someone elses listing' },
    });
    expect(foreignUnpublish.statusCode).toBe(404);

    const foreignStatus = await app.inject({
      method: 'GET',
      url: `/api/v1/property-assets/${asset._id}/listings/${listing._id}/publication-status`,
      headers: { cookie: stranger.cookie },
    });
    expect(foreignStatus.statusCode).toBe(404);
  });

  // 11. два параллельных publish с одним Idempotency-Key не создают две публикации.
  it('11. два параллельных publish с одним Idempotency-Key создают ровно одну публикацию', async () => {
    const owner = await ownerCookie('flow11');
    const { asset, listing } = await createActiveListing(owner, 'sale');
    const idempotencyKey = `race-key-${listing._id}`;

    const [first, second] = await Promise.all([
      publishListing(owner, asset._id, listing._id, idempotencyKey),
      publishListing(owner, asset._id, listing._id, idempotencyKey),
    ]);

    expect([first.statusCode, second.statusCode].every((code) => code === 202)).toBe(true);
    expect(first.json().id).toBe(second.json().id);

    const publications = await connection.collection('marketplace_publications').find({ sourceType: 'listing', sourceId: new Types.ObjectId(listing._id) }).toArray();
    expect(publications).toHaveLength(1);

    const differentBodyRetry = await app.inject({
      method: 'POST',
      url: `/api/v1/property-assets/${asset._id}/listings/${(await createActiveListing(owner, 'rent_long')).listing._id}/publish`,
      headers: { cookie: owner.cookie, 'idempotency-key': idempotencyKey },
    });
    expect(differentBodyRetry.statusCode).toBe(409);
  });

  /**
   * MKT-002-IDEMP-RACE-001: тест 11 выше уже доказывает "ровно одна
   * публикация" под гонкой — этот тест закрывает остальную часть ADR-006
   * контракта, которую сам факт "одна публикация" не проверяет: ровно
   * ОДНО outbox-событие, ровно ОДНА idempotency-запись (не просто "не упало
   * с E11000/500"), и что ни один из двух конкурентных ответов не был
   * случайным 409/500 — реальный причинно-следственный класс бага,
   * найденный при верификации DOC-002 (см. property-assets.service.ts::
   * publishListing, catch-ветка вокруг runInTransaction).
   */
  it('11c. два параллельных publish с одним Idempotency-Key: ровно одно outbox-событие и ровно одна idempotency-запись, ни одного случайного 409/500', async () => {
    const owner = await ownerCookie('flow11c');
    const { asset, listing } = await createActiveListing(owner, 'sale');
    const idempotencyKey = `race-key-11c-${listing._id}`;

    const [first, second] = await Promise.all([
      publishListing(owner, asset._id, listing._id, idempotencyKey),
      publishListing(owner, asset._id, listing._id, idempotencyKey),
    ]);

    expect(first.statusCode).toBe(202);
    expect(second.statusCode).toBe(202);
    expect(first.json()).toEqual(second.json());

    const outboxEvents = await connection
      .collection('outbox_events')
      .find({ eventType: 'PublicationRequested', aggregateId: new Types.ObjectId(listing._id) })
      .toArray();
    expect(outboxEvents).toHaveLength(1);

    const idempotencyRecords = await connection.collection('idempotency_records').find({ key: idempotencyKey }).toArray();
    expect(idempotencyRecords).toHaveLength(1);

    const publications = await connection.collection('marketplace_publications').find({ sourceType: 'listing', sourceId: new Types.ObjectId(listing._id) }).toArray();
    expect(publications).toHaveLength(1);
  });

  /**
   * MKT-002-IDEMP-RACE-001: после того как publish уже полностью завершён
   * (транзакция закоммичена, idempotency-запись существует), повторный
   * вызов с тем же ключом — уже не гонка, а обычный sequential replay
   * (earlyReplay в начале функции). Регрессия на случай, если bounded-retry
   * fix сломал бы этот уже существовавший путь.
   */
  it('11d. повторный publish с тем же Idempotency-Key ПОСЛЕ завершения (не concurrent) — идемпотентный replay, без повторной публикации', async () => {
    const owner = await ownerCookie('flow11d');
    const { asset, listing } = await createActiveListing(owner, 'sale');
    const idempotencyKey = `sequential-key-${listing._id}`;

    const first = await publishListing(owner, asset._id, listing._id, idempotencyKey);
    expect(first.statusCode).toBe(202);

    const second = await publishListing(owner, asset._id, listing._id, idempotencyKey);
    expect(second.statusCode).toBe(202);
    expect(second.json()).toEqual(first.json());

    const publications = await connection.collection('marketplace_publications').find({ sourceType: 'listing', sourceId: new Types.ObjectId(listing._id) }).toArray();
    expect(publications).toHaveLength(1);
    const idempotencyRecords = await connection.collection('idempotency_records').find({ key: idempotencyKey }).toArray();
    expect(idempotencyRecords).toHaveLength(1);
  });

  // Найдено ревью: sequential (не параллельный) повторный publish с НОВЫМ
  // Idempotency-Key на уже опубликованном listing раньше молча создавал
  // лишний version-инкремент и лишнее PublicationRequested-событие — тест
  // 11 выше проверяет только ОДИН и тот же ключ (retry той же попытки),
  // не отдельный второй вызов с другим ключом на уже успешно завершённой
  // публикации.
  it('11b. повторный publish с НОВЫМ Idempotency-Key на уже published listing отклоняется, не создаёт вторую публикацию/version', async () => {
    const owner = await ownerCookie('flow11b');
    const { asset, listing } = await createActiveListing(owner, 'sale');

    const firstPublish = await publishListing(owner, asset._id, listing._id, `key-1-${listing._id}`);
    expect(firstPublish.statusCode).toBe(202);
    await processPendingEvent(listing._id);

    const publicationAfterFirst = await publicationRepository.findBySource('listing', new Types.ObjectId(listing._id));
    expect(publicationAfterFirst?.status).toBe('published');
    const versionAfterFirst = publicationAfterFirst!.version;

    const secondPublish = await publishListing(owner, asset._id, listing._id, `key-2-${listing._id}`);
    expect(secondPublish.statusCode).toBe(409);

    const publications = await connection
      .collection('marketplace_publications')
      .find({ sourceType: 'listing', sourceId: new Types.ObjectId(listing._id) })
      .toArray();
    expect(publications).toHaveLength(1);
    expect(publications[0]!.version).toBe(versionAfterFirst);

    const outboxEventsAfterSecondAttempt = await connection
      .collection('outbox_events')
      .countDocuments({ eventType: 'PublicationRequested', aggregateId: new Types.ObjectId(listing._id) });
    expect(outboxEventsAfterSecondAttempt).toBe(1);
  });

  it('11c. publish снова разрешён после unpublish (rebuild-эквивалентный сценарий, не заблокирован новым guard навсегда)', async () => {
    const owner = await ownerCookie('flow11c');
    const { asset, listing } = await createActiveListing(owner, 'sale');
    await publishListing(owner, asset._id, listing._id, `key-1-${listing._id}`);
    await processPendingEvent(listing._id);

    await app.inject({
      method: 'POST',
      url: `/api/v1/property-assets/${asset._id}/listings/${listing._id}/unpublish`,
      headers: { cookie: owner.cookie },
      payload: { reason: 'Preparing to republish after edit' },
    });

    const republish = await publishListing(owner, asset._id, listing._id, `key-2-${listing._id}`);
    expect(republish.statusCode).toBe(202);
  });

  // 12. старое worker-событие не затирает новую projection version.
  it('12. устаревшее PublicationRequested-событие не затирает уже опубликованную более новую version', async () => {
    const owner = await ownerCookie('flow12');
    const { asset, listing } = await createActiveListing(owner, 'sale');
    await publishListing(owner, asset._id, listing._id);
    const staleEvent = await processPendingEvent(listing._id);

    // Второй publish той же listing (rebuild-эквивалент через unpublish+publish,
    // Listing пока не имеет update-команды, но повторный publish после
    // unpublish воспроизводит тот же version-bump сценарий) поднимает version.
    await app.inject({
      method: 'POST',
      url: `/api/v1/property-assets/${asset._id}/listings/${listing._id}/unpublish`,
      headers: { cookie: owner.cookie },
      payload: { reason: 'rebuild scenario setup' },
    });
    await connection.collection('listings').updateOne({ _id: new Types.ObjectId(listing._id) }, { $set: { status: 'active' } });
    await publishListing(owner, asset._id, listing._id, `key-2-${listing._id}`);
    await processPendingEvent(listing._id);

    const currentPublication = await publicationRepository.findBySource('listing', new Types.ObjectId(listing._id));
    expect(currentPublication?.status).toBe('published');
    const versionBeforeStaleReplay = currentPublication!.version;

    // Реплей устаревшего события (version из первого publish) не должен
    // изменить уже более новое published-состояние.
    await publicationHandler.handle({ payload: staleEvent.payload, aggregateId: new Types.ObjectId() } as never);

    const afterStaleReplay = await publicationRepository.findBySource('listing', new Types.ObjectId(listing._id));
    expect(afterStaleReplay?.version).toBe(versionBeforeStaleReplay);
    expect(afterStaleReplay?.status).toBe('published');
  });

  it('admin unpublish поддерживает sourceType:listing (переиспользует D-06 generic unpublish/list без изменений)', async () => {
    const owner = await ownerCookie('flowadmin');
    const { asset, listing } = await createActiveListing(owner, 'sale');
    await publishListing(owner, asset._id, listing._id);
    await processPendingEvent(listing._id);

    const publicationBefore = await publicationRepository.findBySource('listing', new Types.ObjectId(listing._id));
    expect(publicationBefore?.status).toBe('published');

    const result = await adminPublicationService.unpublish(makeSuperAdminContext(), {
      publicationId: publicationBefore!._id,
      reason: 'Admin removed listing (integration test)',
      correlationId: 'mkt-002-admin-unpublish-test',
    });

    expect(result.sourceType).toBe('listing');
    expect(result.status).toBe('unpublished');

    const publicListResponse = await app.inject({ method: 'GET', url: '/api/v1/public/listings' });
    expect((publicListResponse.json().items as unknown[]).length).toBe(0);
  });

  it('admin list (GET /admin/publications DI-уровень) видит listing-публикации через уже существующий scope-фильтр', async () => {
    const owner = await ownerCookie('flowadminlist');
    const { asset, listing } = await createActiveListing(owner, 'sale');
    await publishListing(owner, asset._id, listing._id);
    await processPendingEvent(listing._id);

    const listResult = await adminPublicationService.list(makeSuperAdminContext(), {
      sourceType: 'listing',
      limit: 20,
    });

    expect(listResult.items.some((item) => item.sourceType === 'listing')).toBe(true);
  });

  // Hardening: реальный slug unique-индекс на marketplace_publications
  // (packages/publication) активно защищает от коллизии двух РАЗНЫХ
  // listing с одинаковой slug-базой (одинаковый propertyType+dealType+city
  // — реалистичный сценарий на MVP-масштабе, не гипотетический). Против
  // реальной MongoDB, не мока — доказывает, что PublicationRequestedHandler
  // реально пробует следующий кандидат при настоящем duplicate-key, не
  // только в unit-тесте с искусственно сброшенной ошибкой.
  it('два listing с идентичной slug-базой (одинаковый propertyType/dealType/city) публикуются с РАЗНЫМИ slug, не падают на unique-индексе', async () => {
    const owner = await ownerCookie('flowslugcollision');
    const first = await createActiveListing(owner, 'sale');
    const second = await createActiveListing(owner, 'sale');

    await publishListing(owner, first.asset._id, first.listing._id, `key-first-${first.listing._id}`);
    await publishListing(owner, second.asset._id, second.listing._id, `key-second-${second.listing._id}`);

    await processPendingEvent(first.listing._id);
    await processPendingEvent(second.listing._id);

    const firstPub = await publicationRepository.findBySource('listing', new Types.ObjectId(first.listing._id));
    const secondPub = await publicationRepository.findBySource('listing', new Types.ObjectId(second.listing._id));

    expect(firstPub?.status).toBe('published');
    expect(secondPub?.status).toBe('published');
    expect(firstPub?.slug).toBeTruthy();
    expect(secondPub?.slug).toBeTruthy();
    expect(firstPub?.slug).not.toBe(secondPub?.slug);
  });
});

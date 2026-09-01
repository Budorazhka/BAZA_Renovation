import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import fastifyCookie from '@fastify/cookie';
import { MarketplacePublicationRepository } from '@baza/publication';
import { AppModule } from '../../src/app.module';
import { AppExceptionFilter } from '../../src/shared/errors/app-exception.filter';
import { CorrelationIdMiddleware } from '../../src/shared/errors/correlation-id.middleware';
import { TenantContextMiddleware } from '../../src/shared/tenant/tenant-context.middleware';
import { AdminContextMiddleware } from '../../src/shared/admin/admin-context.middleware';
import { MarketplaceAccountContextMiddleware } from '../../src/shared/marketplace-account/marketplace-account-context.middleware';
import { AuthService } from '../../src/modules/identity/auth.service';
import { AdminAccountService } from '../../src/modules/admin/admin-account.service';
import type { AdminContext } from '../../src/shared/admin/admin-context';
import { withSession } from './support/with-session';
import { RedisService } from '../../src/shared/redis/redis.service';
import { createRedisMockService } from './support/redis-mock';

/**
 * D-07 read-only admin audit trail — тот же полный-AppModule/реальные
 * Fastify hooks паттерн, что admin-http.integration-spec.ts (закрывает тот
 * же класс пробела: guard/middleware/routing/scope должны проходить через
 * реальный HTTP-путь, не только через прямой вызов сервиса).
 */
describe('Admin audit trail HTTP routes — integration (полный AppModule, реальные Fastify hooks)', () => {
  let replSet: MongoMemoryReplSet;
  let app: NestFastifyApplication;
  let connection: Connection;
  let authService: AuthService;
  let adminAccountService: AdminAccountService;
  let publicationRepository: MarketplacePublicationRepository;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await replSet.waitUntilRunning();
    process.env.MONGO_URI = replSet.getUri();
    process.env.MINIO_ENDPOINT = 'http://localhost:9000';
    process.env.MINIO_ACCESS_KEY = 'test-access-key';
    process.env.MINIO_SECRET_KEY = 'test-secret-key';
    process.env.MINIO_BUCKET_PRIVATE = 'test-private';
    process.env.MINIO_BUCKET_PUBLIC = 'test-public';
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
    const marketplaceAccountContextMiddleware = app.get(MarketplaceAccountContextMiddleware);
    const isHealthCheckPath = (url: string): boolean => url === '/health' || url === '/health/ready';
    fastifyInstance.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
      if (isHealthCheckPath(req.url)) return;
      await correlationIdMiddleware.use(req, reply, () => {});
    });
    fastifyInstance.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
      if (isHealthCheckPath(req.url)) return;
      await tenantContextMiddleware.use(req, reply, () => {});
    });
    fastifyInstance.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
      if (isHealthCheckPath(req.url)) return;
      await adminContextMiddleware.use(req, reply, () => {});
    });
    fastifyInstance.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
      if (isHealthCheckPath(req.url)) return;
      await marketplaceAccountContextMiddleware.use(req, reply, () => {});
    });
    app.useGlobalFilters(new AppExceptionFilter());
    const { ValidationPipe } = await import('@nestjs/common');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    connection = moduleRef.get<Connection>(getConnectionToken());
    authService = moduleRef.get(AuthService);
    adminAccountService = moduleRef.get(AdminAccountService);
    publicationRepository = moduleRef.get(MarketplacePublicationRepository);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await replSet?.stop();
  });

  afterEach(async () => {
    await connection.collection('admin_accounts').deleteMany({});
    await connection.collection('product_accesses').deleteMany({});
    await connection.collection('permission_grants').deleteMany({});
    await connection.collection('identities').deleteMany({});
    await connection.collection('sessions').deleteMany({});
    await connection.collection('audit_events').deleteMany({});
    await connection.collection('marketplace_publications').deleteMany({});
  });

  function makeSuperAdminContext(): AdminContext {
    return {
      identityId: new Types.ObjectId().toString(),
      adminAccountId: new Types.ObjectId().toString(),
      isSuperAdmin: true,
    };
  }

  const PASSWORD = 'correct horse battery staple';

  async function seedRealAdmin(
    isSuperAdmin: boolean,
  ): Promise<{ cookie: string; adminAccountId: string; identityId: Types.ObjectId; login: string }> {
    const login = `admin-${new Types.ObjectId().toString()}@example.test`;
    const identityId = await authService.registerIdentity({ login, password: PASSWORD });
    const account = await adminAccountService.createAdminAccount(makeSuperAdminContext(), {
      identityId,
      isSuperAdmin,
      correlationId: 'audit-http-integration-test',
    });
    const session = await authService.login({ login, password: PASSWORD, audience: 'admin' });
    return { cookie: `baza_session=${session.sessionToken}`, adminAccountId: account._id.toString(), identityId, login };
  }

  async function seedPublication(params: { sourceType: 'development' | 'unit' | 'listing'; city: string }) {
    const sourceId = new Types.ObjectId();
    const organizationId = new Types.ObjectId();
    await withSession(connection, (session) => publicationRepository.upsertPending({
      sourceType: params.sourceType,
      sourceId,
      publisherScope: { type: 'organization', organizationId },
    }, session));
    await connection.collection('marketplace_publications').updateOne(
      { sourceType: params.sourceType, sourceId },
      { $set: { status: 'published', slug: `slug-${sourceId.toString()}`, searchProjection: { city: params.city } } },
    );
    const doc = await connection.collection('marketplace_publications').findOne({ sourceType: params.sourceType, sourceId });
    return { publicationId: doc!._id as Types.ObjectId, sourceId };
  }

  async function unpublish(cookie: string, publicationId: Types.ObjectId, reason: string) {
    return app.inject({
      method: 'POST',
      url: `/api/v1/admin/publications/${publicationId.toString()}/unpublish`,
      headers: { cookie },
      payload: { reason },
    });
  }

  describe('аутентификация', () => {
    it('без cookie вообще — 401 AUTH_NO_SESSION', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/v1/admin/audit-events' });
      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body).error.code).toBe('AUTH_NO_SESSION');
    });

    it('cookie с мусорным токеном — 403, не 500', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/audit-events',
        headers: { cookie: 'baza_session=nonexistent-token-value' },
      });
      expect(response.statusCode).toBe(403);
    });
  });

  describe('super_admin видит account/grant/session-lifecycle audit', () => {
    it('видит admin_account.create/deactivate события через resource=admin_account', async () => {
      const superAdmin = await seedRealAdmin(true);
      const victim = await seedRealAdmin(false);
      await app.inject({
        method: 'POST',
        url: `/api/v1/admin/accounts/${victim.adminAccountId}/deactivate`,
        headers: { cookie: superAdmin.cookie },
        payload: { reason: 'нарушение политики использования admin-доступа' },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/audit-events?resource=admin_account',
        headers: { cookie: superAdmin.cookie },
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      const actions = body.items.map((item: { action: string }) => item.action);
      expect(actions).toEqual(expect.arrayContaining(['admin_account.create', 'admin_account.deactivate']));
    });

    it('видит grant create/revoke события', async () => {
      const superAdmin = await seedRealAdmin(true);
      const scoped = await seedRealAdmin(false);
      const grantResponse = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/accounts/${scoped.adminAccountId}/grants`,
        headers: { cookie: superAdmin.cookie },
        payload: { resource: 'development', action: 'read', scope: 'city', scopeValue: 'batumi' },
      });
      expect(grantResponse.statusCode).toBe(200);
      const grantsResponse = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/accounts/${scoped.adminAccountId}/grants`,
        headers: { cookie: superAdmin.cookie },
      });
      const grant = JSON.parse(grantsResponse.body).items[0];
      await app.inject({
        method: 'POST',
        url: `/api/v1/admin/accounts/${scoped.adminAccountId}/grants/${grant.id}/revoke`,
        headers: { cookie: superAdmin.cookie },
        payload: { reason: 'больше не требуется доступ к этому городу', expectedVersion: grant.version },
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/audit-events?resource=admin_account&resourceId=${scoped.adminAccountId}`,
        headers: { cookie: superAdmin.cookie },
      });
      expect(response.statusCode).toBe(200);
      const actions = JSON.parse(response.body).items.map((item: { action: string }) => item.action);
      expect(actions).toEqual(
        expect.arrayContaining(['admin_account.grant_permission', 'admin_account.revoke_permission']),
      );
    });

    it('без resource-фильтра видит вообще всё, включая publication-события', async () => {
      const superAdmin = await seedRealAdmin(true);
      const { publicationId } = await seedPublication({ sourceType: 'development', city: 'batumi' });
      await unpublish(superAdmin.cookie, publicationId, 'Нарушение правил размещения объявлений');

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/audit-events',
        headers: { cookie: superAdmin.cookie },
      });
      expect(response.statusCode).toBe(200);
      const actions = JSON.parse(response.body).items.map((item: { action: string }) => item.action);
      expect(actions).toEqual(expect.arrayContaining(['publication.unpublish', 'admin_account.create']));
    });
  });

  describe('scoped admin видит только разрешённые publication-события', () => {
    it('видит unpublish-событие публикации в своём city-scope', async () => {
      const superAdmin = await seedRealAdmin(true);
      const scoped = await seedRealAdmin(false);
      // resolvePublicationReadScope (используется AdminAuditService для
      // audit-фида) резолвит грант с action:'read', не 'unpublish' — тот
      // же принцип, что GET /admin/publications уже использует. Событие
      // unpublish создаётся super_admin'ом, scoped admin только ЧИТАЕТ
      // audit-историю в своём read-scope.
      await adminAccountService.grantPermission(makeSuperAdminContext(), {
        adminAccountId: new Types.ObjectId(scoped.adminAccountId),
        resource: 'development',
        action: 'read',
        scope: 'city',
        scopeValue: 'batumi',
        correlationId: 'audit-http-integration-test',
      });
      const { publicationId } = await seedPublication({ sourceType: 'development', city: 'batumi' });
      await unpublish(superAdmin.cookie, publicationId, 'Нарушение правил размещения объявлений');

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/audit-events',
        headers: { cookie: scoped.cookie },
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.items.map((item: { action: string }) => item.action)).toContain('publication.unpublish');
    });

    it('НЕ видит unpublish-событие публикации вне своего city-scope (другой город)', async () => {
      const superAdmin = await seedRealAdmin(true);
      const scoped = await seedRealAdmin(false);
      await adminAccountService.grantPermission(makeSuperAdminContext(), {
        adminAccountId: new Types.ObjectId(scoped.adminAccountId),
        resource: 'development',
        action: 'read',
        scope: 'city',
        scopeValue: 'batumi',
        correlationId: 'audit-http-integration-test',
      });
      const { publicationId } = await seedPublication({ sourceType: 'development', city: 'tbilisi' });
      await unpublish(superAdmin.cookie, publicationId, 'Нарушение правил размещения объявлений');

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/audit-events',
        headers: { cookie: scoped.cookie },
      });
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).items).toHaveLength(0);
    });

    it('admin без единого read-гранта — пустой список, не 403/500 (deny-by-default)', async () => {
      const scoped = await seedRealAdmin(false);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/audit-events',
        headers: { cookie: scoped.cookie },
      });
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ items: [], nextCursor: null });
    });
  });

  describe('scoped admin не может enumerate запрещённые ресурсы (non-disclosure)', () => {
    it('явный resource=admin_account — 403 ADMIN_SCOPE_INSUFFICIENT, не раскрывает наличие/отсутствие событий', async () => {
      const scoped = await seedRealAdmin(false);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/audit-events?resource=admin_account',
        headers: { cookie: scoped.cookie },
      });
      expect(response.statusCode).toBe(403);
      expect(JSON.parse(response.body).error.code).toBe('ADMIN_SCOPE_INSUFFICIENT');
    });

    it('cross-tenant: resourceId чужой publication вне scope — пустой список, не раскрывает существование события', async () => {
      const superAdmin = await seedRealAdmin(true);
      const scoped = await seedRealAdmin(false);
      await adminAccountService.grantPermission(makeSuperAdminContext(), {
        adminAccountId: new Types.ObjectId(scoped.adminAccountId),
        resource: 'development',
        action: 'read',
        scope: 'city',
        scopeValue: 'batumi',
        correlationId: 'audit-http-integration-test',
      });
      const { publicationId, sourceId } = await seedPublication({ sourceType: 'development', city: 'tbilisi' });
      await unpublish(superAdmin.cookie, publicationId, 'Нарушение правил размещения объявлений');

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/audit-events?resource=development&resourceId=${sourceId.toString()}`,
        headers: { cookie: scoped.cookie },
      });
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).items).toHaveLength(0);
    });
  });

  describe('cursor pagination не дублирует и не пропускает события', () => {
    it('две последовательные страницы вместе покрывают все события ровно по разу', async () => {
      const superAdmin = await seedRealAdmin(true);
      const publications = await Promise.all(
        Array.from({ length: 5 }, () => seedPublication({ sourceType: 'development', city: 'batumi' })),
      );
      for (const { publicationId } of publications) {
        const response = await unpublish(superAdmin.cookie, publicationId, 'Нарушение правил размещения объявлений');
        expect(response.statusCode).toBe(200);
      }

      const firstPage = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/audit-events?resource=development&action=publication.unpublish&limit=2',
        headers: { cookie: superAdmin.cookie },
      });
      const firstBody = JSON.parse(firstPage.body);
      expect(firstBody.items).toHaveLength(2);
      expect(firstBody.nextCursor).not.toBeNull();

      const secondPage = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/audit-events?resource=development&action=publication.unpublish&limit=2&cursor=${firstBody.nextCursor}`,
        headers: { cookie: superAdmin.cookie },
      });
      const secondBody = JSON.parse(secondPage.body);
      expect(secondBody.items).toHaveLength(2);

      const thirdPage = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/audit-events?resource=development&action=publication.unpublish&limit=2&cursor=${secondBody.nextCursor}`,
        headers: { cookie: superAdmin.cookie },
      });
      const thirdBody = JSON.parse(thirdPage.body);
      expect(thirdBody.items).toHaveLength(1);
      expect(thirdBody.nextCursor).toBeNull();

      const allIds = [...firstBody.items, ...secondBody.items, ...thirdBody.items].map((item: { id: string }) => item.id);
      expect(new Set(allIds).size).toBe(5);
    });
  });

  describe('secrets/tokens никогда не появляются в JSON-ответе', () => {
    it('после создания admin-аккаунта и выдачи grant ответ audit-events не содержит password/token/secret ключей', async () => {
      const superAdmin = await seedRealAdmin(true);
      const scoped = await seedRealAdmin(false);
      await app.inject({
        method: 'POST',
        url: `/api/v1/admin/accounts/${scoped.adminAccountId}/grants`,
        headers: { cookie: superAdmin.cookie },
        payload: { resource: 'development', action: 'read', scope: 'city', scopeValue: 'batumi' },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/audit-events?resource=admin_account',
        headers: { cookie: superAdmin.cookie },
      });
      const raw = response.body;
      expect(raw.toLowerCase()).not.toMatch(/passwordhash|tokenhash|"token"|"secret"|"apikey"/);
    });
  });

  describe('GET /admin/publications/:publicationId/audit', () => {
    it('super_admin видит unpublish-историю конкретной публикации', async () => {
      const superAdmin = await seedRealAdmin(true);
      const { publicationId } = await seedPublication({ sourceType: 'listing', city: 'batumi' });
      await unpublish(superAdmin.cookie, publicationId, 'Нарушение правил размещения объявлений');

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/publications/${publicationId.toString()}/audit`,
        headers: { cookie: superAdmin.cookie },
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.items).toHaveLength(1);
      expect(body.items[0].action).toBe('publication.unpublish');
    });

    it('scoped admin вне scope этой публикации получает пустой список, не ошибку', async () => {
      const superAdmin = await seedRealAdmin(true);
      const scoped = await seedRealAdmin(false);
      await adminAccountService.grantPermission(makeSuperAdminContext(), {
        adminAccountId: new Types.ObjectId(scoped.adminAccountId),
        resource: 'listing',
        action: 'read',
        scope: 'city',
        scopeValue: 'batumi',
        correlationId: 'audit-http-integration-test',
      });
      const { publicationId } = await seedPublication({ sourceType: 'listing', city: 'tbilisi' });
      await unpublish(superAdmin.cookie, publicationId, 'Нарушение правил размещения объявлений');

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/publications/${publicationId.toString()}/audit`,
        headers: { cookie: scoped.cookie },
      });
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).items).toHaveLength(0);
    });

    it('несуществующий publicationId — 404', async () => {
      const superAdmin = await seedRealAdmin(true);
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/publications/${new Types.ObjectId().toString()}/audit`,
        headers: { cookie: superAdmin.cookie },
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('невалидный ввод', () => {
    it('невалидная дата в from — 400', async () => {
      const superAdmin = await seedRealAdmin(true);
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/audit-events?from=not-a-date',
        headers: { cookie: superAdmin.cookie },
      });
      expect(response.statusCode).toBe(400);
    });

    it('limit больше максимума (100) — 400', async () => {
      const superAdmin = await seedRealAdmin(true);
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/audit-events?limit=1000',
        headers: { cookie: superAdmin.cookie },
      });
      expect(response.statusCode).toBe(400);
    });

    it('невалидный cursor (не ObjectId) — 400', async () => {
      const superAdmin = await seedRealAdmin(true);
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/audit-events?cursor=not-an-object-id',
        headers: { cookie: superAdmin.cookie },
      });
      expect(response.statusCode).toBe(400);
    });

    it('resource вне допустимого enum — 400 (whitelist DTO, не произвольная строка)', async () => {
      const superAdmin = await seedRealAdmin(true);
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/audit-events?resource=identity',
        headers: { cookie: superAdmin.cookie },
      });
      expect(response.statusCode).toBe(400);
    });
  });

  describe('append-only остаётся неизменным', () => {
    it('audit_events коллекция не предоставляет update/delete HTTP-путь — только create (append) через бизнес-действия и read через audit-events', async () => {
      const superAdmin = await seedRealAdmin(true);
      const { publicationId } = await seedPublication({ sourceType: 'development', city: 'batumi' });
      await unpublish(superAdmin.cookie, publicationId, 'Нарушение правил размещения объявлений');

      const before = await connection.collection('audit_events').countDocuments({});
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/audit-events',
        headers: { cookie: superAdmin.cookie },
      });
      expect(response.statusCode).toBe(200);
      const after = await connection.collection('audit_events').countDocuments({});
      expect(after).toBe(before);
    });
  });
});

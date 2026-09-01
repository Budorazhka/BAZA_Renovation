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
 * HTTP-уровневый integration-тест против ПОЛНОГО AppModule + реальных
 * Fastify onRequest hooks (main.api.ts wiring, воспроизведён здесь один в
 * один) — закрывает честный пробел, зафиксированный аудитом перед этим
 * проходом: все существующие admin-*.integration-spec.ts вызывают
 * AdminPublicationService/AdminAccountService НАПРЯМУЮ, минуя AdminGuard/
 * middleware/маршрутизацию целиком. "Неаутентифицированный запрос к
 * /admin/publications возвращает 403" никогда не проверялся реальным HTTP-
 * запросом до этого файла. app.inject() (Fastify-нативный) — не supertest,
 * не поднимает реальный TCP-сокет, но проходит весь стек: onRequest hooks →
 * routing → guards → controller → filter, тот же путь, что реальный клиент.
 */
describe('Admin HTTP routes — integration (полный AppModule, реальные Fastify hooks)', () => {
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

    // Воспроизводит main.api.ts один в один (hook-регистрация, порядок,
    // ValidationPipe, exception filter, global prefix) — без CORS
    // (не security-релевантно для этого теста, app.inject() не отправляет
    // Origin-заголовок сам по себе). fastifyCookie — ДОБАВЛЕНО (было
    // пропущено до этого прохода): reply.setCookie/clearCookie — декорации
    // этого плагина, не Fastify core; до сих пор проходило незамеченным,
    // потому что ни один существующий тест не бил по /auth/login или
    // /auth/logout через реальный HTTP-путь (seedRealAdmin вызывает
    // authService.login() напрямую, минуя AuthController.setCookie).
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

  async function seedRealAdmin(isSuperAdmin: boolean): Promise<{ cookie: string; adminAccountId: string; identityId: Types.ObjectId; login: string }> {
    const login = `admin-${new Types.ObjectId().toString()}@example.test`;
    const identityId = await authService.registerIdentity({ login, password: PASSWORD });
    const account = await adminAccountService.createAdminAccount(makeSuperAdminContext(), {
      identityId,
      isSuperAdmin,
      correlationId: 'http-integration-test',
    });
    const session = await authService.login({ login, password: PASSWORD, audience: 'admin' });
    return { cookie: `baza_session=${session.sessionToken}`, adminAccountId: account._id.toString(), identityId, login };
  }

  describe('аутентификация (401 vs 403, non-disclosure)', () => {
    it('запрос без cookie вообще — 401 AUTH_NO_SESSION (ИЗМЕНЕНО этим проходом — раньше был 403, см. AdminGuard)', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/v1/admin/publications' });
      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body).error.code).toBe('AUTH_NO_SESSION');
    });

    it('cookie с мусорным токеном (не существует ни одной сессии) — 403 FORBIDDEN, не 500', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/publications',
        headers: { cookie: 'baza_session=nonexistent-token-value' },
      });
      expect(response.statusCode).toBe(403);
    });

    it('валидная erp-audience сессия (тот же человек) НЕ проходит как admin-сессия — audience изоляция', async () => {
      const login = `erp-${new Types.ObjectId().toString()}@example.test`;
      await authService.registerIdentity({ login, password: PASSWORD });
      const erpSession = await authService.login({ login, password: PASSWORD, audience: 'marketplace' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/publications',
        headers: { cookie: `baza_session=${erpSession.sessionToken}` },
      });
      expect(response.statusCode).toBe(403);
    });

    it('валидная сессия, но identity деактивирована как AdminAccount — 403, не проходит как трактовка "просто нет доступа"', async () => {
      // AdminAccount никогда не создавался для этой identity — валидная
      // admin-audience сессия без AdminAccount (см. admin-context.middleware.ts).
      const login = `ghost-${new Types.ObjectId().toString()}@example.test`;
      await authService.registerIdentity({ login, password: PASSWORD });
      // login с audience:'admin' требует ProductAccess('admin') — без
      // AdminAccount его никто не выдал, login сам должен отказать.
      await expect(authService.login({ login, password: PASSWORD, audience: 'admin' })).rejects.toThrow();
    });
  });

  describe('GET /admin/me — whoami', () => {
    it('super_admin получает isSuperAdmin:true и publicationReadScope:"all"', async () => {
      const { cookie } = await seedRealAdmin(true);
      const response = await app.inject({ method: 'GET', url: '/api/v1/admin/me', headers: { cookie } });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.isSuperAdmin).toBe(true);
      expect(body.publicationReadScope).toBe('all');
    });

    it('scoped admin получает isSuperAdmin:false и свой city-scope по sourceType', async () => {
      const { cookie, adminAccountId } = await seedRealAdmin(false);
      await adminAccountService.grantPermission(makeSuperAdminContext(), {
        adminAccountId: new Types.ObjectId(adminAccountId),
        resource: 'development',
        action: 'read',
        scope: 'city',
        scopeValue: 'batumi',
        correlationId: 'http-integration-test',
      });

      const response = await app.inject({ method: 'GET', url: '/api/v1/admin/me', headers: { cookie } });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.isSuperAdmin).toBe(false);
      expect(body.publicationReadScope.development).toEqual({ global: false, cities: ['batumi'] });
      expect(body.publicationReadScope.unit).toBeUndefined();
    });
  });

  describe('GET /admin/publications — scope-фильтрация через реальный HTTP-путь', () => {
    async function seedPublication(params: { sourceType: 'development' | 'unit' | 'listing'; city: string }) {
      const sourceId = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      await withSession(connection, (session) => publicationRepository.upsertPending({ sourceType: params.sourceType, sourceId, publisherScope: { type: 'organization', organizationId } }, session));
      await connection.collection('marketplace_publications').updateOne(
        { sourceType: params.sourceType, sourceId },
        { $set: { status: 'published', slug: `slug-${sourceId.toString()}`, searchProjection: { city: params.city } } },
      );
      return sourceId;
    }

    it('city-scoped admin видит только свой город через реальный GET-запрос', async () => {
      await seedPublication({ sourceType: 'development', city: 'batumi' });
      await seedPublication({ sourceType: 'development', city: 'tbilisi' });
      const { cookie, adminAccountId } = await seedRealAdmin(false);
      await adminAccountService.grantPermission(makeSuperAdminContext(), {
        adminAccountId: new Types.ObjectId(adminAccountId),
        resource: 'development',
        action: 'read',
        scope: 'city',
        scopeValue: 'batumi',
        correlationId: 'http-integration-test',
      });

      const response = await app.inject({ method: 'GET', url: '/api/v1/admin/publications', headers: { cookie } });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.items).toHaveLength(1);
      expect(body.items[0].city).toBe('batumi');
    });

    it('admin без единого read-гранта — пустой список через HTTP, не 403/500 (deny-by-default остаётся list, не error)', async () => {
      await seedPublication({ sourceType: 'development', city: 'batumi' });
      const { cookie } = await seedRealAdmin(false);

      const response = await app.inject({ method: 'GET', url: '/api/v1/admin/publications', headers: { cookie } });
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ items: [], nextCursor: null });
    });
  });

  describe('POST /admin/publications/:id/unpublish — обязательный reason, audit', () => {
    async function seedPublishedPublication() {
      const sourceId = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      await withSession(connection, (session) => publicationRepository.upsertPending({ sourceType: 'development', sourceId, publisherScope: { type: 'organization', organizationId } }, session));
      await connection.collection('marketplace_publications').updateOne(
        { sourceType: 'development', sourceId },
        { $set: { status: 'published', slug: 'http-test-slug', searchProjection: { city: 'batumi' } } },
      );
      const doc = await connection.collection('marketplace_publications').findOne({ sourceType: 'development', sourceId });
      return doc!._id as Types.ObjectId;
    }

    it('без reason — 400 ADMIN_REASON_REQUIRED (DTO-уровень), запись не тронута', async () => {
      const publicationId = await seedPublishedPublication();
      const { cookie } = await seedRealAdmin(true);

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/publications/${publicationId.toString()}/unpublish`,
        headers: { cookie },
        payload: {},
      });
      expect(response.statusCode).toBe(400);

      const doc = await connection.collection('marketplace_publications').findOne({ _id: publicationId });
      expect(doc?.status).toBe('published');
    });

    it('scoped admin без grant на development — 403 ADMIN_SCOPE_INSUFFICIENT, не может снять чужую публикацию', async () => {
      const publicationId = await seedPublishedPublication();
      const { cookie } = await seedRealAdmin(false);

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/publications/${publicationId.toString()}/unpublish`,
        headers: { cookie },
        payload: { reason: 'Нарушение правил размещения объявлений' },
      });
      expect(response.statusCode).toBe(403);
      expect(JSON.parse(response.body).error.code).toBe('ADMIN_SCOPE_INSUFFICIENT');

      const doc = await connection.collection('marketplace_publications').findOne({ _id: publicationId });
      expect(doc?.status).toBe('published');
    });

    it('super_admin с валидной reason снимает публикацию через реальный HTTP-путь, audit пишется', async () => {
      const publicationId = await seedPublishedPublication();
      const { cookie } = await seedRealAdmin(true);

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/publications/${publicationId.toString()}/unpublish`,
        headers: { cookie },
        payload: { reason: 'Нарушение правил размещения объявлений' },
      });
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).status).toBe('unpublished');

      const doc = await connection.collection('marketplace_publications').findOne({ _id: publicationId });
      expect(doc?.status).toBe('unpublished');
      const auditCount = await connection.collection('audit_events').countDocuments({ action: 'publication.unpublish' });
      expect(auditCount).toBe(1);
    });
  });

  describe('Privilege escalation prevention через реальный HTTP-путь', () => {
    it('scoped admin не может создать новый AdminAccount (POST /admin/accounts) — 403 SELF_ESCALATION_BLOCKED', async () => {
      const { cookie } = await seedRealAdmin(false);
      const targetLogin = `victim-${new Types.ObjectId().toString()}@example.test`;
      const targetIdentityId = await authService.registerIdentity({ login: targetLogin, password: PASSWORD });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/accounts',
        headers: { cookie },
        payload: { identityId: targetIdentityId.toString(), isSuperAdmin: true },
      });
      expect(response.statusCode).toBe(403);
      expect(JSON.parse(response.body).error.code).toBe('SELF_ESCALATION_BLOCKED');
    });

    it('scoped admin не может выдать себе (или кому-либо) grant — 403, self-escalation через grants endpoint заблокирована', async () => {
      const { cookie, adminAccountId } = await seedRealAdmin(false);

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/accounts/${adminAccountId}/grants`,
        headers: { cookie },
        payload: { resource: 'development', action: 'read', scope: 'global' },
      });
      expect(response.statusCode).toBe(403);
      expect(JSON.parse(response.body).error.code).toBe('SELF_ESCALATION_BLOCKED');
    });

    it('scoped admin не может листить admin accounts (IDOR/enumeration prevention) — 403, не 200 с пустым списком', async () => {
      await seedRealAdmin(false);
      const { cookie: scopedCookie } = await seedRealAdmin(false);

      const response = await app.inject({ method: 'GET', url: '/api/v1/admin/accounts', headers: { cookie: scopedCookie } });
      expect(response.statusCode).toBe(403);
    });

    it('scoped admin не может читать grants чужого аккаунта — 403 SELF_ESCALATION_BLOCKED (IDOR prevention)', async () => {
      const victim = await seedRealAdmin(false);
      const { cookie: attackerCookie } = await seedRealAdmin(false);

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/accounts/${victim.adminAccountId}/grants`,
        headers: { cookie: attackerCookie },
      });
      expect(response.statusCode).toBe(403);
    });
  });

  describe('POST /auth/logout — session invalidation через реальный HTTP-путь', () => {
    it('login → logout → GET /admin/me возвращает 401 (нет cookie вообще после logout)', async () => {
      const { cookie } = await seedRealAdmin(true);

      const logoutResponse = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie } });
      expect(logoutResponse.statusCode).toBe(200);
      expect(JSON.parse(logoutResponse.body)).toEqual({ loggedOut: true });
      const setCookieHeader = logoutResponse.headers['set-cookie'];
      expect(String(setCookieHeader)).toMatch(/baza_session=;/);

      // Реальный браузер больше не отправил бы cookie после clearCookie —
      // симулируем это здесь, посылая следующий запрос вообще без cookie
      // (тот же эффект, что "no cookie at all" сценарий ниже).
      const meResponse = await app.inject({ method: 'GET', url: '/api/v1/admin/me' });
      expect(meResponse.statusCode).toBe(401);
      expect(JSON.parse(meResponse.body).error.code).toBe('AUTH_NO_SESSION');
    });

    it('logout инвалидирует серверную сессию — старый cookie (если бы клиент его сохранил) больше не резолвится в AdminContext', async () => {
      const { cookie } = await seedRealAdmin(true);

      await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie } });

      const meResponse = await app.inject({ method: 'GET', url: '/api/v1/admin/me', headers: { cookie } });
      expect(meResponse.statusCode).toBe(403);
      expect(JSON.parse(meResponse.body).error.code).toBe('FORBIDDEN');
    });

    it('повторный logout — идемпотентен, 200, не бросает', async () => {
      const { cookie } = await seedRealAdmin(true);
      await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie } });

      const secondResponse = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie } });
      expect(secondResponse.statusCode).toBe(200);
      expect(JSON.parse(secondResponse.body)).toEqual({ loggedOut: true });
    });

    it('logout без единой cookie — 200 идемпотентно, не палит наличие сессии', async () => {
      const response = await app.inject({ method: 'POST', url: '/api/v1/auth/logout' });
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ loggedOut: true });
    });

    it('logout с мусорным токеном в cookie — 200 идемпотентно', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: { cookie: 'baza_session=nonexistent-token-value' },
      });
      expect(response.statusCode).toBe(200);
    });

    it('GET /admin/publications без cookie вообще — тоже 401 (не только /admin/me)', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/v1/admin/publications' });
      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body).error.code).toBe('AUTH_NO_SESSION');
    });
  });

  describe('POST /admin/accounts/:id/deactivate / :id/reactivate — через реальный HTTP-путь', () => {
    it('деактивация super_admin\'ом другого аккаунта — 200, деактивированный аккаунт получает 403 по старому cookie', async () => {
      const superAdmin = await seedRealAdmin(true);
      const victim = await seedRealAdmin(false);

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/accounts/${victim.adminAccountId}/deactivate`,
        headers: { cookie: superAdmin.cookie },
        payload: { reason: 'нарушение политики использования admin-доступа' },
      });
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ status: 'deactivated' });

      const meResponse = await app.inject({ method: 'GET', url: '/api/v1/admin/me', headers: { cookie: victim.cookie } });
      expect(meResponse.statusCode).toBe(403);
    });

    it('деактивированный аккаунт не может обращаться к publications/accounts даже со старым (технически ещё не истёкшим) cookie', async () => {
      const superAdmin = await seedRealAdmin(true);
      const victim = await seedRealAdmin(false);
      await adminAccountService.grantPermission(makeSuperAdminContext(), {
        adminAccountId: new Types.ObjectId(victim.adminAccountId),
        resource: 'development',
        action: 'read',
        scope: 'global',
        correlationId: 'http-integration-test',
      });

      await app.inject({
        method: 'POST',
        url: `/api/v1/admin/accounts/${victim.adminAccountId}/deactivate`,
        headers: { cookie: superAdmin.cookie },
        payload: { reason: 'нарушение политики использования admin-доступа' },
      });

      const publicationsResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/publications',
        headers: { cookie: victim.cookie },
      });
      expect(publicationsResponse.statusCode).toBe(403);

      const accountsResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/accounts',
        headers: { cookie: victim.cookie },
      });
      expect(accountsResponse.statusCode).toBe(403);
    });

    it('без reason — 400 (DTO-валидация)', async () => {
      const superAdmin = await seedRealAdmin(true);
      const victim = await seedRealAdmin(false);

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/accounts/${victim.adminAccountId}/deactivate`,
        headers: { cookie: superAdmin.cookie },
        payload: {},
      });
      expect(response.statusCode).toBe(400);
    });

    it('scoped admin не может деактивировать чужой аккаунт — 403 SELF_ESCALATION_BLOCKED', async () => {
      const scopedAttacker = await seedRealAdmin(false);
      const victim = await seedRealAdmin(false);

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/accounts/${victim.adminAccountId}/deactivate`,
        headers: { cookie: scopedAttacker.cookie },
        payload: { reason: 'попытка деактивации без прав super_admin' },
      });
      expect(response.statusCode).toBe(403);
      expect(JSON.parse(response.body).error.code).toBe('SELF_ESCALATION_BLOCKED');
    });

    it('super_admin не может деактивировать самого себя — 403 ADMIN_SELF_DEACTIVATION_BLOCKED', async () => {
      const superAdmin = await seedRealAdmin(true);

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/accounts/${superAdmin.adminAccountId}/deactivate`,
        headers: { cookie: superAdmin.cookie },
        payload: { reason: 'попытка деактивировать самого себя' },
      });
      expect(response.statusCode).toBe(403);
      expect(JSON.parse(response.body).error.code).toBe('ADMIN_SELF_DEACTIVATION_BLOCKED');
    });

    it('реактивация восстанавливает доступ — деактивированный, затем реактивированный аккаунт снова проходит логин', async () => {
      const superAdmin = await seedRealAdmin(true);
      const victim = await seedRealAdmin(false);

      await app.inject({
        method: 'POST',
        url: `/api/v1/admin/accounts/${victim.adminAccountId}/deactivate`,
        headers: { cookie: superAdmin.cookie },
        payload: { reason: 'причина деактивации не менее 10 символов' },
      });

      const reactivateResponse = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/accounts/${victim.adminAccountId}/reactivate`,
        headers: { cookie: superAdmin.cookie },
        payload: { reason: 'ошибка устранена, восстанавливаем доступ' },
      });
      expect(reactivateResponse.statusCode).toBe(200);
      expect(JSON.parse(reactivateResponse.body)).toEqual({ status: 'active' });

      // Реактивированный аккаунт снова может логиниться на audience:'admin' —
      // старая сессия не восстанавливается автоматически (см.
      // AdminAccountService.reactivateAdminAccount), но login-путь (тот же
      // AuthService, что и реальный HTTP-контроллер использует) должен
      // пройти без ошибок продукт-доступа/статуса теперь, когда
      // AdminAccount снова 'active'.
      const newSession = await authService.login({
        login: victim.login,
        password: PASSWORD,
        audience: 'admin',
      });
      expect(newSession.sessionToken).toBeDefined();

      const meResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/me',
        headers: { cookie: `baza_session=${newSession.sessionToken}` },
      });
      expect(meResponse.statusCode).toBe(200);
    });

    it('деактивация несуществующего аккаунта — 404 NOT_FOUND', async () => {
      const superAdmin = await seedRealAdmin(true);

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/accounts/${new Types.ObjectId().toString()}/deactivate`,
        headers: { cookie: superAdmin.cookie },
        payload: { reason: 'причина деактивации не менее 10 символов' },
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /admin/accounts/:id/grants/:grantId/revoke — через реальный HTTP-путь', () => {
    async function seedScopedAdminWithGrant(superAdminCookie: string) {
      const scoped = await seedRealAdmin(false);
      const grantResponse = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/accounts/${scoped.adminAccountId}/grants`,
        headers: { cookie: superAdminCookie },
        payload: { resource: 'development', action: 'read', scope: 'city', scopeValue: 'batumi' },
      });
      expect(grantResponse.statusCode).toBe(200);
      const grantsResponse = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/accounts/${scoped.adminAccountId}/grants`,
        headers: { cookie: superAdminCookie },
      });
      const grant = JSON.parse(grantsResponse.body).items[0];
      return { scoped, grant };
    }

    it('super_admin отзывает grant — 200, GET /admin/me для владельца перестаёт отражать этот grant немедленно', async () => {
      const superAdmin = await seedRealAdmin(true);
      const { scoped, grant } = await seedScopedAdminWithGrant(superAdmin.cookie);

      const meBeforeResponse = await app.inject({ method: 'GET', url: '/api/v1/admin/me', headers: { cookie: scoped.cookie } });
      expect(JSON.parse(meBeforeResponse.body).publicationReadScope.development).toEqual({ global: false, cities: ['batumi'] });

      const revokeResponse = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/accounts/${scoped.adminAccountId}/grants/${grant.id}/revoke`,
        headers: { cookie: superAdmin.cookie },
        payload: { reason: 'больше не требуется доступ к этому городу', expectedVersion: grant.version },
      });
      expect(revokeResponse.statusCode).toBe(200);
      expect(JSON.parse(revokeResponse.body)).toEqual({ revoked: true });

      const meAfterResponse = await app.inject({ method: 'GET', url: '/api/v1/admin/me', headers: { cookie: scoped.cookie } });
      expect(JSON.parse(meAfterResponse.body).publicationReadScope.development).toBeUndefined();
    });

    it('без reason — 400 (DTO-валидация)', async () => {
      const superAdmin = await seedRealAdmin(true);
      const { scoped, grant } = await seedScopedAdminWithGrant(superAdmin.cookie);

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/accounts/${scoped.adminAccountId}/grants/${grant.id}/revoke`,
        headers: { cookie: superAdmin.cookie },
        payload: { expectedVersion: grant.version },
      });
      expect(response.statusCode).toBe(400);
    });

    it('без expectedVersion — 400 (DTO-валидация)', async () => {
      const superAdmin = await seedRealAdmin(true);
      const { scoped, grant } = await seedScopedAdminWithGrant(superAdmin.cookie);

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/accounts/${scoped.adminAccountId}/grants/${grant.id}/revoke`,
        headers: { cookie: superAdmin.cookie },
        payload: { reason: 'причина без указания версии' },
      });
      expect(response.statusCode).toBe(400);
    });

    it('устаревший expectedVersion — 409 VERSION_CONFLICT', async () => {
      const superAdmin = await seedRealAdmin(true);
      const { scoped, grant } = await seedScopedAdminWithGrant(superAdmin.cookie);

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/accounts/${scoped.adminAccountId}/grants/${grant.id}/revoke`,
        headers: { cookie: superAdmin.cookie },
        payload: { reason: 'причина отзыва с неверной версией', expectedVersion: grant.version + 1 },
      });
      expect(response.statusCode).toBe(409);
      expect(JSON.parse(response.body).error.code).toBe('VERSION_CONFLICT');
    });

    it('scoped admin не может отозвать grant (даже свой собственный) — 403 SELF_ESCALATION_BLOCKED', async () => {
      const superAdmin = await seedRealAdmin(true);
      const { scoped, grant } = await seedScopedAdminWithGrant(superAdmin.cookie);

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/accounts/${scoped.adminAccountId}/grants/${grant.id}/revoke`,
        headers: { cookie: scoped.cookie },
        payload: { reason: 'scoped admin пытается отозвать свой же grant', expectedVersion: grant.version },
      });
      expect(response.statusCode).toBe(403);
      expect(JSON.parse(response.body).error.code).toBe('SELF_ESCALATION_BLOCKED');
    });

    it('revoke чужого/несуществующего granta — 404, не раскрывает разницу', async () => {
      const superAdmin = await seedRealAdmin(true);
      const otherAdmin = await seedRealAdmin(false);

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/accounts/${otherAdmin.adminAccountId}/grants/${new Types.ObjectId().toString()}/revoke`,
        headers: { cookie: superAdmin.cookie },
        payload: { reason: 'попытка отозвать несуществующий grant', expectedVersion: 1 },
      });
      expect(response.statusCode).toBe(404);
    });
  });
});

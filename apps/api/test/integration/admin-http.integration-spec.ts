import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
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

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

    // Воспроизводит main.api.ts один в один (hook-регистрация, порядок,
    // ValidationPipe, exception filter, global prefix) — без CORS
    // (не security-релевантно для этого теста, app.inject() не отправляет
    // Origin-заголовок сам по себе).
    const fastifyInstance = app.getHttpAdapter().getInstance();
    const correlationIdMiddleware = app.get(CorrelationIdMiddleware);
    const tenantContextMiddleware = app.get(TenantContextMiddleware);
    const adminContextMiddleware = app.get(AdminContextMiddleware);
    const marketplaceAccountContextMiddleware = app.get(MarketplaceAccountContextMiddleware);
    const isHealthCheckPath = (url: string): boolean => url === '/health' || url === '/health/ready';
    fastifyInstance.addHook('onRequest', async (req: never, reply: never) => {
      if (isHealthCheckPath((req as { url: string }).url)) return;
      await correlationIdMiddleware.use(req as never, reply as never, () => {});
    });
    fastifyInstance.addHook('onRequest', async (req: never, reply: never) => {
      if (isHealthCheckPath((req as { url: string }).url)) return;
      await tenantContextMiddleware.use(req as never, reply as never, () => {});
    });
    fastifyInstance.addHook('onRequest', async (req: never, reply: never) => {
      if (isHealthCheckPath((req as { url: string }).url)) return;
      await adminContextMiddleware.use(req as never, reply as never, () => {});
    });
    fastifyInstance.addHook('onRequest', async (req: never, reply: never) => {
      if (isHealthCheckPath((req as { url: string }).url)) return;
      await marketplaceAccountContextMiddleware.use(req as never, reply as never, () => {});
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

  async function seedRealAdmin(isSuperAdmin: boolean): Promise<{ cookie: string; adminAccountId: string; identityId: Types.ObjectId }> {
    const login = `admin-${new Types.ObjectId().toString()}@example.test`;
    const identityId = await authService.registerIdentity({ login, password: PASSWORD });
    const account = await adminAccountService.createAdminAccount(makeSuperAdminContext(), {
      identityId,
      isSuperAdmin,
      correlationId: 'http-integration-test',
    });
    const session = await authService.login({ login, password: PASSWORD, audience: 'admin' });
    return { cookie: `baza_session=${session.sessionToken}`, adminAccountId: account._id.toString(), identityId };
  }

  describe('аутентификация (401 vs 403, non-disclosure)', () => {
    it('запрос без cookie — 403 FORBIDDEN, не раскрывает наличие/отсутствие endpoint', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/v1/admin/publications' });
      expect(response.statusCode).toBe(403);
      expect(JSON.parse(response.body).error.code).toBe('FORBIDDEN');
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
      await publicationRepository.upsertPending({ sourceType: params.sourceType, sourceId, publisherScope: { type: 'organization', organizationId } });
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
      await publicationRepository.upsertPending({ sourceType: 'development', sourceId, publisherScope: { type: 'organization', organizationId } });
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
});

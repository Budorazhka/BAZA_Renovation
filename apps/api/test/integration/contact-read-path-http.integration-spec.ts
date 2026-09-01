import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import fastifyCookie from '@fastify/cookie';
import { AppModule } from '../../src/app.module';
import { AppExceptionFilter } from '../../src/shared/errors/app-exception.filter';
import { CorrelationIdMiddleware } from '../../src/shared/errors/correlation-id.middleware';
import { TenantContextMiddleware } from '../../src/shared/tenant/tenant-context.middleware';
import { AdminContextMiddleware } from '../../src/shared/admin/admin-context.middleware';
import { MarketplaceAccountContextMiddleware } from '../../src/shared/marketplace-account/marketplace-account-context.middleware';
import { AuthService } from '../../src/modules/identity/auth.service';
import { OrganizationsService } from '../../src/modules/organizations/organizations.service';
import { RedisService } from '../../src/shared/redis/redis.service';
import { createRedisMockService } from './support/redis-mock';

/**
 * GET /contacts и GET /contacts/:contactId — HTTP-уровневый integration-тест
 * против ПОЛНОГО AppModule + реальных Fastify onRequest hooks, тот же
 * bootstrap-паттерн, что lead-read-path-http.integration-spec.ts/
 * admin-http.integration-spec.ts.
 */
describe('GET /contacts, GET /contacts/:contactId — HTTP integration (полный AppModule)', () => {
  let replSet: MongoMemoryReplSet;
  let app: NestFastifyApplication;
  let connection: Connection;
  let authService: AuthService;
  let organizationsService: OrganizationsService;

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
    organizationsService = moduleRef.get(OrganizationsService);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await replSet?.stop();
  });

  afterEach(async () => {
    await connection.collection('leads').deleteMany({});
    await connection.collection('lead_events').deleteMany({});
    await connection.collection('contacts').deleteMany({});
    await connection.collection('positions').deleteMany({});
    await connection.collection('position_assignments').deleteMany({});
    await connection.collection('organizations').deleteMany({});
    await connection.collection('audit_events').deleteMany({});
    await connection.collection('permission_grants').deleteMany({});
    await connection.collection('identities').deleteMany({});
    await connection.collection('sessions').deleteMany({});
    await connection.collection('product_accesses').deleteMany({});
  });

  const PASSWORD = 'correct horse battery staple';

  /** Owner — organization-wide `contact.read` scope (весь tenant). */
  async function seedOwnerSession(): Promise<{ cookie: string; organizationId: Types.ObjectId; positionId: Types.ObjectId }> {
    const login = `owner-${new Types.ObjectId().toString()}@example.test`;
    const identityId = await authService.registerIdentity({ login, password: PASSWORD });
    const { organizationId, positionId } = await organizationsService.createOrganizationWithOwner({
      type: 'agency',
      name: 'Интеграционное агентство',
      ownerIdentityId: identityId,
    });
    const session = await authService.login({ login, password: PASSWORD, audience: 'erp' });
    return { cookie: `baza_session=${session.sessionToken}`, organizationId, positionId };
  }

  /** Manager — `contact.read` own-scope, транзитивно через свои лиды. */
  async function seedManagerSession(
    organizationId: Types.ObjectId,
  ): Promise<{ cookie: string; positionId: Types.ObjectId; identityId: Types.ObjectId }> {
    const login = `manager-${new Types.ObjectId().toString()}@example.test`;
    const identityId = await authService.registerIdentity({ login, password: PASSWORD });
    await authService.grantErpAccess(identityId);
    const positionId = await organizationsService.createVacantPosition({ organizationId, fixedRole: 'manager' });
    await organizationsService.assignOccupant({
      positionId,
      identityId,
      occupantDisplayName: 'Интеграционный менеджер',
      actorIdentityId: identityId,
      expectedOrganizationId: organizationId,
      correlationId: 'http-integration-test-seed',
    });
    const session = await authService.login({ login, password: PASSWORD, audience: 'erp' });
    return { cookie: `baza_session=${session.sessionToken}`, positionId, identityId };
  }

  async function seedContact(
    organizationId: Types.ObjectId,
    overrides?: { name?: string; phone?: string; email?: string; createdAt?: Date },
  ): Promise<Types.ObjectId> {
    const contactId = new Types.ObjectId();
    await connection.collection('contacts').insertOne({
      _id: contactId,
      organizationId,
      name: overrides?.name ?? 'Иван Интеграционный',
      phone: overrides?.phone ?? '+79990000000',
      email: overrides?.email,
      roles: ['buyer'],
      createdAt: overrides?.createdAt ?? new Date(),
    });
    return contactId;
  }

  async function seedLead(
    organizationId: Types.ObjectId,
    contactId: Types.ObjectId,
    overrides?: { ownerPositionId?: Types.ObjectId },
  ): Promise<Types.ObjectId> {
    const leadId = new Types.ObjectId();
    await connection.collection('leads').insertOne({
      _id: leadId,
      organizationId,
      contactId,
      ownerPositionId: overrides?.ownerPositionId,
      stage: 'new',
      version: 0,
      source: { route: '/developments/integration-test' },
      createdAt: new Date(),
    });
    return leadId;
  }

  describe('аутентификация/авторизация (401 vs 403)', () => {
    it('GET /contacts без cookie — 401 AUTH_NO_SESSION', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/v1/contacts' });
      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body).error.code).toBe('AUTH_NO_SESSION');
    });

    it('GET /contacts с мусорной cookie — 403 FORBIDDEN, не 500', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/contacts',
        headers: { cookie: 'baza_session=nonexistent-token-value' },
      });
      expect(response.statusCode).toBe(403);
    });

    it('GET /contacts/:contactId без cookie — 401 AUTH_NO_SESSION', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/contacts/${new Types.ObjectId().toString()}`,
      });
      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body).error.code).toBe('AUTH_NO_SESSION');
    });
  });

  describe('GET /contacts — cursor pagination, q search, tenant/own scope', () => {
    it('limit по умолчанию 20, nextCursor null когда контактов меньше limit', async () => {
      const { cookie, organizationId } = await seedOwnerSession();
      await seedContact(organizationId);
      await seedContact(organizationId);

      const response = await app.inject({ method: 'GET', url: '/api/v1/contacts', headers: { cookie } });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.items).toHaveLength(2);
      expect(body.nextCursor).toBeNull();
    });

    it('cursor pagination без дублей и без пропусков по всем страницам limit=1', async () => {
      const { cookie, organizationId } = await seedOwnerSession();
      const contactIds = [
        await seedContact(organizationId, { createdAt: new Date('2026-08-25T10:00:00Z') }),
        await seedContact(organizationId, { createdAt: new Date('2026-08-26T10:00:00Z') }),
        await seedContact(organizationId, { createdAt: new Date('2026-08-27T10:00:00Z') }),
      ];

      const seenIds: string[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 5; page += 1) {
        const url = cursor ? `/api/v1/contacts?limit=1&cursor=${cursor}` : '/api/v1/contacts?limit=1';
        const response = await app.inject({ method: 'GET', url, headers: { cookie } });
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.items).toHaveLength(1);
        seenIds.push(body.items[0].id);
        if (!body.nextCursor) break;
        cursor = body.nextCursor;
      }

      expect(seenIds).toHaveLength(3);
      expect(new Set(seenIds).size).toBe(3);
      expect(seenIds.sort()).toEqual(contactIds.map((id) => id.toString()).sort());
    });

    it('q ищет по name (частичное совпадение, регистронезависимо)', async () => {
      const { cookie, organizationId } = await seedOwnerSession();
      const targetId = await seedContact(organizationId, { name: 'Иван Петров' });
      await seedContact(organizationId, { name: 'Сергей Смирнов' });

      const response = await app.inject({ method: 'GET', url: '/api/v1/contacts?q=петров', headers: { cookie } });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.items).toHaveLength(1);
      expect(body.items[0].id).toBe(targetId.toString());
    });

    it('q ищет по phone (частичное совпадение)', async () => {
      const { cookie, organizationId } = await seedOwnerSession();
      const targetId = await seedContact(organizationId, { phone: '+79995551234' });
      await seedContact(organizationId, { phone: '+79990000000' });

      const response = await app.inject({ method: 'GET', url: '/api/v1/contacts?q=5551234', headers: { cookie } });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.items).toHaveLength(1);
      expect(body.items[0].id).toBe(targetId.toString());
    });

    it('q с regex-метасимволами не бросает и не интерпретирует их как regex (экранирование)', async () => {
      const { cookie, organizationId } = await seedOwnerSession();
      await seedContact(organizationId, { name: 'Иван Петров' });

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/contacts?${new URLSearchParams({ q: 'a.*b(c' }).toString()}`,
        headers: { cookie },
      });
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).items).toHaveLength(0);
    });

    it('own-scope (manager): видит только контакты своих лидов', async () => {
      const { organizationId } = await seedOwnerSession();
      const { cookie, positionId: managerPositionId } = await seedManagerSession(organizationId);
      const ownContactId = await seedContact(organizationId, { name: 'Свой контакт' });
      await seedLead(organizationId, ownContactId, { ownerPositionId: managerPositionId });
      const foreignContactId = await seedContact(organizationId, { name: 'Чужой контакт' });
      await seedLead(organizationId, foreignContactId, { ownerPositionId: new Types.ObjectId() });

      const response = await app.inject({ method: 'GET', url: '/api/v1/contacts', headers: { cookie } });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.items).toHaveLength(1);
      expect(body.items[0].id).toBe(ownContactId.toString());
    });

    it('own-scope (manager): контакт без единого своего лида — пустой список, не 403/500', async () => {
      const { organizationId } = await seedOwnerSession();
      const { cookie } = await seedManagerSession(organizationId);
      const contactId = await seedContact(organizationId);
      await seedLead(organizationId, contactId, { ownerPositionId: new Types.ObjectId() });

      const response = await app.inject({ method: 'GET', url: '/api/v1/contacts', headers: { cookie } });
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ items: [], nextCursor: null });
    });

    it('cross-tenant isolation: организация A не видит контакты организации B', async () => {
      const { cookie: cookieA } = await seedOwnerSession();
      const { organizationId: orgB } = await seedOwnerSession();
      await seedContact(orgB);

      const response = await app.inject({ method: 'GET', url: '/api/v1/contacts', headers: { cookie: cookieA } });
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).items).toHaveLength(0);
    });

    it('scope escalation: own-scope не может обойти сужение через q/cursor — видит только свои даже с широким q', async () => {
      const { organizationId } = await seedOwnerSession();
      const { cookie, positionId: managerPositionId } = await seedManagerSession(organizationId);
      const ownContactId = await seedContact(organizationId, { name: 'Общее имя' });
      await seedLead(organizationId, ownContactId, { ownerPositionId: managerPositionId });
      const foreignContactId = await seedContact(organizationId, { name: 'Общее имя' });
      await seedLead(organizationId, foreignContactId, { ownerPositionId: new Types.ObjectId() });

      const response = await app.inject({ method: 'GET', url: '/api/v1/contacts?q=Общее', headers: { cookie } });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.items).toHaveLength(1);
      expect(body.items[0].id).toBe(ownContactId.toString());
    });

    it('invalid limit (>100) — 400 VALIDATION_FAILED', async () => {
      const { cookie } = await seedOwnerSession();
      const response = await app.inject({ method: 'GET', url: '/api/v1/contacts?limit=101', headers: { cookie } });
      expect(response.statusCode).toBe(400);
    });

    it('invalid limit (0) — 400 VALIDATION_FAILED', async () => {
      const { cookie } = await seedOwnerSession();
      const response = await app.inject({ method: 'GET', url: '/api/v1/contacts?limit=0', headers: { cookie } });
      expect(response.statusCode).toBe(400);
    });

    it('invalid cursor (не ObjectId) — 400 VALIDATION_FAILED', async () => {
      const { cookie } = await seedOwnerSession();
      const response = await app.inject({ method: 'GET', url: '/api/v1/contacts?cursor=not-an-object-id', headers: { cookie } });
      expect(response.statusCode).toBe(400);
    });

    it('не раскрывает внутренние поля — passwordHash/sessionToken/tokenHash отсутствуют в ответе', async () => {
      const { cookie, organizationId } = await seedOwnerSession();
      await seedContact(organizationId);

      const response = await app.inject({ method: 'GET', url: '/api/v1/contacts', headers: { cookie } });
      expect(response.statusCode).toBe(200);
      expect(response.body).not.toMatch(/passwordHash|sessionToken|tokenHash/);
    });
  });

  describe('GET /contacts/:contactId', () => {
    it('organization-scope: возвращает контакт по id', async () => {
      const { cookie, organizationId } = await seedOwnerSession();
      const contactId = await seedContact(organizationId, { name: 'Иван', phone: '+79990000000' });

      const response = await app.inject({ method: 'GET', url: `/api/v1/contacts/${contactId.toString()}`, headers: { cookie } });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe(contactId.toString());
      expect(body.name).toBe('Иван');
    });

    it('чужой контакт (другая организация) — 404, тот же код, что несуществующий', async () => {
      const { organizationId: orgA } = await seedOwnerSession();
      const { cookie: cookieB } = await seedOwnerSession();
      const contactInOrgA = await seedContact(orgA);

      const foreignResponse = await app.inject({
        method: 'GET',
        url: `/api/v1/contacts/${contactInOrgA.toString()}`,
        headers: { cookie: cookieB },
      });
      const missingResponse = await app.inject({
        method: 'GET',
        url: `/api/v1/contacts/${new Types.ObjectId().toString()}`,
        headers: { cookie: cookieB },
      });

      expect(foreignResponse.statusCode).toBe(404);
      expect(missingResponse.statusCode).toBe(404);
      expect(JSON.parse(foreignResponse.body).error.code).toBe(JSON.parse(missingResponse.body).error.code);
    });

    it('own-scope (manager): контакт, не связанный с его лидами — 404, тот же код что несуществующий', async () => {
      const { organizationId } = await seedOwnerSession();
      const { cookie } = await seedManagerSession(organizationId);
      const foreignContactId = await seedContact(organizationId);
      await seedLead(organizationId, foreignContactId, { ownerPositionId: new Types.ObjectId() });

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/contacts/${foreignContactId.toString()}`,
        headers: { cookie },
      });
      expect(response.statusCode).toBe(404);
    });

    it('own-scope (manager): контакт своего лида — 200', async () => {
      const { organizationId } = await seedOwnerSession();
      const { cookie, positionId: managerPositionId } = await seedManagerSession(organizationId);
      const ownContactId = await seedContact(organizationId);
      await seedLead(organizationId, ownContactId, { ownerPositionId: managerPositionId });

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/contacts/${ownContactId.toString()}`,
        headers: { cookie },
      });
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).id).toBe(ownContactId.toString());
    });

    it('invalid contactId (не ObjectId в path) — 400, не 500', async () => {
      const { cookie } = await seedOwnerSession();
      const response = await app.inject({ method: 'GET', url: '/api/v1/contacts/not-an-object-id', headers: { cookie } });
      expect(response.statusCode).toBe(400);
    });

    it('не раскрывает внутренние поля — passwordHash/sessionToken/tokenHash отсутствуют в ответе', async () => {
      const { cookie, organizationId } = await seedOwnerSession();
      const contactId = await seedContact(organizationId);

      const response = await app.inject({ method: 'GET', url: `/api/v1/contacts/${contactId.toString()}`, headers: { cookie } });
      expect(response.statusCode).toBe(200);
      expect(response.body).not.toMatch(/passwordHash|sessionToken|tokenHash/);
    });
  });
});

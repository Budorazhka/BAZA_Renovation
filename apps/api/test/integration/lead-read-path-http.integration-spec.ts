import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
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

/**
 * GET /leads и GET /leads/:leadId/events — HTTP-уровневый integration-тест
 * против ПОЛНОГО AppModule + реальных Fastify onRequest hooks, тот же
 * bootstrap-паттерн, что admin-http.integration-spec.ts. Закрывает пробел,
 * который lead-management.integration-spec.ts (DI-only, CrmService напрямую)
 * не покрывает: TenantGuard/PermissionGuard/ParseObjectIdPipe/ValidationPipe
 * на реальном HTTP-пути, 401/403/400 коды, реальный cookie-based session flow.
 */
describe('GET /leads, GET /leads/:leadId/events — HTTP integration (полный AppModule)', () => {
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

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

    await app.register(fastifyCookie);
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

  /** Owner — organization-wide `lead.read` scope (весь tenant, ownerPositionId не сужает). */
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

  /** Manager — `lead.read` own-scope, сужается до ownerPositionId===своя Position. */
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

  async function seedLead(
    organizationId: Types.ObjectId,
    overrides?: { stage?: string; ownerPositionId?: Types.ObjectId; createdAt?: Date },
  ): Promise<Types.ObjectId> {
    const contactId = new Types.ObjectId();
    await connection.collection('contacts').insertOne({
      _id: contactId,
      organizationId,
      name: 'Иван Интеграционный',
      phone: '+79990000000',
      roles: ['buyer'],
      createdAt: new Date(),
    });
    const leadId = new Types.ObjectId();
    await connection.collection('leads').insertOne({
      _id: leadId,
      organizationId,
      contactId,
      ownerPositionId: overrides?.ownerPositionId,
      stage: overrides?.stage ?? 'new',
      version: 0,
      source: { route: '/developments/integration-test' },
      createdAt: overrides?.createdAt ?? new Date(),
    });
    return leadId;
  }

  async function seedLeadEvent(
    leadId: Types.ObjectId,
    organizationId: Types.ObjectId,
    overrides?: { stage?: string },
  ): Promise<Types.ObjectId> {
    const eventId = new Types.ObjectId();
    await connection.collection('lead_events').insertOne({
      _id: eventId,
      leadId,
      organizationId,
      stage: overrides?.stage ?? 'new',
      changedBy: { type: 'system' },
      changedAt: new Date(),
    });
    return eventId;
  }

  describe('аутентификация/авторизация (401 vs 403)', () => {
    it('GET /leads без cookie — 401 AUTH_NO_SESSION', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/v1/leads' });
      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body).error.code).toBe('AUTH_NO_SESSION');
    });

    it('GET /leads с мусорной cookie — 403 FORBIDDEN, не 500', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/leads',
        headers: { cookie: 'baza_session=nonexistent-token-value' },
      });
      expect(response.statusCode).toBe(403);
    });

    it('GET /leads/:leadId/events без cookie — 401 AUTH_NO_SESSION', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/leads/${new Types.ObjectId().toString()}/events`,
      });
      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body).error.code).toBe('AUTH_NO_SESSION');
    });
  });

  describe('GET /leads — cursor pagination, limit, stage/owner фильтры', () => {
    it('limit по умолчанию 20, nextCursor null когда лидов меньше limit', async () => {
      const { cookie, organizationId } = await seedOwnerSession();
      await seedLead(organizationId);
      await seedLead(organizationId);

      const response = await app.inject({ method: 'GET', url: '/api/v1/leads', headers: { cookie } });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.items).toHaveLength(2);
      expect(body.nextCursor).toBeNull();
    });

    it('cursor pagination без дублей и без пропусков по всем страницам limit=1', async () => {
      const { cookie, organizationId } = await seedOwnerSession();
      const leadIds = [
        await seedLead(organizationId, { createdAt: new Date('2026-08-25T10:00:00Z') }),
        await seedLead(organizationId, { createdAt: new Date('2026-08-26T10:00:00Z') }),
        await seedLead(organizationId, { createdAt: new Date('2026-08-27T10:00:00Z') }),
      ];

      const seenIds: string[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 5; page += 1) {
        const url = cursor ? `/api/v1/leads?limit=1&cursor=${cursor}` : '/api/v1/leads?limit=1';
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
      expect(seenIds.sort()).toEqual(leadIds.map((id) => id.toString()).sort());
    });

    it('stage-фильтр сужает результат', async () => {
      const { cookie, organizationId } = await seedOwnerSession();
      await seedLead(organizationId, { stage: 'new' });
      const qualifiedLeadId = await seedLead(organizationId, { stage: 'qualified' });

      const response = await app.inject({ method: 'GET', url: '/api/v1/leads?stage=qualified', headers: { cookie } });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.items).toHaveLength(1);
      expect(body.items[0].id).toBe(qualifiedLeadId.toString());
    });

    it('own-scope (manager): без ownerPositionId-фильтра видит только свои лиды', async () => {
      const { organizationId } = await seedOwnerSession();
      const { cookie, positionId: managerPositionId } = await seedManagerSession(organizationId);
      const ownLeadId = await seedLead(organizationId, { ownerPositionId: managerPositionId });
      await seedLead(organizationId, { ownerPositionId: new Types.ObjectId() });
      await seedLead(organizationId);

      const response = await app.inject({ method: 'GET', url: '/api/v1/leads', headers: { cookie } });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.items).toHaveLength(1);
      expect(body.items[0].id).toBe(ownLeadId.toString());
    });

    it('own-scope (manager): явный ownerPositionId=чужая позиция — 400, не расширяет scope', async () => {
      const { organizationId } = await seedOwnerSession();
      const { cookie } = await seedManagerSession(organizationId);
      const otherPositionId = new Types.ObjectId();

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/leads?ownerPositionId=${otherPositionId.toString()}`,
        headers: { cookie },
      });
      expect(response.statusCode).toBe(400);
    });

    it('organization-scope (owner): ownerPositionId-фильтр сужает выборку по конкретному менеджеру', async () => {
      const { cookie, organizationId } = await seedOwnerSession();
      const { positionId: managerPositionId } = await seedManagerSession(organizationId);
      const targetLeadId = await seedLead(organizationId, { ownerPositionId: managerPositionId });
      await seedLead(organizationId, { ownerPositionId: new Types.ObjectId() });

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/leads?ownerPositionId=${managerPositionId.toString()}`,
        headers: { cookie },
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.items).toHaveLength(1);
      expect(body.items[0].id).toBe(targetLeadId.toString());
    });

    it('cross-tenant isolation: организация A не видит лиды организации B', async () => {
      const { cookie: cookieA } = await seedOwnerSession();
      const { organizationId: orgB } = await seedOwnerSession();
      await seedLead(orgB);

      const response = await app.inject({ method: 'GET', url: '/api/v1/leads', headers: { cookie: cookieA } });
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).items).toHaveLength(0);
    });

    it('invalid limit (>100) — 400 VALIDATION_FAILED', async () => {
      const { cookie } = await seedOwnerSession();
      const response = await app.inject({ method: 'GET', url: '/api/v1/leads?limit=101', headers: { cookie } });
      expect(response.statusCode).toBe(400);
    });

    it('invalid limit (0) — 400 VALIDATION_FAILED', async () => {
      const { cookie } = await seedOwnerSession();
      const response = await app.inject({ method: 'GET', url: '/api/v1/leads?limit=0', headers: { cookie } });
      expect(response.statusCode).toBe(400);
    });

    it('invalid cursor (не ObjectId) — 400 VALIDATION_FAILED', async () => {
      const { cookie } = await seedOwnerSession();
      const response = await app.inject({ method: 'GET', url: '/api/v1/leads?cursor=not-an-object-id', headers: { cookie } });
      expect(response.statusCode).toBe(400);
    });

    it('не раскрывает внутренние поля — passwordHash/sessionToken отсутствуют в ответе', async () => {
      const { cookie, organizationId } = await seedOwnerSession();
      await seedLead(organizationId);

      const response = await app.inject({ method: 'GET', url: '/api/v1/leads', headers: { cookie } });
      expect(response.statusCode).toBe(200);
      expect(response.body).not.toMatch(/passwordHash|sessionToken|tokenHash/);
    });
  });

  describe('GET /leads/:leadId/events', () => {
    it('возвращает только события указанного лида, tenant/owner scope проверен до чтения', async () => {
      const { cookie, organizationId } = await seedOwnerSession();
      const leadId = await seedLead(organizationId);
      const otherLeadId = await seedLead(organizationId);
      const eventId = await seedLeadEvent(leadId, organizationId, { stage: 'new' });
      await seedLeadEvent(otherLeadId, organizationId, { stage: 'new' });

      const response = await app.inject({ method: 'GET', url: `/api/v1/leads/${leadId.toString()}/events`, headers: { cookie } });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.items).toHaveLength(1);
      expect(body.items[0].id).toBe(eventId.toString());
      expect(body.items[0].leadId).toBe(leadId.toString());
    });

    it('чужой лид (другая организация) — 404, тот же код, что несуществующий leadId', async () => {
      const { organizationId: orgA } = await seedOwnerSession();
      const { cookie: cookieB } = await seedOwnerSession();
      const leadInOrgA = await seedLead(orgA);

      const foreignResponse = await app.inject({
        method: 'GET',
        url: `/api/v1/leads/${leadInOrgA.toString()}/events`,
        headers: { cookie: cookieB },
      });
      const missingResponse = await app.inject({
        method: 'GET',
        url: `/api/v1/leads/${new Types.ObjectId().toString()}/events`,
        headers: { cookie: cookieB },
      });

      expect(foreignResponse.statusCode).toBe(404);
      expect(missingResponse.statusCode).toBe(404);
      expect(JSON.parse(foreignResponse.body).error.code).toBe(JSON.parse(missingResponse.body).error.code);
    });

    it('own-scope (manager): чужой лид (не свой) — 404, тот же код что несуществующий', async () => {
      const { organizationId } = await seedOwnerSession();
      const { cookie } = await seedManagerSession(organizationId);
      const foreignOwnedLeadId = await seedLead(organizationId, { ownerPositionId: new Types.ObjectId() });

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/leads/${foreignOwnedLeadId.toString()}/events`,
        headers: { cookie },
      });
      expect(response.statusCode).toBe(404);
    });

    it('пустая история — items:[], nextCursor:null, 200 (не 404)', async () => {
      const { cookie, organizationId } = await seedOwnerSession();
      const leadId = await seedLead(organizationId);

      const response = await app.inject({ method: 'GET', url: `/api/v1/leads/${leadId.toString()}/events`, headers: { cookie } });
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ items: [], nextCursor: null });
    });

    it('cursor pagination без дублей и без пропусков по всем страницам limit=1', async () => {
      const { cookie, organizationId } = await seedOwnerSession();
      const leadId = await seedLead(organizationId);
      const eventIds = [
        await seedLeadEvent(leadId, organizationId, { stage: 'new' }),
        await seedLeadEvent(leadId, organizationId, { stage: 'contacted' }),
        await seedLeadEvent(leadId, organizationId, { stage: 'qualified' }),
      ];

      const seenIds: string[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 5; page += 1) {
        const url = cursor
          ? `/api/v1/leads/${leadId.toString()}/events?limit=1&cursor=${cursor}`
          : `/api/v1/leads/${leadId.toString()}/events?limit=1`;
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
      expect(seenIds.sort()).toEqual(eventIds.map((id) => id.toString()).sort());
    });

    it('invalid leadId (не ObjectId в path) — 400, не 500', async () => {
      const { cookie } = await seedOwnerSession();
      const response = await app.inject({ method: 'GET', url: '/api/v1/leads/not-an-object-id/events', headers: { cookie } });
      expect(response.statusCode).toBe(400);
    });

    it('invalid limit — 400 VALIDATION_FAILED', async () => {
      const { cookie, organizationId } = await seedOwnerSession();
      const leadId = await seedLead(organizationId);
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/leads/${leadId.toString()}/events?limit=0`,
        headers: { cookie },
      });
      expect(response.statusCode).toBe(400);
    });

    it('invalid cursor — 400 VALIDATION_FAILED', async () => {
      const { cookie, organizationId } = await seedOwnerSession();
      const leadId = await seedLead(organizationId);
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/leads/${leadId.toString()}/events?cursor=garbage`,
        headers: { cookie },
      });
      expect(response.statusCode).toBe(400);
    });
  });
});

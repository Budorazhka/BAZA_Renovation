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
 * Backend vertical slice: CRM reports (GET /crm/reports/lead-funnel,
 * GET /crm/reports/positions) — расширение crm-модуля. Тот же каркас, что
 * calendar-events.integration-spec.ts (Full Fastify HTTP integration test
 * против реального MongoDB replica set).
 */
describe('CRM Reports — HTTP Integration (AppModule)', () => {
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
    await connection.collection('deals').deleteMany({});
    await connection.collection('contacts').deleteMany({});
    await connection.collection('positions').deleteMany({});
    await connection.collection('position_assignments').deleteMany({});
    await connection.collection('organizations').deleteMany({});
    await connection.collection('audit_events').deleteMany({});
    await connection.collection('permission_grants').deleteMany({});
    await connection.collection('identities').deleteMany({});
    await connection.collection('sessions').deleteMany({});
    await connection.collection('product_accesses').deleteMany({});
    await connection.collection('idempotency_records').deleteMany({});
  });

  const PASSWORD = 'correct horse battery staple';

  async function seedOwnerSession(): Promise<{
    cookie: string;
    organizationId: Types.ObjectId;
    positionId: Types.ObjectId;
  }> {
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

  async function seedManagerSession(
    organizationId: Types.ObjectId,
  ): Promise<{ cookie: string; positionId: Types.ObjectId }> {
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
    return { cookie: `baza_session=${session.sessionToken}`, positionId };
  }

  function seedContact(organizationId: Types.ObjectId) {
    const contactId = new Types.ObjectId();
    return connection
      .collection('contacts')
      .insertOne({ _id: contactId, organizationId, name: 'Клиент', phone: '+995500000000', roles: ['lead'] })
      .then(() => contactId);
  }

  async function seedLeadWithEvents(params: {
    organizationId: Types.ObjectId;
    contactId: Types.ObjectId;
    ownerPositionId?: Types.ObjectId;
    stages: Array<{ stage: string; changedAt: Date }>;
  }): Promise<Types.ObjectId> {
    const leadId = new Types.ObjectId();
    const lastStage = params.stages[params.stages.length - 1]!.stage;
    await connection.collection('leads').insertOne({
      _id: leadId,
      organizationId: params.organizationId,
      contactId: params.contactId,
      ownerPositionId: params.ownerPositionId,
      source: { route: '/test' },
      stage: lastStage,
      version: params.stages.length - 1,
      status: 'active',
      attachedAssetIds: [],
      createdAt: params.stages[0]!.changedAt,
    });
    await connection.collection('lead_events').insertMany(
      params.stages.map((s) => ({
        leadId,
        organizationId: params.organizationId,
        stage: s.stage,
        changedBy: { type: 'system' },
        changedAt: s.changedAt,
      })),
    );
    return leadId;
  }

  function seedDeal(params: {
    organizationId: Types.ObjectId;
    contactId: Types.ObjectId;
    ownerPositionId: Types.ObjectId;
    stage: string;
    createdAt?: Date;
    expectedCommission?: { amountMinorUnits: number; currency: string };
  }) {
    const dealId = new Types.ObjectId();
    return connection
      .collection('deals')
      .insertOne({
        _id: dealId,
        organizationId: params.organizationId,
        contactId: params.contactId,
        ownerPositionId: params.ownerPositionId,
        title: 'Сделка',
        stage: params.stage,
        expectedCommission: params.expectedCommission,
        participants: [],
        checklistItems: [],
        version: 0,
        createdAt: params.createdAt ?? new Date(),
        updatedAt: params.createdAt ?? new Date(),
      })
      .then(() => dealId);
  }

  describe('GET /crm/reports/lead-funnel', () => {
    it('без сессии — 401 AUTH_NO_SESSION', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/crm/reports/lead-funnel' });
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).error.code).toBe('AUTH_NO_SESSION');
    });

    it('у manager нет crm_report.read — 403', async () => {
      const { organizationId } = await seedOwnerSession();
      const { cookie } = await seedManagerSession(organizationId);

      const res = await app.inject({ method: 'GET', url: '/api/v1/crm/reports/lead-funnel', headers: { cookie } });

      expect(res.statusCode).toBe(403);
    });

    it('лид, повторно заходивший в одну стадию, считается в ней один раз', async () => {
      const { cookie, organizationId } = await seedOwnerSession();
      const contactId = await seedContact(organizationId);

      await seedLeadWithEvents({
        organizationId,
        contactId,
        stages: [
          { stage: 'new', changedAt: new Date('2026-01-01T00:00:00.000Z') },
          { stage: 'contacted', changedAt: new Date('2026-01-02T00:00:00.000Z') },
          { stage: 'new', changedAt: new Date('2026-01-03T00:00:00.000Z') },
          { stage: 'contacted', changedAt: new Date('2026-01-04T00:00:00.000Z') },
        ],
      });

      const res = await app.inject({ method: 'GET', url: '/api/v1/crm/reports/lead-funnel', headers: { cookie } });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      const byStage = Object.fromEntries(
        (body.stages as Array<{ stage: string; leadCount: number }>).map((s) => [s.stage, s.leadCount]),
      );
      expect(byStage.new).toBe(1);
      expect(byStage.contacted).toBe(1);
    });

    it('лид без единого события не появляется в отчёте — считаются только lead_events, не Lead.stage', async () => {
      const { cookie, organizationId } = await seedOwnerSession();
      const contactId = await seedContact(organizationId);
      const leadId = new Types.ObjectId();
      await connection.collection('leads').insertOne({
        _id: leadId,
        organizationId,
        contactId,
        source: { route: '/test' },
        stage: 'new',
        version: 0,
        status: 'active',
        attachedAssetIds: [],
        createdAt: new Date(),
      });

      const res = await app.inject({ method: 'GET', url: '/api/v1/crm/reports/lead-funnel', headers: { cookie } });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).stages).toEqual([]);
    });

    it('период без событий возвращает пустой массив stages', async () => {
      const { cookie, organizationId } = await seedOwnerSession();
      const contactId = await seedContact(organizationId);
      await seedLeadWithEvents({
        organizationId,
        contactId,
        stages: [{ stage: 'new', changedAt: new Date('2026-01-01T00:00:00.000Z') }],
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/crm/reports/lead-funnel?from=2027-01-01T00:00:00.000Z&to=2027-02-01T00:00:00.000Z',
        headers: { cookie },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).stages).toEqual([]);
    });

    it('лид другой организации не утекает в агрегацию', async () => {
      const { cookie, organizationId } = await seedOwnerSession();
      const contactId = await seedContact(organizationId);
      await seedLeadWithEvents({
        organizationId,
        contactId,
        stages: [{ stage: 'new', changedAt: new Date('2026-01-01T00:00:00.000Z') }],
      });

      const { organizationId: otherOrgId } = await seedOwnerSession();
      const otherContactId = await seedContact(otherOrgId);
      await seedLeadWithEvents({
        organizationId: otherOrgId,
        contactId: otherContactId,
        stages: [
          { stage: 'new', changedAt: new Date('2026-01-01T00:00:00.000Z') },
          { stage: 'contacted', changedAt: new Date('2026-01-02T00:00:00.000Z') },
        ],
      });

      const res = await app.inject({ method: 'GET', url: '/api/v1/crm/reports/lead-funnel', headers: { cookie } });

      const body = JSON.parse(res.body);
      const byStage = Object.fromEntries(
        (body.stages as Array<{ stage: string; leadCount: number }>).map((s) => [s.stage, s.leadCount]),
      );
      expect(byStage.new).toBe(1);
      expect(byStage.contacted).toBeUndefined();
    });

    it('productType сужает воронку на стадии этого продукта', async () => {
      const { cookie, organizationId } = await seedOwnerSession();
      const contactId = await seedContact(organizationId);
      await seedLeadWithEvents({
        organizationId,
        contactId,
        stages: [{ stage: 'network_new_lead', changedAt: new Date('2026-01-01T00:00:00.000Z') }],
      });
      await seedLeadWithEvents({
        organizationId,
        contactId,
        stages: [{ stage: 'new', changedAt: new Date('2026-01-01T00:00:00.000Z') }],
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/crm/reports/lead-funnel?productType=network',
        headers: { cookie },
      });

      const body = JSON.parse(res.body);
      const stages = (body.stages as Array<{ stage: string; leadCount: number }>).map((s) => s.stage);
      expect(stages).toEqual(['network_new_lead']);
    });
  });

  describe('GET /crm/reports/positions', () => {
    it('без сессии — 401 AUTH_NO_SESSION', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/crm/reports/positions' });
      expect(res.statusCode).toBe(401);
    });

    it('у manager нет crm_report.read — 403', async () => {
      const { organizationId } = await seedOwnerSession();
      const { cookie } = await seedManagerSession(organizationId);

      const res = await app.inject({ method: 'GET', url: '/api/v1/crm/reports/positions', headers: { cookie } });

      expect(res.statusCode).toBe(403);
    });

    it('группирует лиды и сделки по ownerPositionId, суммирует комиссию по валюте', async () => {
      const { cookie, organizationId } = await seedOwnerSession();
      const { positionId: managerPositionId } = await seedManagerSession(organizationId);
      const contactId = await seedContact(organizationId);

      await seedLeadWithEvents({
        organizationId,
        contactId,
        ownerPositionId: managerPositionId,
        stages: [{ stage: 'new', changedAt: new Date() }],
      });
      await seedDeal({
        organizationId,
        contactId,
        ownerPositionId: managerPositionId,
        stage: 'showing',
        expectedCommission: { amountMinorUnits: 10000, currency: 'USD' },
      });
      await seedDeal({
        organizationId,
        contactId,
        ownerPositionId: managerPositionId,
        stage: 'deal',
        expectedCommission: { amountMinorUnits: 25000, currency: 'USD' },
      });

      const res = await app.inject({ method: 'GET', url: '/api/v1/crm/reports/positions', headers: { cookie } });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      const entry = (body.positions as Array<{ positionId: string | null }>).find(
        (p) => p.positionId === managerPositionId.toString(),
      );
      expect(entry).toMatchObject({
        leadsTotal: 1,
        leadsByStage: { new: 1 },
        dealsTotal: 2,
        dealsByStage: { showing: 1, deal: 1 },
        dealsCommission: [{ currency: 'USD', amountMinorUnits: 35000 }],
      });
    });

    it('лид без ownerPositionId группируется отдельной строкой positionId:null', async () => {
      const { cookie, organizationId } = await seedOwnerSession();
      const contactId = await seedContact(organizationId);
      await seedLeadWithEvents({ organizationId, contactId, stages: [{ stage: 'new', changedAt: new Date() }] });

      const res = await app.inject({ method: 'GET', url: '/api/v1/crm/reports/positions', headers: { cookie } });

      const body = JSON.parse(res.body);
      const unassigned = (body.positions as Array<{ positionId: string | null; leadsTotal: number }>).find(
        (p) => p.positionId === null,
      );
      expect(unassigned).toMatchObject({ leadsTotal: 1 });
    });

    it('чужая организация не утекает в сводку по позициям', async () => {
      const { cookie, organizationId } = await seedOwnerSession();
      const { positionId: managerPositionId } = await seedManagerSession(organizationId);
      const contactId = await seedContact(organizationId);
      await seedLeadWithEvents({
        organizationId,
        contactId,
        ownerPositionId: managerPositionId,
        stages: [{ stage: 'new', changedAt: new Date() }],
      });

      const { organizationId: otherOrgId } = await seedOwnerSession();
      const { positionId: otherManagerPositionId } = await seedManagerSession(otherOrgId);
      const otherContactId = await seedContact(otherOrgId);
      await seedLeadWithEvents({
        organizationId: otherOrgId,
        contactId: otherContactId,
        ownerPositionId: otherManagerPositionId,
        stages: [{ stage: 'new', changedAt: new Date() }],
      });

      const res = await app.inject({ method: 'GET', url: '/api/v1/crm/reports/positions', headers: { cookie } });

      const body = JSON.parse(res.body);
      const positionIds = (body.positions as Array<{ positionId: string | null }>).map((p) => p.positionId);
      expect(positionIds).toContain(managerPositionId.toString());
      expect(positionIds).not.toContain(otherManagerPositionId.toString());
    });

    it('период без данных возвращает пустой массив positions', async () => {
      const { cookie, organizationId } = await seedOwnerSession();
      const contactId = await seedContact(organizationId);
      await seedLeadWithEvents({ organizationId, contactId, stages: [{ stage: 'new', changedAt: new Date() }] });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/crm/reports/positions?from=2027-01-01T00:00:00.000Z&to=2027-02-01T00:00:00.000Z',
        headers: { cookie },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).positions).toEqual([]);
    });
  });
});

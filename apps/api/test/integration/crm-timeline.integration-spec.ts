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
 * CRM-004: Pipeline & Activity Timeline + Stalled Leads.
 * Full Fastify HTTP integration test against real MongoDB replica set.
 */
describe('CRM Pipeline & Activity Timeline + Stalled Leads — HTTP Integration', () => {
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
    await connection.collection('tasks').deleteMany({});
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

  async function seedOwnerSession(): Promise<{
    cookie: string;
    organizationId: Types.ObjectId;
    positionId: Types.ObjectId;
    identityId: Types.ObjectId;
  }> {
    const login = `owner-${new Types.ObjectId().toString()}@example.test`;
    const identityId = await authService.registerIdentity({ login, password: PASSWORD });
    const { organizationId, positionId } = await organizationsService.createOrganizationWithOwner({
      type: 'agency',
      name: 'Интеграционное агентство',
      ownerIdentityId: identityId,
    });
    const session = await authService.login({ login, password: PASSWORD, audience: 'erp' });
    return { cookie: `baza_session=${session.sessionToken}`, organizationId, positionId, identityId };
  }

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

  it('1. GET /leads/:leadId/timeline & GET /contacts/:contactId/timeline — 401, 403, 404, non-disclosure & tenant isolation', async () => {
    const ownerA = await seedOwnerSession();
    const ownerB = await seedOwnerSession();
    const managerA = await seedManagerSession(ownerA.organizationId);

    const contactIdA = new Types.ObjectId();
    await connection.collection('contacts').insertOne({
      _id: contactIdA,
      organizationId: ownerA.organizationId,
      name: 'Контакт А',
      phone: '+79991112233',
      createdAt: new Date(),
    });

    const leadIdA = new Types.ObjectId();
    await connection.collection('leads').insertOne({
      _id: leadIdA,
      organizationId: ownerA.organizationId,
      contactId: contactIdA,
      ownerPositionId: ownerA.positionId, // Assigned to owner, NOT managerA
      stage: 'new',
      version: 0,
      source: { route: '/test' },
      createdAt: new Date(),
    });

    // 401 without cookie
    const res401Lead = await app.inject({
      method: 'GET',
      url: `/api/v1/leads/${leadIdA.toString()}/timeline`,
    });
    expect(res401Lead.statusCode).toBe(401);

    const res401Contact = await app.inject({
      method: 'GET',
      url: `/api/v1/contacts/${contactIdA.toString()}/timeline`,
    });
    expect(res401Contact.statusCode).toBe(401);

    // 404 for cross-tenant from Organization B (tenant isolation)
    const resTenantBLead = await app.inject({
      method: 'GET',
      url: `/api/v1/leads/${leadIdA.toString()}/timeline`,
      headers: { cookie: ownerB.cookie },
    });
    expect(resTenantBLead.statusCode).toBe(404);

    const resTenantBContact = await app.inject({
      method: 'GET',
      url: `/api/v1/contacts/${contactIdA.toString()}/timeline`,
      headers: { cookie: ownerB.cookie },
    });
    expect(resTenantBContact.statusCode).toBe(404);

    // 404 for managerA (own-scope: lead belongs to ownerA, manager has no leads for this contact -> uniform 404 non-disclosure)
    const resManagerLead = await app.inject({
      method: 'GET',
      url: `/api/v1/leads/${leadIdA.toString()}/timeline`,
      headers: { cookie: managerA.cookie },
    });
    expect(resManagerLead.statusCode).toBe(404);

    const resManagerContact = await app.inject({
      method: 'GET',
      url: `/api/v1/contacts/${contactIdA.toString()}/timeline`,
      headers: { cookie: managerA.cookie },
    });
    expect(resManagerContact.statusCode).toBe(404);
  });

  it('2. GET /leads/:leadId/timeline — aggregates stage changes, tasks, audit events with cursor pagination and whitelist', async () => {
    const owner = await seedOwnerSession();
    const contactId = new Types.ObjectId();
    await connection.collection('contacts').insertOne({
      _id: contactId,
      organizationId: owner.organizationId,
      name: 'Пётр',
      phone: '+79995554433',
      createdAt: new Date('2026-08-01T10:00:00Z'),
    });

    const leadId = new Types.ObjectId();
    await connection.collection('leads').insertOne({
      _id: leadId,
      organizationId: owner.organizationId,
      contactId,
      ownerPositionId: owner.positionId,
      stage: 'contacted',
      version: 1,
      source: { route: '/test' },
      createdAt: new Date('2026-08-01T10:00:00Z'),
    });

    // Lead stage event
    await connection.collection('lead_events').insertOne({
      _id: new Types.ObjectId(),
      leadId,
      organizationId: owner.organizationId,
      stage: 'contacted',
      changedBy: { type: 'position', positionId: owner.positionId },
      changedAt: new Date('2026-08-02T12:00:00Z'),
    });

    // Task 1: completed
    const task1Id = new Types.ObjectId();
    await connection.collection('tasks').insertOne({
      _id: task1Id,
      organizationId: owner.organizationId,
      leadId,
      contactId,
      title: 'Первый звонок',
      description: 'Обсудить планировку',
      status: 'completed',
      assignedPositionId: owner.positionId,
      completedByPositionId: owner.positionId,
      createdAt: new Date('2026-08-03T09:00:00Z'),
      completedAt: new Date('2026-08-03T10:00:00Z'),
    });

    // Task 2: open
    const task2Id = new Types.ObjectId();
    await connection.collection('tasks').insertOne({
      _id: task2Id,
      organizationId: owner.organizationId,
      leadId,
      contactId,
      title: 'Подготовить КП',
      status: 'open',
      assignedPositionId: owner.positionId,
      createdAt: new Date('2026-08-04T14:00:00Z'),
    });

    // Audit event: lead.assign
    await connection.collection('audit_events').insertOne({
      _id: new Types.ObjectId(),
      action: 'lead.assign',
      actor: { type: 'position', id: owner.positionId },
      resource: 'lead',
      resourceId: leadId,
      after: { ownerPositionId: owner.positionId.toString() },
      createdAt: new Date('2026-08-01T11:00:00Z'),
    });

    // Fetch full timeline (limit 10)
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/leads/${leadId.toString()}/timeline?limit=10`,
      headers: { cookie: owner.cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.items).toHaveLength(5);
    // Chronological order: newest first
    // 1. Task 2 created: 2026-08-04T14:00:00Z
    // 2. Task 1 completed: 2026-08-03T10:00:00Z
    // 3. Task 1 created: 2026-08-03T09:00:00Z
    // 4. Lead stage changed: 2026-08-02T12:00:00Z
    // 5. Lead assigned: 2026-08-01T11:00:00Z
    expect(body.items[0].type).toBe('task_created');
    expect(body.items[1].type).toBe('task_completed');
    expect(body.items[2].type).toBe('task_created');
    expect(body.items[3].type).toBe('lead_stage_changed');
    expect(body.items[4].type).toBe('lead_assigned');

    // No leaks: check that no passwords or internal fields exist
    for (const item of body.items) {
      expect(item.password).toBeUndefined();
      expect(item.token).toBeUndefined();
      expect(item.secret).toBeUndefined();
    }

    // Cursor pagination: limit=2 -> nextCursor -> fetch next page
    const page1Res = await app.inject({
      method: 'GET',
      url: `/api/v1/leads/${leadId.toString()}/timeline?limit=2`,
      headers: { cookie: owner.cookie },
    });
    expect(page1Res.statusCode).toBe(200);
    const page1 = JSON.parse(page1Res.body);
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).toBeTruthy();

    const page2Res = await app.inject({
      method: 'GET',
      url: `/api/v1/leads/${leadId.toString()}/timeline?limit=2&cursor=${page1.nextCursor}`,
      headers: { cookie: owner.cookie },
    });
    expect(page2Res.statusCode).toBe(200);
    const page2 = JSON.parse(page2Res.body);
    expect(page2.items).toHaveLength(2);
    expect(page2.items[0].id).toBe(body.items[2].id);
    expect(page2.items[1].id).toBe(body.items[3].id);

    // Filter by type=task_completed
    const filterRes = await app.inject({
      method: 'GET',
      url: `/api/v1/leads/${leadId.toString()}/timeline?type=task_completed`,
      headers: { cookie: owner.cookie },
    });
    expect(filterRes.statusCode).toBe(200);
    const filterBody = JSON.parse(filterRes.body);
    expect(filterBody.items).toHaveLength(1);
    expect(filterBody.items[0].type).toBe('task_completed');
  });

  it('3. GET /contacts/:contactId/timeline — aggregates timeline across contact and visible leads/tasks', async () => {
    const owner = await seedOwnerSession();
    const contactId = new Types.ObjectId();
    await connection.collection('contacts').insertOne({
      _id: contactId,
      organizationId: owner.organizationId,
      name: 'Анна',
      phone: '+79998887766',
      createdAt: new Date('2026-08-01T10:00:00Z'),
    });

    const leadId = new Types.ObjectId();
    await connection.collection('leads').insertOne({
      _id: leadId,
      organizationId: owner.organizationId,
      contactId,
      ownerPositionId: owner.positionId,
      stage: 'new',
      version: 0,
      source: { route: '/test' },
      createdAt: new Date('2026-08-01T10:00:00Z'),
    });

    await connection.collection('tasks').insertOne({
      _id: new Types.ObjectId(),
      organizationId: owner.organizationId,
      leadId,
      contactId,
      title: 'Встреча в офисе',
      status: 'open',
      assignedPositionId: owner.positionId,
      createdAt: new Date('2026-08-05T10:00:00Z'),
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/contacts/${contactId.toString()}/timeline`,
      headers: { cookie: owner.cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].type).toBe('task_created');
  });

  it('4. Stalled Leads Calculation & GET /leads?stalled=true/false filters', async () => {
    const owner = await seedOwnerSession();
    const contactId = new Types.ObjectId();
    await connection.collection('contacts').insertOne({
      _id: contactId,
      organizationId: owner.organizationId,
      name: 'Клиент',
      phone: '+79990001122',
      createdAt: new Date(),
    });

    // Lead 1: stage='new', 0 tasks -> STALLED: true
    const lead1Id = new Types.ObjectId();
    await connection.collection('leads').insertOne({
      _id: lead1Id,
      organizationId: owner.organizationId,
      contactId,
      ownerPositionId: owner.positionId,
      stage: 'new',
      version: 0,
      source: { route: '/test' },
      createdAt: new Date('2026-08-10T10:00:00Z'),
    });

    // Lead 2: stage='qualified', 1 open task -> STALLED: false
    const lead2Id = new Types.ObjectId();
    await connection.collection('leads').insertOne({
      _id: lead2Id,
      organizationId: owner.organizationId,
      contactId,
      ownerPositionId: owner.positionId,
      stage: 'qualified',
      version: 0,
      source: { route: '/test' },
      createdAt: new Date('2026-08-11T10:00:00Z'),
    });
    await connection.collection('tasks').insertOne({
      _id: new Types.ObjectId(),
      organizationId: owner.organizationId,
      leadId: lead2Id,
      contactId,
      title: 'Подготовка договора',
      status: 'open',
      assignedPositionId: owner.positionId,
      createdAt: new Date(),
    });

    // Lead 3: stage='contacted', 1 completed task (0 open) -> STALLED: true
    const lead3Id = new Types.ObjectId();
    await connection.collection('leads').insertOne({
      _id: lead3Id,
      organizationId: owner.organizationId,
      contactId,
      ownerPositionId: owner.positionId,
      stage: 'contacted',
      version: 0,
      source: { route: '/test' },
      createdAt: new Date('2026-08-12T10:00:00Z'),
    });
    await connection.collection('tasks').insertOne({
      _id: new Types.ObjectId(),
      organizationId: owner.organizationId,
      leadId: lead3Id,
      contactId,
      title: 'Прошлый звонок',
      status: 'completed',
      assignedPositionId: owner.positionId,
      completedByPositionId: owner.positionId,
      createdAt: new Date(),
      completedAt: new Date(),
    });

    // Lead 4: stage='converted' (terminal), 0 tasks -> STALLED: false
    const lead4Id = new Types.ObjectId();
    await connection.collection('leads').insertOne({
      _id: lead4Id,
      organizationId: owner.organizationId,
      contactId,
      ownerPositionId: owner.positionId,
      stage: 'converted',
      version: 0,
      source: { route: '/test' },
      createdAt: new Date('2026-08-13T10:00:00Z'),
    });

    // Single lead check via GET /leads/:leadId
    const resGetLead1 = await app.inject({
      method: 'GET',
      url: `/api/v1/leads/${lead1Id.toString()}`,
      headers: { cookie: owner.cookie },
    });
    expect(resGetLead1.statusCode).toBe(200);
    expect(JSON.parse(resGetLead1.body).stalled).toBe(true);

    const resGetLead2 = await app.inject({
      method: 'GET',
      url: `/api/v1/leads/${lead2Id.toString()}`,
      headers: { cookie: owner.cookie },
    });
    expect(resGetLead2.statusCode).toBe(200);
    expect(JSON.parse(resGetLead2.body).stalled).toBe(false);

    const resGetLead4 = await app.inject({
      method: 'GET',
      url: `/api/v1/leads/${lead4Id.toString()}`,
      headers: { cookie: owner.cookie },
    });
    expect(resGetLead4.statusCode).toBe(200);
    expect(JSON.parse(resGetLead4.body).stalled).toBe(false);

    // List all leads: check stalled projections
    const resAll = await app.inject({
      method: 'GET',
      url: '/api/v1/leads',
      headers: { cookie: owner.cookie },
    });
    expect(resAll.statusCode).toBe(200);
    const allBody = JSON.parse(resAll.body);
    expect(allBody.items).toHaveLength(4);

    // Filter: GET /leads?stalled=true (should return Lead 1 and Lead 3)
    const resStalledTrue = await app.inject({
      method: 'GET',
      url: '/api/v1/leads?stalled=true',
      headers: { cookie: owner.cookie },
    });
    expect(resStalledTrue.statusCode).toBe(200);
    const stalledTrueBody = JSON.parse(resStalledTrue.body);
    expect(stalledTrueBody.items).toHaveLength(2);
    const stalledIds = stalledTrueBody.items.map((i: { id: string }) => i.id);
    expect(stalledIds).toContain(lead1Id.toString());
    expect(stalledIds).toContain(lead3Id.toString());

    // Filter: GET /leads?stalled=false (should return Lead 2 and Lead 4)
    const resStalledFalse = await app.inject({
      method: 'GET',
      url: '/api/v1/leads?stalled=false',
      headers: { cookie: owner.cookie },
    });
    expect(resStalledFalse.statusCode).toBe(200);
    const stalledFalseBody = JSON.parse(resStalledFalse.body);
    expect(stalledFalseBody.items).toHaveLength(2);
    const nonStalledIds = stalledFalseBody.items.map((i: { id: string }) => i.id);
    expect(nonStalledIds).toContain(lead2Id.toString());
    expect(nonStalledIds).toContain(lead4Id.toString());
  });
});

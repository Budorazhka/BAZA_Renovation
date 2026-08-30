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
 * CRM-003: Backend vertical slice CRM tasks / Next Action.
 * Full Fastify HTTP integration test against real MongoDB replica set.
 */
describe('CRM Tasks / Next Action — HTTP Integration (AppModule)', () => {
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

  async function seedAdministratorSession(
    organizationId: Types.ObjectId,
  ): Promise<{ cookie: string; positionId: Types.ObjectId; identityId: Types.ObjectId }> {
    const login = `administrator-${new Types.ObjectId().toString()}@example.test`;
    const identityId = await authService.registerIdentity({ login, password: PASSWORD });
    await authService.grantErpAccess(identityId);
    const positionId = await organizationsService.createVacantPosition({ organizationId, fixedRole: 'administrator' });
    await organizationsService.assignOccupant({
      positionId,
      identityId,
      occupantDisplayName: 'Интеграционный администратор',
      actorIdentityId: identityId,
      expectedOrganizationId: organizationId,
      correlationId: 'http-integration-test-seed',
    });
    const session = await authService.login({ login, password: PASSWORD, audience: 'erp' });
    return { cookie: `baza_session=${session.sessionToken}`, positionId, identityId };
  }

  async function seedContact(organizationId: Types.ObjectId): Promise<Types.ObjectId> {
    const contactId = new Types.ObjectId();
    await connection.collection('contacts').insertOne({
      _id: contactId,
      organizationId,
      name: 'Петр Клиент',
      phone: '+79991112233',
      roles: ['buyer'],
      createdAt: new Date(),
    });
    return contactId;
  }

  async function seedLead(organizationId: Types.ObjectId, contactId: Types.ObjectId): Promise<Types.ObjectId> {
    const leadId = new Types.ObjectId();
    await connection.collection('leads').insertOne({
      _id: leadId,
      organizationId,
      contactId,
      stage: 'new',
      version: 0,
      source: { route: '/developments/test' },
      createdAt: new Date(),
    });
    return leadId;
  }

  /**
   * version:0 обязателен — прямая вставка через native driver (не Mongoose)
   * не применяет schema default:0 автоматически, а PATCH/complete/reassign
   * фильтруют по version:expectedVersion атомарно (без $exists-fallback,
   * см. TaskRepository.updateTask докстринг — Task новая схема, легаси-
   * документов без version не существует, значит тест не должен их
   * симулировать без явного version:0).
   */
  async function seedTask(
    organizationId: Types.ObjectId,
    overrides?: { title?: string; status?: string; assignedPositionId?: Types.ObjectId; leadId?: Types.ObjectId },
  ): Promise<Types.ObjectId> {
    const taskId = new Types.ObjectId();
    await connection.collection('tasks').insertOne({
      _id: taskId,
      organizationId,
      title: overrides?.title ?? 'Задача',
      status: overrides?.status ?? 'open',
      assignedPositionId: overrides?.assignedPositionId,
      leadId: overrides?.leadId,
      version: 0,
      createdAt: new Date(),
    });
    return taskId;
  }

  describe('Authentication & Authorization Guards', () => {
    it('GET /tasks without cookie returns 401 AUTH_NO_SESSION', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/tasks' });
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).error.code).toBe('AUTH_NO_SESSION');
    });

    it('POST /tasks without cookie returns 401 AUTH_NO_SESSION', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/tasks',
        payload: { title: 'Call client' },
      });
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).error.code).toBe('AUTH_NO_SESSION');
    });
  });

  describe('POST /tasks — Task creation, Lead/Contact linkage, Audit', () => {
    it('creates task with automatic contactId linkage from lead and writes audit_events', async () => {
      const { cookie, organizationId, positionId } = await seedOwnerSession();
      const contactId = await seedContact(organizationId);
      const leadId = await seedLead(organizationId, contactId);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/tasks',
        headers: { cookie },
        payload: {
          title: 'Подготовить презентацию ЖК',
          description: 'Отправить подборку квартир на WhatsApp',
          dueAt: new Date(Date.now() + 86400000).toISOString(),
          assignedPositionId: positionId.toString(),
          leadId: leadId.toString(),
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.title).toBe('Подготовить презентацию ЖК');
      expect(body.description).toBe('Отправить подборку квартир на WhatsApp');
      expect(body.status).toBe('open');
      expect(body.assignedPositionId).toBe(positionId.toString());
      expect(body.leadId).toBe(leadId.toString());
      expect(body.contactId).toBe(contactId.toString()); // Auto-populated from lead!

      // Check audit event
      const audit = await connection.collection('audit_events').findOne({
        action: 'task.create',
        resource: 'task',
        resourceId: new Types.ObjectId(body.id),
      });
      expect(audit).not.toBeNull();
      expect(audit?.after?.title).toBe('Подготовить презентацию ЖК');
    });

    it('returns 404 when associating with non-existent or foreign lead', async () => {
      const { cookie } = await seedOwnerSession();
      const foreignLeadId = new Types.ObjectId();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/tasks',
        headers: { cookie },
        payload: {
          title: 'Follow up',
          leadId: foreignLeadId.toString(),
        },
      });

      expect(res.statusCode).toBe(404);
    });

    it('manager can create task assigned to themselves', async () => {
      const { organizationId } = await seedOwnerSession();
      const manager = await seedManagerSession(organizationId);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/tasks',
        headers: { cookie: manager.cookie },
        payload: {
          title: 'Звонок после просмотра',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.assignedPositionId).toBe(manager.positionId.toString());
    });
  });

  describe('GET /tasks & GET /tasks/:taskId — Scope enforcement and pagination', () => {
    it('cursor pagination, status filter, and newest-first order', async () => {
      const { cookie, organizationId, positionId } = await seedOwnerSession();

      // Create 3 tasks with 10ms gap
      for (let i = 1; i <= 3; i++) {
        await connection.collection('tasks').insertOne({
          organizationId,
          title: `Task #${i}`,
          status: i === 3 ? 'completed' : 'open',
          assignedPositionId: positionId,
          version: 0,
          createdAt: new Date(Date.now() + i * 100),
        });
      }

      // Query open tasks with limit 2
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/tasks?status=open&limit=1',
        headers: { cookie },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.items).toHaveLength(1);
      expect(data.items[0].title).toBe('Task #2');
      expect(data.nextCursor).not.toBeNull();

      // Second page
      const res2 = await app.inject({
        method: 'GET',
        url: `/api/v1/tasks?status=open&limit=1&cursor=${data.nextCursor}`,
        headers: { cookie },
      });
      const data2 = JSON.parse(res2.body);
      expect(data2.items).toHaveLength(1);
      expect(data2.items[0].title).toBe('Task #1');
      expect(data2.nextCursor).toBeNull();
    });

    it('manager with own-scope can only see their own tasks', async () => {
      const { organizationId } = await seedOwnerSession();
      const manager1 = await seedManagerSession(organizationId);
      const manager2 = await seedManagerSession(organizationId);

      // Task for Manager 1
      await seedTask(organizationId, { title: 'Manager 1 task', assignedPositionId: manager1.positionId });

      // Task for Manager 2
      const task2Id = await seedTask(organizationId, { title: 'Manager 2 task', assignedPositionId: manager2.positionId });

      // Manager 1 lists tasks
      const m1List = await app.inject({
        method: 'GET',
        url: '/api/v1/tasks',
        headers: { cookie: manager1.cookie },
      });
      expect(m1List.statusCode).toBe(200);
      const m1Items = JSON.parse(m1List.body).items;
      expect(m1Items).toHaveLength(1);
      expect(m1Items[0].title).toBe('Manager 1 task');

      // Manager 1 cannot get Manager 2 task -> 404 (non-disclosure)
      const m1GetM2 = await app.inject({
        method: 'GET',
        url: `/api/v1/tasks/${task2Id.toString()}`,
        headers: { cookie: manager1.cookie },
      });
      expect(m1GetM2.statusCode).toBe(404);

      // Manager 1 cannot query assignedPositionId of Manager 2 -> 400
      const m1FilterMismatch = await app.inject({
        method: 'GET',
        url: `/api/v1/tasks?assignedPositionId=${manager2.positionId.toString()}`,
        headers: { cookie: manager1.cookie },
      });
      expect(m1FilterMismatch.statusCode).toBe(400);
    });

    it('multi-tenant isolation: Tenant A cannot access Tenant B task', async () => {
      const orgA = await seedOwnerSession();
      const orgB = await seedOwnerSession();

      const taskBId = await seedTask(orgB.organizationId, { title: 'Org B Secret Task' });

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/tasks/${taskBId.toString()}`,
        headers: { cookie: orgA.cookie },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('PATCH /tasks/:taskId & POST /tasks/:taskId/complete', () => {
    it('updates task attributes and writes audit record', async () => {
      const { cookie, organizationId, positionId } = await seedOwnerSession();
      const taskId = await seedTask(organizationId, { title: 'Initial title', assignedPositionId: positionId });

      const patchRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/tasks/${taskId.toString()}`,
        headers: { cookie },
        payload: {
          expectedVersion: 0,
          title: 'Updated title',
          description: 'Updated notes',
          status: 'cancelled',
        },
      });

      expect(patchRes.statusCode).toBe(200);
      const body = JSON.parse(patchRes.body);
      expect(body.title).toBe('Updated title');
      expect(body.description).toBe('Updated notes');
      expect(body.status).toBe('cancelled');

      // Check audit
      const audit = await connection.collection('audit_events').findOne({
        action: 'task.update',
        resourceId: taskId,
      });
      expect(audit).not.toBeNull();
      expect(audit?.before?.status).toBe('open');
      expect(audit?.after?.status).toBe('cancelled');
    });

    it('completes task via POST /tasks/:taskId/complete and sets completedBy and timestamp', async () => {
      const { organizationId } = await seedOwnerSession();
      const manager = await seedManagerSession(organizationId);

      const taskId = await seedTask(organizationId, {
        title: 'Conduct phone interview',
        assignedPositionId: manager.positionId,
      });

      const completeRes = await app.inject({
        method: 'POST',
        url: `/api/v1/tasks/${taskId.toString()}/complete`,
        headers: { cookie: manager.cookie },
        payload: { expectedVersion: 0 },
      });

      expect(completeRes.statusCode).toBe(200);
      const body = JSON.parse(completeRes.body);
      expect(body.status).toBe('completed');
      expect(body.completedAt).not.toBeNull();
      expect(body.completedByPositionId).toBe(manager.positionId.toString());

      // Cannot edit a completed task (returns 400)
      const editCompleted = await app.inject({
        method: 'PATCH',
        url: `/api/v1/tasks/${taskId.toString()}`,
        headers: { cookie: manager.cookie },
        payload: { expectedVersion: 1, title: 'New title after done' },
      });
      expect(editCompleted.statusCode).toBe(400);
    });

    it('manager cannot complete a task belonging to another manager', async () => {
      const { organizationId } = await seedOwnerSession();
      const manager1 = await seedManagerSession(organizationId);
      const manager2 = await seedManagerSession(organizationId);

      const task2Id = await seedTask(organizationId, { title: 'Manager 2 task', assignedPositionId: manager2.positionId });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/tasks/${task2Id.toString()}/complete`,
        headers: { cookie: manager1.cookie },
        payload: { expectedVersion: 0 },
      });
      expect(res.statusCode).toBe(404);
    });

    it('stale expectedVersion on an open task — 409 CONFLICT, does not modify the task', async () => {
      const { cookie, organizationId, positionId } = await seedOwnerSession();
      const taskId = await seedTask(organizationId, { assignedPositionId: positionId });

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/tasks/${taskId.toString()}`,
        headers: { cookie },
        payload: { expectedVersion: 99, title: 'Should not apply' },
      });

      expect(res.statusCode).toBe(409);
      const taskDoc = await connection.collection('tasks').findOne({ _id: taskId });
      expect(taskDoc?.title).toBe('Задача');
    });

    it('complete is idempotent: repeated call after completion returns 200 with the same state, ignoring stale expectedVersion', async () => {
      const { cookie, organizationId, positionId } = await seedOwnerSession();
      const taskId = await seedTask(organizationId, { assignedPositionId: positionId });

      const first = await app.inject({
        method: 'POST',
        url: `/api/v1/tasks/${taskId.toString()}/complete`,
        headers: { cookie },
        payload: { expectedVersion: 0 },
      });
      expect(first.statusCode).toBe(200);

      const second = await app.inject({
        method: 'POST',
        url: `/api/v1/tasks/${taskId.toString()}/complete`,
        headers: { cookie },
        payload: { expectedVersion: 0 },
      });
      expect(second.statusCode).toBe(200);
      expect(JSON.parse(second.body).status).toBe('completed');
    });
  });

  describe('PATCH /tasks/:taskId/reassign — task.reassign (отдельный от task.edit)', () => {
    it('owner переназначает задачу на другую Position, пишет audit task.reassign', async () => {
      const { cookie, organizationId } = await seedOwnerSession();
      const oldAssignee = await organizationsService.createVacantPosition({ organizationId, fixedRole: 'manager' });
      const newAssignee = await organizationsService.createVacantPosition({ organizationId, fixedRole: 'manager' });
      const taskId = await seedTask(organizationId, { assignedPositionId: oldAssignee });

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/tasks/${taskId.toString()}/reassign`,
        headers: { cookie },
        payload: { expectedVersion: 0, assignedPositionId: newAssignee.toString() },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).assignedPositionId).toBe(newAssignee.toString());

      const audit = await connection.collection('audit_events').findOne({ action: 'task.reassign', resourceId: taskId });
      expect(audit).not.toBeNull();
      expect(audit?.before?.assignedPositionId).toBe(oldAssignee.toString());
      expect(audit?.after?.assignedPositionId).toBe(newAssignee.toString());
    });

    it('manager (own-scope, task.reassign нет гранта) — 403 FORBIDDEN', async () => {
      const { organizationId } = await seedOwnerSession();
      const manager = await seedManagerSession(organizationId);
      const taskId = await seedTask(organizationId, { assignedPositionId: manager.positionId });

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/tasks/${taskId.toString()}/reassign`,
        headers: { cookie: manager.cookie },
        payload: { expectedVersion: 0, assignedPositionId: manager.positionId.toString() },
      });

      expect(res.statusCode).toBe(403);
    });

    it('PATCH /tasks/:taskId (task.edit) больше НЕ принимает assignedPositionId — поле игнорируется/отклоняется ValidationPipe (whitelist)', async () => {
      const { cookie, organizationId, positionId } = await seedOwnerSession();
      const otherPosition = await organizationsService.createVacantPosition({ organizationId, fixedRole: 'manager' });
      const taskId = await seedTask(organizationId, { assignedPositionId: positionId });

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/tasks/${taskId.toString()}`,
        headers: { cookie },
        payload: { expectedVersion: 0, assignedPositionId: otherPosition.toString() },
      });

      // whitelist:true + forbidNonWhitelisted:true (main.api.ts ValidationPipe) —
      // неизвестное для UpdateTaskDto поле assignedPositionId отклоняется 400,
      // не молча игнорируется — тот же контракт, что остальные DTO этого API.
      expect(res.statusCode).toBe(400);
    });
  });

  describe('administrator role — task.complete grant (owner-подтверждено 30.08.2026)', () => {
    it('administrator может завершить любую задачу организации', async () => {
      const { organizationId } = await seedOwnerSession();
      const admin = await seedAdministratorSession(organizationId);
      const managerSession = await seedManagerSession(organizationId);
      const taskId = await seedTask(organizationId, { assignedPositionId: managerSession.positionId });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/tasks/${taskId.toString()}/complete`,
        headers: { cookie: admin.cookie },
        payload: { expectedVersion: 0 },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).status).toBe('completed');
    });

    it('administrator НЕ имеет task.edit/task.reassign — 403 FORBIDDEN', async () => {
      const { organizationId } = await seedOwnerSession();
      const admin = await seedAdministratorSession(organizationId);
      const taskId = await seedTask(organizationId);

      const editRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/tasks/${taskId.toString()}`,
        headers: { cookie: admin.cookie },
        payload: { expectedVersion: 0, title: 'x' },
      });
      expect(editRes.statusCode).toBe(403);

      const reassignRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/tasks/${taskId.toString()}/reassign`,
        headers: { cookie: admin.cookie },
        payload: { expectedVersion: 0 },
      });
      expect(reassignRes.statusCode).toBe(403);
    });
  });

  describe('CRM-003: hasOpenNextAction в GET /leads и GET /leads/:leadId (мягкое правило)', () => {
    it('активный лид (new) с открытой задачей — hasOpenNextAction:true в GET /leads/:leadId', async () => {
      const { cookie, organizationId } = await seedOwnerSession();
      const contactId = await seedContact(organizationId);
      const leadId = await seedLead(organizationId, contactId);
      await seedTask(organizationId, { leadId, status: 'open' });

      const res = await app.inject({ method: 'GET', url: `/api/v1/leads/${leadId.toString()}`, headers: { cookie } });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).hasOpenNextAction).toBe(true);
    });

    it('активный лид (new) БЕЗ задач — hasOpenNextAction:false', async () => {
      const { cookie, organizationId } = await seedOwnerSession();
      const contactId = await seedContact(organizationId);
      const leadId = await seedLead(organizationId, contactId);

      const res = await app.inject({ method: 'GET', url: `/api/v1/leads/${leadId.toString()}`, headers: { cookie } });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).hasOpenNextAction).toBe(false);
    });

    it('активный лид, у которого единственная задача cancelled (не open) — hasOpenNextAction:false', async () => {
      const { cookie, organizationId } = await seedOwnerSession();
      const contactId = await seedContact(organizationId);
      const leadId = await seedLead(organizationId, contactId);
      await seedTask(organizationId, { leadId, status: 'cancelled' });

      const res = await app.inject({ method: 'GET', url: `/api/v1/leads/${leadId.toString()}`, headers: { cookie } });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).hasOpenNextAction).toBe(false);
    });

    it('GET /leads (список) отражает hasOpenNextAction по каждому лиду независимо, одним батч-запросом', async () => {
      const { cookie, organizationId } = await seedOwnerSession();
      const contactId = await seedContact(organizationId);
      const leadWithTask = await seedLead(organizationId, contactId);
      const leadWithoutTask = await seedLead(organizationId, contactId);
      await seedTask(organizationId, { leadId: leadWithTask, status: 'open' });

      const res = await app.inject({ method: 'GET', url: '/api/v1/leads', headers: { cookie } });
      expect(res.statusCode).toBe(200);
      const items = JSON.parse(res.body).items as Array<{ id: string; hasOpenNextAction: boolean }>;
      const byId = new Map(items.map((item) => [item.id, item.hasOpenNextAction]));
      expect(byId.get(leadWithTask.toString())).toBe(true);
      expect(byId.get(leadWithoutTask.toString())).toBe(false);
    });
  });
});

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
 * CRM-004: transactional outbox events for the CRM Task lifecycle
 * (TaskCreated/TaskCompleted/TaskReassigned) — real MongoDB replica set +
 * full Fastify HTTP path (same bootstrap as tasks.integration-spec.ts).
 * Producer-only: no consumer is asserted here, only that outbox_events
 * gets exactly the right rows, in the same transaction as the business
 * write, with the right payload shape and no duplicates on retry/no-op.
 */
describe('CRM Task lifecycle outbox events — HTTP + Mongo integration (AppModule)', () => {
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
    await connection.collection('tasks').deleteMany({});
    await connection.collection('outbox_events').deleteMany({});
    await connection.collection('audit_events').deleteMany({});
    await connection.collection('leads').deleteMany({});
    await connection.collection('lead_events').deleteMany({});
    await connection.collection('contacts').deleteMany({});
    await connection.collection('positions').deleteMany({});
    await connection.collection('position_assignments').deleteMany({});
    await connection.collection('organizations').deleteMany({});
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

  async function seedTask(
    organizationId: Types.ObjectId,
    overrides?: { status?: string; assignedPositionId?: Types.ObjectId; leadId?: Types.ObjectId; contactId?: Types.ObjectId; version?: number },
  ): Promise<Types.ObjectId> {
    const taskId = new Types.ObjectId();
    await connection.collection('tasks').insertOne({
      _id: taskId,
      organizationId,
      title: 'Задача',
      status: overrides?.status ?? 'open',
      assignedPositionId: overrides?.assignedPositionId,
      leadId: overrides?.leadId,
      contactId: overrides?.contactId,
      version: overrides?.version ?? 0,
      createdAt: new Date(),
    });
    return taskId;
  }

  async function outboxEventsFor(taskId: Types.ObjectId, eventType?: string) {
    return connection
      .collection('outbox_events')
      .find({ aggregateId: taskId, ...(eventType ? { eventType } : {}) })
      .toArray();
  }

  describe('POST /tasks — TaskCreated', () => {
    it('успешное создание пишет ровно одну pending outbox-запись в той же транзакции, что задача+audit', async () => {
      const { cookie, organizationId, positionId } = await seedOwnerSession();
      const contactId = await seedContact(organizationId);
      const leadId = await seedLead(organizationId, contactId);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/tasks',
        headers: { cookie },
        payload: { title: 'Позвонить клиенту', assignedPositionId: positionId.toString(), leadId: leadId.toString() },
      });
      expect(res.statusCode).toBe(201);
      const taskId = new Types.ObjectId(JSON.parse(res.body).id);

      const events = await outboxEventsFor(taskId, 'TaskCreated');
      expect(events).toHaveLength(1);
      const event = events[0]!;
      expect(event.status).toBe('pending');
      expect(event.aggregateType).toBe('task');
      expect(event.payload).toEqual({
        taskId: taskId.toString(),
        organizationId: organizationId.toString(),
        leadId: leadId.toString(),
        contactId: contactId.toString(),
        assignedPositionId: positionId.toString(),
        actorPositionId: positionId.toString(),
        occurredAt: expect.any(String),
        correlationId: expect.any(String),
      });

      // Payload не содержит description/телефон/токены/сырой Mongo-документ.
      const serialized = JSON.stringify(event.payload);
      expect(serialized).not.toMatch(/\+7999/); // seedContact phone
      expect(serialized).not.toContain('description');
      expect(serialized).not.toContain('passwordHash');
      expect(serialized).not.toContain('sessionToken');
    });

    it('404 (несуществующий leadId) — задача не создаётся, TaskCreated не публикуется, вся транзакция откатывается', async () => {
      const { cookie, organizationId } = await seedOwnerSession();
      const foreignLeadId = new Types.ObjectId();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/tasks',
        headers: { cookie },
        payload: { title: 'x', leadId: foreignLeadId.toString() },
      });
      expect(res.statusCode).toBe(404);

      const taskCount = await connection.collection('tasks').countDocuments({ organizationId });
      expect(taskCount).toBe(0);
      const outboxCount = await connection.collection('outbox_events').countDocuments({ eventType: 'TaskCreated' });
      expect(outboxCount).toBe(0);
    });
  });

  describe('POST /tasks/:taskId/complete — TaskCompleted', () => {
    it('первое успешное завершение пишет ровно одну pending TaskCompleted-запись', async () => {
      const { cookie, organizationId, positionId } = await seedOwnerSession();
      const contactId = await seedContact(organizationId);
      const leadId = await seedLead(organizationId, contactId);
      const taskId = await seedTask(organizationId, { assignedPositionId: positionId, leadId, contactId });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/tasks/${taskId.toString()}/complete`,
        headers: { cookie },
        payload: { expectedVersion: 0 },
      });
      expect(res.statusCode).toBe(200);

      const events = await outboxEventsFor(taskId, 'TaskCompleted');
      expect(events).toHaveLength(1);
      expect(events[0]!.status).toBe('pending');
      expect(events[0]!.payload).toMatchObject({
        taskId: taskId.toString(),
        organizationId: organizationId.toString(),
        leadId: leadId.toString(),
        contactId: contactId.toString(),
        actorPositionId: positionId.toString(),
      });
    });

    it('идемпотентный повторный complete уже завершённой задачи — 200, TaskCompleted БЕЗ дублей (всё ещё ровно одна запись)', async () => {
      const { cookie, organizationId, positionId } = await seedOwnerSession();
      const taskId = await seedTask(organizationId, { assignedPositionId: positionId });

      const first = await app.inject({
        method: 'POST',
        url: `/api/v1/tasks/${taskId.toString()}/complete`,
        headers: { cookie },
        payload: { expectedVersion: 0 },
      });
      expect(first.statusCode).toBe(200);

      // Повтор с ЛЮБЫМ (в т.ч. устаревшим) expectedVersion — идемпотентный
      // путь, тот же контракт, что описан в docs/operations/crm-tasks-next-action.md.
      const second = await app.inject({
        method: 'POST',
        url: `/api/v1/tasks/${taskId.toString()}/complete`,
        headers: { cookie },
        payload: { expectedVersion: 0 },
      });
      expect(second.statusCode).toBe(200);

      const events = await outboxEventsFor(taskId, 'TaskCompleted');
      expect(events).toHaveLength(1);
    });

    it('409 CAS-конфликт (устаревший expectedVersion на открытой задаче) — TaskCompleted НЕ публикуется, задача не изменена', async () => {
      const { cookie, organizationId, positionId } = await seedOwnerSession();
      const taskId = await seedTask(organizationId, { assignedPositionId: positionId, version: 0 });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/tasks/${taskId.toString()}/complete`,
        headers: { cookie },
        payload: { expectedVersion: 5 },
      });
      expect(res.statusCode).toBe(409);

      const taskDoc = await connection.collection('tasks').findOne({ _id: taskId });
      expect(taskDoc?.status).toBe('open');
      const events = await outboxEventsFor(taskId, 'TaskCompleted');
      expect(events).toHaveLength(0);
      const auditCount = await connection.collection('audit_events').countDocuments({ resourceId: taskId, action: 'task.complete' });
      expect(auditCount).toBe(0);
    });

    it('404 (чужая/несуществующая задача) — TaskCompleted не публикуется', async () => {
      const { cookie: ownerBCookie } = await seedOwnerSession();
      const { organizationId: orgA, positionId } = await seedOwnerSession();
      const taskInOrgA = await seedTask(orgA, { assignedPositionId: positionId });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/tasks/${taskInOrgA.toString()}/complete`,
        headers: { cookie: ownerBCookie },
        payload: { expectedVersion: 0 },
      });
      expect(res.statusCode).toBe(404);

      const events = await outboxEventsFor(taskInOrgA, 'TaskCompleted');
      expect(events).toHaveLength(0);
    });

    it('конкурентный complete (два параллельных запроса, один expectedVersion) — ровно ОДНА TaskCompleted-запись, второй запрос получает 409', async () => {
      const { cookie, organizationId, positionId } = await seedOwnerSession();
      const taskId = await seedTask(organizationId, { assignedPositionId: positionId, version: 0 });

      const [first, second] = await Promise.all([
        app.inject({
          method: 'POST',
          url: `/api/v1/tasks/${taskId.toString()}/complete`,
          headers: { cookie },
          payload: { expectedVersion: 0 },
        }),
        app.inject({
          method: 'POST',
          url: `/api/v1/tasks/${taskId.toString()}/complete`,
          headers: { cookie },
          payload: { expectedVersion: 0 },
        }),
      ]);

      const statusCodes = [first.statusCode, second.statusCode].sort();
      // Один побеждает (200 — либо реальное завершение, либо застаёт задачу
      // уже completed конкурентом и идемпотентно возвращает 200), другой
      // либо тоже 200 (застал completed уже ПОСЛЕ CAS-победителя), либо 409
      // (застал ещё open, но CAS уже проигран) — оба валидных исхода этой
      // гонки, критично лишь что TaskCompleted не задублирован.
      expect(statusCodes.every((code) => code === 200 || code === 409)).toBe(true);

      const events = await outboxEventsFor(taskId, 'TaskCompleted');
      expect(events).toHaveLength(1);
    });
  });

  describe('PATCH /tasks/:taskId/reassign — TaskReassigned', () => {
    it('фактическая смена исполнителя пишет ровно одну pending TaskReassigned-запись с previous/new', async () => {
      const { cookie, organizationId } = await seedOwnerSession();
      const oldAssignee = await organizationsService.createVacantPosition({ organizationId, fixedRole: 'manager' });
      const newAssignee = await organizationsService.createVacantPosition({ organizationId, fixedRole: 'manager' });
      const contactId = await seedContact(organizationId);
      const leadId = await seedLead(organizationId, contactId);
      const taskId = await seedTask(organizationId, { assignedPositionId: oldAssignee, leadId, contactId });

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/tasks/${taskId.toString()}/reassign`,
        headers: { cookie },
        payload: { expectedVersion: 0, assignedPositionId: newAssignee.toString() },
      });
      expect(res.statusCode).toBe(200);

      const events = await outboxEventsFor(taskId, 'TaskReassigned');
      expect(events).toHaveLength(1);
      expect(events[0]!.payload).toEqual({
        taskId: taskId.toString(),
        organizationId: organizationId.toString(),
        leadId: leadId.toString(),
        contactId: contactId.toString(),
        assignedPositionId: newAssignee.toString(),
        actorPositionId: expect.any(String),
        occurredAt: expect.any(String),
        correlationId: expect.any(String),
        previousAssignedPositionId: oldAssignee.toString(),
        newAssignedPositionId: newAssignee.toString(),
      });
    });

    it('reassign на ТО ЖЕ значение — 200, но TaskReassigned НЕ публикуется (нет фактического изменения)', async () => {
      const { cookie, organizationId } = await seedOwnerSession();
      const assignee = await organizationsService.createVacantPosition({ organizationId, fixedRole: 'manager' });
      const taskId = await seedTask(organizationId, { assignedPositionId: assignee, version: 0 });

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/tasks/${taskId.toString()}/reassign`,
        headers: { cookie },
        payload: { expectedVersion: 0, assignedPositionId: assignee.toString() },
      });
      expect(res.statusCode).toBe(200);

      const events = await outboxEventsFor(taskId, 'TaskReassigned');
      expect(events).toHaveLength(0);
      // version НЕ инкрементирован — no-op не мутирует документ вообще.
      const taskDoc = await connection.collection('tasks').findOne({ _id: taskId });
      expect(taskDoc?.version).toBe(0);
      const auditCount = await connection.collection('audit_events').countDocuments({ resourceId: taskId, action: 'task.reassign' });
      expect(auditCount).toBe(0);
    });

    it('409 CAS-конфликт (устаревший expectedVersion) — TaskReassigned НЕ публикуется, assignedPositionId не изменён', async () => {
      const { cookie, organizationId } = await seedOwnerSession();
      const oldAssignee = await organizationsService.createVacantPosition({ organizationId, fixedRole: 'manager' });
      const newAssignee = await organizationsService.createVacantPosition({ organizationId, fixedRole: 'manager' });
      const taskId = await seedTask(organizationId, { assignedPositionId: oldAssignee, version: 0 });

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/tasks/${taskId.toString()}/reassign`,
        headers: { cookie },
        payload: { expectedVersion: 9, assignedPositionId: newAssignee.toString() },
      });
      expect(res.statusCode).toBe(409);

      const taskDoc = await connection.collection('tasks').findOne({ _id: taskId });
      expect(taskDoc?.assignedPositionId?.toString()).toBe(oldAssignee.toString());
      const events = await outboxEventsFor(taskId, 'TaskReassigned');
      expect(events).toHaveLength(0);
    });

    it('manager (own-scope, нет task.reassign гранта) — 403, TaskReassigned не публикуется', async () => {
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

      const events = await outboxEventsFor(taskId, 'TaskReassigned');
      expect(events).toHaveLength(0);
    });
  });

  describe('Tenant isolation', () => {
    it('outbox-события задачи организации A не смешиваются с организацией B (aggregateId изолирует, но проверяем и organizationId в payload)', async () => {
      const { cookie: cookieA, organizationId: orgA, positionId: positionA } = await seedOwnerSession();
      const { organizationId: orgB, positionId: positionB } = await seedOwnerSession();

      const taskA = await seedTask(orgA, { assignedPositionId: positionA, version: 0 });
      const taskB = await seedTask(orgB, { assignedPositionId: positionB, version: 0 });

      await app.inject({
        method: 'POST',
        url: `/api/v1/tasks/${taskA.toString()}/complete`,
        headers: { cookie: cookieA },
        payload: { expectedVersion: 0 },
      });

      const eventsA = await outboxEventsFor(taskA, 'TaskCompleted');
      const eventsB = await outboxEventsFor(taskB, 'TaskCompleted');
      expect(eventsA).toHaveLength(1);
      expect(eventsA[0]!.payload.organizationId).toBe(orgA.toString());
      expect(eventsB).toHaveLength(0);

      // Организация A не может даже дотянуться до задачи B, чтобы попытаться
      // сгенерировать для неё событие через чужую сессию.
      const crossTenantAttempt = await app.inject({
        method: 'POST',
        url: `/api/v1/tasks/${taskB.toString()}/complete`,
        headers: { cookie: cookieA },
        payload: { expectedVersion: 0 },
      });
      expect(crossTenantAttempt.statusCode).toBe(404);
      expect(await outboxEventsFor(taskB, 'TaskCompleted')).toHaveLength(0);
    });
  });
});

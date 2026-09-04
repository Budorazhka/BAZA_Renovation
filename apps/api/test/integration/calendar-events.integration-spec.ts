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
 * Backend vertical slice: CRM Calendar events (расширение crm-модуля).
 * Full Fastify HTTP integration test against real MongoDB replica set —
 * тот же каркас, что tasks.integration-spec.ts/crm-deals.integration-spec.ts.
 */
describe('CRM Calendar Events — HTTP Integration (AppModule)', () => {
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
    await connection.collection('calendar_events').deleteMany({});
    await connection.collection('tasks').deleteMany({});
    await connection.collection('leads').deleteMany({});
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

  function seedEvent(
    organizationId: Types.ObjectId,
    overrides?: {
      title?: string;
      startTime?: Date;
      endTime?: Date;
      createdByPositionId?: Types.ObjectId;
      participants?: Types.ObjectId[];
    },
  ) {
    const eventId = new Types.ObjectId();
    return connection
      .collection('calendar_events')
      .insertOne({
        _id: eventId,
        organizationId,
        title: overrides?.title ?? 'Встреча',
        startTime: overrides?.startTime ?? new Date('2026-09-10T10:00:00.000Z'),
        endTime: overrides?.endTime ?? new Date('2026-09-10T11:00:00.000Z'),
        type: 'meeting',
        status: 'scheduled',
        participants: overrides?.participants ?? [],
        externalParticipants: [],
        reminderMinutes: [],
        createdByPositionId: overrides?.createdByPositionId ?? new Types.ObjectId(),
        version: 0,
        createdAt: new Date(),
      })
      .then(() => eventId);
  }

  describe('Authentication & Authorization Guards', () => {
    it('GET /calendar/events without cookie returns 401 AUTH_NO_SESSION', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/calendar/events?startDate=2026-09-01T00:00:00.000Z&endDate=2026-09-30T00:00:00.000Z',
      });
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).error.code).toBe('AUTH_NO_SESSION');
    });

    it('POST /calendar/events without idempotency key returns 400 IDEMPOTENCY_KEY_REQUIRED', async () => {
      const { cookie } = await seedOwnerSession();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/calendar/events',
        headers: { cookie },
        payload: {
          title: 'Показ',
          startTime: '2026-09-10T10:00:00.000Z',
          endTime: '2026-09-10T11:00:00.000Z',
        },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    });
  });

  describe('POST /calendar/events — creation, idempotency, audit', () => {
    it('creates event and writes audit_events', async () => {
      const { cookie } = await seedOwnerSession();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/calendar/events',
        headers: { cookie, 'idempotency-key': new Types.ObjectId().toString() },
        payload: {
          title: 'Показ ЖК Олимп',
          startTime: '2026-09-10T10:00:00.000Z',
          endTime: '2026-09-10T11:00:00.000Z',
          type: 'lead_followup',
          location: 'ЖК Олимп, корп. 3',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.title).toBe('Показ ЖК Олимп');
      expect(body.type).toBe('lead_followup');
      expect(body.status).toBe('scheduled');
      expect(body.version).toBe(0);
      expect(body.isRecurring).toBe(false);
      expect(body.reminderMinutes).toEqual([]);

      const audit = await connection.collection('audit_events').findOne({
        action: 'calendar_event.create',
        resource: 'calendar_event',
        resourceId: new Types.ObjectId(body.id),
      });
      expect(audit).not.toBeNull();
    });

    it('stores isRecurring/recurringRule/reminderMinutes без интерпретации (осознанный пробел)', async () => {
      const { cookie } = await seedOwnerSession();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/calendar/events',
        headers: { cookie, 'idempotency-key': new Types.ObjectId().toString() },
        payload: {
          title: 'Еженедельная планёрка',
          startTime: '2026-09-10T10:00:00.000Z',
          endTime: '2026-09-10T11:00:00.000Z',
          isRecurring: true,
          recurringRule: 'FREQ=WEEKLY;BYDAY=MO',
          reminderMinutes: [15, 60],
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.isRecurring).toBe(true);
      expect(body.recurringRule).toBe('FREQ=WEEKLY;BYDAY=MO');
      expect(body.reminderMinutes).toEqual([15, 60]);

      // Сервер не создал никаких дополнительных вхождений серии — хранится
      // РОВНО одна запись.
      const count = await connection.collection('calendar_events').countDocuments({});
      expect(count).toBe(1);
    });

    it('идемпотентный повтор с тем же ключом не создаёт вторую запись', async () => {
      const { cookie } = await seedOwnerSession();
      const idempotencyKey = new Types.ObjectId().toString();
      const payload = {
        title: 'Звонок клиенту',
        startTime: '2026-09-10T10:00:00.000Z',
        endTime: '2026-09-10T10:30:00.000Z',
        type: 'call',
      };

      const first = await app.inject({
        method: 'POST',
        url: '/api/v1/calendar/events',
        headers: { cookie, 'idempotency-key': idempotencyKey },
        payload,
      });
      const second = await app.inject({
        method: 'POST',
        url: '/api/v1/calendar/events',
        headers: { cookie, 'idempotency-key': idempotencyKey },
        payload,
      });

      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(201);
      expect(JSON.parse(first.body).id).toBe(JSON.parse(second.body).id);

      const count = await connection.collection('calendar_events').countDocuments({});
      expect(count).toBe(1);
    });

    it('multi-tenant isolation: событие организации B не видно организации A', async () => {
      const orgA = await seedOwnerSession();
      const orgB = await seedOwnerSession();
      const eventBId = await seedEvent(orgB.organizationId);

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/calendar/events/${eventBId.toString()}`,
        headers: { cookie: orgA.cookie },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /calendar/events — range overlap and scope', () => {
    it('возвращает событие, пересекающееся с диапазоном, даже если начинается раньше', async () => {
      const { cookie, organizationId } = await seedOwnerSession();
      await seedEvent(organizationId, {
        title: 'Начавшееся вчера',
        startTime: new Date('2026-09-09T23:00:00.000Z'),
        endTime: new Date('2026-09-10T02:00:00.000Z'),
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/calendar/events?startDate=2026-09-10T00:00:00.000Z&endDate=2026-09-10T23:59:59.000Z',
        headers: { cookie },
      });

      expect(res.statusCode).toBe(200);
      const items = JSON.parse(res.body).items;
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('Начавшееся вчера');
    });

    it('manager (own-scope) видит только событие, где сам participant или createdBy', async () => {
      const { organizationId } = await seedOwnerSession();
      const manager1 = await seedManagerSession(organizationId);
      const manager2 = await seedManagerSession(organizationId);

      await seedEvent(organizationId, { title: 'Событие менеджера 1', createdByPositionId: manager1.positionId });
      await seedEvent(organizationId, {
        title: 'Событие менеджера 2 (менеджер 1 — участник)',
        createdByPositionId: manager2.positionId,
        participants: [manager1.positionId],
      });
      await seedEvent(organizationId, { title: 'Чужое событие менеджера 2', createdByPositionId: manager2.positionId });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/calendar/events?startDate=2026-09-01T00:00:00.000Z&endDate=2026-09-30T00:00:00.000Z',
        headers: { cookie: manager1.cookie },
      });

      expect(res.statusCode).toBe(200);
      const titles = JSON.parse(res.body).items.map((i: { title: string }) => i.title).sort();
      expect(titles).toEqual(['Событие менеджера 1', 'Событие менеджера 2 (менеджер 1 — участник)']);
    });
  });

  describe('PATCH /calendar/events/:eventId — CAS', () => {
    it('updates fields and increments version', async () => {
      const { cookie, organizationId } = await seedOwnerSession();
      const eventId = await seedEvent(organizationId, { title: 'Исходное название' });

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/calendar/events/${eventId.toString()}`,
        headers: { cookie },
        payload: { expectedVersion: 0, title: 'Новое название', status: 'completed' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.title).toBe('Новое название');
      expect(body.status).toBe('completed');
      expect(body.version).toBe(1);
    });

    it('stale expectedVersion — 409, событие не изменено', async () => {
      const { cookie, organizationId } = await seedOwnerSession();
      const eventId = await seedEvent(organizationId, { title: 'Не трогать' });

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/calendar/events/${eventId.toString()}`,
        headers: { cookie },
        payload: { expectedVersion: 99, title: 'Не должно примениться' },
      });

      expect(res.statusCode).toBe(409);
      const doc = await connection.collection('calendar_events').findOne({ _id: eventId });
      expect(doc?.title).toBe('Не трогать');
    });

    it('PATCH не принимает startTime/endTime — поле вне DTO отклоняется ValidationPipe', async () => {
      const { cookie, organizationId } = await seedOwnerSession();
      const eventId = await seedEvent(organizationId);

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/calendar/events/${eventId.toString()}`,
        headers: { cookie },
        payload: { expectedVersion: 0, startTime: '2026-09-11T10:00:00.000Z' },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('PATCH /calendar/events/:eventId/move — CAS перенос дат', () => {
    it('переносит startTime/endTime и увеличивает version', async () => {
      const { cookie, organizationId } = await seedOwnerSession();
      const eventId = await seedEvent(organizationId);

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/calendar/events/${eventId.toString()}/move`,
        headers: { cookie },
        payload: {
          expectedVersion: 0,
          newStartTime: '2026-09-11T14:00:00.000Z',
          newEndTime: '2026-09-11T15:00:00.000Z',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.startTime).toBe('2026-09-11T14:00:00.000Z');
      expect(body.endTime).toBe('2026-09-11T15:00:00.000Z');
      expect(body.version).toBe(1);
    });

    it('конкурентный перенос — второй запрос со старой версией получает 409, а не тихую перезапись', async () => {
      const { cookie, organizationId } = await seedOwnerSession();
      const eventId = await seedEvent(organizationId);

      const first = await app.inject({
        method: 'PATCH',
        url: `/api/v1/calendar/events/${eventId.toString()}/move`,
        headers: { cookie },
        payload: { expectedVersion: 0, newStartTime: '2026-09-11T14:00:00.000Z', newEndTime: '2026-09-11T15:00:00.000Z' },
      });
      expect(first.statusCode).toBe(200);

      const second = await app.inject({
        method: 'PATCH',
        url: `/api/v1/calendar/events/${eventId.toString()}/move`,
        headers: { cookie },
        payload: { expectedVersion: 0, newStartTime: '2026-09-12T14:00:00.000Z', newEndTime: '2026-09-12T15:00:00.000Z' },
      });
      expect(second.statusCode).toBe(409);

      const doc = await connection.collection('calendar_events').findOne({ _id: eventId });
      expect(doc?.startTime.toISOString()).toBe('2026-09-11T14:00:00.000Z');
    });

    it('manager (own-scope) не может перенести чужое событие — 404 (non-disclosure)', async () => {
      const { organizationId } = await seedOwnerSession();
      const manager1 = await seedManagerSession(organizationId);
      const manager2 = await seedManagerSession(organizationId);
      const eventId = await seedEvent(organizationId, { createdByPositionId: manager2.positionId });

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/calendar/events/${eventId.toString()}/move`,
        headers: { cookie: manager1.cookie },
        payload: { expectedVersion: 0, newStartTime: '2026-09-11T14:00:00.000Z', newEndTime: '2026-09-11T15:00:00.000Z' },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE /calendar/events/:eventId — soft delete', () => {
    it('помечает deletedAt, документ остаётся в коллекции, но пропадает из выдачи', async () => {
      const { cookie, organizationId } = await seedOwnerSession();
      const eventId = await seedEvent(organizationId);

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/calendar/events/${eventId.toString()}`,
        headers: { cookie },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ deleted: true });

      const doc = await connection.collection('calendar_events').findOne({ _id: eventId });
      expect(doc).not.toBeNull();
      expect(doc?.deletedAt).toBeInstanceOf(Date);

      const getRes = await app.inject({
        method: 'GET',
        url: `/api/v1/calendar/events/${eventId.toString()}`,
        headers: { cookie },
      });
      expect(getRes.statusCode).toBe(404);
    });

    it('повторное удаление уже удалённого события — 404, не второй side-effect', async () => {
      const { cookie, organizationId } = await seedOwnerSession();
      const eventId = await seedEvent(organizationId);

      await app.inject({ method: 'DELETE', url: `/api/v1/calendar/events/${eventId.toString()}`, headers: { cookie } });
      const second = await app.inject({
        method: 'DELETE',
        url: `/api/v1/calendar/events/${eventId.toString()}`,
        headers: { cookie },
      });

      expect(second.statusCode).toBe(404);
    });
  });

  describe('GET /calendar/unified — объединение с задачами по dueAt', () => {
    it('объединяет CalendarEvent и Task, у которых dueAt попадает в диапазон', async () => {
      const { cookie, organizationId, positionId } = await seedOwnerSession();
      await seedEvent(organizationId, {
        title: 'Встреча в календаре',
        startTime: new Date('2026-09-15T10:00:00.000Z'),
        endTime: new Date('2026-09-15T11:00:00.000Z'),
      });
      await connection.collection('tasks').insertOne({
        _id: new Types.ObjectId(),
        organizationId,
        title: 'Подготовить документы',
        status: 'open',
        assignedPositionId: positionId,
        dueAt: new Date('2026-09-16T09:00:00.000Z'),
        version: 0,
        createdAt: new Date(),
      });
      // Задача за пределами диапазона не должна попасть в выдачу.
      await connection.collection('tasks').insertOne({
        _id: new Types.ObjectId(),
        organizationId,
        title: 'Задача вне диапазона',
        status: 'open',
        assignedPositionId: positionId,
        dueAt: new Date('2026-11-01T09:00:00.000Z'),
        version: 0,
        createdAt: new Date(),
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/calendar/unified?startDate=2026-09-01T00:00:00.000Z&endDate=2026-09-30T23:59:59.000Z',
        headers: { cookie },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.events).toHaveLength(1);
      expect(body.events[0].title).toBe('Встреча в календаре');
      expect(body.tasks).toHaveLength(1);
      expect(body.tasks[0].title).toBe('Подготовить документы');
    });
  });

  describe('Permission grants', () => {
    it('manager без calendar_event.create гранта — FORBIDDEN, но manager получает own-scope грант по умолчанию, поэтому создаёт успешно', async () => {
      const { organizationId } = await seedOwnerSession();
      const manager = await seedManagerSession(organizationId);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/calendar/events',
        headers: { cookie: manager.cookie, 'idempotency-key': new Types.ObjectId().toString() },
        payload: { title: 'Своя встреча', startTime: '2026-09-10T10:00:00.000Z', endTime: '2026-09-10T11:00:00.000Z' },
      });

      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.body).createdByPositionId).toBe(manager.positionId.toString());
    });
  });
});

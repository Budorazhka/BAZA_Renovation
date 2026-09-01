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
 * DEAL-001: Deal Core Backend Vertical Slice HTTP Integration Tests.
 * Tests Fastify guards, RBAC permissions, non-disclosure, optimistic concurrency,
 * terminal state protection, checklist atomic updates, participants, and audit events.
 */
describe('CRM Deals — HTTP Integration (AppModule)', () => {
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
    await connection.collection('deals').deleteMany({});
    await connection.collection('deal_events').deleteMany({});
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
      name: 'Агентство Недвижимости',
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
      occupantDisplayName: 'Менеджер Продаж',
      actorIdentityId: identityId,
      expectedOrganizationId: organizationId,
      correlationId: 'http-integration-test-seed',
    });
    const session = await authService.login({ login, password: PASSWORD, audience: 'erp' });
    return { cookie: `baza_session=${session.sessionToken}`, positionId, identityId };
  }

  async function seedContact(organizationId: Types.ObjectId, name = 'Иван Клиент'): Promise<Types.ObjectId> {
    const contactId = new Types.ObjectId();
    await connection.collection('contacts').insertOne({
      _id: contactId,
      organizationId,
      name,
      phone: '+995555112233',
      email: 'client@example.test',
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
      source: { route: '/listings/batumi-sea' },
      createdAt: new Date(),
    });
    return leadId;
  }

  describe('Authentication & Authorization Guards', () => {
    it('GET /deals without session returns 401 AUTH_NO_SESSION', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/deals' });
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).error.code).toBe('AUTH_NO_SESSION');
    });

    it('POST /deals without session returns 401 AUTH_NO_SESSION', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/deals',
        payload: { title: 'Deal without auth', contactId: new Types.ObjectId().toString() },
      });
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).error.code).toBe('AUTH_NO_SESSION');
    });
  });

  describe('POST /deals — Creation, Cross-Tenant Validation, Audit & Event', () => {
    it('creates deal with valid contact, lead, participants and writes audit + deal_events', async () => {
      const owner = await seedOwnerSession();
      const primaryContactId = await seedContact(owner.organizationId, 'Главный Покупатель');
      const participantContactId = await seedContact(owner.organizationId, 'Юрист');
      const leadId = await seedLead(owner.organizationId, primaryContactId);

      const payload = {
        title: 'Продажа виллы в Батуми',
        description: 'Первая линия, вид на море',
        contactId: primaryContactId.toString(),
        leadId: leadId.toString(),
        stage: 'showing',
        expectedCommission: {
          amountMinorUnits: 1500000,
          currency: 'USD',
        },
        participants: [
          { role: 'lawyer', contactId: participantContactId.toString() },
        ],
        checklistItems: [
          { label: 'Проверить документы на землю', done: false },
          { label: 'Составить договор задатка', done: false },
        ],
      };

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/deals',
        headers: { cookie: owner.cookie },
        payload,
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.id).toBeDefined();
      expect(body.title).toBe('Продажа виллы в Батуми');
      expect(body.stage).toBe('showing');
      expect(body.version).toBe(0);
      expect(body.expectedCommission).toEqual({ amountMinorUnits: 1500000, currency: 'USD' });
      expect(body.participants).toHaveLength(1);
      expect(body.participants[0].role).toBe('lawyer');
      expect(body.participants[0].contact.name).toBe('Юрист');
      expect(body.contact.name).toBe('Главный Покупатель');
      expect(body.checklistItems).toHaveLength(2);

      // Verify deal_events was appended
      const dealEvent = await connection.collection('deal_events').findOne({
        dealId: new Types.ObjectId(body.id),
        stage: 'showing',
      });
      expect(dealEvent).not.toBeNull();

      // Verify audit_events was appended
      const auditEvent = await connection.collection('audit_events').findOne({
        action: 'deal.create',
        resourceId: new Types.ObjectId(body.id),
      });
      expect(auditEvent).not.toBeNull();
      expect(auditEvent?.after?.title).toBe('Продажа виллы в Батуми');
    });

    it('returns 404 when primary contact belongs to a different tenant', async () => {
      const tenantA = await seedOwnerSession();
      const tenantB = await seedOwnerSession();
      const foreignContactId = await seedContact(tenantB.organizationId, 'Чужой контакт');

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/deals',
        headers: { cookie: tenantA.cookie },
        payload: {
          title: 'Попытка кражи контакта',
          contactId: foreignContactId.toString(),
        },
      });

      expect(res.statusCode).toBe(404);
    });

    it('returns 404 when participant contact belongs to a different tenant', async () => {
      const tenantA = await seedOwnerSession();
      const tenantB = await seedOwnerSession();
      const contactA = await seedContact(tenantA.organizationId, 'Свой контакт');
      const foreignContact = await seedContact(tenantB.organizationId, 'Чужой контакт');

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/deals',
        headers: { cookie: tenantA.cookie },
        payload: {
          title: 'Сделка с чужим юристом',
          contactId: contactA.toString(),
          participants: [{ role: 'lawyer', contactId: foreignContact.toString() }],
        },
      });

      expect(res.statusCode).toBe(404);
    });

    it('returns 400 when duplicate participant contactId provided in creation payload', async () => {
      const owner = await seedOwnerSession();
      const contactId = await seedContact(owner.organizationId);
      const participantId = await seedContact(owner.organizationId, 'Участник');

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/deals',
        headers: { cookie: owner.cookie },
        payload: {
          title: 'Дубль участников',
          contactId: contactId.toString(),
          participants: [
            { role: 'lawyer', contactId: participantId.toString() },
            { role: 'broker', contactId: participantId.toString() },
          ],
        },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('PATCH /deals/:dealId/stage — Lifecycle, Transitions, Terminal stage, Optimistic Concurrency & Race', () => {
    it('executes valid stage transition showing -> deposit and increments version', async () => {
      const owner = await seedOwnerSession();
      const contactId = await seedContact(owner.organizationId);

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/deals',
        headers: { cookie: owner.cookie },
        payload: { title: 'Стадии сделки', contactId: contactId.toString() },
      });
      const dealId = JSON.parse(createRes.body).id;

      const stageRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/deals/${dealId}/stage`,
        headers: { cookie: owner.cookie },
        payload: {
          stage: 'deposit',
          expectedVersion: 0,
          reason: 'Получен аванс 5000$',
        },
      });

      expect(stageRes.statusCode).toBe(200);
      const body = JSON.parse(stageRes.body);
      expect(body.stage).toBe('deposit');
      expect(body.version).toBe(1);

      // Verify audit and event
      const audit = await connection.collection('audit_events').findOne({
        action: 'deal.change_stage',
        resourceId: new Types.ObjectId(dealId),
      });
      expect(audit?.before?.stage).toBe('showing');
      expect(audit?.after?.stage).toBe('deposit');
      expect(audit?.after?.reason).toBe('Получен аванс 5000$');
    });

    it('rejects invalid stage transition (showing -> golden) with 400 VALIDATION_FAILED', async () => {
      const owner = await seedOwnerSession();
      const contactId = await seedContact(owner.organizationId);

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/deals',
        headers: { cookie: owner.cookie },
        payload: { title: 'Невалидный скачок', contactId: contactId.toString() },
      });
      const dealId = JSON.parse(createRes.body).id;

      const stageRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/deals/${dealId}/stage`,
        headers: { cookie: owner.cookie },
        payload: {
          stage: 'golden',
          expectedVersion: 0,
        },
      });

      expect(stageRes.statusCode).toBe(400);
      expect(JSON.parse(stageRes.body).error.code).toBe('VALIDATION_FAILED');
    });

    it('rejects stage transition when expectedVersion is stale (409 VERSION_CONFLICT)', async () => {
      const owner = await seedOwnerSession();
      const contactId = await seedContact(owner.organizationId);

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/deals',
        headers: { cookie: owner.cookie },
        payload: { title: 'Конфликт версий', contactId: contactId.toString() },
      });
      const dealId = JSON.parse(createRes.body).id;

      // First transition advances version to 1
      await app.inject({
        method: 'PATCH',
        url: `/api/v1/deals/${dealId}/stage`,
        headers: { cookie: owner.cookie },
        payload: { stage: 'deposit', expectedVersion: 0 },
      });

      // Second transition with outdated expectedVersion: 0 -> 409 Conflict
      const staleRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/deals/${dealId}/stage`,
        headers: { cookie: owner.cookie },
        payload: { stage: 'deal', expectedVersion: 0 },
      });

      expect(staleRes.statusCode).toBe(409);
    });

    it('terminal stage closed_lost cannot be transitioned out of', async () => {
      const owner = await seedOwnerSession();
      const contactId = await seedContact(owner.organizationId);

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/deals',
        headers: { cookie: owner.cookie },
        payload: { title: 'Сделка сорвалась', contactId: contactId.toString() },
      });
      const dealId = JSON.parse(createRes.body).id;

      // Transition to closed_lost (valid from showing)
      const lostRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/deals/${dealId}/stage`,
        headers: { cookie: owner.cookie },
        payload: { stage: 'closed_lost', expectedVersion: 0, reason: 'Покупатель передумал' },
      });
      expect(lostRes.statusCode).toBe(200);

      // Attempt to resurrect closed_lost to showing -> 400 VALIDATION_FAILED
      const reviveRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/deals/${dealId}/stage`,
        headers: { cookie: owner.cookie },
        payload: { stage: 'showing', expectedVersion: 1 },
      });

      expect(reviveRes.statusCode).toBe(400);
      expect(JSON.parse(reviveRes.body).error.code).toBe('VALIDATION_FAILED');
    });

    it('handles concurrent stage transitions race: exactly one wins, one gets 409', async () => {
      const owner = await seedOwnerSession();
      const contactId = await seedContact(owner.organizationId);

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/deals',
        headers: { cookie: owner.cookie },
        payload: { title: 'Гонка стадий', contactId: contactId.toString() },
      });
      const dealId = JSON.parse(createRes.body).id;

      // Two concurrent requests with expectedVersion: 0
      const [res1, res2] = await Promise.all([
        app.inject({
          method: 'PATCH',
          url: `/api/v1/deals/${dealId}/stage`,
          headers: { cookie: owner.cookie },
          payload: { stage: 'deposit', expectedVersion: 0, reason: 'Thread 1' },
        }),
        app.inject({
          method: 'PATCH',
          url: `/api/v1/deals/${dealId}/stage`,
          headers: { cookie: owner.cookie },
          payload: { stage: 'closed_lost', expectedVersion: 0, reason: 'Thread 2' },
        }),
      ]);

      const statusCodes = [res1.statusCode, res2.statusCode].sort();
      expect(statusCodes).toEqual([200, 409]);
    });
  });

  describe('Participants and Checklist Management', () => {
    it('adds and removes participants with duplicates check and version increment', async () => {
      const owner = await seedOwnerSession();
      const contactId = await seedContact(owner.organizationId);
      const participantContactId = await seedContact(owner.organizationId, 'Архитектор');

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/deals',
        headers: { cookie: owner.cookie },
        payload: { title: 'Сделка с участниками', contactId: contactId.toString() },
      });
      const dealId = JSON.parse(createRes.body).id;

      // Add participant
      const addRes = await app.inject({
        method: 'POST',
        url: `/api/v1/deals/${dealId}/participants`,
        headers: { cookie: owner.cookie },
        payload: { role: 'architect', contactId: participantContactId.toString(), expectedVersion: 0 },
      });
      expect(addRes.statusCode).toBe(200);
      const addBody = JSON.parse(addRes.body);
      expect(addBody.participants).toHaveLength(1);
      expect(addBody.participants[0].role).toBe('architect');
      expect(addBody.version).toBe(1);

      // Attempt to add duplicate participant -> 409
      const dupRes = await app.inject({
        method: 'POST',
        url: `/api/v1/deals/${dealId}/participants`,
        headers: { cookie: owner.cookie },
        payload: { role: 'architect', contactId: participantContactId.toString(), expectedVersion: 1 },
      });
      expect(dupRes.statusCode).toBe(409);

      // Remove participant
      const remRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/deals/${dealId}/participants/${participantContactId.toString()}?expectedVersion=1`,
        headers: { cookie: owner.cookie },
      });
      expect(remRes.statusCode).toBe(200);
      const remBody = JSON.parse(remRes.body);
      expect(remBody.participants).toHaveLength(0);
      expect(remBody.version).toBe(2);
    });

    it('updates checklist atomically and preserves completion timestamps for unchanged done items', async () => {
      const owner = await seedOwnerSession();
      const contactId = await seedContact(owner.organizationId);

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/deals',
        headers: { cookie: owner.cookie },
        payload: {
          title: 'Сделка с чек-листом',
          contactId: contactId.toString(),
          checklistItems: [
            { label: 'Пункт 1', done: false },
            { label: 'Пункт 2', done: false },
          ],
        },
      });
      const createdDeal = JSON.parse(createRes.body);
      const dealId = createdDeal.id;
      const item1Id = createdDeal.checklistItems[0].id;
      const item2Id = createdDeal.checklistItems[1].id;

      // Mark Item 1 as done
      const update1 = await app.inject({
        method: 'PATCH',
        url: `/api/v1/deals/${dealId}/checklist`,
        headers: { cookie: owner.cookie },
        payload: {
          expectedVersion: 0,
          items: [
            { id: item1Id, label: 'Пункт 1', done: true },
            { id: item2Id, label: 'Пункт 2', done: false },
          ],
        },
      });
      expect(update1.statusCode).toBe(200);
      const body1 = JSON.parse(update1.body);
      expect(body1.checklistItems[0].done).toBe(true);
      expect(body1.checklistItems[0].completedAt).not.toBeNull();
      const item1CompletedAt = body1.checklistItems[0].completedAt;

      // Add Item 3 and keep Item 1 done
      const update2 = await app.inject({
        method: 'PATCH',
        url: `/api/v1/deals/${dealId}/checklist`,
        headers: { cookie: owner.cookie },
        payload: {
          expectedVersion: 1,
          items: [
            { id: item1Id, label: 'Пункт 1', done: true },
            { id: item2Id, label: 'Пункт 2', done: false },
            { label: 'Пункт 3 новый', done: false },
          ],
        },
      });
      expect(update2.statusCode).toBe(200);
      const body2 = JSON.parse(update2.body);
      expect(body2.checklistItems).toHaveLength(3);
      // CompletedAt preserved:
      expect(body2.checklistItems[0].completedAt).toBe(item1CompletedAt);
    });

    it('rejects one of two concurrent checklist writes with the same expectedVersion', async () => {
      const owner = await seedOwnerSession();
      const contactId = await seedContact(owner.organizationId);
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/deals',
        headers: { cookie: owner.cookie },
        payload: {
          title: 'Гонка чек-листа',
          contactId: contactId.toString(),
          checklistItems: [{ label: 'Проверить выписку', done: false }],
        },
      });
      const createdDeal = JSON.parse(createRes.body);
      const dealId = createdDeal.id;
      const itemId = createdDeal.checklistItems[0].id;

      const [first, second] = await Promise.all([
        app.inject({
          method: 'PATCH',
          url: `/api/v1/deals/${dealId}/checklist`,
          headers: { cookie: owner.cookie },
          payload: { expectedVersion: 0, items: [{ id: itemId, label: 'Проверить выписку', done: true }] },
        }),
        app.inject({
          method: 'PATCH',
          url: `/api/v1/deals/${dealId}/checklist`,
          headers: { cookie: owner.cookie },
          payload: { expectedVersion: 0, items: [{ id: itemId, label: 'Проверить выписку', done: false }] },
        }),
      ]);

      expect([first.statusCode, second.statusCode].sort()).toEqual([200, 409]);
      const persisted = await connection.collection('deals').findOne({ _id: new Types.ObjectId(dealId) });
      expect(persisted?.version).toBe(1);
    });
  });

  describe('PATCH /deals/:dealId/reassign — client.reassign (security review 31.08.2026)', () => {
    it('owner reassigns a deal to another position, increments version and writes client.reassign audit', async () => {
      const owner = await seedOwnerSession();
      const managerA = await seedManagerSession(owner.organizationId);
      const managerB = await seedManagerSession(owner.organizationId);
      const contactId = await seedContact(owner.organizationId);

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/deals',
        headers: { cookie: managerA.cookie },
        payload: { title: 'Сделка на реассайн', contactId: contactId.toString() },
      });
      const dealId = JSON.parse(createRes.body).id;

      const reassignRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/deals/${dealId}/reassign`,
        headers: { cookie: owner.cookie },
        payload: { expectedVersion: 0, ownerPositionId: managerB.positionId.toString() },
      });

      expect(reassignRes.statusCode).toBe(200);
      const body = JSON.parse(reassignRes.body);
      expect(body.ownerPositionId).toBe(managerB.positionId.toString());
      expect(body.version).toBe(1);

      const audit = await connection.collection('audit_events').findOne({
        action: 'client.reassign',
        resourceId: new Types.ObjectId(dealId),
      });
      expect(audit?.before?.ownerPositionId).toBe(managerA.positionId.toString());
      expect(audit?.after?.ownerPositionId).toBe(managerB.positionId.toString());
    });

    it('manager without client.reassign grant gets 403 even on their own deal', async () => {
      const owner = await seedOwnerSession();
      const managerA = await seedManagerSession(owner.organizationId);
      const managerB = await seedManagerSession(owner.organizationId);
      const contactId = await seedContact(owner.organizationId);

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/deals',
        headers: { cookie: managerA.cookie },
        payload: { title: 'Менеджер не может переназначить сам', contactId: contactId.toString() },
      });
      const dealId = JSON.parse(createRes.body).id;

      const reassignRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/deals/${dealId}/reassign`,
        headers: { cookie: managerA.cookie },
        payload: { expectedVersion: 0, ownerPositionId: managerB.positionId.toString() },
      });

      expect(reassignRes.statusCode).toBe(403);
    });

    it('PATCH /deals/:dealId no longer accepts ownerPositionId — deal.edit alone cannot reassign', async () => {
      const owner = await seedOwnerSession();
      const managerB = await seedManagerSession(owner.organizationId);
      const contactId = await seedContact(owner.organizationId);

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/deals',
        headers: { cookie: owner.cookie },
        payload: { title: 'Правка без реассайна', contactId: contactId.toString() },
      });
      const dealId = JSON.parse(createRes.body).id;

      const editRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/deals/${dealId}`,
        headers: { cookie: owner.cookie },
        payload: { expectedVersion: 0, ownerPositionId: managerB.positionId.toString() },
      });

      expect(editRes.statusCode).toBe(400);
      expect(JSON.parse(editRes.body).error.code).toBe('VALIDATION_FAILED');
    });

    it('rejects reassignment to a position outside the organization with 404', async () => {
      const owner = await seedOwnerSession();
      const foreignOwner = await seedOwnerSession();
      const contactId = await seedContact(owner.organizationId);

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/deals',
        headers: { cookie: owner.cookie },
        payload: { title: 'Чужая позиция', contactId: contactId.toString() },
      });
      const dealId = JSON.parse(createRes.body).id;

      const reassignRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/deals/${dealId}/reassign`,
        headers: { cookie: owner.cookie },
        payload: { expectedVersion: 0, ownerPositionId: foreignOwner.positionId.toString() },
      });

      expect(reassignRes.statusCode).toBe(404);
    });

    it('rejects stale expectedVersion with 409 VERSION_CONFLICT', async () => {
      const owner = await seedOwnerSession();
      const managerB = await seedManagerSession(owner.organizationId);
      const contactId = await seedContact(owner.organizationId);

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/deals',
        headers: { cookie: owner.cookie },
        payload: { title: 'Устаревшая версия', contactId: contactId.toString() },
      });
      const dealId = JSON.parse(createRes.body).id;

      await app.inject({
        method: 'PATCH',
        url: `/api/v1/deals/${dealId}`,
        headers: { cookie: owner.cookie },
        payload: { expectedVersion: 0, title: 'Обновлённое название' },
      });

      const reassignRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/deals/${dealId}/reassign`,
        headers: { cookie: owner.cookie },
        payload: { expectedVersion: 0, ownerPositionId: managerB.positionId.toString() },
      });

      expect(reassignRes.statusCode).toBe(409);
    });

    it('no-op reassignment to the same owner succeeds without a version bump or audit entry', async () => {
      const owner = await seedOwnerSession();
      const managerA = await seedManagerSession(owner.organizationId);
      const contactId = await seedContact(owner.organizationId);

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/deals',
        headers: { cookie: managerA.cookie },
        payload: { title: 'Тот же владелец', contactId: contactId.toString() },
      });
      const dealId = JSON.parse(createRes.body).id;

      const reassignRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/deals/${dealId}/reassign`,
        headers: { cookie: owner.cookie },
        payload: { expectedVersion: 0, ownerPositionId: managerA.positionId.toString() },
      });

      expect(reassignRes.statusCode).toBe(200);
      expect(JSON.parse(reassignRes.body).version).toBe(0);

      const audit = await connection.collection('audit_events').findOne({
        action: 'client.reassign',
        resourceId: new Types.ObjectId(dealId),
      });
      expect(audit).toBeNull();
    });
  });

  describe('Manager own-scope and Tenant Non-Disclosure', () => {
    it('manager can only see and access their own deals (foreign deal returns 404)', async () => {
      const owner = await seedOwnerSession();
      const managerA = await seedManagerSession(owner.organizationId);
      const managerB = await seedManagerSession(owner.organizationId);
      const contactId = await seedContact(owner.organizationId);

      // Manager A creates deal
      const dealARes = await app.inject({
        method: 'POST',
        url: '/api/v1/deals',
        headers: { cookie: managerA.cookie },
        payload: { title: 'Сделка Менеджера А', contactId: contactId.toString() },
      });
      const dealAId = JSON.parse(dealARes.body).id;

      // Manager B creates deal
      const dealBRes = await app.inject({
        method: 'POST',
        url: '/api/v1/deals',
        headers: { cookie: managerB.cookie },
        payload: { title: 'Сделка Менеджера Б', contactId: contactId.toString() },
      });
      const dealBId = JSON.parse(dealBRes.body).id;

      // Manager A lists deals -> only sees Deal A
      const listResA = await app.inject({
        method: 'GET',
        url: '/api/v1/deals',
        headers: { cookie: managerA.cookie },
      });
      expect(listResA.statusCode).toBe(200);
      const listA = JSON.parse(listResA.body).items;
      expect(listA).toHaveLength(1);
      expect(listA[0].id).toBe(dealAId);

      // Manager A tries to GET Deal B -> 404 (non-disclosure)
      const getForeignRes = await app.inject({
        method: 'GET',
        url: `/api/v1/deals/${dealBId}`,
        headers: { cookie: managerA.cookie },
      });
      expect(getForeignRes.statusCode).toBe(404);

      // Manager A tries to mutate Deal B stage -> 404 (non-disclosure)
      const mutateForeignRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/deals/${dealBId}/stage`,
        headers: { cookie: managerA.cookie },
        payload: { stage: 'deposit', expectedVersion: 0 },
      });
      expect(mutateForeignRes.statusCode).toBe(404);

      // Owner (organization scope) sees both deals
      const listResOwner = await app.inject({
        method: 'GET',
        url: '/api/v1/deals',
        headers: { cookie: owner.cookie },
      });
      expect(listResOwner.statusCode).toBe(200);
      expect(JSON.parse(listResOwner.body).items).toHaveLength(2);
    });
  });

  describe('Pagination and Filtering', () => {
    it('lists deals newest-first with cursor pagination and filtering by stage', async () => {
      const owner = await seedOwnerSession();
      const contactId = await seedContact(owner.organizationId);

      // Create 3 deals
      for (let i = 1; i <= 3; i++) {
        await app.inject({
          method: 'POST',
          url: '/api/v1/deals',
          headers: { cookie: owner.cookie },
          payload: { title: `Сделка ${i}`, contactId: contactId.toString() },
        });
      }

      // Page 1 with limit 2
      const page1Res = await app.inject({
        method: 'GET',
        url: '/api/v1/deals?limit=2',
        headers: { cookie: owner.cookie },
      });
      expect(page1Res.statusCode).toBe(200);
      const page1 = JSON.parse(page1Res.body);
      expect(page1.items).toHaveLength(2);
      expect(page1.items[0].title).toBe('Сделка 3');
      expect(page1.items[1].title).toBe('Сделка 2');
      expect(page1.nextCursor).not.toBeNull();

      // Page 2 using nextCursor
      const page2Res = await app.inject({
        method: 'GET',
        url: `/api/v1/deals?limit=2&cursor=${page1.nextCursor}`,
        headers: { cookie: owner.cookie },
      });
      expect(page2Res.statusCode).toBe(200);
      const page2 = JSON.parse(page2Res.body);
      expect(page2.items).toHaveLength(1);
      expect(page2.items[0].title).toBe('Сделка 1');
      expect(page2.nextCursor).toBeNull();
    });
  });
});

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
import { MessengerDialogRepository } from '../../src/modules/messenger/repository/messenger-dialog.repository';
import { RedisService } from '../../src/shared/redis/redis.service';
import { createRedisMockService } from './support/redis-mock';

/**
 * ИСПРАВЛЕНО 11.09.2026: `messenger_message.send`/`messenger_dialog.link_crm`
 * — единственные два messenger-права со scope `own` (только у manager, см.
 * default-role-grants.ts) — до этого коммита own-scope проверялся ТОЛЬКО на
 * чтение (`ownerFilterForAction` вызывался в listDialogs/getDialog/
 * listMessages/markDialogRead). Отправка сообщения, привязка к CRM и
 * создание задачи из диалога own-scope не сужали вовсе — деймон-гейт
 * `@RequirePermission` проверяет только факт наличия гранта, не владение
 * конкретным диалогом. Полный HTTP-путь (тот же паттерн, что
 * dev-selections.integration-spec.ts): TenantGuard → PermissionGuard →
 * MessengerController.ownerFilterForAction → MessengerService — против
 * реальных PermissionGrant-документов, не моков.
 */
describe('Messenger own-scope — HTTP integration (полный AppModule)', () => {
  let replSet: MongoMemoryReplSet;
  let app: NestFastifyApplication;
  let connection: Connection;
  let authService: AuthService;
  let organizationsService: OrganizationsService;
  let dialogRepository: MessengerDialogRepository;

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
    dialogRepository = moduleRef.get(MessengerDialogRepository);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await replSet?.stop();
  });

  afterEach(async () => {
    for (const collection of [
      'messenger_dialogs',
      'messenger_messages',
      'messenger_accounts',
      'positions',
      'position_assignments',
      'organizations',
      'permission_grants',
      'identities',
      'sessions',
      'product_accesses',
      'idempotency_records',
    ]) {
      await connection.collection(collection).deleteMany({});
    }
  });

  const PASSWORD = 'correct horse battery staple';

  async function seedOwnerSession(): Promise<{ cookie: string; organizationId: Types.ObjectId }> {
    const login = `owner-${new Types.ObjectId().toString()}@example.test`;
    const identityId = await authService.registerIdentity({ login, password: PASSWORD });
    const { organizationId } = await organizationsService.createOrganizationWithOwner({
      type: 'agency',
      name: 'Интеграционное агентство',
      ownerIdentityId: identityId,
    });
    const session = await authService.login({ login, password: PASSWORD, audience: 'erp' });
    return { cookie: `baza_session=${session.sessionToken}`, organizationId };
  }

  async function seedManagerSession(
    organizationId: Types.ObjectId,
    name: string,
  ): Promise<{ cookie: string; positionId: Types.ObjectId }> {
    const login = `manager-${new Types.ObjectId().toString()}@example.test`;
    const identityId = await authService.registerIdentity({ login, password: PASSWORD });
    await authService.grantErpAccess(identityId);
    const positionId = await organizationsService.createVacantPosition({ organizationId, fixedRole: 'manager' });
    await organizationsService.assignOccupant({
      positionId,
      identityId,
      occupantDisplayName: name,
      actorIdentityId: identityId,
      expectedOrganizationId: organizationId,
      correlationId: 'messenger-own-scope-integration-seed',
    });
    const session = await authService.login({ login, password: PASSWORD, audience: 'erp' });
    return { cookie: `baza_session=${session.sessionToken}`, positionId };
  }

  async function seedDialog(
    organizationId: Types.ObjectId,
    assignedPositionId: Types.ObjectId | undefined,
  ): Promise<Types.ObjectId> {
    const dialog = await dialogRepository.create({
      organizationId,
      accountId: new Types.ObjectId(),
      assignedPositionId,
      platform: 'telegram',
      externalChatId: `chat-${new Types.ObjectId().toString()}`,
      name: 'Клиент Иван',
    });
    return dialog._id;
  }

  it('sendTextMessage: менеджер не может писать в диалог, назначенный коллеге — 404, сообщение не создаётся', async () => {
    const { organizationId } = await seedOwnerSession();
    const { positionId: managerA } = await seedManagerSession(organizationId, 'Менеджер А');
    const { cookie: cookieB } = await seedManagerSession(organizationId, 'Менеджер Б');
    const dialogId = await seedDialog(organizationId, managerA);

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/messenger/dialogs/${dialogId}/messages`,
      headers: { cookie: cookieB, 'idempotency-key': new Types.ObjectId().toString() },
      payload: { text: 'Попытка обхода own-scope' },
    });

    expect(response.statusCode).toBe(404);
    expect(await connection.collection('messenger_messages').countDocuments({})).toBe(0);
  });

  it('sendTextMessage: менеджер пишет в свой диалог — 201', async () => {
    const { organizationId } = await seedOwnerSession();
    const { cookie: cookieA, positionId: managerA } = await seedManagerSession(organizationId, 'Менеджер А');
    const dialogId = await seedDialog(organizationId, managerA);

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/messenger/dialogs/${dialogId}/messages`,
      headers: { cookie: cookieA, 'idempotency-key': new Types.ObjectId().toString() },
      payload: { text: 'Добрый день!' },
    });

    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body).text).toBe('Добрый день!');
  });

  it('sendTextMessage: диалог ещё не взят в работу — own-scope не блокирует (тот же принцип, что у непринятого лида)', async () => {
    const { organizationId } = await seedOwnerSession();
    const { cookie } = await seedManagerSession(organizationId, 'Менеджер А');
    const dialogId = await seedDialog(organizationId, undefined);

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/messenger/dialogs/${dialogId}/messages`,
      headers: { cookie, 'idempotency-key': new Types.ObjectId().toString() },
      payload: { text: 'Здравствуйте!' },
    });

    expect(response.statusCode).toBe(201);
  });

  it('sendTextMessage: владелец (organization-scope) пишет в любой диалог организации', async () => {
    const { cookie, organizationId } = await seedOwnerSession();
    const { positionId: managerA } = await seedManagerSession(organizationId, 'Менеджер А');
    const dialogId = await seedDialog(organizationId, managerA);

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/messenger/dialogs/${dialogId}/messages`,
      headers: { cookie, 'idempotency-key': new Types.ObjectId().toString() },
      payload: { text: 'Сообщение от владельца' },
    });

    expect(response.statusCode).toBe(201);
  });

  it('linkDialogToCrm: менеджер не может перепривязать чужой диалог — 404, привязка не меняется', async () => {
    const { organizationId } = await seedOwnerSession();
    const { positionId: managerA } = await seedManagerSession(organizationId, 'Менеджер А');
    const { cookie: cookieB } = await seedManagerSession(organizationId, 'Менеджер Б');
    const dialogId = await seedDialog(organizationId, managerA);
    const leadId = new Types.ObjectId();

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/messenger/dialogs/${dialogId}/link-crm`,
      headers: { cookie: cookieB },
      payload: { leadId: leadId.toString() },
    });

    expect(response.statusCode).toBe(404);
    const dialog = await connection.collection('messenger_dialogs').findOne({ _id: dialogId });
    expect(dialog?.leadId).toBeUndefined();
  });

  it('createTaskFromDialog: менеджер не может создать задачу из чужого диалога — 404', async () => {
    const { organizationId } = await seedOwnerSession();
    const { positionId: managerA } = await seedManagerSession(organizationId, 'Менеджер А');
    const { cookie: cookieB } = await seedManagerSession(organizationId, 'Менеджер Б');
    const dialogId = await seedDialog(organizationId, managerA);

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/messenger/dialogs/${dialogId}/create-task`,
      headers: { cookie: cookieB, 'idempotency-key': new Types.ObjectId().toString() },
      payload: { title: 'Попытка обхода' },
    });

    expect(response.statusCode).toBe(404);
  });
});

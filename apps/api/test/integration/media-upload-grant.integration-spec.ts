import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import fastifyCookie from '@fastify/cookie';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { MediaStorageService } from '@baza/media-storage';
import { AppModule } from '../../src/app.module';
import { AppExceptionFilter } from '../../src/shared/errors/app-exception.filter';
import { CorrelationIdMiddleware } from '../../src/shared/errors/correlation-id.middleware';
import { TenantContextMiddleware } from '../../src/shared/tenant/tenant-context.middleware';
import { AdminContextMiddleware } from '../../src/shared/admin/admin-context.middleware';
import { AuthService } from '../../src/modules/identity/auth.service';
import { OrganizationsService } from '../../src/modules/organizations/organizations.service';
import { RedisService } from '../../src/shared/redis/redis.service';
import { createRedisMockService } from './support/redis-mock';

/**
 * media_asset.upload. До 01.09.2026 это право проверялось на
 * POST /media/upload-intent, но не было выдано НИ ОДНОЙ роли — эндпоинт
 * отвечал 403 всем и всегда, то есть план этажа, фото юнита, документ
 * агентства и аватар загрузить было нельзя никак.
 *
 * Тест идёт через настоящий HTTP и настоящие гранты из
 * DEFAULT_ROLE_GRANTS: только так проверяется именно то, что было сломано.
 * Существующая media-спека (media-confirm-upload) зовёт MediaService
 * НАПРЯМУЮ, минуя guard, — поэтому она эту дыру и не ловила.
 */
describe('media_asset.upload — загрузка медиа по назначениям (real HTTP + real MongoDB)', () => {
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
      .overrideProvider(MediaStorageService)
      .useValue({
        createUploadUrl: jest.fn().mockResolvedValue('https://minio.test/presigned-put'),
        getPublicUrl: jest.fn((key: string) => `https://cdn.test/${key}`),
        readObject: jest.fn().mockResolvedValue(Buffer.from('fake-bytes')),
      })
      .compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.register(fastifyCookie);
    const fastify = app.getHttpAdapter().getInstance();
    fastify.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) =>
      app.get(CorrelationIdMiddleware).use(req, reply, () => {}),
    );
    fastify.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) =>
      app.get(TenantContextMiddleware).use(req, reply, () => {}),
    );
    fastify.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) =>
      app.get(AdminContextMiddleware).use(req, reply, () => {}),
    );
    app.useGlobalFilters(new AppExceptionFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    await app.init();
    await fastify.ready();

    connection = moduleRef.get<Connection>(getConnectionToken());
    authService = moduleRef.get(AuthService);
    organizationsService = moduleRef.get(OrganizationsService);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await replSet?.stop();
  });

  afterEach(async () => {
    for (const collection of [
      'media_assets',
      'positions',
      'position_assignments',
      'organizations',
      'permission_grants',
      'identities',
      'sessions',
      'product_accesses',
    ]) {
      await connection.collection(collection).deleteMany({});
    }
  });

  const PASSWORD = 'correct horse battery staple';

  async function seedOwner() {
    const login = `owner-${new Types.ObjectId().toString()}@example.test`;
    const identityId = await authService.registerIdentity({ login, password: PASSWORD });
    const { organizationId } = await organizationsService.createOrganizationWithOwner({
      type: 'agency',
      name: 'Агентство',
      ownerIdentityId: identityId,
    });
    const session = await authService.login({ login, password: PASSWORD, audience: 'erp' });
    return { cookie: `baza_session=${session.sessionToken}`, organizationId };
  }

  async function seedRole(organizationId: Types.ObjectId, fixedRole: 'manager' | 'marketer' | 'administrator') {
    const login = `${fixedRole}-${new Types.ObjectId().toString()}@example.test`;
    const identityId = await authService.registerIdentity({ login, password: PASSWORD });
    await authService.grantErpAccess(identityId);
    const positionId = await organizationsService.createVacantPosition({ organizationId, fixedRole });
    await organizationsService.assignOccupant({
      positionId,
      identityId,
      occupantDisplayName: fixedRole,
      actorIdentityId: identityId,
      expectedOrganizationId: organizationId,
      correlationId: 'media-grant-seed',
    });
    const session = await authService.login({ login, password: PASSWORD, audience: 'erp' });
    return { cookie: `baza_session=${session.sessionToken}` };
  }

  it('владелец может создать upload-intent — раньше здесь был 403 у всех', async () => {
    const owner = await seedOwner();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/media/upload-intent',
      headers: { cookie: owner.cookie },
      payload: { purpose: 'floor_plan', declaredMimeType: 'image/png', sizeBytes: 1024 },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.assetId).toBeDefined();
    expect(body.uploadUrl).toBe('https://minio.test/presigned-put');
  });

  it('менеджер тоже может: грант выдан всем, у кого есть property_asset.edit', async () => {
    const owner = await seedOwner();
    const manager = await seedRole(owner.organizationId, 'manager');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/media/upload-intent',
      headers: { cookie: manager.cookie },
      payload: { purpose: 'unit_photo', declaredMimeType: 'image/jpeg', sizeBytes: 2048 },
    });

    expect(res.statusCode).toBe(201);
  });

  it('маркетолог не может — с медиа объектов он не работает', async () => {
    const owner = await seedOwner();
    const marketer = await seedRole(owner.organizationId, 'marketer');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/media/upload-intent',
      headers: { cookie: marketer.cookie },
      payload: { purpose: 'floor_plan', declaredMimeType: 'image/png', sizeBytes: 1024 },
    });

    expect(res.statusCode).toBe(403);
  });

  it('администратор не может — у него нет ни property_asset.edit, ни development.edit', async () => {
    const owner = await seedOwner();
    const administrator = await seedRole(owner.organizationId, 'administrator');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/media/upload-intent',
      headers: { cookie: administrator.cookie },
      payload: { purpose: 'agency_document', declaredMimeType: 'application/pdf', sizeBytes: 1024 },
    });

    expect(res.statusCode).toBe(403);
  });

  it('без сессии — 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/media/upload-intent',
      payload: { purpose: 'floor_plan', declaredMimeType: 'image/png', sizeBytes: 1024 },
    });

    expect(res.statusCode).toBe(401);
  });

  it('созданный media_asset привязан к организации вызывающего', async () => {
    const owner = await seedOwner();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/media/upload-intent',
      headers: { cookie: owner.cookie },
      payload: { purpose: 'profile_avatar', declaredMimeType: 'image/png', sizeBytes: 512 },
    });

    const asset = await connection
      .collection('media_assets')
      .findOne({ _id: new Types.ObjectId(JSON.parse(res.body).assetId) });
    expect(asset?.ownerScope?.organizationId?.toString()).toBe(owner.organizationId.toString());
  });
});

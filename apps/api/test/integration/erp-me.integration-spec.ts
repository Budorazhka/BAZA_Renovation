import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import fastifyCookie from '@fastify/cookie';
import { AppModule } from '../../src/app.module';
import { AppExceptionFilter } from '../../src/shared/errors/app-exception.filter';
import { CorrelationIdMiddleware } from '../../src/shared/errors/correlation-id.middleware';
import { TenantContextMiddleware } from '../../src/shared/tenant/tenant-context.middleware';
import { AdminContextMiddleware } from '../../src/shared/admin/admin-context.middleware';
import { RedisService } from '../../src/shared/redis/redis.service';
import { createRedisMockService } from './support/redis-mock';

const ERP_ORIGIN = 'http://localhost:3000';

describe('GET /me — ERP Current User Context (real HTTP flow)', () => {
  let replSet: MongoMemoryReplSet;
  let app: NestFastifyApplication;
  let connection: Connection;

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
    process.env.CORS_ALLOWED_ORIGIN_ERP = ERP_ORIGIN;

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
    fastifyInstance.addHook('onRequest', async (req, reply) => {
      await correlationIdMiddleware.use(req, reply, () => {});
    });
    fastifyInstance.addHook('onRequest', async (req, reply) => {
      await tenantContextMiddleware.use(req, reply, () => {});
    });
    fastifyInstance.addHook('onRequest', async (req, reply) => {
      await adminContextMiddleware.use(req, reply, () => {});
    });

    app.useGlobalFilters(new AppExceptionFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    connection = moduleRef.get<Connection>(getConnectionToken());
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await replSet?.stop();
  });

  afterEach(async () => {
    await connection.collection('identities').deleteMany({});
    await connection.collection('organizations').deleteMany({});
    await connection.collection('positions').deleteMany({});
    await connection.collection('position_assignments').deleteMany({});
    await connection.collection('position_profiles').deleteMany({});
    await connection.collection('product_accesses').deleteMany({});
    await connection.collection('permission_grants').deleteMany({});
    await connection.collection('sessions').deleteMany({});
  });

  function extractSessionCookie(response: { headers: Record<string, unknown> }): string {
    const raw = response.headers['set-cookie'];
    if (!raw) throw new Error('No set-cookie header found in response');
    const header = Array.isArray(raw) ? raw[0] : String(raw);
    const cookie = header.split(';')[0];
    if (!cookie.startsWith('baza_session=')) throw new Error(`Unexpected cookie: ${cookie}`);
    return cookie;
  }

  it('200: возвращает полный профиль owner после онбординга организации', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { login: 'owner@agency.com', password: 'StrongPassword123!' },
    });

    const orgRes = await app.inject({
      method: 'POST',
      url: '/api/v1/organizations/register',
      payload: {
        login: 'owner@agency.com',
        password: 'StrongPassword123!',
        name: 'АН Премиум',
        type: 'agency',
      },
    });
    expect(orgRes.statusCode).toBe(201);
    const sessionCookie = extractSessionCookie(orgRes);

    const meRes = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { cookie: sessionCookie },
    });

    expect(meRes.statusCode).toBe(200);
    const body = JSON.parse(meRes.body);

    expect(body).toMatchObject({
      identity: {
        login: 'owner@agency.com',
        status: 'active',
      },
      organization: {
        name: 'АН Премиум',
        type: 'agency',
        status: 'active',
      },
      position: {
        role: 'owner',
        displayName: 'Owner',
        parentPositionId: null,
      },
    });

    expect(Array.isArray(body.permissions)).toBe(true);
    expect(body.permissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ resource: 'lead', action: 'read', scope: 'organization' }),
        expect.objectContaining({ resource: 'lead', action: 'create', scope: 'organization' }),
        expect.objectContaining({ resource: 'deal', action: 'read', scope: 'organization' }),
        expect.objectContaining({ resource: 'task', action: 'read', scope: 'organization' }),
        expect.objectContaining({ resource: 'position', action: 'create', scope: 'organization' }),
      ]),
    );
  });

  it('200: возвращает профиль manager с own-scope разрешениями', async () => {
    // 1. Owner создаёт организацию
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { login: 'boss@agency.com', password: 'StrongPassword123!' },
    });
    const orgRes = await app.inject({
      method: 'POST',
      url: '/api/v1/organizations/register',
      payload: { login: 'boss@agency.com', password: 'StrongPassword123!', name: 'АН Лидер', type: 'agency' },
    });
    const ownerCookie = extractSessionCookie(orgRes);

    // 2. Owner создаёт сотрудника-менеджера через POST /team-users
    const createManagerRes = await app.inject({
      method: 'POST',
      url: '/api/v1/team-users',
      headers: { cookie: ownerCookie },
      payload: {
        loginEmail: 'manager@agency.com',
        password: 'ManagerPassword123!',
        name: 'Алексей Менеджер',
        role: 'manager',
        phone: '+995555000111',
      },
    });
    expect(createManagerRes.statusCode).toBe(201);

    // 3. Manager логинится в ERP
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: ERP_ORIGIN },
      payload: { login: 'manager@agency.com', password: 'ManagerPassword123!' },
    });
    expect(loginRes.statusCode).toBe(200);
    const managerCookie = extractSessionCookie(loginRes);

    // 4. Manager вызывает GET /api/v1/me
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { cookie: managerCookie },
    });

    expect(meRes.statusCode).toBe(200);
    const body = JSON.parse(meRes.body);

    expect(body).toMatchObject({
      identity: {
        login: 'manager@agency.com',
        status: 'active',
      },
      organization: {
        name: 'АН Лидер',
        type: 'agency',
        status: 'active',
      },
      position: {
        role: 'manager',
        displayName: 'Алексей Менеджер',
      },
    });

    // У менеджера lead.read имеет scope: 'own'
    expect(body.permissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ resource: 'lead', action: 'read', scope: 'own' }),
        expect.objectContaining({ resource: 'lead', action: 'changeStage', scope: 'own' }),
        expect.objectContaining({ resource: 'deal', action: 'read', scope: 'own' }),
        expect.objectContaining({ resource: 'task', action: 'read', scope: 'own' }),
      ]),
    );
  });

  it('401: запрос без cookie возвращает AUTH_NO_SESSION', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('AUTH_NO_SESSION');
  });
});

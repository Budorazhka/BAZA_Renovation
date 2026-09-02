import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
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
import { RedisService } from '../../src/shared/redis/redis.service';
import { createRedisMockService } from './support/redis-mock';

const ERP_ORIGIN = 'https://erp.example.test';

/**
 * Закрывает два honest gap'а, задокументированных во время TEAM-001
 * (apps/erp-web/src/services/teamApi.ts::getById/createAccountSlot):
 * GET /team-users/:positionId (одна позиция по id) и
 * POST /team-users/positions (вакантный слот без occupant'а).
 */
describe('GET /team-users/:positionId, POST /team-users/positions', () => {
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
    // resolveProductAudienceFromOrigin (ADR-004) сравнивает req.headers.origin
    // с этой env-переменной — устанавливается ДО того, как AppModule/
    // AuthController её прочитают (см. seedManager ниже, реальный /auth/login).
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
    jest.restoreAllMocks();
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
    const header = Array.isArray(raw) ? raw[0] : raw;
    if (typeof header !== 'string') throw new Error('No set-cookie header in response');
    const match = header.match(/baza_session=[^;]+/);
    if (!match) throw new Error(`set-cookie header did not contain baza_session: ${header}`);
    return match[0];
  }

  async function seedOwner() {
    const login = `owner-${new Types.ObjectId().toString()}@example.test`;
    const password = 'correct horse battery staple';

    await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { login, password } });
    const orgRes = await app.inject({
      method: 'POST',
      url: '/api/v1/organizations/register',
      payload: { login, password, type: 'agency', name: 'Пробел-тест ООО' },
    });
    expect(orgRes.statusCode).toBe(201);

    return {
      cookie: extractSessionCookie(orgRes),
      organizationId: new Types.ObjectId(orgRes.json().organizationId as string),
    };
  }

  /** Создаёт занятого менеджера (существующий POST /team-users) и возвращает его cookie/positionId. */
  async function seedManager(ownerCookie: string) {
    const loginEmail = `manager-${new Types.ObjectId().toString()}@example.test`;
    const password = 'another correct horse battery';

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/team-users',
      headers: { cookie: ownerCookie },
      payload: { name: 'Менеджер', role: 'manager', loginEmail, password },
    });
    expect(res.statusCode).toBe(201);

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: ERP_ORIGIN },
      payload: { login: loginEmail, password },
    });
    expect(loginRes.statusCode).toBe(200);

    return {
      cookie: extractSessionCookie(loginRes),
      positionId: res.json().data.positionId as string,
    };
  }

  describe('GET /team-users/:positionId', () => {
    it('владелец читает собственную позицию по id', async () => {
      const { cookie, organizationId } = await seedOwner();
      const position = await connection.collection('positions').findOne({ organizationId });

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/team-users/${position!._id.toString()}`,
        headers: { cookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.positionId).toBe(position!._id.toString());
      expect(body.data.role).toBe('owner');
      expect(body.data.vacant).toBe(false);
    });

    it('несуществующая позиция → 404', async () => {
      const { cookie } = await seedOwner();

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/team-users/${new Types.ObjectId().toString()}`,
        headers: { cookie },
      });

      expect(res.statusCode).toBe(404);
    });

    it('позиция другой организации → 404, не раскрывает cross-tenant существование', async () => {
      const { cookie: ownerACookie } = await seedOwner();
      const { organizationId: organizationB } = await seedOwner();
      const foreignPosition = await connection.collection('positions').findOne({ organizationId: organizationB });

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/team-users/${foreignPosition!._id.toString()}`,
        headers: { cookie: ownerACookie },
      });

      expect(res.statusCode).toBe(404);
    });

    it('без сессии → 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/team-users/${new Types.ObjectId().toString()}`,
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /team-users/positions', () => {
    it('создаёт вакантную позицию с DEFAULT_ROLE_GRANTS, position/accessProfile не сохраняются', async () => {
      const { cookie, organizationId } = await seedOwner();
      const ownerPosition = await connection.collection('positions').findOne({ organizationId });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/team-users/positions',
        headers: { cookie },
        payload: {
          role: 'manager',
          position: 'Manager 1',
          managerId: ownerPosition!._id.toString(),
          accessProfile: { 'lead.read': 'organization' },
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.vacant).toBe(true);
      expect(body.data.role).toBe('manager');
      expect(body.data.managerId).toBe(ownerPosition!._id.toString());
      expect(body.data.platformUserId).toBe('');

      const positionId = new Types.ObjectId(body.data.positionId as string);
      const positionDoc = await connection.collection('positions').findOne({ _id: positionId });
      expect(positionDoc?.status).toBe('vacant');
      // `position` (человекочитаемый title) нигде не хранится — ни на самой
      // позиции, ни в position_profiles.
      expect(positionDoc).not.toHaveProperty('position');
      expect(await connection.collection('position_profiles').countDocuments({ positionId })).toBe(0);
      // Только стартовый DEFAULT_ROLE_GRANTS[fixedRole] набор, не
      // произвольный accessProfile из payload: manager получает lead.read
      // со scope'ом 'own' по умолчанию, а не 'organization', который
      // просили в accessProfile — запрошенный scope молча проигнорирован.
      const grants = await connection.collection('permission_grants').find({ subjectId: positionId }).toArray();
      expect(grants.length).toBeGreaterThan(0);
      const leadReadGrant = grants.find((g) => g.resource === 'lead' && g.action === 'read');
      expect(leadReadGrant?.scope).toBe('own');
      // position.create — НЕ в DEFAULT_ROLE_GRANTS[manager] вообще (только
      // owner/director/developer), значит и не могло появиться из
      // accessProfile.
      expect(grants.some((g) => g.resource === 'position' && g.action === 'create')).toBe(false);

      // Позиция видна списком и по прямому id.
      const getRes = await app.inject({
        method: 'GET',
        url: `/api/v1/team-users/${positionId.toString()}`,
        headers: { cookie },
      });
      expect(getRes.statusCode).toBe(200);
      expect(getRes.json().data.vacant).toBe(true);
    });

    it('managerId не передан → top-level позиция (parentPositionId:null)', async () => {
      const { cookie } = await seedOwner();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/team-users/positions',
        headers: { cookie },
        payload: { role: 'marketer', position: 'Marketer 1' },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().data.managerId).toBeNull();
    });

    it('роль без position.create (manager) → 403', async () => {
      const { cookie: ownerCookie } = await seedOwner();
      const { cookie: managerCookie } = await seedManager(ownerCookie);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/team-users/positions',
        headers: { cookie: managerCookie },
        payload: { role: 'manager', position: 'Manager 2' },
      });

      expect(res.statusCode).toBe(403);
    });

    it('неизвестное поле в body отклоняется ValidationPipe (whitelist), не молча отбрасывается', async () => {
      const { cookie } = await seedOwner();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/team-users/positions',
        headers: { cookie },
        payload: { role: 'manager', position: 'Manager 3', unknownField: 'x' },
      });

      expect(res.statusCode).toBe(400);
    });
  });
});

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
import { PositionProfileRepository } from '../../src/modules/organizations/repository/position-profile.repository';
import { createRedisMockService } from './support/redis-mock';

/**
 * POST /team-users создаёт сотрудника четырьмя шагами: Identity, позиция со
 * стартовыми грантами, назначение человека на позицию, HR-профиль. Общей
 * границы у них не было — падение на середине оставляло вакантную позицию с
 * грантами, за которой нет человека, или занятую позицию без профиля. В
 * составе команды такое не отличить от настоящей записи.
 *
 * Три из четырёх шагов принадлежат Organizations и теперь идут одной
 * транзакцией. Четвёртый — Identity — остаётся снаружи намеренно: ADR-001
 * запрещает писать чужую коллекцию внутри своей транзакции, тем же правилом
 * вынесен за коммит grantErpAccess.
 *
 * Тест ломает последний шаг транзакции и проверяет, что от неудавшегося
 * создания не осталось ничего, кроме документированного остатка — Identity.
 */
describe('POST /team-users — атомарность org-стороны', () => {
  let replSet: MongoMemoryReplSet;
  let app: NestFastifyApplication;
  let connection: Connection;
  let profileRepository: PositionProfileRepository;

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
    profileRepository = moduleRef.get(PositionProfileRepository);
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
    await connection.collection('audit_events').deleteMany({});
    await connection.collection('outbox_events').deleteMany({});
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
      payload: { login, password, type: 'agency', name: 'Атомарность ООО' },
    });
    expect(orgRes.statusCode).toBe(201);

    return {
      cookie: extractSessionCookie(orgRes),
      organizationId: new Types.ObjectId(orgRes.json().organizationId as string),
    };
  }

  function newEmployeePayload(loginEmail: string) {
    return {
      name: 'Новый Менеджер',
      role: 'manager',
      loginEmail,
      password: 'another correct horse battery',
      phone: '+79990000000',
    };
  }

  it('падение на последнем шаге не оставляет ни позиции, ни назначения, ни грантов', async () => {
    const { cookie, organizationId } = await seedOwner();
    const positionsBefore = await connection.collection('positions').countDocuments({ organizationId });
    const grantsBefore = await connection.collection('permission_grants').countDocuments({});
    const loginEmail = `manager-${new Types.ObjectId().toString()}@example.test`;

    jest
      .spyOn(profileRepository, 'create')
      .mockRejectedValueOnce(new Error('диверсия: профиль не записался'));

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/team-users',
      headers: { cookie },
      payload: newEmployeePayload(loginEmail),
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(500);

    // Ничего от неудавшегося создания не осталось.
    expect(await connection.collection('positions').countDocuments({ organizationId })).toBe(positionsBefore);
    expect(await connection.collection('permission_grants').countDocuments({})).toBe(grantsBefore);
    expect(await connection.collection('position_profiles').countDocuments({ organizationId })).toBe(0);

    const identity = await connection.collection('identities').findOne({ normalizedLogin: loginEmail });
    // Документированный остаток: Identity создаётся вне транзакции (ADR-001),
    // поэтому переживает откат. Доступ к ERP при этом не выдан — он идёт
    // после коммита, которого не было.
    expect(identity).not.toBeNull();
    expect(
      await connection.collection('product_accesses').countDocuments({ identityId: identity!._id }),
    ).toBe(0);
  });

  it('успешное создание записывает все четыре части', async () => {
    const { cookie, organizationId } = await seedOwner();
    const loginEmail = `manager-${new Types.ObjectId().toString()}@example.test`;

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/team-users',
      headers: { cookie },
      payload: newEmployeePayload(loginEmail),
    });

    expect(res.statusCode).toBe(201);
    const positionId = new Types.ObjectId(res.json().data.positionId as string);

    const identity = await connection.collection('identities').findOne({ normalizedLogin: loginEmail });
    expect(identity).not.toBeNull();

    const position = await connection.collection('positions').findOne({ _id: positionId, organizationId });
    expect(position?.status).toBe('occupied');

    expect(
      await connection.collection('position_assignments').countDocuments({ positionId, identityId: identity!._id }),
    ).toBe(1);
    expect(await connection.collection('position_profiles').countDocuments({ positionId })).toBe(1);
    expect(
      await connection.collection('permission_grants').countDocuments({ subjectId: positionId }),
    ).toBeGreaterThan(0);
    // ProductAccess выдан после коммита — человек может войти в ERP.
    expect(
      await connection.collection('product_accesses').countDocuments({ identityId: identity!._id }),
    ).toBe(1);
  });

  it('повтор с тем же логином после отката отвечает конфликтом, а не создаёт дубль', async () => {
    const { cookie, organizationId } = await seedOwner();
    const loginEmail = `manager-${new Types.ObjectId().toString()}@example.test`;

    jest
      .spyOn(profileRepository, 'create')
      .mockRejectedValueOnce(new Error('диверсия: профиль не записался'));

    await app.inject({
      method: 'POST',
      url: '/api/v1/team-users',
      headers: { cookie },
      payload: newEmployeePayload(loginEmail),
    });

    // Осевшая Identity делает повтор конфликтом — это честный отказ с
    // понятной причиной, а не молчаливое создание второго человека.
    const retry = await app.inject({
      method: 'POST',
      url: '/api/v1/team-users',
      headers: { cookie },
      payload: newEmployeePayload(loginEmail),
    });

    expect(retry.statusCode).toBe(409);
    expect(await connection.collection('positions').countDocuments({ organizationId })).toBe(1);
  });
});

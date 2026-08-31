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

/**
 * skipMiddie (security review 31.08.2026): main.api.ts выключает
 * @fastify/middie, чтобы убрать из поверхности атаки серию адвизори класса
 * "middleware bypass" (включая critical), фикс которых существует только в
 * ветке под Fastify 5. Обоснование — в докстринге самого main.api.ts.
 *
 * Остальные integration-спеки поднимают приложение через
 * `new FastifyAdapter()` БЕЗ опций, то есть С middie — они бы не заметили,
 * если бы отключение сломало пайплайн. Этот файл поднимает адаптер ровно
 * с теми же опциями, что и продовый bootstrap, и проверяет главное: что
 * без middie по-прежнему работает весь путь запроса, а не только роутинг —
 * onRequest-хуки доносят tenantContext до guards (ровно то, что ломал
 * nestjs/nest#8837 и ради чего middleware здесь вообще выведены в хуки).
 */
describe('skipMiddie — приложение работает без @fastify/middie', () => {
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
    // Те же опции адаптера, что в продовом main.api.ts.
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ skipMiddie: true }),
    );

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
    await connection.collection('developments').deleteMany({});
    await connection.collection('positions').deleteMany({});
    await connection.collection('position_assignments').deleteMany({});
    await connection.collection('organizations').deleteMany({});
    await connection.collection('permission_grants').deleteMany({});
    await connection.collection('identities').deleteMany({});
    await connection.collection('sessions').deleteMany({});
    await connection.collection('product_accesses').deleteMany({});
  });

  it('middie действительно не зарегистрирован — instance.use отсутствует', () => {
    const instance = app.getHttpAdapter().getInstance() as unknown as { use?: unknown };
    expect(typeof instance.use).toBe('undefined');
  });

  it('health-эндпоинт отвечает (роутинг жив без middie)', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
  });

  it('запрос без сессии отклоняется 401 — guard-пайплайн работает', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/developments' });
    expect(res.statusCode).toBe(401);
  });

  it('аутентифицированный запрос проходит: onRequest-хуки доносят tenantContext до guards', async () => {
    const login = `owner-${new Types.ObjectId().toString()}@example.test`;
    const identityId = await authService.registerIdentity({ login, password: 'correct horse battery staple' });
    await organizationsService.createOrganizationWithOwner({
      type: 'developer',
      name: 'Застройщик',
      ownerIdentityId: identityId,
    });
    const session = await authService.login({
      login,
      password: 'correct horse battery staple',
      audience: 'erp',
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/developments',
      headers: { cookie: `baza_session=${session.sessionToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).items).toEqual([]);
  });

  it('correlation-id хук отработал — заголовок ответа проставлен', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/developments' });
    expect(res.headers['x-correlation-id']).toBeDefined();
  });
});

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
import { DevelopmentRepository } from '@baza/development';

/**
 * Точный баг-репорт: два параллельных HTTP POST .../publish с ОДИНАКОВЫМИ
 * identity + Idempotency-Key. checkReplay в контроллере выполняется ДО
 * транзакции — оба запроса могут пройти его одновременно (record ещё не
 * записан), затем один выигрывает атомарный updateStatus и коммитит + пишет
 * idempotency record, а второй раньше безусловно получал ConflictException
 * вместо сохранённого 202-ответа "своей же" попытки. Это реальный сетевой
 * тест через app.inject() (Fastify, не supertest — тот же адаптер, что
 * main.api.ts), не unit-мок: воспроизводит гонку через настоящий HTTP-путь
 * (controller → guards → service → реальная MongoDB транзакция).
 *
 * Собирает полный AppModule (не только DevelopmentsModule) — publish идёт
 * через TenantGuard/PermissionGuard, которым нужен реальный DI-граф
 * (PolicyEvaluatorService, PositionAssignmentService и т.д.), тот же подход,
 * что app-module-boot.integration-spec.ts. TenantContextMiddleware/
 * AdminContextMiddleware/CorrelationIdMiddleware регистрируются как нативные
 * Fastify onRequest hooks вручную (как в main.api.ts) — NestMiddleware на
 * FastifyAdapter не долетает до Guards (GitHub issue nestjs/nest#8837, см.
 * комментарий в app.module.ts), без этого TenantGuard всегда отклонял бы
 * запрос как FORBIDDEN.
 */
describe('POST /developments/:id/publish — гонка параллельных запросов с одним Idempotency-Key', () => {
  let replSet: MongoMemoryReplSet;
  let app: NestFastifyApplication;
  let connection: Connection;
  let developmentRepository: DevelopmentRepository;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await replSet.waitUntilRunning();
    process.env.MONGO_URI = replSet.getUri();

    // Синтаксически валидные фиктивные значения — MediaStorageService
    // конструирует S3Client в конструкторе, ни один реальный вызов сюда не
    // идёт (тот же паттерн, что app-module-boot.integration-spec.ts).
    process.env.MINIO_ENDPOINT ??= 'http://localhost:9000';
    process.env.MINIO_ACCESS_KEY ??= 'test-access-key';
    process.env.MINIO_SECRET_KEY ??= 'test-secret-key';
    process.env.MINIO_BUCKET_PRIVATE ??= 'test-private';
    process.env.MINIO_BUCKET_PUBLIC ??= 'test-public';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

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
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    connection = moduleRef.get<Connection>(getConnectionToken());
    developmentRepository = moduleRef.get(DevelopmentRepository);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await replSet?.stop();
  });

  afterEach(async () => {
    await connection.collection('developments').deleteMany({});
    await connection.collection('marketplace_publications').deleteMany({});
    await connection.collection('outbox_events').deleteMany({});
    await connection.collection('idempotency_records').deleteMany({});
    await connection.collection('identities').deleteMany({});
    await connection.collection('organizations').deleteMany({});
    await connection.collection('positions').deleteMany({});
    await connection.collection('position_assignments').deleteMany({});
    await connection.collection('sessions').deleteMany({});
    await connection.collection('permission_grants').deleteMany({});
    await connection.collection('product_accesses').deleteMany({});
  });

  /**
   * Реальный HTTP onboarding-flow: POST /auth/register → POST /organizations/register
   * (developer-организация возвращает сессию с ролью developer).
   */
  async function seedAuthenticatedDeveloperOwner(): Promise<{ cookie: string; organizationId: Types.ObjectId }> {
    const login = `owner-${new Types.ObjectId().toString()}@example.test`;
    const password = 'correct horse battery staple';
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { login, password },
    });
    const orgRes = await app.inject({
      method: 'POST',
      url: '/api/v1/organizations/register',
      payload: { login, password, type: 'developer', name: 'Гоночный застройщик' },
    });
    expect(orgRes.statusCode).toBe(201);
    const raw = orgRes.headers['set-cookie'];
    const cookie = (Array.isArray(raw) ? raw[0] : raw)?.match(/baza_session=[^;]+/)?.[0];
    if (!cookie) throw new Error('session cookie missing');
    return { cookie, organizationId: new Types.ObjectId(orgRes.json().organizationId as string) };
  }

  it('два параллельных publish с одним Idempotency-Key: один и тот же 202-ответ, ровно одна публикация', async () => {
    const { cookie, organizationId } = await seedAuthenticatedDeveloperOwner();
    const development = await developmentRepository.create({
      organizationId,
      name: 'ЖК Гонка publish',
      location: { country: 'Georgia', city: 'Batumi', geo: { type: 'Point', coordinates: [41.6, 41.6] } },
      contact: { phone: '+995500000009' },
    });

    const idempotencyKey = 'race-http-key-1';
    const injectPublish = () =>
      app.inject({
        method: 'POST',
        url: `/api/v1/developments/${development._id.toString()}/publish`,
        headers: { cookie, 'idempotency-key': idempotencyKey },
      });

    const [first, second] = await Promise.all([injectPublish(), injectPublish()]);

    // Оба запроса должны завершиться успешно (202) — раньше один из них
    // получал 409 Conflict вместо replay сохранённого ответа победителя.
    expect(first.statusCode).toBe(202);
    expect(second.statusCode).toBe(202);

    const firstBody = JSON.parse(first.body);
    const secondBody = JSON.parse(second.body);
    expect(secondBody).toEqual(firstBody);

    const publicationCount = await connection
      .collection('marketplace_publications')
      .countDocuments({ sourceType: 'development', sourceId: development._id });
    expect(publicationCount).toBe(1);

    const developmentDoc = await connection.collection('developments').findOne({ _id: development._id });
    expect(developmentDoc?.status).toBe('active');
    // version не должна быть инкрементирована дважды гонкой — ровно один
    // реальный draft→active переход, второй запрос был чистым replay.
    expect(developmentDoc?.version).toBe(1);

    const idempotencyRecordCount = await connection
      .collection('idempotency_records')
      .countDocuments({ operation: 'publishDevelopment', key: idempotencyKey });
    expect(idempotencyRecordCount).toBe(1);
  });
});

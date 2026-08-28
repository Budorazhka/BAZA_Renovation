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
import { ContactRepository } from '../../src/modules/crm/repository/contact.repository';
import { LeadRepository } from '../../src/modules/crm/repository/lead.repository';

/**
 * Точный баг-репорт (найден при реализации, не гипотетически):
 * PATCH .../leads/:id/stage раньше делал безусловный `updateOne({_id,
 * organizationId}, {$set:{stage}})` — два параллельных запроса, читающие
 * ОДИНАКОВЫЙ previousStage, оба проходили synchronous transition-проверку
 * (LEAD_STAGE_TRANSITIONS) до транзакции и оба безусловно записывали новый
 * stage, "последний write выигрывает" без 409 ни одному из них — lost
 * update, не просто теоретический риск (тот же класс гонки, что уже
 * задокументирован для publish + Idempotency-Key в sibling-файле
 * publish-idempotency-race.integration-spec.ts, тот же bootstrap-паттерн).
 *
 * Фикс (27.08.2026): LeadDocument.version + LeadRepository.
 * changeStageWithVersionCheck — атомарный Mongo-фильтр {_id, organizationId,
 * version:expectedVersion, stage:{$in:allowedFromStages}}, тот же паттерн,
 * что UnitRepository.updateStatusWithVersionCheck. Этот тест — реальный
 * сетевой прогон через app.inject() (Fastify), не unit-мок: два параллельных
 * HTTP PATCH с ОДНОЙ и той же expectedVersion=0 (оба клиента прочитали лид
 * до того, как кто-либо его изменил) — ровно один должен выиграть (200),
 * второй должен получить 409 VERSION_CONFLICT, не тихую потерю его попытки.
 */
describe('PATCH /leads/:id/stage — гонка параллельных запросов с одинаковой expectedVersion', () => {
  let replSet: MongoMemoryReplSet;
  let app: NestFastifyApplication;
  let connection: Connection;
  let contactRepository: ContactRepository;
  let leadRepository: LeadRepository;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await replSet.waitUntilRunning();
    process.env.MONGO_URI = replSet.getUri();

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
    contactRepository = moduleRef.get(ContactRepository);
    leadRepository = moduleRef.get(LeadRepository);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await replSet?.stop();
  });

  afterEach(async () => {
    await connection.collection('leads').deleteMany({});
    await connection.collection('lead_events').deleteMany({});
    await connection.collection('contacts').deleteMany({});
    await connection.collection('audit_events').deleteMany({});
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
   * (agency-организация возвращает сессию с ролью owner).
   */
  async function seedAuthenticatedOwner(): Promise<{ cookie: string; organizationId: Types.ObjectId }> {
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
      payload: { login, password, type: 'agency', name: 'Гоночное агентство' },
    });
    expect(orgRes.statusCode).toBe(201);
    const raw = orgRes.headers['set-cookie'];
    const cookie = (Array.isArray(raw) ? raw[0] : raw)?.match(/baza_session=[^;]+/)?.[0];
    if (!cookie) throw new Error('session cookie missing');
    return { cookie, organizationId: new Types.ObjectId(orgRes.json().organizationId as string) };
  }

  it('два параллельных PATCH .../stage с одной expectedVersion: ровно один 200, второй 409 VERSION_CONFLICT', async () => {
    const { cookie, organizationId } = await seedAuthenticatedOwner();
    const contact = await contactRepository.create({
      organizationId,
      name: 'Гоночный контакт',
      phone: '+995500000777',
      roles: ['buyer'],
    });
    const lead = await leadRepository.create({
      organizationId,
      contactId: contact._id,
      source: { route: '/developments/race-test' },
    });

    const injectChangeStage = (newStage: string) =>
      app.inject({
        method: 'PATCH',
        url: `/api/v1/leads/${lead._id.toString()}/stage`,
        headers: { cookie },
        payload: { stage: newStage, expectedVersion: 0 },
      });

    const [first, second] = await Promise.all([injectChangeStage('contacted'), injectChangeStage('lost')]);

    const statuses = [first.statusCode, second.statusCode].sort();
    // Ровно один запрос выигрывает (200), второй честно получает 409 —
    // раньше ОБА безусловно записывали (200/200), один тихо терял свой
    // write без какого-либо сигнала вызывающему.
    expect(statuses).toEqual([200, 409]);

    const winner = first.statusCode === 200 ? first : second;
    const loser = first.statusCode === 200 ? second : first;

    const winnerBody = JSON.parse(winner.body);
    expect(['contacted', 'lost']).toContain(winnerBody.stage);
    expect(winnerBody.version).toBe(1);

    const loserBody = JSON.parse(loser.body);
    expect(loserBody.error.code).toBe('VERSION_CONFLICT');

    // Ровно ОДИН stage-переход реально произошёл — не оба.
    const leadDoc = await connection.collection('leads').findOne({ _id: lead._id });
    expect(leadDoc?.version).toBe(1);
    expect(leadDoc?.stage).toBe(winnerBody.stage);

    const eventCount = await connection.collection('lead_events').countDocuments({ leadId: lead._id });
    expect(eventCount).toBe(1);
  });

  it('ретрай проигравшего с ОБНОВЛЁННОЙ version — успешен (не постоянная блокировка)', async () => {
    const { cookie, organizationId } = await seedAuthenticatedOwner();
    const contact = await contactRepository.create({
      organizationId,
      name: 'Ретрай контакт',
      phone: '+995500000778',
      roles: ['buyer'],
    });
    const lead = await leadRepository.create({
      organizationId,
      contactId: contact._id,
      source: { route: '/developments/retry-test' },
    });

    const firstRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/leads/${lead._id.toString()}/stage`,
      headers: { cookie },
      payload: { stage: 'contacted', expectedVersion: 0 },
    });
    expect(firstRes.statusCode).toBe(200);

    const staleRetryRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/leads/${lead._id.toString()}/stage`,
      headers: { cookie },
      payload: { stage: 'lost', expectedVersion: 0 },
    });
    expect(staleRetryRes.statusCode).toBe(409);

    // Клиент делает ровно то, что 409-ответ ожидает от него: перечитывает
    // актуальную version и повторяет попытку с ней.
    const freshRetryRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/leads/${lead._id.toString()}/stage`,
      headers: { cookie },
      payload: { stage: 'lost', expectedVersion: 1 },
    });
    expect(freshRetryRes.statusCode).toBe(200);
    const freshBody = JSON.parse(freshRetryRes.body);
    expect(freshBody.stage).toBe('lost');
    expect(freshBody.version).toBe(2);
  });

  it('legacy lead без поля version читается как version:0 и может быть изменён', async () => {
    const { cookie, organizationId } = await seedAuthenticatedOwner();
    const contact = await contactRepository.create({
      organizationId,
      name: 'Legacy контакт',
      phone: '+995500000779',
      roles: ['buyer'],
    });
    const leadId = new Types.ObjectId();

    // Имитируем документ, созданный до добавления Lead.version: Mongoose
    // default здесь намеренно обходится прямой записью в Mongo.
    await connection.collection('leads').insertOne({
      _id: leadId,
      organizationId,
      contactId: contact._id,
      source: { route: '/developments/legacy-test' },
      stage: 'new',
      createdAt: new Date(),
    });

    const readRes = await app.inject({
      method: 'GET',
      url: `/api/v1/leads/${leadId.toString()}`,
      headers: { cookie },
    });
    expect(readRes.statusCode).toBe(200);
    expect(JSON.parse(readRes.body).version).toBe(0);

    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/leads/${leadId.toString()}/stage`,
      headers: { cookie },
      payload: { stage: 'contacted', expectedVersion: 0 },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(JSON.parse(patchRes.body).version).toBe(1);

    const stored = await connection.collection('leads').findOne({ _id: leadId });
    expect(stored?.stage).toBe('contacted');
    expect(stored?.version).toBe(1);
  });
});

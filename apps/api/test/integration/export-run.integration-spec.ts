import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import fastifyCookie from '@fastify/cookie';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Workbook } from 'exceljs';
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
 * export.run. Главное, что здесь проверяется, — что выгрузка НЕ стала
 * обходом прав на чтение: грант выдан в том числе `administrator`, у
 * которого нет deal.read, и он не должен получить файл со сделками.
 *
 * Проверяется против реальной БД и реальных грантов из DEFAULT_ROLE_GRANTS,
 * потому что именно их сочетание и создаёт риск — мок показал бы ровно то,
 * что в него положили.
 */
describe('export.run — выгрузка CRM-списков (real HTTP + real MongoDB)', () => {
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
      'leads',
      'lead_events',
      'contacts',
      'deals',
      'tasks',
      'positions',
      'position_assignments',
      'organizations',
      'permission_grants',
      'identities',
      'sessions',
      'product_accesses',
      'audit_events',
    ]) {
      await connection.collection(collection).deleteMany({});
    }
  });

  const PASSWORD = 'correct horse battery staple';

  async function seedOwner() {
    const login = `owner-${new Types.ObjectId().toString()}@example.test`;
    const identityId = await authService.registerIdentity({ login, password: PASSWORD });
    const { organizationId, positionId } = await organizationsService.createOrganizationWithOwner({
      type: 'agency',
      name: 'Агентство Батуми',
      ownerIdentityId: identityId,
    });
    const session = await authService.login({ login, password: PASSWORD, audience: 'erp' });
    return { cookie: `baza_session=${session.sessionToken}`, organizationId, positionId };
  }

  async function seedRole(organizationId: Types.ObjectId, fixedRole: 'manager' | 'administrator' | 'marketer') {
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
      correlationId: 'export-run-seed',
    });
    const session = await authService.login({ login, password: PASSWORD, audience: 'erp' });
    return { cookie: `baza_session=${session.sessionToken}`, positionId };
  }

  async function seedContact(organizationId: Types.ObjectId, name: string, phone: string) {
    const contactId = new Types.ObjectId();
    await connection.collection('contacts').insertOne({
      _id: contactId,
      organizationId,
      name,
      phone,
      roles: ['buyer'],
      createdAt: new Date('2026-09-01T10:00:00.000Z'),
    });
    return contactId;
  }

  async function seedLead(organizationId: Types.ObjectId, contactId: Types.ObjectId, ownerPositionId?: Types.ObjectId) {
    await connection.collection('leads').insertOne({
      _id: new Types.ObjectId(),
      organizationId,
      contactId,
      ...(ownerPositionId ? { ownerPositionId } : {}),
      stage: 'new',
      version: 0,
      source: { route: 'manual' },
      createdAt: new Date('2026-09-01T10:00:00.000Z'),
    });
  }

  async function readSheet(body: Buffer) {
    const workbook = new Workbook();
    await workbook.xlsx.load(body as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    return workbook;
  }

  it('без сессии — 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/exports/leads' });
    expect(res.statusCode).toBe(401);
  });

  it('владелец выгружает контакты: настоящий xlsx с листом и заголовками', async () => {
    const owner = await seedOwner();
    await seedContact(owner.organizationId, 'Иван Покупатель', '+995500000001');

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/exports/contacts',
      headers: { cookie: owner.cookie },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(res.headers['content-disposition']).toContain("filename*=UTF-8''");

    const sheet = (await readSheet(res.rawPayload)).getWorksheet('Контакты')!;
    expect(sheet).toBeDefined();
    expect(sheet.getRow(1).values).toEqual([undefined, 'Создан', 'Имя', 'Телефон', 'Email']);
    expect(sheet.getRow(2).getCell(2).value).toBe('Иван Покупатель');
    expect(sheet.getRow(2).getCell(3).value).toBe('+995500000001');
  });

  it('администратор имеет export.run, но НЕ имеет deal.read — сделки ему не выгружаются', async () => {
    const owner = await seedOwner();
    const administrator = await seedRole(owner.organizationId, 'administrator');

    // Он же спокойно выгружает то, что читать вправе.
    const leadsRes = await app.inject({
      method: 'GET',
      url: '/api/v1/exports/leads',
      headers: { cookie: administrator.cookie },
    });
    expect(leadsRes.statusCode).toBe(200);

    const dealsRes = await app.inject({
      method: 'GET',
      url: '/api/v1/exports/deals',
      headers: { cookie: administrator.cookie },
    });
    expect(dealsRes.statusCode).toBe(403);
    expect(JSON.parse(dealsRes.body).error.code).toBe('FORBIDDEN');
  });

  it('маркетолог без export.run не проходит дальше guard', async () => {
    const owner = await seedOwner();
    const marketer = await seedRole(owner.organizationId, 'marketer');

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/exports/leads',
      headers: { cookie: marketer.cookie },
    });

    expect(res.statusCode).toBe(403);
  });

  it('own-scope: менеджер не имеет export.run вовсе — выгрузка ему недоступна', async () => {
    const owner = await seedOwner();
    const manager = await seedRole(owner.organizationId, 'manager');

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/exports/leads',
      headers: { cookie: manager.cookie },
    });

    expect(res.statusCode).toBe(403);
  });

  it('выгружаются только лиды своей организации', async () => {
    const first = await seedOwner();
    const second = await seedOwner();
    const contactA = await seedContact(first.organizationId, 'Свой контакт', '+995500000010');
    const contactB = await seedContact(second.organizationId, 'Чужой контакт', '+995500000020');
    await seedLead(first.organizationId, contactA);
    await seedLead(second.organizationId, contactB);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/exports/leads',
      headers: { cookie: first.cookie },
    });

    const sheet = (await readSheet(res.rawPayload)).getWorksheet('Лиды')!;
    expect(sheet.rowCount).toBe(2); // заголовок + один свой лид
    expect(sheet.getRow(2).getCell(3).value).toBe('Свой контакт');
  });

  it('неизвестная сущность отклоняется 400, а не отдаёт пустой файл', async () => {
    const owner = await seedOwner();

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/exports/salaries',
      headers: { cookie: owner.cookie },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('VALIDATION_FAILED');
  });

  it('выгрузка персональных данных остаётся в audit_events', async () => {
    const owner = await seedOwner();
    await seedContact(owner.organizationId, 'Иван', '+995500000001');

    await app.inject({
      method: 'GET',
      url: '/api/v1/exports/contacts',
      headers: { cookie: owner.cookie },
    });

    const audit = await connection.collection('audit_events').findOne({ action: 'export.run' });
    expect(audit).not.toBeNull();
    expect(audit?.after?.entity).toBe('contacts');
    expect(audit?.after?.rowCount).toBe(1);
  });

  it('пустой список отдаёт валидный файл с одними заголовками', async () => {
    const owner = await seedOwner();

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/exports/tasks',
      headers: { cookie: owner.cookie },
    });

    expect(res.statusCode).toBe(200);
    const sheet = (await readSheet(res.rawPayload)).getWorksheet('Задачи')!;
    expect(sheet.rowCount).toBe(1);
  });
});

import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import fastifyCookie from '@fastify/cookie';
import { Workbook } from 'exceljs';
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
 * chessboard.export — единственный эндпоинт API, отдающий не JSON. Мок
 * этого проверить не может: тест поднимает реальный Fastify, реально
 * скачивает байты и РАСПАКОВЫВАЕТ полученный workbook обратно, сверяя
 * лист/заголовки/строки с форматом bz26-client-erp, откуда формат взят.
 */
describe('chessboard.export — HTTP Integration (AppModule)', () => {
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
    await connection.collection('developments').deleteMany({});
    await connection.collection('buildings').deleteMany({});
    await connection.collection('floors').deleteMany({});
    await connection.collection('units').deleteMany({});
    await connection.collection('positions').deleteMany({});
    await connection.collection('position_assignments').deleteMany({});
    await connection.collection('organizations').deleteMany({});
    await connection.collection('permission_grants').deleteMany({});
    await connection.collection('identities').deleteMany({});
    await connection.collection('sessions').deleteMany({});
    await connection.collection('product_accesses').deleteMany({});
  });

  const PASSWORD = 'correct horse battery staple';

  async function seedOwnerSession(): Promise<{ cookie: string; organizationId: Types.ObjectId }> {
    const login = `owner-${new Types.ObjectId().toString()}@example.test`;
    const identityId = await authService.registerIdentity({ login, password: PASSWORD });
    const { organizationId } = await organizationsService.createOrganizationWithOwner({
      type: 'developer',
      name: 'Застройщик',
      ownerIdentityId: identityId,
    });
    const session = await authService.login({ login, password: PASSWORD, audience: 'erp' });
    return { cookie: `baza_session=${session.sessionToken}`, organizationId };
  }

  async function seedMarketerSession(
    organizationId: Types.ObjectId,
  ): Promise<{ cookie: string }> {
    const login = `marketer-${new Types.ObjectId().toString()}@example.test`;
    const identityId = await authService.registerIdentity({ login, password: PASSWORD });
    await authService.grantErpAccess(identityId);
    const positionId = await organizationsService.createVacantPosition({ organizationId, fixedRole: 'marketer' });
    await organizationsService.assignOccupant({
      positionId,
      identityId,
      occupantDisplayName: 'Маркетолог',
      actorIdentityId: identityId,
      expectedOrganizationId: organizationId,
      correlationId: 'chessboard-export-test-seed',
    });
    const session = await authService.login({ login, password: PASSWORD, audience: 'erp' });
    return { cookie: `baza_session=${session.sessionToken}` };
  }

  async function seedDevelopment(
    organizationId: Types.ObjectId,
    name = 'ЖК Морской',
  ): Promise<Types.ObjectId> {
    const developmentId = new Types.ObjectId();
    await connection.collection('developments').insertOne({
      _id: developmentId,
      organizationId,
      name,
      status: 'draft',
      location: { country: 'Georgia', city: 'Batumi', geo: { type: 'Point', coordinates: [41.6, 41.6] } },
      contact: { phone: '+995500000000' },
      version: 0,
      createdAt: new Date(),
    });
    return developmentId;
  }

  async function seedBuildingWithFloor(
    organizationId: Types.ObjectId,
    developmentId: Types.ObjectId,
    buildingName: string,
    floorNumber: number,
  ): Promise<{ buildingId: Types.ObjectId; floorId: Types.ObjectId }> {
    const buildingId = new Types.ObjectId();
    const floorId = new Types.ObjectId();
    await connection.collection('buildings').insertOne({
      _id: buildingId,
      developmentId,
      organizationId,
      name: buildingName,
      floorsCount: 10,
      createdAt: new Date(),
    });
    await connection.collection('floors').insertOne({
      _id: floorId,
      buildingId,
      organizationId,
      floorNumber,
      createdAt: new Date(),
    });
    return { buildingId, floorId };
  }

  async function seedUnit(
    organizationId: Types.ObjectId,
    buildingId: Types.ObjectId,
    floorId: Types.ObjectId,
    overrides: Record<string, unknown> = {},
  ): Promise<void> {
    await connection.collection('units').insertOne({
      _id: new Types.ObjectId(),
      buildingId,
      floorId,
      organizationId,
      number: 'A-0301',
      kind: 'apartment',
      rooms: 2,
      area: 58,
      price: { amountMinorUnits: 12_180_000, currency: 'USD' },
      status: 'available',
      priceHistory: [],
      version: 0,
      createdAt: new Date(),
      ...overrides,
    });
  }

  async function readWorkbook(body: Buffer): Promise<Workbook> {
    const workbook = new Workbook();
    // exceljs типизирует load() своим Buffer из @types/node старого поколения,
    // куда Buffer<ArrayBufferLike> из актуальных типов не присваивается.
    // Расхождение чисто номинальное — на вход идут те же байты ответа.
    await workbook.xlsx.load(body as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    return workbook;
  }

  it('отдаёт настоящий xlsx: лист «Шахматка», 15 колонок формата bz26 и строки юнитов', async () => {
    const owner = await seedOwnerSession();
    const developmentId = await seedDevelopment(owner.organizationId);
    const { buildingId, floorId } = await seedBuildingWithFloor(
      owner.organizationId,
      developmentId,
      'Корпус 1',
      3,
    );
    await seedUnit(owner.organizationId, buildingId, floorId);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/developments/${developmentId.toString()}/chessboard/export`,
      headers: { cookie: owner.cookie },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(res.headers['content-disposition']).toContain("filename*=UTF-8''");
    expect(res.headers['content-disposition']).toContain(encodeURIComponent('chessboard_ЖК_Морской'));

    const workbook = await readWorkbook(res.rawPayload);
    const sheet = workbook.getWorksheet('Шахматка');
    expect(sheet).toBeDefined();

    expect(sheet!.getRow(1).values).toEqual([
      undefined,
      'Корпус',
      'Этаж',
      'Номер',
      'Комнатность',
      'Площадь, м²',
      'Цена за м², $',
      'Цена: Черный каркас, $/м²',
      'Цена: Белый каркас, $/м²',
      'Цена: Зеленый каркас, $/м²',
      'Цена: С ремонтом, $/м²',
      'Цена: Под ключ, $/м²',
      'Базовая цена за м², $',
      'Итого, $',
      'Статус',
      'Акция',
    ]);

    const dataRow = sheet!.getRow(2);
    expect(dataRow.getCell(1).value).toBe('Корпус 1');
    expect(dataRow.getCell(2).value).toBe(3);
    expect(dataRow.getCell(3).value).toBe('A-0301');
    expect(dataRow.getCell(4).value).toBe(2);
    expect(dataRow.getCell(5).value).toBe(58);
    expect(dataRow.getCell(6).value).toBe(2100);
    expect(dataRow.getCell(13).value).toBe(121_800);
    expect(dataRow.getCell(14).value).toBe('Свободно');
    expect(sheet!.rowCount).toBe(2);
  });

  it('в файл попадают только квартиры — паркинг и кладовка того же этажа пропускаются', async () => {
    const owner = await seedOwnerSession();
    const developmentId = await seedDevelopment(owner.organizationId);
    const { buildingId, floorId } = await seedBuildingWithFloor(
      owner.organizationId,
      developmentId,
      'Корпус 1',
      1,
    );
    await seedUnit(owner.organizationId, buildingId, floorId, { number: 'A-0101' });
    await seedUnit(owner.organizationId, buildingId, floorId, { number: 'P-01', kind: 'parking' });
    await seedUnit(owner.organizationId, buildingId, floorId, { number: 'S-01', kind: 'storage' });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/developments/${developmentId.toString()}/chessboard/export`,
      headers: { cookie: owner.cookie },
    });

    const sheet = (await readWorkbook(res.rawPayload)).getWorksheet('Шахматка')!;
    expect(sheet.rowCount).toBe(2);
    expect(sheet.getRow(2).getCell(3).value).toBe('A-0101');
  });

  it('сортирует строки корпус → этаж → номер по всему ЖК', async () => {
    const owner = await seedOwnerSession();
    const developmentId = await seedDevelopment(owner.organizationId);
    const first = await seedBuildingWithFloor(owner.organizationId, developmentId, 'Корпус 1', 10);
    const second = await seedBuildingWithFloor(owner.organizationId, developmentId, 'Корпус 2', 1);
    const firstLower = await seedBuildingWithFloor(owner.organizationId, developmentId, 'Корпус 1', 2);

    await seedUnit(owner.organizationId, second.buildingId, second.floorId, { number: 'B-0101' });
    await seedUnit(owner.organizationId, first.buildingId, first.floorId, { number: 'A-1001' });
    await seedUnit(owner.organizationId, firstLower.buildingId, firstLower.floorId, { number: 'A-0202' });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/developments/${developmentId.toString()}/chessboard/export`,
      headers: { cookie: owner.cookie },
    });

    const sheet = (await readWorkbook(res.rawPayload)).getWorksheet('Шахматка')!;
    expect([2, 3, 4].map((r) => sheet.getRow(r).getCell(3).value)).toEqual(['A-0202', 'A-1001', 'B-0101']);
  });

  it('маркетолог с грантом chessboard.export тоже может выгрузить (грант, а не роль)', async () => {
    const owner = await seedOwnerSession();
    const marketer = await seedMarketerSession(owner.organizationId);
    const developmentId = await seedDevelopment(owner.organizationId);
    const { buildingId, floorId } = await seedBuildingWithFloor(
      owner.organizationId,
      developmentId,
      'Корпус 1',
      1,
    );
    await seedUnit(owner.organizationId, buildingId, floorId);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/developments/${developmentId.toString()}/chessboard/export`,
      headers: { cookie: marketer.cookie },
    });

    expect(res.statusCode).toBe(200);
  });

  it('ЖК чужой организации — 404, не пустой файл (не раскрываем существование)', async () => {
    const owner = await seedOwnerSession();
    const foreign = await seedOwnerSession();
    const foreignDevelopmentId = await seedDevelopment(foreign.organizationId, 'Чужой ЖК');

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/developments/${foreignDevelopmentId.toString()}/chessboard/export`,
      headers: { cookie: owner.cookie },
    });

    expect(res.statusCode).toBe(404);
  });

  it('без сессии — 401, файл не собирается', async () => {
    const owner = await seedOwnerSession();
    const developmentId = await seedDevelopment(owner.organizationId);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/developments/${developmentId.toString()}/chessboard/export`,
    });

    expect(res.statusCode).toBe(401);
  });

  it('смешанные валюты в одном ЖК — 400, а не файл с неверной подписью колонок', async () => {
    const owner = await seedOwnerSession();
    const developmentId = await seedDevelopment(owner.organizationId);
    const { buildingId, floorId } = await seedBuildingWithFloor(
      owner.organizationId,
      developmentId,
      'Корпус 1',
      1,
    );
    await seedUnit(owner.organizationId, buildingId, floorId, { number: 'A-0101' });
    await seedUnit(owner.organizationId, buildingId, floorId, {
      number: 'A-0102',
      price: { amountMinorUnits: 5_000_000, currency: 'GEL' },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/developments/${developmentId.toString()}/chessboard/export`,
      headers: { cookie: owner.cookie },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('VALIDATION_FAILED');
  });

  it('ЖК без юнитов отдаёт валидный файл с одной строкой заголовков', async () => {
    const owner = await seedOwnerSession();
    const developmentId = await seedDevelopment(owner.organizationId);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/developments/${developmentId.toString()}/chessboard/export`,
      headers: { cookie: owner.cookie },
    });

    expect(res.statusCode).toBe(200);
    const sheet = (await readWorkbook(res.rawPayload)).getWorksheet('Шахматка')!;
    expect(sheet.rowCount).toBe(1);
  });
});

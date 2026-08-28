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
import { MarketplacePublicationRepository, type PublicationSourceType } from '@baza/publication';

/**
 * D-04A: GET /api/v1/public/developments (list) — самостоятельная,
 * изолированная от полного publish-pipeline read-функциональность.
 * publish-to-published-projection.integration-spec.ts уже полностью
 * покрывает publish→outbox→worker→published цепочку (не дублируется
 * здесь) — этот файл про query-валидацию/пагинацию/фильтры на уже
 * опубликованных документах.
 *
 * Bootstrap — тот же паттерн, что publish-to-published-projection
 * (полный AppModule, MongoMemoryReplSet, Fastify onRequest hooks).
 *
 * Публикации сеются НАПРЯМУЮ в статус published через
 * MarketplacePublicationRepository.upsertPending + markPublished — без
 * прогона через worker/outbox на каждый test case (worker-корректность уже
 * доказана sibling-файлом), это чистая read-поверхность, ей не нужна
 * publish-транзакция на каждый seed.
 */
describe('GET /public/developments — list, cursor pagination, validation, filters', () => {
  let replSet: MongoMemoryReplSet;
  let app: NestFastifyApplication;
  let connection: Connection;
  let publicationRepository: MarketplacePublicationRepository;

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
    // Sibling-файл (publish-to-published-projection) не регистрирует
    // ValidationPipe — до этого файла ни один integration-тест не проверял
    // query-DTO-валидацию на реальном HTTP-уровне. Те же опции, что в
    // main.api.ts (реальный production bootstrap) — иначе тест проверял бы
    // не то поведение, что реально работает в бою.
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    connection = moduleRef.get<Connection>(getConnectionToken());
    publicationRepository = moduleRef.get(MarketplacePublicationRepository);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await replSet?.stop();
  });

  afterEach(async () => {
    await connection.collection('marketplace_publications').deleteMany({});
  });

  let seedCounter = 0;

  /**
   * Заводит published MarketplacePublication напрямую через repository
   * (upsertPending → markPublished), без outbox/worker — сама list-функция
   * не зависит от того, КАК документ стал published, только от факта его
   * status/searchProjection/denormalizedFields.
   */
  async function seedPublished(overrides?: {
    name?: string;
    city?: string;
    geo?: [number, number];
    sourceType?: PublicationSourceType;
  }): Promise<{ id: Types.ObjectId; slug: string }> {
    seedCounter += 1;
    const sourceType = overrides?.sourceType ?? 'development';
    const sourceId = new Types.ObjectId();
    const organizationId = new Types.ObjectId();

    const pending = await publicationRepository.upsertPending(
      { sourceType, sourceId, publisherScope: { type: 'organization', organizationId } },
      await connection.startSession(),
    );

    const name = overrides?.name ?? `ЖК Тест ${seedCounter}`;
    const city = overrides?.city ?? 'batumi';
    const geo = overrides?.geo ?? [41.6, 41.6];
    const slug = `zhk-test-${seedCounter}-${pending._id.toString().slice(-6)}`;

    await publicationRepository.markPublished(pending._id, {
      expectedVersion: pending.version,
      slug,
      seo: { title: name, description: name, canonicalUrl: `https://example.test/${slug}`, structuredData: {} },
      denormalizedFields: { name, location: { city } },
      searchProjection: { city, geo: { type: 'Point', coordinates: geo } },
    });

    return { id: pending._id, slug };
  }

  async function seedNonPublished(status: 'publication_pending' | 'unpublished' | 'build_failed'): Promise<void> {
    const sourceId = new Types.ObjectId();
    const organizationId = new Types.ObjectId();
    const pending = await publicationRepository.upsertPending(
      { sourceType: 'development', sourceId, publisherScope: { type: 'organization', organizationId } },
      await connection.startSession(),
    );
    if (status !== 'publication_pending') {
      await connection.collection('marketplace_publications').updateOne({ _id: pending._id }, { $set: { status } });
    }
  }

  async function get(query: string) {
    const response = await app.inject({ method: 'GET', url: `/api/v1/public/developments${query}` });
    return { statusCode: response.statusCode, body: JSON.parse(response.body) as Record<string, unknown> };
  }

  it('limit+1 boundary: N+1 seed, limit=N → N items + non-null nextCursor равный N-му _id, второй запрос возвращает последний элемент и nextCursor=null', async () => {
    const seeded = [await seedPublished(), await seedPublished(), await seedPublished()];

    const first = await get('?limit=2');
    expect(first.statusCode).toBe(200);
    const firstItems = first.body.items as Array<Record<string, unknown>>;
    expect(firstItems).toHaveLength(2);
    expect(first.body.nextCursor).toBe(seeded[1]!.id.toString());

    const second = await get(`?limit=2&cursor=${first.body.nextCursor}`);
    expect(second.statusCode).toBe(200);
    expect((second.body.items as unknown[]).length).toBe(1);
    expect(second.body.nextCursor).toBeNull();
  });

  it('ровно N seed, limit=N → nextCursor=null сразу, без одного лишнего пустого round-trip', async () => {
    await seedPublished();
    await seedPublished();

    const response = await get('?limit=2');
    expect(response.statusCode).toBe(200);
    expect((response.body.items as unknown[]).length).toBe(2);
    expect(response.body.nextCursor).toBeNull();
  });

  it('невалидный cursor → 400 VALIDATION_FAILED', async () => {
    const response = await get('?cursor=not-an-object-id');
    expect(response.statusCode).toBe(400);
    expect((response.body.error as { code: string }).code).toBe('VALIDATION_FAILED');
  });

  it('limit нечисловой → 400', async () => {
    const response = await get('?limit=abc');
    expect(response.statusCode).toBe(400);
  });

  it('limit=0 и limit=-5 → оба 400', async () => {
    expect((await get('?limit=0')).statusCode).toBe(400);
    expect((await get('?limit=-5')).statusCode).toBe(400);
  });

  it('limit выше максимума (101) → 400', async () => {
    const response = await get('?limit=101');
    expect(response.statusCode).toBe(400);
  });

  it('limit=100 (документированный максимум) → 200, не отклоняется как "выше максимума"', async () => {
    const response = await get('?limit=100');
    expect(response.statusCode).toBe(200);
  });

  it('bbox с неверным числом частей → 400', async () => {
    const response = await get('?bbox=1,2,3');
    expect(response.statusCode).toBe(400);
  });

  it('bbox с нечисловой частью → 400', async () => {
    const response = await get('?bbox=a,2,3,4');
    expect(response.statusCode).toBe(400);
  });

  it('bbox с longitude/latitude вне диапазона → 400 (оба случая)', async () => {
    expect((await get('?bbox=-200,10,10,20')).statusCode).toBe(400);
    expect((await get('?bbox=10,-100,20,10')).statusCode).toBe(400);
  });

  it('bbox с min>=max → 400 (оба случая lng и lat)', async () => {
    expect((await get('?bbox=45,41,44,42')).statusCode).toBe(400);
    expect((await get('?bbox=44,42,45,41')).statusCode).toBe(400);
  });

  it('валидный bbox реально фильтрует — только объект внутри box возвращается', async () => {
    const inside = await seedPublished({ geo: [41.6, 41.6] });
    await seedPublished({ geo: [50.0, 50.0] });

    const response = await get('?bbox=41,41,42,42');
    expect(response.statusCode).toBe(200);
    const items = response.body.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    expect(items[0]!.slug).toBe(inside.slug);
  });

  it('city фильтр реально фильтрует', async () => {
    const batumi = await seedPublished({ city: 'batumi' });
    await seedPublished({ city: 'tbilisi' });

    const response = await get('?city=batumi');
    expect(response.statusCode).toBe(200);
    const items = response.body.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    expect(items[0]!.slug).toBe(batumi.slug);
  });

  it('лишний query-параметр отклоняется 400 (forbidNonWhitelisted реально работает через новый DTO)', async () => {
    const response = await get('?foo=bar');
    expect(response.statusCode).toBe(400);
  });

  it('пустой результат — 200 с items:[] и nextCursor:null, не ошибка', async () => {
    const response = await get('?city=nonexistent-city');
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ items: [], nextCursor: null });
  });

  it('publication_pending/unpublished/build_failed не попадают в list — только published', async () => {
    const published = await seedPublished();
    await seedNonPublished('publication_pending');
    await seedNonPublished('unpublished');
    await seedNonPublished('build_failed');

    const response = await get('?limit=50');
    expect(response.statusCode).toBe(200);
    const items = response.body.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    expect(items[0]!.slug).toBe(published.slug);
  });
});

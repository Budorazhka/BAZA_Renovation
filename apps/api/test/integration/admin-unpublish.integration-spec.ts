import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MarketplacePublicationRepository } from '@baza/publication';
import { AdminModule } from '../../src/modules/admin/admin.module';
import { AdminPublicationService } from '../../src/modules/admin/admin-publication.service';
import { AdminAccountService } from '../../src/modules/admin/admin-account.service';
import { AuthService } from '../../src/modules/identity/auth.service';
import type { AdminContext } from '../../src/shared/admin/admin-context';
import { withSession } from './support/with-session';

/**
 * Integration-тест против РЕАЛЬНОГО MongoDB single-node replica set
 * (mongodb-memory-server, не мок Model) — закрывает честный пробел,
 * зафиксированный в d06-admin-operation.md "Не реализовано": admin-модуль
 * был покрыт только unit-тестами с моками + DI-граф boot-тестом (который
 * не проверяет саму транзакцию unpublish). Тот же паттерн, что уже
 * установлен media-confirm-upload.integration-spec.ts и
 * developments-transactions.integration-spec.ts.
 *
 * Использует ПОЛНЫЙ AdminModule — AdminPublicationService зависит от
 * PublicationService/AdminPolicyService, оба сами транзитивно тянут
 * AuditModule/OutboxModule/AuthorizationModule; проще взять готовый модуль
 * целиком, чем дублировать граф зависимостей здесь.
 */
describe('AdminPublicationService.unpublish — integration (real MongoDB transaction)', () => {
  let replSet: MongoMemoryReplSet;
  let connection: Connection;
  let adminPublicationService: AdminPublicationService;
  let adminAccountService: AdminAccountService;
  let authService: AuthService;
  let publicationRepository: MarketplacePublicationRepository;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await replSet.waitUntilRunning();
    const uri = replSet.getUri();

    // ConfigModule (ДОБАВЛЕНО): AdminModule теперь импортирует
    // PropertyAssetsModule (admin duplicate-candidates review queue), которое
    // транзитивно тянет MediaModule → MediaStorageService, а тот требует
    // ConfigService в конструкторе (реальный S3Client) — тот же паттерн
    // фикса, что уже применён в developments-transactions.integration-spec.ts.
    process.env.MINIO_ENDPOINT ??= 'http://localhost:9000';
    process.env.MINIO_ACCESS_KEY ??= 'test-access-key';
    process.env.MINIO_SECRET_KEY ??= 'test-secret-key';
    process.env.MINIO_BUCKET_PRIVATE ??= 'test-private';
    process.env.MINIO_BUCKET_PUBLIC ??= 'test-public';
    process.env.REDIS_URL ??= 'redis://localhost:6379';

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), MongooseModule.forRoot(uri), AdminModule],
    }).compile();

    connection = moduleRef.get<Connection>(getConnectionToken());
    adminPublicationService = moduleRef.get(AdminPublicationService);
    adminAccountService = moduleRef.get(AdminAccountService);
    authService = moduleRef.get(AuthService);
    publicationRepository = moduleRef.get(MarketplacePublicationRepository);
  }, 120_000);

  afterAll(async () => {
    await connection?.close();
    await replSet?.stop();
  });

  afterEach(async () => {
    await connection.collection('marketplace_publications').deleteMany({});
    await connection.collection('audit_events').deleteMany({});
    await connection.collection('outbox_events').deleteMany({});
    await connection.collection('admin_accounts').deleteMany({});
    await connection.collection('product_accesses').deleteMany({});
    await connection.collection('sessions').deleteMany({});
    await connection.collection('identities').deleteMany({});
  });

  function makeSuperAdminContext(): AdminContext {
    return {
      identityId: new Types.ObjectId().toString(),
      adminAccountId: new Types.ObjectId().toString(),
      isSuperAdmin: true,
    };
  }

  it('созданный AdminAccount получает ProductAccess(admin) и может создать admin-сессию', async () => {
    const login = `admin-${new Types.ObjectId().toString()}@example.test`;
    const password = 'correct horse battery staple';
    const identityId = await authService.registerIdentity({ login, password });

    await adminAccountService.createAdminAccount(makeSuperAdminContext(), {
      identityId,
      isSuperAdmin: false,
      correlationId: 'integration-test-correlation-id',
    });

    const access = await connection.collection('product_accesses').findOne({ identityId, product: 'admin' });
    expect(access?.revokedAt).toBeUndefined();

    const session = await authService.login({ login, password, audience: 'admin' });
    expect(session.identityId.equals(identityId)).toBe(true);
    expect(session.sessionToken).toBeTruthy();
  });

  async function seedPublishedPublication(sourceId: Types.ObjectId, organizationId: Types.ObjectId) {
    await withSession(connection, (session) => publicationRepository.upsertPending({
      sourceType: 'development',
      sourceId,
      publisherScope: { type: 'organization', organizationId },
    }, session));
    await connection
      .collection('marketplace_publications')
      .updateOne({ sourceType: 'development', sourceId }, { $set: { status: 'published', slug: 'test-slug' } });
    const doc = await publicationRepository.findById(
      (await connection.collection('marketplace_publications').findOne({ sourceType: 'development', sourceId }))!
        ._id as Types.ObjectId,
    );
    return doc!;
  }

  it('атомарно коммитит status=unpublished + audit-запись + outbox-событие в одной транзакции', async () => {
    const sourceId = new Types.ObjectId();
    const organizationId = new Types.ObjectId();
    const publication = await seedPublishedPublication(sourceId, organizationId);

    const result = await adminPublicationService.unpublish(makeSuperAdminContext(), {
      publicationId: publication._id,
      reason: 'Нарушение правил размещения объявлений',
      correlationId: 'integration-test-correlation-id',
    });

    expect(result.status).toBe('unpublished');
    expect(result.unpublishReason).toBe('Нарушение правил размещения объявлений');

    const doc = await connection.collection('marketplace_publications').findOne({ _id: publication._id });
    expect(doc?.status).toBe('unpublished');
    expect(doc?.unpublishReason).toBe('Нарушение правил размещения объявлений');

    const auditDocs = await connection.collection('audit_events').find({ resourceId: sourceId }).toArray();
    expect(auditDocs).toHaveLength(1);
    expect(auditDocs[0]?.action).toBe('publication.unpublish');
    expect(auditDocs[0]?.actor).toMatchObject({ type: 'admin_account' });

    const outboxDocs = await connection.collection('outbox_events').find({ aggregateId: sourceId }).toArray();
    expect(outboxDocs).toHaveLength(1);
    expect(outboxDocs[0]?.eventType).toBe('UnpublicationRequested');
    expect(outboxDocs[0]?.status).toBe('pending');
  });

  it('бросает ConflictException при попытке unpublish уже unpublished записи, НЕ дублирует audit/outbox', async () => {
    const sourceId = new Types.ObjectId();
    const organizationId = new Types.ObjectId();
    const publication = await seedPublishedPublication(sourceId, organizationId);

    await adminPublicationService.unpublish(makeSuperAdminContext(), {
      publicationId: publication._id,
      reason: 'Первая причина отклонения',
      correlationId: 'integration-test-correlation-id',
    });

    await expect(
      adminPublicationService.unpublish(makeSuperAdminContext(), {
        publicationId: publication._id,
        reason: 'Вторая попытка снятия',
        correlationId: 'integration-test-correlation-id',
      }),
    ).rejects.toThrow();

    const auditCount = await connection.collection('audit_events').countDocuments({ resourceId: sourceId });
    expect(auditCount).toBe(1);
    const outboxCount = await connection.collection('outbox_events').countDocuments({ aggregateId: sourceId });
    expect(outboxCount).toBe(1);
  });

  it('бросает AppException(ADMIN_REASON_REQUIRED), если reason короче 10 символов, НЕ трогает запись', async () => {
    const sourceId = new Types.ObjectId();
    const organizationId = new Types.ObjectId();
    const publication = await seedPublishedPublication(sourceId, organizationId);

    await expect(
      adminPublicationService.unpublish(makeSuperAdminContext(), {
        publicationId: publication._id,
        reason: 'коротко',
        correlationId: 'integration-test-correlation-id',
      }),
    ).rejects.toThrow();

    const doc = await connection.collection('marketplace_publications').findOne({ _id: publication._id });
    expect(doc?.status).toBe('published');
  });

  /**
   * ADR-006 идемпотентность против реальной конкурентности — тот же
   * паттерн, что уже установлен для confirmUpload/updateUnitPrice: два
   * ПАРАЛЛЕЛЬНЫХ unpublish для одной и той же публикации (Promise.all) —
   * ровно один должен применить изменение, ровно один audit/outbox.
   */
  it('конкурентный unpublish для одной публикации: ровно один побеждает, второй получает конфликт', async () => {
    const sourceId = new Types.ObjectId();
    const organizationId = new Types.ObjectId();
    const publication = await seedPublishedPublication(sourceId, organizationId);

    const attempt = () =>
      adminPublicationService
        .unpublish(makeSuperAdminContext(), {
          publicationId: publication._id,
          reason: 'Конкурентная попытка снятия публикации',
          correlationId: 'integration-test-correlation-id',
        })
        .then(() => 'ok' as const)
        .catch(() => 'conflict' as const);

    const [first, second] = await Promise.all([attempt(), attempt()]);
    const outcomes = [first, second];

    expect(outcomes.filter((o) => o === 'ok')).toHaveLength(1);
    expect(outcomes.filter((o) => o === 'conflict')).toHaveLength(1);

    const auditCount = await connection.collection('audit_events').countDocuments({ resourceId: sourceId });
    expect(auditCount).toBe(1);
    const outboxCount = await connection.collection('outbox_events').countDocuments({ aggregateId: sourceId });
    expect(outboxCount).toBe(1);
  });
});

/**
 * D-06 (продолжение): "Admin может найти publication только в разрешённом
 * scope" (мастер-план) — до этого прохода не было HTTP-пути найти
 * publication, только unpublish по уже известному ID. Тот же bootstrap,
 * что unpublish-тесты выше (AdminModule, реальная MongoDB), новый describe
 * — не дублирует seedPublishedPublication (тот привязан к внешнему scope
 * этого файла).
 */
describe('AdminPublicationService.list — integration (real MongoDB, scope-фильтрация)', () => {
  let replSet: MongoMemoryReplSet;
  let connection: Connection;
  let adminPublicationService: AdminPublicationService;
  let adminAccountService: AdminAccountService;
  let authService: AuthService;
  let publicationRepository: MarketplacePublicationRepository;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await replSet.waitUntilRunning();
    const uri = replSet.getUri();

    // ConfigModule (ДОБАВЛЕНО): AdminModule теперь импортирует
    // PropertyAssetsModule (admin duplicate-candidates review queue), которое
    // транзитивно тянет MediaModule → MediaStorageService, а тот требует
    // ConfigService в конструкторе (реальный S3Client) — тот же паттерн
    // фикса, что уже применён в developments-transactions.integration-spec.ts.
    process.env.MINIO_ENDPOINT ??= 'http://localhost:9000';
    process.env.MINIO_ACCESS_KEY ??= 'test-access-key';
    process.env.MINIO_SECRET_KEY ??= 'test-secret-key';
    process.env.MINIO_BUCKET_PRIVATE ??= 'test-private';
    process.env.MINIO_BUCKET_PUBLIC ??= 'test-public';
    process.env.REDIS_URL ??= 'redis://localhost:6379';

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), MongooseModule.forRoot(uri), AdminModule],
    }).compile();

    connection = moduleRef.get<Connection>(getConnectionToken());
    adminPublicationService = moduleRef.get(AdminPublicationService);
    adminAccountService = moduleRef.get(AdminAccountService);
    authService = moduleRef.get(AuthService);
    publicationRepository = moduleRef.get(MarketplacePublicationRepository);
  }, 120_000);

  afterAll(async () => {
    await connection?.close();
    await replSet?.stop();
  });

  afterEach(async () => {
    await connection.collection('marketplace_publications').deleteMany({});
    await connection.collection('admin_accounts').deleteMany({});
    await connection.collection('product_accesses').deleteMany({});
    await connection.collection('permission_grants').deleteMany({});
    await connection.collection('identities').deleteMany({});
  });

  function makeSuperAdminContext(): AdminContext {
    return {
      identityId: new Types.ObjectId().toString(),
      adminAccountId: new Types.ObjectId().toString(),
      isSuperAdmin: true,
    };
  }

  /** Создаёт реального (не super) AdminAccount и выдаёт ему один grant тем же путём, что production. */
  async function seedScopedAdmin(grant: { resource: string; action: string; scope: 'global' | 'city'; scopeValue?: string }): Promise<AdminContext> {
    const login = `admin-${new Types.ObjectId().toString()}@example.test`;
    const identityId = await authService.registerIdentity({ login, password: 'correct horse battery staple' });
    const account = await adminAccountService.createAdminAccount(makeSuperAdminContext(), {
      identityId,
      isSuperAdmin: false,
      correlationId: 'integration-test-correlation-id',
    });
    await adminAccountService.grantPermission(makeSuperAdminContext(), {
      adminAccountId: account._id,
      resource: grant.resource,
      action: grant.action,
      scope: grant.scope,
      scopeValue: grant.scopeValue,
      correlationId: 'integration-test-correlation-id',
    });
    return { identityId: identityId.toString(), adminAccountId: account._id.toString(), isSuperAdmin: false };
  }

  async function seedPublication(params: { sourceType: 'development' | 'unit' | 'listing'; city: string; status: 'published' | 'unpublished' | 'build_failed' | 'publication_pending' }) {
    const sourceId = new Types.ObjectId();
    const organizationId = new Types.ObjectId();
    await withSession(connection, (session) => publicationRepository.upsertPending({ sourceType: params.sourceType, sourceId, publisherScope: { type: 'organization', organizationId } }, session));
    await connection.collection('marketplace_publications').updateOne(
      { sourceType: params.sourceType, sourceId },
      { $set: { status: params.status, slug: `slug-${sourceId.toString()}`, searchProjection: { city: params.city } } },
    );
    return sourceId;
  }

  it('city-scoped admin видит только publication своего города через реальный HTTP-путь сервиса', async () => {
    await seedPublication({ sourceType: 'development', city: 'batumi', status: 'published' });
    await seedPublication({ sourceType: 'development', city: 'tbilisi', status: 'published' });
    const adminContext = await seedScopedAdmin({ resource: 'development', action: 'read', scope: 'city', scopeValue: 'batumi' });

    const result = await adminPublicationService.list(adminContext, { limit: 20 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.city).toBe('batumi');
  });

  it('admin без grant на unit не видит unit-публикации даже при grant только на development', async () => {
    await seedPublication({ sourceType: 'development', city: 'batumi', status: 'published' });
    await seedPublication({ sourceType: 'unit', city: 'batumi', status: 'published' });
    const adminContext = await seedScopedAdmin({ resource: 'development', action: 'read', scope: 'global' });

    const result = await adminPublicationService.list(adminContext, { limit: 20 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.sourceType).toBe('development');
  });

  it('unpublished и build_failed видны admin (не только published — ключевое отличие от public list)', async () => {
    await seedPublication({ sourceType: 'development', city: 'batumi', status: 'unpublished' });
    await seedPublication({ sourceType: 'development', city: 'batumi', status: 'build_failed' });
    const adminContext = await seedScopedAdmin({ resource: 'development', action: 'read', scope: 'city', scopeValue: 'batumi' });

    const result = await adminPublicationService.list(adminContext, { limit: 20 });

    const statuses = result.items.map((item) => item.status).sort();
    expect(statuses).toEqual(['build_failed', 'unpublished']);
  });

  it('query-параметр sourceType вне разрешённого scope — пустой список, не ошибка (AND-сужение, не расширение)', async () => {
    await seedPublication({ sourceType: 'unit', city: 'batumi', status: 'published' });
    const adminContext = await seedScopedAdmin({ resource: 'development', action: 'read', scope: 'global' });

    const result = await adminPublicationService.list(adminContext, { sourceType: 'unit', limit: 20 });

    expect(result.items).toEqual([]);
  });

  it('limit+1 пагинация: N+1 seed, limit=N → N items и non-null nextCursor, второй запрос — 1 item и nextCursor:null', async () => {
    await seedPublication({ sourceType: 'development', city: 'batumi', status: 'published' });
    await seedPublication({ sourceType: 'development', city: 'batumi', status: 'published' });
    await seedPublication({ sourceType: 'development', city: 'batumi', status: 'published' });
    const adminContext = await seedScopedAdmin({ resource: 'development', action: 'read', scope: 'global' });

    const first = await adminPublicationService.list(adminContext, { limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();

    const second = await adminPublicationService.list(adminContext, { cursor: first.nextCursor!, limit: 2 });
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
  });

  it('admin без единого read-гранта — пустой список (deny-by-default), не ошибка', async () => {
    await seedPublication({ sourceType: 'development', city: 'batumi', status: 'published' });
    const login = `admin-${new Types.ObjectId().toString()}@example.test`;
    const identityId = await authService.registerIdentity({ login, password: 'correct horse battery staple' });
    const account = await adminAccountService.createAdminAccount(makeSuperAdminContext(), {
      identityId,
      isSuperAdmin: false,
      correlationId: 'integration-test-correlation-id',
    });

    const result = await adminPublicationService.list(
      { identityId: identityId.toString(), adminAccountId: account._id.toString(), isSuperAdmin: false },
      { limit: 20 },
    );

    expect(result).toEqual({ items: [], nextCursor: null });
  });

  it('super_admin видит publication всех sourceType/городов без единого grant', async () => {
    await seedPublication({ sourceType: 'development', city: 'batumi', status: 'published' });
    await seedPublication({ sourceType: 'unit', city: 'tbilisi', status: 'published' });

    const result = await adminPublicationService.list(makeSuperAdminContext(), { limit: 20 });

    expect(result.items).toHaveLength(2);
  });
});

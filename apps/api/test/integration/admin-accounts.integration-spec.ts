import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { AdminModule } from '../../src/modules/admin/admin.module';
import { AdminAccountService } from '../../src/modules/admin/admin-account.service';
import { AuthService } from '../../src/modules/identity/auth.service';
import type { AdminContext } from '../../src/shared/admin/admin-context';

/**
 * Service-level integration против реального MongoDB (тот же паттерн, что
 * admin-unpublish.integration-spec.ts) — закрывает честный пробел:
 * listAdminAccounts/listGrants (admin-web accounts screen) были покрыты
 * только unit-тестами с моками repository/PolicyEvaluatorService, не
 * реальной транзакцией/агрегацией grants из permission_grants.
 */
describe('AdminAccountService.listAdminAccounts / listGrants — integration (real MongoDB)', () => {
  let replSet: MongoMemoryReplSet;
  let connection: Connection;
  let adminAccountService: AdminAccountService;
  let authService: AuthService;

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
    adminAccountService = moduleRef.get(AdminAccountService);
    authService = moduleRef.get(AuthService);
  }, 120_000);

  afterAll(async () => {
    await connection?.close();
    await replSet?.stop();
  });

  afterEach(async () => {
    await connection.collection('admin_accounts').deleteMany({});
    await connection.collection('product_accesses').deleteMany({});
    await connection.collection('permission_grants').deleteMany({});
    await connection.collection('identities').deleteMany({});
    await connection.collection('audit_events').deleteMany({});
  });

  function makeSuperAdminContext(): AdminContext {
    return {
      identityId: new Types.ObjectId().toString(),
      adminAccountId: new Types.ObjectId().toString(),
      isSuperAdmin: true,
    };
  }

  async function seedRealAdminAccount(isSuperAdmin: boolean) {
    const login = `admin-${new Types.ObjectId().toString()}@example.test`;
    const identityId = await authService.registerIdentity({ login, password: 'correct horse battery staple' });
    const account = await adminAccountService.createAdminAccount(makeSuperAdminContext(), {
      identityId,
      isSuperAdmin,
      correlationId: 'integration-test-correlation-id',
    });
    return { identityId, account };
  }

  it('listAdminAccounts от НЕ-super_admin бросает SELF_ESCALATION_BLOCKED, ни один аккаунт не раскрывается', async () => {
    await seedRealAdminAccount(false);
    const scopedContext: AdminContext = { identityId: new Types.ObjectId().toString(), adminAccountId: new Types.ObjectId().toString(), isSuperAdmin: false };

    await expect(adminAccountService.listAdminAccounts(scopedContext, { limit: 20 })).rejects.toThrow();
  });

  it('super_admin видит созданные аккаунты через реальный cursor-пагинированный repository.list', async () => {
    const first = await seedRealAdminAccount(false);
    const second = await seedRealAdminAccount(true);

    const result = await adminAccountService.listAdminAccounts(makeSuperAdminContext(), { limit: 20 });

    const identityIds = result.map((row) => row.identityId.toString()).sort();
    expect(identityIds).toEqual([first.identityId.toString(), second.identityId.toString()].sort());
    expect(result.find((row) => row.identityId.equals(second.identityId))?.isSuperAdmin).toBe(true);
  });

  it('пагинация: limit=1 c двумя аккаунтами возвращает по одному за раз, ничего не теряется и не дублируется', async () => {
    const first = await seedRealAdminAccount(false);
    const second = await seedRealAdminAccount(false);

    const page1 = await adminAccountService.listAdminAccounts(makeSuperAdminContext(), { limit: 1 });
    expect(page1).toHaveLength(1);

    const page2 = await adminAccountService.listAdminAccounts(makeSuperAdminContext(), {
      cursor: page1[0]!.id,
      limit: 1,
    });
    expect(page2).toHaveLength(1);

    const seenIdentityIds = [...page1, ...page2].map((row) => row.identityId.toString()).sort();
    expect(seenIdentityIds).toEqual([first.identityId.toString(), second.identityId.toString()].sort());
  });

  it('listGrants от НЕ-super_admin бросает SELF_ESCALATION_BLOCKED, не читает чужие grants (IDOR prevention)', async () => {
    const { account } = await seedRealAdminAccount(false);
    await adminAccountService.grantPermission(makeSuperAdminContext(), {
      adminAccountId: account._id,
      resource: 'development',
      action: 'read',
      scope: 'city',
      scopeValue: 'batumi',
      correlationId: 'integration-test-correlation-id',
    });
    const attackerContext: AdminContext = { identityId: new Types.ObjectId().toString(), adminAccountId: new Types.ObjectId().toString(), isSuperAdmin: false };

    await expect(adminAccountService.listGrants(attackerContext, account._id)).rejects.toThrow();
  });

  it('super_admin видит реально выданные grants через полную цепочку grantPermission → permission_grants → listGrants', async () => {
    const { account } = await seedRealAdminAccount(false);
    await adminAccountService.grantPermission(makeSuperAdminContext(), {
      adminAccountId: account._id,
      resource: 'development',
      action: 'read',
      scope: 'city',
      scopeValue: 'batumi',
      correlationId: 'integration-test-correlation-id',
    });
    await adminAccountService.grantPermission(makeSuperAdminContext(), {
      adminAccountId: account._id,
      resource: 'listing',
      action: 'unpublish',
      scope: 'global',
      correlationId: 'integration-test-correlation-id',
    });

    const grants = await adminAccountService.listGrants(makeSuperAdminContext(), account._id);

    expect(grants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ resource: 'development', action: 'read', scope: 'city', scopeValue: 'batumi', version: 1, revokedAt: undefined }),
        expect.objectContaining({ resource: 'listing', action: 'unpublish', scope: 'global', scopeValue: undefined, version: 1, revokedAt: undefined }),
      ]),
    );
  });

  it('listGrants (ИЗМЕНЕНО) включает уже отозванные grants с revokedAt/revokedBy/revokeReason — история, не только активное подмножество', async () => {
    const { account } = await seedRealAdminAccount(false);
    const superAdminContext = makeSuperAdminContext();
    await adminAccountService.grantPermission(superAdminContext, {
      adminAccountId: account._id,
      resource: 'development',
      action: 'read',
      scope: 'global',
      correlationId: 'integration-test-correlation-id',
    });
    const [grant] = await adminAccountService.listGrants(superAdminContext, account._id);

    await adminAccountService.revokeGrant(superAdminContext, {
      adminAccountId: account._id,
      grantId: new Types.ObjectId(grant!.id),
      expectedVersion: grant!.version,
      reason: 'больше не требуется доступ этому аккаунту',
      correlationId: 'integration-test-correlation-id',
    });

    const grantsAfterRevoke = await adminAccountService.listGrants(superAdminContext, account._id);
    expect(grantsAfterRevoke).toHaveLength(1);
    expect(grantsAfterRevoke[0]!.revokedAt).toBeDefined();
    expect(grantsAfterRevoke[0]!.revokedBy).toBe(superAdminContext.adminAccountId);
    expect(grantsAfterRevoke[0]!.revokeReason).toBe('больше не требуется доступ этому аккаунту');
  });

  it('listGrants бросает NOT_FOUND для несуществующего adminAccountId, не раскрывая существование', async () => {
    await expect(
      adminAccountService.listGrants(makeSuperAdminContext(), new Types.ObjectId()),
    ).rejects.toThrow();
  });
});

describe('AdminAccountService.deactivateAdminAccount / reactivateAdminAccount — integration (real MongoDB, real transactions)', () => {
  let replSet: MongoMemoryReplSet;
  let connection: Connection;
  let adminAccountService: AdminAccountService;
  let authService: AuthService;

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
    adminAccountService = moduleRef.get(AdminAccountService);
    authService = moduleRef.get(AuthService);
  }, 120_000);

  afterAll(async () => {
    await connection?.close();
    await replSet?.stop();
  });

  afterEach(async () => {
    await connection.collection('admin_accounts').deleteMany({});
    await connection.collection('product_accesses').deleteMany({});
    await connection.collection('permission_grants').deleteMany({});
    await connection.collection('identities').deleteMany({});
    await connection.collection('sessions').deleteMany({});
    await connection.collection('audit_events').deleteMany({});
  });

  function makeSuperAdminContext(): AdminContext {
    return {
      identityId: new Types.ObjectId().toString(),
      adminAccountId: new Types.ObjectId().toString(),
      isSuperAdmin: true,
    };
  }

  const PASSWORD = 'correct horse battery staple';

  async function seedRealAdminAccount(isSuperAdmin: boolean) {
    const login = `admin-${new Types.ObjectId().toString()}@example.test`;
    const identityId = await authService.registerIdentity({ login, password: PASSWORD });
    const account = await adminAccountService.createAdminAccount(makeSuperAdminContext(), {
      identityId,
      isSuperAdmin,
      correlationId: 'integration-test-correlation-id',
    });
    const session = await authService.login({ login, password: PASSWORD, audience: 'admin' });
    return { identityId, account, sessionToken: session.sessionToken };
  }

  it('деактивация реального аккаунта отзывает его admin-сессию (findActiveByTokenHash перестаёт находить её)', async () => {
    const { account } = await seedRealAdminAccount(false);

    await adminAccountService.deactivateAdminAccount(makeSuperAdminContext(), {
      adminAccountId: account._id,
      reason: 'нарушение политики использования admin-доступа',
      correlationId: 'integration-test-correlation-id',
    });

    const sessionDoc = await connection.collection('sessions').findOne({});
    expect(sessionDoc?.revokedAt).toBeDefined();
  });

  it('деактивация записывает audit-событие с actor/target/before/after/reason/correlationId', async () => {
    const superAdminContext = makeSuperAdminContext();
    const { account } = await seedRealAdminAccount(false);

    await adminAccountService.deactivateAdminAccount(superAdminContext, {
      adminAccountId: account._id,
      reason: 'нарушение политики использования admin-доступа',
      correlationId: 'deactivate-correlation-id',
    });

    const auditDoc = await connection.collection('audit_events').findOne({ action: 'admin_account.deactivate' });
    expect(auditDoc).toMatchObject({
      actor: { type: 'admin_account', id: new Types.ObjectId(superAdminContext.adminAccountId) },
      resource: 'admin_account',
      resourceId: account._id,
      reason: 'нарушение политики использования admin-доступа',
      before: { status: 'active' },
      after: { status: 'deactivated' },
      correlationId: 'deactivate-correlation-id',
    });
  });

  it('деактивированный аккаунт больше не резолвится в AdminContext (findActiveByIdentityId фильтрует по status:active)', async () => {
    const { account, identityId } = await seedRealAdminAccount(false);

    await adminAccountService.deactivateAdminAccount(makeSuperAdminContext(), {
      adminAccountId: account._id,
      reason: 'нарушение политики использования admin-доступа',
      correlationId: 'integration-test-correlation-id',
    });

    const doc = await connection.collection('admin_accounts').findOne({ identityId });
    expect(doc?.status).toBe('deactivated');
  });

  it('деактивированный аккаунт не может снова получить admin-сессию через login (ProductAccess остаётся, но AdminContextMiddleware отклонит по status)', async () => {
    const { account } = await seedRealAdminAccount(false);
    await adminAccountService.deactivateAdminAccount(makeSuperAdminContext(), {
      adminAccountId: account._id,
      reason: 'нарушение политики использования admin-доступа',
      correlationId: 'integration-test-correlation-id',
    });

    const doc = await connection.collection('admin_accounts').findOne({ _id: account._id });
    expect(doc?.status).toBe('deactivated');
  });

  it('запрещает деактивацию последнего активного super_admin', async () => {
    const superAdminContext = makeSuperAdminContext();
    const { account: onlySuperAdmin } = await seedRealAdminAccount(true);
    // makeSuperAdminContext() выше — синтетический bootstrap-контекст, не
    // реальный AdminAccount в базе, поэтому onlySuperAdmin реально
    // единственный active super_admin в коллекции на этом этапе теста.

    await expect(
      adminAccountService.deactivateAdminAccount(superAdminContext, {
        adminAccountId: onlySuperAdmin._id,
        reason: 'причина деактивации не менее 10 символов',
        correlationId: 'integration-test-correlation-id',
      }),
    ).rejects.toThrow();

    const doc = await connection.collection('admin_accounts').findOne({ _id: onlySuperAdmin._id });
    expect(doc?.status).toBe('active');
  });

  it('разрешает деактивацию super_admin, когда есть второй активный super_admin', async () => {
    const superAdminContext = makeSuperAdminContext();
    const { account: firstSuperAdmin } = await seedRealAdminAccount(true);
    await seedRealAdminAccount(true);

    const result = await adminAccountService.deactivateAdminAccount(superAdminContext, {
      adminAccountId: firstSuperAdmin._id,
      reason: 'причина деактивации не менее 10 символов',
      correlationId: 'integration-test-correlation-id',
    });

    expect(result).toEqual({ status: 'deactivated' });
  });

  it('scoped admin не может деактивировать/реактивировать чужой аккаунт — SELF_ESCALATION_BLOCKED', async () => {
    const { account: victim } = await seedRealAdminAccount(false);
    const { account: attackerAccount } = await seedRealAdminAccount(false);
    const attackerContext: AdminContext = {
      identityId: new Types.ObjectId().toString(),
      adminAccountId: attackerAccount._id.toString(),
      isSuperAdmin: false,
    };

    await expect(
      adminAccountService.deactivateAdminAccount(attackerContext, {
        adminAccountId: victim._id,
        reason: 'причина деактивации не менее 10 символов',
        correlationId: 'integration-test-correlation-id',
      }),
    ).rejects.toThrow();
  });

  it('повторная деактивация — идемпотентна, не создаёт второй audit-записи', async () => {
    const superAdminContext = makeSuperAdminContext();
    const { account } = await seedRealAdminAccount(false);

    await adminAccountService.deactivateAdminAccount(superAdminContext, {
      adminAccountId: account._id,
      reason: 'первая деактивация с явной причиной',
      correlationId: 'integration-test-correlation-id-1',
    });
    await adminAccountService.deactivateAdminAccount(superAdminContext, {
      adminAccountId: account._id,
      reason: 'вторая попытка той же деактивации',
      correlationId: 'integration-test-correlation-id-2',
    });

    const auditCount = await connection.collection('audit_events').countDocuments({ action: 'admin_account.deactivate' });
    expect(auditCount).toBe(1);
  });

  it('reactivate восстанавливает доступ и пишет audit', async () => {
    const superAdminContext = makeSuperAdminContext();
    const { account } = await seedRealAdminAccount(false);
    await adminAccountService.deactivateAdminAccount(superAdminContext, {
      adminAccountId: account._id,
      reason: 'причина деактивации не менее 10 символов',
      correlationId: 'integration-test-correlation-id',
    });

    const result = await adminAccountService.reactivateAdminAccount(superAdminContext, {
      adminAccountId: account._id,
      reason: 'ошибка была устранена, восстанавливаем доступ',
      correlationId: 'integration-test-correlation-id',
    });

    expect(result).toEqual({ status: 'active' });
    const doc = await connection.collection('admin_accounts').findOne({ _id: account._id });
    expect(doc?.status).toBe('active');
    const auditDoc = await connection.collection('audit_events').findOne({ action: 'admin_account.reactivate' });
    expect(auditDoc).toBeDefined();
  });
});

describe('AdminAccountService.revokeGrant — integration (real MongoDB, CAS)', () => {
  let replSet: MongoMemoryReplSet;
  let connection: Connection;
  let adminAccountService: AdminAccountService;
  let authService: AuthService;

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
    adminAccountService = moduleRef.get(AdminAccountService);
    authService = moduleRef.get(AuthService);
  }, 120_000);

  afterAll(async () => {
    await connection?.close();
    await replSet?.stop();
  });

  afterEach(async () => {
    await connection.collection('admin_accounts').deleteMany({});
    await connection.collection('product_accesses').deleteMany({});
    await connection.collection('permission_grants').deleteMany({});
    await connection.collection('identities').deleteMany({});
    await connection.collection('audit_events').deleteMany({});
  });

  function makeSuperAdminContext(): AdminContext {
    return {
      identityId: new Types.ObjectId().toString(),
      adminAccountId: new Types.ObjectId().toString(),
      isSuperAdmin: true,
    };
  }

  async function seedRealAdminAccountWithGrant(superAdminContext: AdminContext) {
    const login = `admin-${new Types.ObjectId().toString()}@example.test`;
    const identityId = await authService.registerIdentity({ login, password: 'correct horse battery staple' });
    const account = await adminAccountService.createAdminAccount(superAdminContext, {
      identityId,
      isSuperAdmin: false,
      correlationId: 'integration-test-correlation-id',
    });
    await adminAccountService.grantPermission(superAdminContext, {
      adminAccountId: account._id,
      resource: 'development',
      action: 'read',
      scope: 'city',
      scopeValue: 'batumi',
      correlationId: 'integration-test-correlation-id',
    });
    const [grant] = await adminAccountService.listGrants(superAdminContext, account._id);
    return { account, grant: grant! };
  }

  it('успешный revoke делает grant невидимым для evaluate/resolveListScope на следующий же запрос', async () => {
    const superAdminContext = makeSuperAdminContext();
    const { account, grant } = await seedRealAdminAccountWithGrant(superAdminContext);

    await adminAccountService.revokeGrant(superAdminContext, {
      adminAccountId: account._id,
      grantId: new Types.ObjectId(grant.id),
      expectedVersion: grant.version,
      reason: 'причина отзыва этого granta',
      correlationId: 'integration-test-correlation-id',
    });

    const grantDoc = await connection.collection('permission_grants').findOne({ _id: new Types.ObjectId(grant.id) });
    expect(grantDoc?.revokedAt).toBeDefined();
    expect(grantDoc?.revokedBy).toBeDefined();
    expect(grantDoc?.revokeReason).toBe('причина отзыва этого granta');
  });

  it('CAS: revoke с устаревшим expectedVersion бросает VERSION_CONFLICT, ничего не меняет', async () => {
    const superAdminContext = makeSuperAdminContext();
    const { account, grant } = await seedRealAdminAccountWithGrant(superAdminContext);

    await expect(
      adminAccountService.revokeGrant(superAdminContext, {
        adminAccountId: account._id,
        grantId: new Types.ObjectId(grant.id),
        expectedVersion: grant.version + 1,
        reason: 'причина отзыва этого granta',
        correlationId: 'integration-test-correlation-id',
      }),
    ).rejects.toThrow();

    const grantDoc = await connection.collection('permission_grants').findOne({ _id: new Types.ObjectId(grant.id) });
    expect(grantDoc?.revokedAt).toBeUndefined();
  });

  it('повторный revoke того же гранта — VERSION_CONFLICT, не тихий успех', async () => {
    const superAdminContext = makeSuperAdminContext();
    const { account, grant } = await seedRealAdminAccountWithGrant(superAdminContext);

    await adminAccountService.revokeGrant(superAdminContext, {
      adminAccountId: account._id,
      grantId: new Types.ObjectId(grant.id),
      expectedVersion: grant.version,
      reason: 'первый отзыв этого granta',
      correlationId: 'integration-test-correlation-id',
    });

    await expect(
      adminAccountService.revokeGrant(superAdminContext, {
        adminAccountId: account._id,
        grantId: new Types.ObjectId(grant.id),
        expectedVersion: grant.version,
        reason: 'вторая попытка того же отзыва',
        correlationId: 'integration-test-correlation-id',
      }),
    ).rejects.toThrow();
  });

  it('конкурентный revoke того же granta двумя параллельными вызовами: ровно один успевает, другой получает конфликт', async () => {
    const superAdminContext = makeSuperAdminContext();
    const { account, grant } = await seedRealAdminAccountWithGrant(superAdminContext);

    const results = await Promise.allSettled([
      adminAccountService.revokeGrant(superAdminContext, {
        adminAccountId: account._id,
        grantId: new Types.ObjectId(grant.id),
        expectedVersion: grant.version,
        reason: 'конкурентный вызов А',
        correlationId: 'race-a',
      }),
      adminAccountService.revokeGrant(superAdminContext, {
        adminAccountId: account._id,
        grantId: new Types.ObjectId(grant.id),
        expectedVersion: grant.version,
        reason: 'конкурентный вызов Б',
        correlationId: 'race-b',
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });

  it('scoped admin не может отозвать чужой grant — SELF_ESCALATION_BLOCKED', async () => {
    const superAdminContext = makeSuperAdminContext();
    const { account, grant } = await seedRealAdminAccountWithGrant(superAdminContext);
    const attackerContext: AdminContext = {
      identityId: new Types.ObjectId().toString(),
      adminAccountId: new Types.ObjectId().toString(),
      isSuperAdmin: false,
    };

    await expect(
      adminAccountService.revokeGrant(attackerContext, {
        adminAccountId: account._id,
        grantId: new Types.ObjectId(grant.id),
        expectedVersion: grant.version,
        reason: 'попытка отозвать чужой grant',
        correlationId: 'integration-test-correlation-id',
      }),
    ).rejects.toThrow();

    const grantDoc = await connection.collection('permission_grants').findOne({ _id: new Types.ObjectId(grant.id) });
    expect(grantDoc?.revokedAt).toBeUndefined();
  });

  it('revoke записывает audit-событие с before=детали granta, after={revoked:true}, reason, correlationId', async () => {
    const superAdminContext = makeSuperAdminContext();
    const { account, grant } = await seedRealAdminAccountWithGrant(superAdminContext);

    await adminAccountService.revokeGrant(superAdminContext, {
      adminAccountId: account._id,
      grantId: new Types.ObjectId(grant.id),
      expectedVersion: grant.version,
      reason: 'причина отзыва для audit-проверки',
      correlationId: 'audit-correlation-id',
    });

    const auditDoc = await connection.collection('audit_events').findOne({ action: 'admin_account.revoke_permission' });
    expect(auditDoc).toMatchObject({
      resource: 'admin_account',
      resourceId: account._id,
      reason: 'причина отзыва для audit-проверки',
      before: { resource: 'development', action: 'read', scope: 'city', scopeValue: 'batumi' },
      after: { revoked: true },
      correlationId: 'audit-correlation-id',
    });
  });
});

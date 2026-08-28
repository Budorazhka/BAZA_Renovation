import { Test } from '@nestjs/testing';
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

    const moduleRef = await Test.createTestingModule({
      imports: [MongooseModule.forRoot(uri), AdminModule],
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
        { resource: 'development', action: 'read', scope: 'city', scopeValue: 'batumi' },
        { resource: 'listing', action: 'unpublish', scope: 'global', scopeValue: undefined },
      ]),
    );
  });

  it('listGrants бросает NOT_FOUND для несуществующего adminAccountId, не раскрывая существование', async () => {
    await expect(
      adminAccountService.listGrants(makeSuperAdminContext(), new Types.ObjectId()),
    ).rejects.toThrow();
  });
});

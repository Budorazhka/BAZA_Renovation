import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { PropertyAssetRepository, DuplicateCandidateRepository } from '@baza/property-assets';
import { AdminModule } from '../../src/modules/admin/admin.module';
import { AdminDuplicateCandidateService } from '../../src/modules/admin/admin-duplicate-candidate.service';
import { AdminAccountService } from '../../src/modules/admin/admin-account.service';
import { AuthService } from '../../src/modules/identity/auth.service';
import { PropertyAssetsModule } from '../../src/modules/property-assets/property-assets.module';
import type { AdminContext } from '../../src/shared/admin/admin-context';

/**
 * Admin duplicate-candidates review queue (DEDUPE-001) — тот же паттерн,
 * что admin-unpublish.integration-spec.ts: реальный MongoDB single-node
 * replica set, полный AdminModule (не мок-граф). Закрывает честный gap —
 * DuplicateCandidateRepository.listForReview/markConfirmedDuplicate
 * существовали в @baza/property-assets, но не были подключены ни к одному
 * HTTP/service-пути до этого прохода.
 */
describe('AdminDuplicateCandidateService — integration (real MongoDB)', () => {
  let replSet: MongoMemoryReplSet;
  let connection: Connection;
  let service: AdminDuplicateCandidateService;
  let adminAccountService: AdminAccountService;
  let authService: AuthService;
  let propertyAssetRepository: PropertyAssetRepository;
  let duplicateCandidateRepository: DuplicateCandidateRepository;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await replSet.waitUntilRunning();
    const uri = replSet.getUri();

    // ConfigModule: AdminModule импортирует PropertyAssetsModule, которое
    // транзитивно тянет MediaModule → MediaStorageService (требует
    // ConfigService в конструкторе, реальный S3Client) — тот же паттерн
    // фикса, что developments-transactions.integration-spec.ts.
    process.env.MINIO_ENDPOINT ??= 'http://localhost:9000';
    process.env.MINIO_ACCESS_KEY ??= 'test-access-key';
    process.env.MINIO_SECRET_KEY ??= 'test-secret-key';
    process.env.MINIO_BUCKET_PRIVATE ??= 'test-private';
    process.env.MINIO_BUCKET_PUBLIC ??= 'test-public';
    process.env.REDIS_URL ??= 'redis://localhost:6379';

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), MongooseModule.forRoot(uri), AdminModule, PropertyAssetsModule],
    }).compile();

    connection = moduleRef.get<Connection>(getConnectionToken());
    service = moduleRef.get(AdminDuplicateCandidateService);
    adminAccountService = moduleRef.get(AdminAccountService);
    authService = moduleRef.get(AuthService);
    propertyAssetRepository = moduleRef.get(PropertyAssetRepository);
    duplicateCandidateRepository = moduleRef.get(DuplicateCandidateRepository);
  }, 120_000);

  afterAll(async () => {
    await connection?.close();
    await replSet?.stop();
  });

  afterEach(async () => {
    for (const collection of [
      'property_assets',
      'duplicate_candidates',
      'audit_events',
      'admin_accounts',
      'product_accesses',
      'permission_grants',
      'sessions',
      'identities',
    ]) {
      await connection.collection(collection).deleteMany({});
    }
  });

  function makeSuperAdminContext(): AdminContext {
    return {
      identityId: new Types.ObjectId().toString(),
      adminAccountId: new Types.ObjectId().toString(),
      isSuperAdmin: true,
    };
  }

  /** Реальный (не super) AdminAccount + один grant тем же путём, что production. */
  async function seedScopedAdmin(grant: { resource: string; action: string }): Promise<AdminContext> {
    const login = `admin-${new Types.ObjectId().toString()}@example.test`;
    const identityId = await authService.registerIdentity({ login, password: 'correct horse battery staple' });
    const account = await adminAccountService.createAdminAccount(makeSuperAdminContext(), {
      identityId,
      isSuperAdmin: false,
      correlationId: 'integration-test-correlation-id', idempotency: { actorIdentityId: new Types.ObjectId(), key: new Types.ObjectId().toString(), requestBody: { probe: new Types.ObjectId().toString() } } });
    await adminAccountService.grantPermission(makeSuperAdminContext(), {
      adminAccountId: account._id,
      resource: grant.resource,
      action: grant.action,
      scope: 'global',
      correlationId: 'integration-test-correlation-id',
    });
    return { identityId: identityId.toString(), adminAccountId: account._id.toString(), isSuperAdmin: false };
  }

  async function seedAsset(overrides: Partial<{ city: string; phone: string }> = {}) {
    return propertyAssetRepository.create({
      publisherScope: { type: 'organization', organizationId: new Types.ObjectId() },
      propertyType: 'apartment',
      location: {
        country: 'Georgia',
        city: overrides.city ?? 'Batumi',
        address: '1 Rustaveli St',
        geo: { type: 'Point', coordinates: [41.6, 41.6] },
      },
      characteristics: { area: 55, rooms: 2, floor: 5 },
      representativePhone: overrides.phone ?? '+995500000001',
      version: 0,
    });
  }

  async function seedCandidate(assetAId: Types.ObjectId, assetBId: Types.ObjectId) {
    return duplicateCandidateRepository.upsertDetected(assetAId, assetBId, {
      phoneMatch: true,
      addressMatch: false,
      roomsAreaFloorMatch: false,
    });
  }

  describe('list', () => {
    it('бросает без grant duplicate_candidate.read (deny-by-default, не пустой список — в отличие от publications)', async () => {
      const assetA = await seedAsset();
      const assetB = await seedAsset();
      await seedCandidate(assetA._id, assetB._id);
      const login = `admin-${new Types.ObjectId().toString()}@example.test`;
      const identityId = await authService.registerIdentity({ login, password: 'correct horse battery staple' });
      const account = await adminAccountService.createAdminAccount(makeSuperAdminContext(), {
        identityId,
        isSuperAdmin: false,
        correlationId: 'integration-test-correlation-id', idempotency: { actorIdentityId: new Types.ObjectId(), key: new Types.ObjectId().toString(), requestBody: { probe: new Types.ObjectId().toString() } } });

      await expect(
        service.list(
          { identityId: identityId.toString(), adminAccountId: account._id.toString(), isSuperAdmin: false },
          { limit: 20 },
        ),
      ).rejects.toThrow();
    });

    it('super_admin видит detected-кандидата с asset-парой без единого grant', async () => {
      const assetA = await seedAsset({ city: 'Batumi' });
      const assetB = await seedAsset({ city: 'Batumi' });
      await seedCandidate(assetA._id, assetB._id);

      const result = await service.list(makeSuperAdminContext(), { limit: 20 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        status: 'detected',
        signals: { phoneMatch: true },
      });
      expect(result.items[0]!.assetA?.location.city).toBe('Batumi');
      expect(result.items[0]!.assetB?.location.city).toBe('Batumi');
    });

    it('scoped admin с grant duplicate_candidate.read видит очередь', async () => {
      const assetA = await seedAsset();
      const assetB = await seedAsset();
      await seedCandidate(assetA._id, assetB._id);
      const adminContext = await seedScopedAdmin({ resource: 'duplicate_candidate', action: 'read' });

      const result = await service.list(adminContext, { limit: 20 });

      expect(result.items).toHaveLength(1);
    });

    it('дефолтная очередь (без status) не включает confirmed_duplicate', async () => {
      const assetA = await seedAsset();
      const assetB = await seedAsset();
      const assetC = await seedAsset();
      const assetD = await seedAsset();
      await seedCandidate(assetA._id, assetB._id); // detected
      const confirmedPair = await seedCandidate(assetC._id, assetD._id);
      await duplicateCandidateRepository.markConfirmedDuplicate(confirmedPair._id, {
        reason: 'Already reviewed earlier',
        confirmByAdminAccountId: new Types.ObjectId(),
      });

      const result = await service.list(makeSuperAdminContext(), { limit: 20 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.status).toBe('detected');
    });

    it('явный status=confirmed_duplicate показывает только подтверждённые', async () => {
      const assetA = await seedAsset();
      const assetB = await seedAsset();
      const confirmedPair = await seedCandidate(assetA._id, assetB._id);
      await duplicateCandidateRepository.markConfirmedDuplicate(confirmedPair._id, {
        reason: 'Already reviewed earlier',
        confirmByAdminAccountId: new Types.ObjectId(),
      });

      const result = await service.list(makeSuperAdminContext(), { status: 'confirmed_duplicate', limit: 20 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.status).toBe('confirmed_duplicate');
    });
  });

  describe('confirm', () => {
    it('бросает без grant duplicate_candidate.confirm', async () => {
      const assetA = await seedAsset();
      const assetB = await seedAsset();
      const candidate = await seedCandidate(assetA._id, assetB._id);
      const login = `admin-${new Types.ObjectId().toString()}@example.test`;
      const identityId = await authService.registerIdentity({ login, password: 'correct horse battery staple' });
      const account = await adminAccountService.createAdminAccount(makeSuperAdminContext(), {
        identityId,
        isSuperAdmin: false,
        correlationId: 'integration-test-correlation-id', idempotency: { actorIdentityId: new Types.ObjectId(), key: new Types.ObjectId().toString(), requestBody: { probe: new Types.ObjectId().toString() } } });

      await expect(
        service.confirm(
          { identityId: identityId.toString(), adminAccountId: account._id.toString(), isSuperAdmin: false },
          { duplicateCandidateId: candidate._id, reason: 'Verified same physical unit', correlationId: 'corr' },
        ),
      ).rejects.toThrow();
    });

    it('переводит detected → confirmed_duplicate и пишет audit c actor:admin_account', async () => {
      const assetA = await seedAsset();
      const assetB = await seedAsset();
      const candidate = await seedCandidate(assetA._id, assetB._id);
      const adminContext = makeSuperAdminContext();

      await service.confirm(adminContext, {
        duplicateCandidateId: candidate._id,
        reason: 'Verified same physical unit by phone',
        correlationId: 'integration-test-correlation-id',
      });

      const updated = await connection.collection('duplicate_candidates').findOne({ _id: candidate._id });
      expect(updated?.status).toBe('confirmed_duplicate');
      expect(updated?.confirmReason).toBe('Verified same physical unit by phone');

      const auditDocs = await connection.collection('audit_events').find({ resourceId: candidate._id }).toArray();
      expect(auditDocs).toHaveLength(1);
      expect(auditDocs[0]?.action).toBe('duplicate_candidate.confirm');
      expect(auditDocs[0]?.actor).toMatchObject({ type: 'admin_account' });
    });

    it('admin может confirm ИЗ override_not_duplicate (отменяет решение владельца)', async () => {
      const assetA = await seedAsset();
      const assetB = await seedAsset();
      const candidate = await seedCandidate(assetA._id, assetB._id);
      await duplicateCandidateRepository.override(candidate._id, {
        overrideReason: 'Owner claims not the same unit',
        overrideByIdentityId: new Types.ObjectId(),
      });

      await service.confirm(makeSuperAdminContext(), {
        duplicateCandidateId: candidate._id,
        reason: 'Admin disagrees with owner override',
        correlationId: 'integration-test-correlation-id',
      });

      const updated = await connection.collection('duplicate_candidates').findOne({ _id: candidate._id });
      expect(updated?.status).toBe('confirmed_duplicate');
    });

    it('бросает при повторном confirm уже confirmed_duplicate, не дублирует audit', async () => {
      const assetA = await seedAsset();
      const assetB = await seedAsset();
      const candidate = await seedCandidate(assetA._id, assetB._id);
      const adminContext = makeSuperAdminContext();

      await service.confirm(adminContext, {
        duplicateCandidateId: candidate._id,
        reason: 'First confirmation of the duplicate',
        correlationId: 'integration-test-correlation-id',
      });

      await expect(
        service.confirm(adminContext, {
          duplicateCandidateId: candidate._id,
          reason: 'Second confirmation attempt',
          correlationId: 'integration-test-correlation-id',
        }),
      ).rejects.toThrow();

      const auditCount = await connection.collection('audit_events').countDocuments({ resourceId: candidate._id });
      expect(auditCount).toBe(1);
    });

    it('бросает при reason короче 10 символов, не трогает запись', async () => {
      const assetA = await seedAsset();
      const assetB = await seedAsset();
      const candidate = await seedCandidate(assetA._id, assetB._id);

      await expect(
        service.confirm(makeSuperAdminContext(), {
          duplicateCandidateId: candidate._id,
          reason: 'коротко',
          correlationId: 'integration-test-correlation-id',
        }),
      ).rejects.toThrow();

      const doc = await connection.collection('duplicate_candidates').findOne({ _id: candidate._id });
      expect(doc?.status).toBe('detected');
    });
  });
});

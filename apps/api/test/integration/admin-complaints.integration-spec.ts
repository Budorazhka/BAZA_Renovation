import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { PropertyAssetRepository, ListingRepository } from '@baza/property-assets';
import { MarketplacePublicationRepository } from '@baza/publication';
import { AdminModule } from '../../src/modules/admin/admin.module';
import { AdminComplaintService } from '../../src/modules/admin/admin-complaint.service';
import { AdminAccountService } from '../../src/modules/admin/admin-account.service';
import { AuthService } from '../../src/modules/identity/auth.service';
import { PropertyAssetsModule } from '../../src/modules/property-assets/property-assets.module';
import { ComplaintService } from '../../src/modules/property-assets/complaint.service';
import type { AdminContext } from '../../src/shared/admin/admin-context';
import { withSession } from './support/with-session';

/**
 * ADMIN-OPS-001 сквозной сценарий: подать жалобу (анонимно, через
 * ComplaintService.submit — тот же сервис, что вызывает публичный
 * PublicComplaintController) → admin видит её в city-scoped очереди →
 * резолюция upheld снимает listing с публикации через УЖЕ существующий
 * D-06 admin unpublish-путь (AdminPublicationService.unpublish) → audit
 * записан на оба действия (complaint.resolve и publication.unpublish).
 * Тот же паттерн, что admin-duplicate-candidates.integration-spec.ts —
 * реальный MongoDB single-node replica set, полный AdminModule.
 */
describe('AdminComplaintService — integration (real MongoDB)', () => {
  let replSet: MongoMemoryReplSet;
  let connection: Connection;
  let adminComplaintService: AdminComplaintService;
  let complaintService: ComplaintService;
  let adminAccountService: AdminAccountService;
  let authService: AuthService;
  let propertyAssetRepository: PropertyAssetRepository;
  let listingRepository: ListingRepository;
  let publicationRepository: MarketplacePublicationRepository;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await replSet.waitUntilRunning();
    const uri = replSet.getUri();

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
    adminComplaintService = moduleRef.get(AdminComplaintService);
    complaintService = moduleRef.get(ComplaintService);
    adminAccountService = moduleRef.get(AdminAccountService);
    authService = moduleRef.get(AuthService);
    propertyAssetRepository = moduleRef.get(PropertyAssetRepository);
    listingRepository = moduleRef.get(ListingRepository);
    publicationRepository = moduleRef.get(MarketplacePublicationRepository);
  }, 120_000);

  afterAll(async () => {
    await connection?.close();
    await replSet?.stop();
  });

  afterEach(async () => {
    for (const collection of [
      'property_assets',
      'listings',
      'complaints',
      'marketplace_publications',
      'audit_events',
      'outbox_events',
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

  /**
   * permission-matrix.md §2.2 «Модератор вторички Батуми»: реальная
   * композиция держит `complaint.resolve.city` И `listing.unpublish.city`
   * ОДНОВРЕМЕННО (последний покрывает resource:'listing' — AdminPublicationService.
   * unpublish резолвит resource ПО publication.sourceType, здесь всегда
   * 'listing'). Резолюция upheld идёт через уже существующий D-06
   * unpublish-путь (permission-matrix.md разд.4 "Listing unpublish (Admin)") —
   * тот же grant, что и прямой admin-unpublish, не отдельный обходной путь.
   */
  async function seedScopedAdmin(grants: Array<{ resource: string; action: string; scope: 'global' | 'city'; scopeValue?: string }>): Promise<AdminContext> {
    const login = `admin-${new Types.ObjectId().toString()}@example.test`;
    const identityId = await authService.registerIdentity({ login, password: 'correct horse battery staple' });
    const account = await adminAccountService.createAdminAccount(makeSuperAdminContext(), {
      identityId,
      isSuperAdmin: false,
      correlationId: 'integration-test-correlation-id',
      idempotency: { actorIdentityId: new Types.ObjectId(), key: new Types.ObjectId().toString(), requestBody: { probe: new Types.ObjectId().toString() } },
    });
    for (const grant of grants) {
      await adminAccountService.grantPermission(makeSuperAdminContext(), {
        adminAccountId: account._id,
        resource: grant.resource,
        action: grant.action,
        scope: grant.scope,
        scopeValue: grant.scopeValue,
        correlationId: 'integration-test-correlation-id',
      });
    }
    return { identityId: identityId.toString(), adminAccountId: account._id.toString(), isSuperAdmin: false };
  }

  async function seedListing(city: string) {
    const organizationId = new Types.ObjectId();
    const asset = await propertyAssetRepository.create({
      publisherScope: { type: 'organization', organizationId },
      propertyType: 'apartment',
      location: { country: 'Georgia', city, address: '1 Rustaveli St', geo: { type: 'Point', coordinates: [41.6, 41.6] } },
      characteristics: { area: 55, rooms: 2, floor: 5 },
      representativePhone: '+995500000001',
      version: 0,
    });
    const listing = await withSession(connection, (session) =>
      listingRepository.create(
        { propertyAssetId: asset._id, publisherScope: asset.publisherScope, dealType: 'sale', price: { amountMinorUnits: 10_000_000, currency: 'USD' }, status: 'active', version: 0 },
        session,
      ),
    );
    return { asset, listing };
  }

  async function seedPublishedPublication(listingId: Types.ObjectId, organizationId: Types.ObjectId, city: string) {
    await withSession(connection, (session) =>
      publicationRepository.upsertPending({ sourceType: 'listing', sourceId: listingId, publisherScope: { type: 'organization', organizationId } }, session),
    );
    // searchProjection.city обязателен: AdminPublicationService.unpublish
    // резолвит scopeValue гранта именно из него (publication.searchProjection.city),
    // не из canonical PropertyAsset.location.city напрямую.
    await connection
      .collection('marketplace_publications')
      .updateOne(
        { sourceType: 'listing', sourceId: listingId },
        { $set: { status: 'published', slug: `slug-${listingId.toString()}`, searchProjection: { city } } },
      );
  }

  it('сквозной сценарий: submit → list (city-scoped) → resolve upheld → unpublish + audit на обоих действиях', async () => {
    const { asset, listing } = await seedListing('batumi');
    await seedPublishedPublication(listing._id, (asset.publisherScope as { organizationId: Types.ObjectId }).organizationId, 'batumi');

    const { id: complaintId } = await complaintService.submit({
      listingId: listing._id,
      category: 'not_available',
      reporterPhone: '+995500000099',
    });

    const adminContext = await seedScopedAdmin([
      { resource: 'complaint', action: 'resolve', scope: 'city', scopeValue: 'batumi' },
      { resource: 'listing', action: 'unpublish', scope: 'city', scopeValue: 'batumi' },
    ]);

    const listResult = await adminComplaintService.list(adminContext, { limit: 20 });
    expect(listResult.items).toHaveLength(1);
    expect(listResult.items[0]).toMatchObject({ id: complaintId.toString(), status: 'pending', scopeCity: 'batumi' });

    await adminComplaintService.resolve(adminContext, {
      complaintId,
      decision: 'upheld',
      reason: 'Confirmed the unit was sold two weeks ago by phone',
      correlationId: 'integration-test-correlation-id',
    });

    const complaintDoc = await connection.collection('complaints').findOne({ _id: complaintId });
    expect(complaintDoc?.status).toBe('resolved_upheld');
    expect(complaintDoc?.resolutionReason).toBe('Confirmed the unit was sold two weeks ago by phone');

    const publicationDoc = await connection.collection('marketplace_publications').findOne({ sourceType: 'listing', sourceId: listing._id });
    expect(publicationDoc?.status).toBe('unpublished');

    const complaintAudit = await connection.collection('audit_events').find({ resourceId: complaintId }).toArray();
    expect(complaintAudit).toHaveLength(1);
    expect(complaintAudit[0]?.action).toBe('complaint.resolve');
    expect(complaintAudit[0]?.actor).toMatchObject({ type: 'admin_account' });

    const publicationAudit = await connection.collection('audit_events').find({ resourceId: listing._id }).toArray();
    expect(publicationAudit).toHaveLength(1);
    expect(publicationAudit[0]?.action).toBe('publication.unpublish');

    // Резолюцированная очередь больше не показывает жалобу в default (pending) списке.
    const afterList = await adminComplaintService.list(adminContext, { limit: 20 });
    expect(afterList.items).toHaveLength(0);
  });

  it('resolve dismissed НЕ трогает публикацию — domain invariant: жалоба сама по себе не доказывает нарушение', async () => {
    const { asset, listing } = await seedListing('batumi');
    await seedPublishedPublication(listing._id, (asset.publisherScope as { organizationId: Types.ObjectId }).organizationId, 'batumi');
    const { id: complaintId } = await complaintService.submit({ listingId: listing._id, category: 'other' });
    const adminContext = await seedScopedAdmin([{ resource: 'complaint', action: 'resolve', scope: 'city', scopeValue: 'batumi' }]);

    await adminComplaintService.resolve(adminContext, {
      complaintId,
      decision: 'dismissed',
      reason: 'Verified the listing is still genuinely available',
      correlationId: 'integration-test-correlation-id',
    });

    const complaintDoc = await connection.collection('complaints').findOne({ _id: complaintId });
    expect(complaintDoc?.status).toBe('resolved_dismissed');

    const publicationDoc = await connection.collection('marketplace_publications').findOne({ sourceType: 'listing', sourceId: listing._id });
    expect(publicationDoc?.status).toBe('published');
  });

  it('admin с грантом на ДРУГОЙ город не видит жалобу и не может её резолюцировать (city-scope deny-by-default)', async () => {
    const { asset, listing } = await seedListing('batumi');
    await seedPublishedPublication(listing._id, (asset.publisherScope as { organizationId: Types.ObjectId }).organizationId, 'batumi');
    const { id: complaintId } = await complaintService.submit({ listingId: listing._id, category: 'scam' });
    const adminContext = await seedScopedAdmin([{ resource: 'complaint', action: 'resolve', scope: 'city', scopeValue: 'tbilisi' }]);

    const listResult = await adminComplaintService.list(adminContext, { limit: 20 });
    expect(listResult.items).toHaveLength(0);

    await expect(
      adminComplaintService.resolve(adminContext, {
        complaintId,
        decision: 'upheld',
        reason: 'Trying to resolve a complaint outside my granted city',
        correlationId: 'integration-test-correlation-id',
      }),
    ).rejects.toThrow();

    const complaintDoc = await connection.collection('complaints').findOne({ _id: complaintId });
    expect(complaintDoc?.status).toBe('pending');
  });

  it('повторная резолюция уже резолюцированной жалобы — конфликт, не переписывает решение', async () => {
    const { listing } = await seedListing('batumi');
    const { id: complaintId } = await complaintService.submit({ listingId: listing._id, category: 'duplicate' });
    const adminContext = await seedScopedAdmin([{ resource: 'complaint', action: 'resolve', scope: 'city', scopeValue: 'batumi' }]);

    await adminComplaintService.resolve(adminContext, {
      complaintId,
      decision: 'dismissed',
      reason: 'First resolution of this complaint',
      correlationId: 'integration-test-correlation-id',
    });

    await expect(
      adminComplaintService.resolve(adminContext, {
        complaintId,
        decision: 'upheld',
        reason: 'Second admin trying to override the first decision',
        correlationId: 'integration-test-correlation-id',
      }),
    ).rejects.toThrow();

    const complaintDoc = await connection.collection('complaints').findOne({ _id: complaintId });
    expect(complaintDoc?.status).toBe('resolved_dismissed');
  });
});

import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import fastifyCookie from '@fastify/cookie';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppModule } from '../../src/app.module';
import { AppExceptionFilter } from '../../src/shared/errors/app-exception.filter';
import { CorrelationIdMiddleware } from '../../src/shared/errors/correlation-id.middleware';
import { TenantContextMiddleware } from '../../src/shared/tenant/tenant-context.middleware';
import { AdminContextMiddleware } from '../../src/shared/admin/admin-context.middleware';
import { MarketplaceAccountContextMiddleware } from '../../src/shared/marketplace-account/marketplace-account-context.middleware';
import { MediaStorageService } from '@baza/media-storage';
import { MediaMimeVerifierService } from '../../src/modules/media/media-mime-verifier.service';
import type { PropertyAssetMediaViewItem } from '../../src/modules/property-assets/property-assets.service';
import { RedisService } from '../../src/shared/redis/redis.service';
import { createRedisMockService } from './support/redis-mock';

describe('Property Asset Media Vertical (real HTTP)', () => {
  let replSet: MongoMemoryReplSet;
  let app: NestFastifyApplication;
  let connection: Connection;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
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
      .overrideProvider(MediaStorageService)
      .useValue({
        createUploadUrl: jest.fn().mockResolvedValue('https://minio.test/upload-presigned'),
        getPublicUrl: jest.fn((k: string) => `https://cdn.baza.sale/${k}`),
        readObject: jest.fn().mockImplementation(async ({ key }: { key: string }) => {
          return key.endsWith('.png') ? Buffer.from('fake-png-bytes') : Buffer.from('fake-jpeg-bytes');
        }),
      })
      .overrideProvider(MediaMimeVerifierService)
      .useValue({
        verify: jest.fn().mockImplementation(async (buf: Buffer) => {
          const isPng = buf.toString().includes('png');
          return {
            verified: true,
            mimeType: isPng ? 'image/png' : 'image/jpeg',
            checksum: 'abc-checksum-123',
          };
        }),
      })
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.register(fastifyCookie);
    const fastify = app.getHttpAdapter().getInstance();
    fastify.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => app.get(CorrelationIdMiddleware).use(req, reply, () => {}));
    fastify.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => app.get(TenantContextMiddleware).use(req, reply, () => {}));
    fastify.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => app.get(AdminContextMiddleware).use(req, reply, () => {}));
    fastify.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => app.get(MarketplaceAccountContextMiddleware).use(req, reply, () => {}));
    app.useGlobalFilters(new AppExceptionFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    await app.init();
    await fastify.ready();
    connection = moduleRef.get<Connection>(getConnectionToken());
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await replSet?.stop();
  });

  afterEach(async () => {
    for (const collection of [
      'listings',
      'property_assets',
      'media_assets',
      'marketplace_publications',
      'duplicate_candidates',
      'permission_grants',
      'sessions',
      'position_assignments',
      'positions',
      'organizations',
      'identities',
    ]) {
      await connection.collection(collection).deleteMany({});
    }
  });

  async function ownerCookie(prefix: string) {
    const login = `${prefix}-${new Types.ObjectId().toString()}@example.test`;
    const password = 'correct horse battery staple';
    await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { login, password } });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/organizations/register',
      payload: { login, password, type: 'agency', name: `${prefix} agency` },
    });
    expect(response.statusCode).toBe(201);
    const raw = response.headers['set-cookie'];
    const cookie = (Array.isArray(raw) ? raw[0] : raw)?.match(/baza_session=[^;]+/)?.[0];
    if (!cookie) throw new Error('session cookie missing');
    return { cookie, organizationId: response.json().organizationId as string };
  }

  function makeAssetPayload(uniqueSuffix: string) {
    return {
      propertyType: 'apartment' as const,
      location: {
        country: 'GE',
        city: 'Batumi',
        address: `1 Rustaveli St ${uniqueSuffix}`,
        geo: { type: 'Point' as const, coordinates: [41.6, 41.64] as [number, number] },
      },
      characteristics: { area: 65, rooms: 2, floor: 4, totalFloors: 10 },
      representativePhone: `+995500${Math.floor(100000 + Math.random() * 900000)}`,
    };
  }

  it('full media vertical: upload intent -> confirm -> list -> update -> reorder -> delete with tenant isolation', async () => {
    const { cookie: cookieTenantA } = await ownerCookie('tenant-a');
    const { cookie: cookieTenantB } = await ownerCookie('tenant-b');

    // 1. Create property asset in Tenant A
    const assetRes = await app.inject({
      method: 'POST',
      url: '/api/v1/property-assets',
      headers: { 'idempotency-key': new Types.ObjectId().toString(), cookie: cookieTenantA },
      payload: makeAssetPayload('A1'),
    });
    expect(assetRes.statusCode).toBe(201);
    const assetId = assetRes.json()._id;

    // 2. Tenant B attempts to create upload intent on Tenant A asset -> 404
    const foreignIntentRes = await app.inject({
      method: 'POST',
      url: `/api/v1/property-assets/${assetId}/media/upload-intent`,
      headers: { cookie: cookieTenantB },
      payload: { declaredMimeType: 'image/jpeg', sizeBytes: 1024 * 1024 },
    });
    expect(foreignIntentRes.statusCode).toBe(404);

    // 3. Validation: reject unsupported MIME or oversized file
    const invalidMimeRes = await app.inject({
      method: 'POST',
      url: `/api/v1/property-assets/${assetId}/media/upload-intent`,
      headers: { cookie: cookieTenantA },
      payload: { declaredMimeType: 'application/pdf', sizeBytes: 1024 },
    });
    expect(invalidMimeRes.statusCode).toBe(400);

    // 4. Valid upload intent
    const intentRes1 = await app.inject({
      method: 'POST',
      url: `/api/v1/property-assets/${assetId}/media/upload-intent`,
      headers: { cookie: cookieTenantA },
      payload: { declaredMimeType: 'image/jpeg', sizeBytes: 2 * 1024 * 1024 },
    });
    expect(intentRes1.statusCode).toBe(201);
    const mediaAssetId1 = intentRes1.json().mediaAssetId;
    expect(intentRes1.json().uploadUrl).toBe('https://minio.test/upload-presigned');

    // 5. Confirm upload for photo 1
    const confirmRes1 = await app.inject({
      method: 'POST',
      url: `/api/v1/property-assets/${assetId}/media/${mediaAssetId1}/confirm`,
      headers: { cookie: cookieTenantA },
      payload: { alt: 'Гостиная с видом на море' },
    });
    expect(confirmRes1.statusCode).toBe(200);
    const listAfterConfirm1 = confirmRes1.json();
    expect(listAfterConfirm1).toHaveLength(1);
    expect(listAfterConfirm1[0].role).toBe('cover'); // First photo is auto-cover
    expect(listAfterConfirm1[0].alt).toBe('Гостиная с видом на море');

    // 6. Upload second photo
    const intentRes2 = await app.inject({
      method: 'POST',
      url: `/api/v1/property-assets/${assetId}/media/upload-intent`,
      headers: { cookie: cookieTenantA },
      payload: { declaredMimeType: 'image/png', sizeBytes: 1024 * 1024 },
    });
    const mediaAssetId2 = intentRes2.json().mediaAssetId;

    const confirmRes2 = await app.inject({
      method: 'POST',
      url: `/api/v1/property-assets/${assetId}/media/${mediaAssetId2}/confirm`,
      headers: { cookie: cookieTenantA },
      payload: { role: 'gallery', alt: 'Спальня' },
    });
    expect(confirmRes2.statusCode).toBe(200);
    const listAfterConfirm2 = confirmRes2.json();
    expect(listAfterConfirm2).toHaveLength(2);

    // 7. GET list media (verify no storage keys leak)
    const listRes = await app.inject({
      method: 'GET',
      url: `/api/v1/property-assets/${assetId}/media`,
      headers: { cookie: cookieTenantA },
    });
    expect(listRes.statusCode).toBe(200);
    const items = listRes.json();
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item).not.toHaveProperty('storageKey');
      expect(item).not.toHaveProperty('bucket');
      expect(item).not.toHaveProperty('ownerScope');
    }

    // 8. Promote second photo to cover via PATCH
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/property-assets/${assetId}/media/${mediaAssetId2}`,
      headers: { cookie: cookieTenantA },
      payload: { role: 'cover' },
    });
    expect(patchRes.statusCode).toBe(200);
    const updatedList: PropertyAssetMediaViewItem[] = patchRes.json();
    const photo1 = updatedList.find((i) => i.mediaAssetId === mediaAssetId1);
    const photo2 = updatedList.find((i) => i.mediaAssetId === mediaAssetId2);
    // Явная проверка присутствия до обращения к полям: без неё пропажа
    // фото из ответа давала бы TypeError вместо внятного отказа теста.
    expect(photo1).toBeDefined();
    expect(photo2).toBeDefined();
    expect(photo2!.role).toBe('cover');
    expect(photo1!.role).toBe('gallery'); // Demoted to gallery

    // 9. Reorder media via PUT
    const reorderRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/property-assets/${assetId}/media/order`,
      headers: { cookie: cookieTenantA },
      payload: {
        items: [
          { mediaAssetId: mediaAssetId1, sortOrder: 0 },
          { mediaAssetId: mediaAssetId2, sortOrder: 1 },
        ],
      },
    });
    expect(reorderRes.statusCode).toBe(200);

    // 10. Delete photo 2 (the current cover) -> photo 1 auto-promoted to cover
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/property-assets/${assetId}/media/${mediaAssetId2}`,
      headers: { cookie: cookieTenantA },
    });
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.json()).toEqual({ success: true });

    const finalListingRes = await app.inject({
      method: 'GET',
      url: `/api/v1/property-assets/${assetId}/media`,
      headers: { cookie: cookieTenantA },
    });
    const finalItems = finalListingRes.json();
    expect(finalItems).toHaveLength(1);
    expect(finalItems[0].mediaAssetId).toBe(mediaAssetId1);
    expect(finalItems[0].role).toBe('cover');
  });

  /**
   * MKT-004-MEDIA-RACE-001: two genuinely concurrent confirm calls for
   * DIFFERENT photos on the SAME asset — before mutateMedia's CAS+retry,
   * both requests read the same starting media[] array, both computed an
   * "append" in memory, and whichever `$set` committed last silently
   * discarded the other's write (a real lost-update bug, not just a
   * theoretical one). Real HTTP via app.inject(), real Mongo transaction
   * isolation via mongodb-memory-server (not a mock of the repository).
   */
  it('two concurrent confirms for different photos on the same asset both survive (no lost update)', async () => {
    const { cookie } = await ownerCookie('race-tenant');

    const assetRes = await app.inject({
      method: 'POST',
      url: '/api/v1/property-assets',
      headers: { 'idempotency-key': new Types.ObjectId().toString(), cookie },
      payload: makeAssetPayload('RACE1'),
    });
    expect(assetRes.statusCode).toBe(201);
    const assetId = assetRes.json()._id;

    // Two independent upload-intents, sequential (only the CONFIRM calls
    // below race — intent creation itself isn't the vertical under test).
    const intentA = await app.inject({
      method: 'POST',
      url: `/api/v1/property-assets/${assetId}/media/upload-intent`,
      headers: { cookie },
      payload: { declaredMimeType: 'image/jpeg', sizeBytes: 1024 * 1024 },
    });
    const intentB = await app.inject({
      method: 'POST',
      url: `/api/v1/property-assets/${assetId}/media/upload-intent`,
      headers: { cookie },
      payload: { declaredMimeType: 'image/png', sizeBytes: 1024 * 1024 },
    });
    const mediaAssetIdA = intentA.json().mediaAssetId;
    const mediaAssetIdB = intentB.json().mediaAssetId;

    const confirm = (mediaAssetId: string, alt: string) =>
      app.inject({
        method: 'POST',
        url: `/api/v1/property-assets/${assetId}/media/${mediaAssetId}/confirm`,
        headers: { cookie },
        payload: { alt },
      });

    const [confirmA, confirmB] = await Promise.all([
      confirm(mediaAssetIdA, 'Photo A'),
      confirm(mediaAssetIdB, 'Photo B'),
    ]);
    expect(confirmA.statusCode).toBe(200);
    expect(confirmB.statusCode).toBe(200);

    const finalListRes = await app.inject({
      method: 'GET',
      url: `/api/v1/property-assets/${assetId}/media`,
      headers: { cookie },
    });
    const finalItems: PropertyAssetMediaViewItem[] = finalListRes.json();
    // Both photos must be present — a lost update would leave only 1.
    expect(finalItems).toHaveLength(2);
    const ids = finalItems.map((i) => i.mediaAssetId).sort();
    expect(ids).toEqual([mediaAssetIdA, mediaAssetIdB].sort());
    // Exactly one cover (the invariant the mutator logic maintains) —
    // a lost update could also have left this at 0 or 2.
    const coverCount = finalItems.filter((i) => i.role === 'cover').length;
    expect(coverCount).toBe(1);
  });

  /**
   * Same class of race, different pair of operations: confirming a NEW
   * photo while concurrently deleting an EXISTING one on the same asset.
   * Before the fix, the delete's array (missing the removed item) and the
   * confirm's array (missing the new item) raced on the same `$set` — one
   * of the two changes would vanish depending on write order.
   */
  it('a concurrent confirm and delete on the same asset both apply (no lost update)', async () => {
    const { cookie } = await ownerCookie('race-tenant-2');

    const assetRes = await app.inject({
      method: 'POST',
      url: '/api/v1/property-assets',
      headers: { 'idempotency-key': new Types.ObjectId().toString(), cookie },
      payload: makeAssetPayload('RACE2'),
    });
    const assetId = assetRes.json()._id;

    const existingIntent = await app.inject({
      method: 'POST',
      url: `/api/v1/property-assets/${assetId}/media/upload-intent`,
      headers: { cookie },
      payload: { declaredMimeType: 'image/jpeg', sizeBytes: 1024 * 1024 },
    });
    const existingMediaAssetId = existingIntent.json().mediaAssetId;
    await app.inject({
      method: 'POST',
      url: `/api/v1/property-assets/${assetId}/media/${existingMediaAssetId}/confirm`,
      headers: { cookie },
      payload: { alt: 'Existing photo' },
    });

    const newIntent = await app.inject({
      method: 'POST',
      url: `/api/v1/property-assets/${assetId}/media/upload-intent`,
      headers: { cookie },
      payload: { declaredMimeType: 'image/png', sizeBytes: 1024 * 1024 },
    });
    const newMediaAssetId = newIntent.json().mediaAssetId;

    const [deleteRes, confirmRes] = await Promise.all([
      app.inject({
        method: 'DELETE',
        url: `/api/v1/property-assets/${assetId}/media/${existingMediaAssetId}`,
        headers: { cookie },
      }),
      app.inject({
        method: 'POST',
        url: `/api/v1/property-assets/${assetId}/media/${newMediaAssetId}/confirm`,
        headers: { cookie },
        payload: { alt: 'New photo' },
      }),
    ]);
    expect(deleteRes.statusCode).toBe(200);
    expect(confirmRes.statusCode).toBe(200);

    const finalListRes = await app.inject({
      method: 'GET',
      url: `/api/v1/property-assets/${assetId}/media`,
      headers: { cookie },
    });
    const finalItems: PropertyAssetMediaViewItem[] = finalListRes.json();
    // The delete's effect (old photo gone) AND the confirm's effect (new
    // photo present) must both have applied — a lost update would leave
    // either the old photo still present, or the new one missing.
    expect(finalItems).toHaveLength(1);
    expect(finalItems[0]!.mediaAssetId).toBe(newMediaAssetId);
  });
});

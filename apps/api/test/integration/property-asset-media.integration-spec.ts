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

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
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
      headers: { cookie: cookieTenantA },
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
    const updatedList = patchRes.json();
    const photo1 = updatedList.find((i: any) => i.mediaAssetId === mediaAssetId1);
    const photo2 = updatedList.find((i: any) => i.mediaAssetId === mediaAssetId2);
    expect(photo2.role).toBe('cover');
    expect(photo1.role).toBe('gallery'); // Demoted to gallery

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
});

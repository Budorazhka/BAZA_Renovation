import { Test } from '@nestjs/testing';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import {
  MediaAssetDocument,
  MediaAssetSchema,
  MediaAssetRepository,
  MediaStorageService,
} from '@baza/media-storage';
import { MediaService } from '../../src/modules/media/media.service';
import { MediaMimeVerifierService } from '../../src/modules/media/media-mime-verifier.service';
import { AuditModule } from '../../src/modules/audit/audit.module';
import { OutboxModule } from '../../src/modules/outbox/outbox.module';
import { OutboxEventDocument } from '@baza/domain-events';

/**
 * Integration-тест против РЕАЛЬНОГО MongoDB single-node replica set
 * (mongodb-memory-server, не мок Model) — прямая проверка того, что
 * transactional outbox pattern (ADR-006) реально работает на настоящей
 * multi-document транзакции, не только на моках, которые могут скрыть
 * ошибку сериализации/сессии, невидимую unit-тестам.
 *
 * Замокан ТОЛЬКО MediaStorageService (S3/MinIO — сеть, не то, что здесь
 * тестируется) и MediaMimeVerifierService (сама детекция — уже покрыта
 * отдельно, media-mime-verifier.service.spec.ts) — MongoDB-часть стека
 * (MediaAssetRepository, AuditService, OutboxService, реальная транзакция)
 * не замокана нигде.
 */
describe('MediaService.confirmUpload — integration (real MongoDB transaction)', () => {
  let replSet: MongoMemoryReplSet;
  let connection: Connection;
  let mediaService: MediaService;
  let mediaAssetRepository: MediaAssetRepository;
  let readObjectMock: jest.Mock;
  let verifyMock: jest.Mock;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await replSet.waitUntilRunning();
    const uri = replSet.getUri();

    readObjectMock = jest.fn().mockResolvedValue(Buffer.from('fake-png-bytes'));
    verifyMock = jest.fn().mockResolvedValue({
      verified: true,
      mimeType: 'image/png',
      checksum: 'integration-test-checksum',
    });

    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri),
        MongooseModule.forFeature([{ name: MediaAssetDocument.name, schema: MediaAssetSchema }]),
        AuditModule,
        OutboxModule,
      ],
      // MediaStorageService/MediaMimeVerifierService объявлены здесь как
      // providers (иначе Nest не может их разрешить как зависимости
      // MediaService), но реальные их реализации заменяются сразу ниже
      // через overrideProvider — overrideProvider ЗАМЕНЯЕТ существующий
      // provider, не создаёт новый с нуля, поэтому классы всё равно должны
      // быть в исходном списке providers.
      providers: [MediaAssetRepository, MediaService, MediaStorageService, MediaMimeVerifierService],
    })
      .overrideProvider(MediaStorageService)
      .useValue({ readObject: readObjectMock })
      .overrideProvider(MediaMimeVerifierService)
      .useValue({ verify: verifyMock })
      .compile();

    connection = moduleRef.get<Connection>(getConnectionToken());
    mediaService = moduleRef.get(MediaService);
    mediaAssetRepository = moduleRef.get(MediaAssetRepository);
  }, 120_000);

  afterAll(async () => {
    await connection?.close();
    await replSet?.stop();
  });

  afterEach(async () => {
    await connection.collection('media_assets').deleteMany({});
    await connection.collection('audit_events').deleteMany({});
    await connection.collection('outbox_events').deleteMany({});
    readObjectMock.mockClear();
    verifyMock.mockClear();
  });

  async function seedPendingAsset(organizationId: Types.ObjectId): Promise<Types.ObjectId> {
    const assetId = new Types.ObjectId();
    await mediaAssetRepository.create({
      _id: assetId,
      ownerScope: { type: 'organization', organizationId },
      declaredMimeType: 'image/png',
      sizeBytes: 1000,
      bucket: 'public',
      originalPath: `${assetId.toString()}/original.png`,
      purpose: 'unit_photo',
    });
    return assetId;
  }

  it('атомарно коммитит status=verified + audit-запись + outbox-событие в одной транзакции', async () => {
    const organizationId = new Types.ObjectId();
    const assetId = await seedPendingAsset(organizationId);

    const result = await mediaService.confirmUpload({
      assetId,
      actorIdentityId: new Types.ObjectId(),
      expectedOwnerScope: { type: 'organization', organizationId },
      correlationId: 'integration-test-correlation-id',
    });

    expect(result).toEqual({ status: 'verified' });

    const assetDoc = await connection.collection('media_assets').findOne({ _id: assetId });
    expect(assetDoc?.status).toBe('verified');
    expect(assetDoc?.verifiedMimeType).toBe('image/png');

    const auditDocs = await connection
      .collection('audit_events')
      .find({ resourceId: assetId })
      .toArray();
    expect(auditDocs).toHaveLength(1);
    expect(auditDocs[0]?.action).toBe('media.verify');

    const outboxDocs = await connection
      .collection<OutboxEventDocument>('outbox_events' as never)
      .find({ aggregateId: assetId })
      .toArray();
    expect(outboxDocs).toHaveLength(1);
    expect(outboxDocs[0]?.eventType).toBe('MediaVerified');
    expect(outboxDocs[0]?.status).toBe('pending');
  });

  it('атомарно коммитит status=rejected + audit-запись, НЕ публикует outbox при неуспешном verify', async () => {
    verifyMock.mockResolvedValueOnce({
      verified: false,
      checksum: 'x',
      rejectionReason: 'MIME не входит в allowlist',
    });

    const organizationId = new Types.ObjectId();
    const assetId = await seedPendingAsset(organizationId);

    const result = await mediaService.confirmUpload({
      assetId,
      actorIdentityId: new Types.ObjectId(),
      expectedOwnerScope: { type: 'organization', organizationId },
      correlationId: 'integration-test-correlation-id',
    });

    expect(result).toEqual({ status: 'rejected' });

    const assetDoc = await connection.collection('media_assets').findOne({ _id: assetId });
    expect(assetDoc?.status).toBe('rejected');

    const outboxCount = await connection
      .collection('outbox_events')
      .countDocuments({ aggregateId: assetId });
    expect(outboxCount).toBe(0);
  });

  /**
   * Прямая проверка находки ревью — IDOR-фикс реально работает против
   * настоящей БД, не только против моков в media.service.spec.ts.
   */
  it('НЕ подтверждает asset другой организации (реальная БД-проверка ownerScope)', async () => {
    const actualOwnerOrgId = new Types.ObjectId();
    const attackerOrgId = new Types.ObjectId();
    const assetId = await seedPendingAsset(actualOwnerOrgId);

    await expect(
      mediaService.confirmUpload({
        assetId,
        actorIdentityId: new Types.ObjectId(),
        expectedOwnerScope: { type: 'organization', organizationId: attackerOrgId },
        correlationId: 'integration-test-correlation-id',
      }),
    ).rejects.toThrow();

    expect(readObjectMock).not.toHaveBeenCalled();

    const assetDoc = await connection.collection('media_assets').findOne({ _id: assetId });
    expect(assetDoc?.status).toBe('pending');
  });

  /**
   * ADR-006 идемпотентность против реальной конкурентности: два
   * ПАРАЛЛЕЛЬНЫХ confirmUpload для одного и того же asset (Promise.all,
   * не последовательно) — только один должен реально записать audit/outbox,
   * второй должен корректно обработать modifiedCount:0, не дублировать
   * side-effects и не упасть необработанным исключением.
   */
  it('конкурентный confirmUpload для одного asset не дублирует audit/outbox', async () => {
    const organizationId = new Types.ObjectId();
    const assetId = await seedPendingAsset(organizationId);

    const params = {
      assetId,
      actorIdentityId: new Types.ObjectId(),
      expectedOwnerScope: { type: 'organization' as const, organizationId },
      correlationId: 'integration-test-correlation-id',
    };

    const [first, second] = await Promise.all([
      mediaService.confirmUpload(params),
      mediaService.confirmUpload(params),
    ]);

    expect([first.status, second.status]).toEqual(['verified', 'verified']);

    const auditCount = await connection
      .collection('audit_events')
      .countDocuments({ resourceId: assetId });
    expect(auditCount).toBe(1);

    const outboxCount = await connection
      .collection('outbox_events')
      .countDocuments({ aggregateId: assetId });
    expect(outboxCount).toBe(1);
  });
});

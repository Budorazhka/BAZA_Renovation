import { Test } from '@nestjs/testing';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MarketplacePublicationRepository } from '@baza/publication';
import { AdminModule } from '../../src/modules/admin/admin.module';
import { AdminPublicationService } from '../../src/modules/admin/admin-publication.service';
import type { AdminContext } from '../../src/shared/admin/admin-context';

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
  let publicationRepository: MarketplacePublicationRepository;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await replSet.waitUntilRunning();
    const uri = replSet.getUri();

    const moduleRef = await Test.createTestingModule({
      imports: [MongooseModule.forRoot(uri), AdminModule],
    }).compile();

    connection = moduleRef.get<Connection>(getConnectionToken());
    adminPublicationService = moduleRef.get(AdminPublicationService);
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
  });

  function makeSuperAdminContext(): AdminContext {
    return {
      identityId: new Types.ObjectId().toString(),
      adminAccountId: new Types.ObjectId().toString(),
      isSuperAdmin: true,
    };
  }

  async function seedPublishedPublication(sourceId: Types.ObjectId, organizationId: Types.ObjectId) {
    await publicationRepository.upsertPending({
      sourceType: 'development',
      sourceId,
      publisherScope: { type: 'organization', organizationId },
    });
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

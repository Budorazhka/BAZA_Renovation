import { Test } from '@nestjs/testing';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { DevelopmentRepository } from '@baza/development';
import { DevelopmentsModule } from '../../src/modules/developments/developments.module';
import { DevelopmentsService } from '../../src/modules/developments/developments.service';
import { UnitRepository } from '../../src/modules/developments/repository/unit.repository';
import { BuildingRepository } from '../../src/modules/developments/repository/building.repository';
import { FloorRepository } from '../../src/modules/developments/repository/floor.repository';
import { AdminModule } from '../../src/modules/admin/admin.module';
import { AdminPublicationService } from '../../src/modules/admin/admin-publication.service';
import type { AdminContext } from '../../src/shared/admin/admin-context';

/**
 * Integration-тест против РЕАЛЬНОГО MongoDB single-node replica set
 * (mongodb-memory-server, не мок Model) — прямая проверка того, что
 * updateUnitPrice/updateDevelopment реально работают на настоящей
 * multi-document транзакции/optimistic concurrency, не только на моках,
 * которые могут скрыть ошибку сериализации/сессии, невидимую unit-тестам.
 * Тот же паттерн, что уже установлен media-confirm-upload.integration-spec.ts —
 * закрывает честный пробел, зафиксированный в d01-development-aggregate.md
 * "Не покрыто": "developments-модуль пока покрыт только unit-тестами с
 * моками".
 *
 * Использует ПОЛНЫЙ DevelopmentsModule (не собирает providers вручную) —
 * DevelopmentsService зависит от PublicationService (publishDevelopment),
 * который сам транзитивно требует AuditModule/OutboxModule/собственной
 * MongooseModule.forFeature — проще и надёжнее взять готовый модуль
 * целиком, чем дублировать граф зависимостей здесь.
 */
describe('DevelopmentsService — integration (real MongoDB transactions)', () => {
  let replSet: MongoMemoryReplSet;
  let connection: Connection;
  let developmentsService: DevelopmentsService;
  let developmentRepository: DevelopmentRepository;
  let unitRepository: UnitRepository;
  let buildingRepository: BuildingRepository;
  let floorRepository: FloorRepository;
  let adminPublicationService: AdminPublicationService;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await replSet.waitUntilRunning();
    const uri = replSet.getUri();

    const moduleRef = await Test.createTestingModule({
      imports: [MongooseModule.forRoot(uri), DevelopmentsModule, AdminModule],
    }).compile();

    connection = moduleRef.get<Connection>(getConnectionToken());
    developmentsService = moduleRef.get(DevelopmentsService);
    developmentRepository = moduleRef.get(DevelopmentRepository);
    unitRepository = moduleRef.get(UnitRepository);
    buildingRepository = moduleRef.get(BuildingRepository);
    floorRepository = moduleRef.get(FloorRepository);
    adminPublicationService = moduleRef.get(AdminPublicationService);
  }, 120_000);

  afterAll(async () => {
    await connection?.close();
    await replSet?.stop();
  });

  afterEach(async () => {
    await connection.collection('developments').deleteMany({});
    await connection.collection('buildings').deleteMany({});
    await connection.collection('floors').deleteMany({});
    await connection.collection('units').deleteMany({});
    await connection.collection('audit_events').deleteMany({});
    await connection.collection('outbox_events').deleteMany({});
    await connection.collection('marketplace_publications').deleteMany({});
    await connection.collection('idempotency_records').deleteMany({});
  });

  async function seedUnit(organizationId: Types.ObjectId) {
    const development = await developmentRepository.create({
      organizationId,
      name: 'ЖК Интеграционный',
      location: { country: 'Georgia', city: 'Batumi', geo: { type: 'Point', coordinates: [41.6, 41.6] } },
      contact: { phone: '+995500000000' },
    });
    const building = await buildingRepository.create({
      developmentId: development._id,
      organizationId,
      name: 'Корпус 1',
      floorsCount: 5,
    });
    const floor = await floorRepository.create({
      buildingId: building._id,
      organizationId,
      floorNumber: 1,
    });
    const unit = await unitRepository.create({
      buildingId: building._id,
      floorId: floor._id,
      organizationId,
      number: '1',
      kind: 'apartment',
      area: 40,
      price: { amountMinorUnits: 10000000, currency: 'USD' },
    });
    return { development, building, floor, unit };
  }

  describe('updateUnitPrice', () => {
    it('атомарно коммитит price+priceHistory+version + audit-запись + outbox-событие в одной транзакции', async () => {
      const organizationId = new Types.ObjectId();
      const { unit } = await seedUnit(organizationId);
      const actorIdentityId = new Types.ObjectId();
      const actorPositionId = new Types.ObjectId();

      await developmentsService.updateUnitPrice({
        unitId: unit._id,
        organizationId,
        expectedVersion: 0,
        price: { amountMinorUnits: 12000000, currency: 'USD' },
        actorIdentityId,
        actorPositionId,
        correlationId: 'integration-test-correlation-id',
      });

      // toMatchObject, не toEqual — MoneyAmountSchemaDefinition (unit.schema.ts)
      // объявлен как plain-object type, не new MongooseSchema(...,{_id:false})
      // (в отличие от GeoPointSchema/PolygonSchema в этом же модуле) — Mongoose
      // автоматически добавляет _id к вложенному sub-document, найдено этим
      // тестом (первый прогон упал на toEqual), не предположено заранее.
      const unitDoc = await connection.collection('units').findOne({ _id: unit._id });
      expect(unitDoc?.price).toMatchObject({ amountMinorUnits: 12000000, currency: 'USD' });
      expect(unitDoc?.version).toBe(1);
      expect(unitDoc?.priceHistory).toHaveLength(1);
      expect(unitDoc?.priceHistory[0].price).toMatchObject({ amountMinorUnits: 12000000, currency: 'USD' });

      const auditDocs = await connection.collection('audit_events').find({ resourceId: unit._id }).toArray();
      expect(auditDocs).toHaveLength(1);
      expect(auditDocs[0]?.action).toBe('unit.price.update');

      const outboxDocs = await connection.collection('outbox_events').find({ aggregateId: unit._id }).toArray();
      expect(outboxDocs).toHaveLength(1);
      expect(outboxDocs[0]?.eventType).toBe('UnitPriceChanged');
      expect(outboxDocs[0]?.status).toBe('pending');
    });

    it('стейл expectedVersion — ConflictException, НЕ коммитит price/audit/outbox (реальная транзакция откатывается целиком)', async () => {
      const organizationId = new Types.ObjectId();
      const { unit } = await seedUnit(organizationId);

      await expect(
        developmentsService.updateUnitPrice({
          unitId: unit._id,
          organizationId,
          expectedVersion: 99,
          price: { amountMinorUnits: 1, currency: 'USD' },
          actorIdentityId: new Types.ObjectId(),
          actorPositionId: new Types.ObjectId(),
          correlationId: 'integration-test-correlation-id',
        }),
      ).rejects.toThrow();

      const unitDoc = await connection.collection('units').findOne({ _id: unit._id });
      expect(unitDoc?.version).toBe(0);
      expect(unitDoc?.price).toMatchObject({ amountMinorUnits: 10000000, currency: 'USD' });

      const auditCount = await connection.collection('audit_events').countDocuments({ resourceId: unit._id });
      expect(auditCount).toBe(0);
      const outboxCount = await connection.collection('outbox_events').countDocuments({ aggregateId: unit._id });
      expect(outboxCount).toBe(0);
    });

    /**
     * ADR-006 идемпотентность против реальной конкурентности — тот же
     * паттерн, что media-confirm-upload.integration-spec.ts уже установил
     * для confirmUpload: два ПАРАЛЛЕЛЬНЫХ updateUnitPrice с одним и тем же
     * expectedVersion (Promise.all, не последовательно) — только один
     * должен реально применить изменение, второй обязан корректно
     * обработать VERSION_CONFLICT, не молча перезаписать/задублировать
     * side-effects.
     */
    it('конкурентный updateUnitPrice с тем же expectedVersion: ровно один побеждает, второй получает конфликт', async () => {
      const organizationId = new Types.ObjectId();
      const { unit } = await seedUnit(organizationId);

      const attempt = (amountMinorUnits: number) =>
        developmentsService
          .updateUnitPrice({
            unitId: unit._id,
            organizationId,
            expectedVersion: 0,
            price: { amountMinorUnits, currency: 'USD' },
            actorIdentityId: new Types.ObjectId(),
            actorPositionId: new Types.ObjectId(),
            correlationId: 'integration-test-correlation-id',
          })
          .then(() => 'ok' as const)
          .catch(() => 'conflict' as const);

      const [first, second] = await Promise.all([attempt(11000000), attempt(13000000)]);
      const outcomes = [first, second];

      expect(outcomes.filter((o) => o === 'ok')).toHaveLength(1);
      expect(outcomes.filter((o) => o === 'conflict')).toHaveLength(1);

      const unitDoc = await connection.collection('units').findOne({ _id: unit._id });
      expect(unitDoc?.version).toBe(1);

      const auditCount = await connection.collection('audit_events').countDocuments({ resourceId: unit._id });
      expect(auditCount).toBe(1);
      const outboxCount = await connection.collection('outbox_events').countDocuments({ aggregateId: unit._id });
      expect(outboxCount).toBe(1);
    });
  });

  describe('updateDevelopment', () => {
    it('optimistic concurrency: корректная version коммитит изменение и увеличивает version', async () => {
      const organizationId = new Types.ObjectId();
      const development = await developmentRepository.create({
        organizationId,
        name: 'Исходное имя',
        location: { country: 'Georgia', city: 'Tbilisi', geo: { type: 'Point', coordinates: [44.8, 41.7] } },
        contact: { phone: '+995500000001' },
      });

      await developmentsService.updateDevelopment({
        id: development._id,
        organizationId,
        expectedVersion: 0,
        correlationId: 'integration-test-correlation-id',
        changes: { name: 'Новое имя' },
      });

      const doc = await connection.collection('developments').findOne({ _id: development._id });
      expect(doc?.name).toBe('Новое имя');
      expect(doc?.version).toBe(1);
    });

    it('стейл expectedVersion — ConflictException (409-эквивалент), НЕ меняет запись', async () => {
      const organizationId = new Types.ObjectId();
      const development = await developmentRepository.create({
        organizationId,
        name: 'Исходное имя',
        location: { country: 'Georgia', city: 'Tbilisi', geo: { type: 'Point', coordinates: [44.8, 41.7] } },
        contact: { phone: '+995500000001' },
      });

      await expect(
        developmentsService.updateDevelopment({
          id: development._id,
          organizationId,
          expectedVersion: 5,
          correlationId: 'integration-test-correlation-id',
          changes: { name: 'Не должно примениться' },
        }),
      ).rejects.toThrow();

      const doc = await connection.collection('developments').findOne({ _id: development._id });
      expect(doc?.name).toBe('Исходное имя');
      expect(doc?.version).toBe(0);
    });

    /**
     * Прямая проверка tenant isolation против реальной БД — тот же принцип,
     * что media-confirm-upload.integration-spec.ts уже проверяет для
     * confirmUpload/ownerScope.
     */
    it('НЕ обновляет Development другой организации (реальная БД-проверка organizationId)', async () => {
      const actualOwnerOrgId = new Types.ObjectId();
      const attackerOrgId = new Types.ObjectId();
      const development = await developmentRepository.create({
        organizationId: actualOwnerOrgId,
        name: 'Чужой ЖК',
        location: { country: 'Georgia', city: 'Tbilisi', geo: { type: 'Point', coordinates: [44.8, 41.7] } },
        contact: { phone: '+995500000002' },
      });

      await expect(
        developmentsService.updateDevelopment({
          id: development._id,
          organizationId: attackerOrgId,
          expectedVersion: 0,
          correlationId: 'integration-test-correlation-id',
          changes: { name: 'Захвачено' },
        }),
      ).rejects.toThrow();

      const doc = await connection.collection('developments').findOne({ _id: development._id });
      expect(doc?.name).toBe('Чужой ЖК');
    });

    /**
     * D-03 rebuild (owner decision 26.08.2026): update опубликованной записи
     * должен перевыпустить PublicationRequested реальной транзакцией —
     * прямая проверка против настоящей MarketplacePublication-коллекции,
     * не мока PublicationService.
     */
    it('перевыпускает PublicationRequested (rebuild), если публикация сейчас published', async () => {
      const organizationId = new Types.ObjectId();
      const development = await developmentRepository.create({
        organizationId,
        name: 'Исходное имя',
        location: { country: 'Georgia', city: 'Tbilisi', geo: { type: 'Point', coordinates: [44.8, 41.7] } },
        contact: { phone: '+995500000003' },
      });

      await developmentsService.publishDevelopment({
        id: development._id,
        organizationId,
        actorIdentityId: new Types.ObjectId(),
        idempotencyKey: 'rebuild-test-publish-key',
        correlationId: 'integration-test-correlation-id',
      });

      await connection
        .collection('marketplace_publications')
        .updateOne({ sourceType: 'development', sourceId: development._id }, { $set: { status: 'published' } });

      await developmentsService.updateDevelopment({
        id: development._id,
        organizationId,
        expectedVersion: 1,
        correlationId: 'integration-test-correlation-id',
        changes: { name: 'Обновлённое опубликованное имя' },
      });

      const publicationDoc = await connection
        .collection('marketplace_publications')
        .findOne({ sourceType: 'development', sourceId: development._id });
      expect(publicationDoc?.status).toBe('publication_pending');
      expect(publicationDoc?.version).toBe(2);

      const outboxDocs = await connection
        .collection('outbox_events')
        .find({ aggregateId: development._id, eventType: 'PublicationRequested' })
        .toArray();
      expect(outboxDocs).toHaveLength(2);
      expect(outboxDocs[1]?.payload?.publicationId?.toString()).toBe(publicationDoc?._id?.toString());
    });

    it('НЕ перевыпускает PublicationRequested, если Development никогда не публиковался', async () => {
      const organizationId = new Types.ObjectId();
      const development = await developmentRepository.create({
        organizationId,
        name: 'Черновик',
        location: { country: 'Georgia', city: 'Tbilisi', geo: { type: 'Point', coordinates: [44.8, 41.7] } },
        contact: { phone: '+995500000004' },
      });

      await developmentsService.updateDevelopment({
        id: development._id,
        organizationId,
        expectedVersion: 0,
        correlationId: 'integration-test-correlation-id',
        changes: { name: 'Изменённый черновик' },
      });

      const publicationDoc = await connection
        .collection('marketplace_publications')
        .findOne({ sourceType: 'development', sourceId: development._id });
      expect(publicationDoc).toBeNull();

      const outboxCount = await connection
        .collection('outbox_events')
        .countDocuments({ aggregateId: development._id, eventType: 'PublicationRequested' });
      expect(outboxCount).toBe(0);
    });

    it('НЕ перевыпускает PublicationRequested, если публикация была unpublished вручную (не обходит admin unpublish)', async () => {
      const organizationId = new Types.ObjectId();
      const development = await developmentRepository.create({
        organizationId,
        name: 'Опубликован затем скрыт',
        location: { country: 'Georgia', city: 'Tbilisi', geo: { type: 'Point', coordinates: [44.8, 41.7] } },
        contact: { phone: '+995500000005' },
      });

      await developmentsService.publishDevelopment({
        id: development._id,
        organizationId,
        actorIdentityId: new Types.ObjectId(),
        idempotencyKey: 'rebuild-test-unpublish-key',
        correlationId: 'integration-test-correlation-id',
      });

      await connection.collection('marketplace_publications').updateOne(
        { sourceType: 'development', sourceId: development._id },
        { $set: { status: 'unpublished', unpublishedAt: new Date(), unpublishReason: 'test' } },
      );

      await developmentsService.updateDevelopment({
        id: development._id,
        organizationId,
        expectedVersion: 1,
        correlationId: 'integration-test-correlation-id',
        changes: { name: 'Не должно снова опубликоваться' },
      });

      const publicationDoc = await connection
        .collection('marketplace_publications')
        .findOne({ sourceType: 'development', sourceId: development._id });
      expect(publicationDoc?.status).toBe('unpublished');

      const outboxDocs = await connection
        .collection('outbox_events')
        .find({ aggregateId: development._id, eventType: 'PublicationRequested' })
        .toArray();
      expect(outboxDocs).toHaveLength(1);
    });

    /**
     * Second-opinion (Gemini) находка, проблема 3: изначальная реализация
     * rebuild делала read-then-write (isCurrentlyPublished read вне
     * session, ПОТОМ отдельный requestPublication write) — TOCTOU-гонка,
     * конкурентный admin unpublish мог быть обойдён безусловным upsert.
     * Исправлено на атомарный findOneAndUpdate с status:'published' в
     * фильтре (markPendingIfPublished). Этот тест — прямая проверка
     * РЕАЛЬНОЙ конкурентности (Promise.all, не последовательные вызовы):
     * admin unpublish и update запускаются одновременно на одной
     * published-публикации — какой бы порядок ни выиграл на уровне
     * MongoDB, результат обязан быть СОГЛАСОВАННЫМ (unpublished никогда
     * не откатывается обратно в publication_pending этой гонкой).
     */
    it('конкурентный admin unpublish + updateDevelopment (rebuild) на одной published-публикации: unpublish никогда не обходится гонкой', async () => {
      const organizationId = new Types.ObjectId();
      const development = await developmentRepository.create({
        organizationId,
        name: 'Гонка unpublish vs rebuild',
        location: { country: 'Georgia', city: 'Tbilisi', geo: { type: 'Point', coordinates: [44.8, 41.7] } },
        contact: { phone: '+995500000006' },
      });

      await developmentsService.publishDevelopment({
        id: development._id,
        organizationId,
        actorIdentityId: new Types.ObjectId(),
        idempotencyKey: 'race-test-publish-key',
        correlationId: 'integration-test-correlation-id',
      });
      await connection
        .collection('marketplace_publications')
        .updateOne({ sourceType: 'development', sourceId: development._id }, { $set: { status: 'published' } });

      const publicationBefore = await connection
        .collection('marketplace_publications')
        .findOne({ sourceType: 'development', sourceId: development._id });

      const runUnpublish = () =>
        adminPublicationService.unpublish(
          { identityId: new Types.ObjectId().toString(), adminAccountId: new Types.ObjectId().toString(), isSuperAdmin: true } as AdminContext,
          {
            publicationId: publicationBefore!._id as Types.ObjectId,
            reason: 'Конкурентный admin unpublish против rebuild',
            correlationId: 'integration-test-correlation-id',
          },
        )
          .then(() => 'ok' as const)
          .catch(() => 'conflict' as const);

      const runUpdate = () =>
        developmentsService
          .updateDevelopment({
            id: development._id,
            organizationId,
            expectedVersion: 1,
            correlationId: 'integration-test-correlation-id',
            changes: { name: 'Конкурентный rebuild' },
          })
          .then(() => 'ok' as const)
          .catch(() => 'conflict' as const);

      await Promise.all([runUnpublish(), runUpdate()]);

      // Ключевое утверждение гонки: НЕЗАВИСИМО от того, в каком порядке
      // разрешились две конкурентные операции, итоговый статус — либо
      // unpublished (unpublish выиграл, rebuild корректно увидел уже-не-
      // published состояние и не сработал), либо publication_pending
      // (rebuild выиграл ДО unpublish — тоже валидный, непротиворечивый
      // исход порядка гонки). Недопустимый исход — published (застрял
      // необновлённым) или несогласованное состояние (unpublished, но с
      // version, инкрементированной rebuild'ом, — признак, что rebuild
      // применился ПОСЛЕ unpublish, обойдя его).
      const publicationAfter = await connection
        .collection('marketplace_publications')
        .findOne({ sourceType: 'development', sourceId: development._id });

      expect(['unpublished', 'publication_pending']).toContain(publicationAfter?.status);
      if (publicationAfter?.status === 'unpublished') {
        // Rebuild не должен был выполниться после unpublish — version
        // осталась той, что была на момент publish (1), не +1 от rebuild.
        expect(publicationAfter?.version).toBe(publicationBefore?.version);
      }
    });
  });
});

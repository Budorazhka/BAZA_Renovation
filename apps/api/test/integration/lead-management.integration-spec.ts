import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { CrmModule } from '../../src/modules/crm/crm.module';
import { CrmService } from '../../src/modules/crm/crm.service';
import { OrganizationsModule } from '../../src/modules/organizations/organizations.module';
import { OrganizationsService } from '../../src/modules/organizations/organizations.service';
import { ErrorCode } from '../../src/shared/errors/error-codes';

/**
 * D-05B: GET/POST/PATCH /leads/* — самостоятельная integration-проверка
 * против РЕАЛЬНОЙ MongoDB транзакции (не моки), закрывает честный пробел —
 * до этой задачи CRM/leads не был покрыт ни одним integration-тестом.
 * Тот же bootstrap-паттерн, что developments-transactions.integration-spec.ts
 * (DI-only, без HTTP-слоя — CrmController/LeadController не участвуют,
 * ParseObjectIdPipe/PermissionGuard проверяются отдельно unit-тестами).
 */
describe('CrmService — Lead management integration (real MongoDB transactions)', () => {
  let replSet: MongoMemoryReplSet;
  let connection: Connection;
  let crmService: CrmService;
  let organizationsService: OrganizationsService;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await replSet.waitUntilRunning();
    const uri = replSet.getUri();

    // CrmModule теперь импортирует OrganizationsModule (D-05B), которое
    // транзитивно тянет MediaModule → MediaStorageService (реальный
    // S3Client в конструкторе) — тот же паттерн MINIO_* фикстур, что уже
    // используется в developments-transactions.integration-spec.ts.
    process.env.MINIO_ENDPOINT ??= 'http://localhost:9000';
    process.env.MINIO_ACCESS_KEY ??= 'test-access-key';
    process.env.MINIO_SECRET_KEY ??= 'test-secret-key';
    process.env.MINIO_BUCKET_PRIVATE ??= 'test-private';
    process.env.MINIO_BUCKET_PUBLIC ??= 'test-public';
    // CrmModule → RateLimitModule → RedisModule (RedisService конструирует
    // ioredis-клиент в конструкторе, тот же паттерн, что MediaStorageService/
    // S3Client выше) — ни один тест здесь не проходит через
    // RedisRateLimitGuard (нет HTTP-слоя, только CrmService напрямую),
    // реального подключения не требуется, ioredis сам переподключается в
    // фоне без синхронного throw (см. RedisService докстринг).
    process.env.REDIS_URL ??= 'redis://localhost:6379';

    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        MongooseModule.forRoot(uri),
        CrmModule,
        OrganizationsModule,
      ],
    }).compile();

    connection = moduleRef.get<Connection>(getConnectionToken());
    crmService = moduleRef.get(CrmService);
    organizationsService = moduleRef.get(OrganizationsService);
  }, 120_000);

  afterAll(async () => {
    // moduleRef.close() — триггерит RedisService.onModuleDestroy (закрывает
    // ioredis-соединение), иначе открытый TCP-хендл держит jest-процесс
    // (тот же риск, что незакрытый MongoDB connection).
    await moduleRef?.close();
    await connection?.close();
    await replSet?.stop();
  });

  afterEach(async () => {
    await connection.collection('leads').deleteMany({});
    await connection.collection('lead_events').deleteMany({});
    await connection.collection('contacts').deleteMany({});
    await connection.collection('positions').deleteMany({});
    await connection.collection('organizations').deleteMany({});
    await connection.collection('audit_events').deleteMany({});
    await connection.collection('permission_grants').deleteMany({});
  });

  async function seedOrganization(organizationId: Types.ObjectId): Promise<void> {
    await connection.collection('organizations').insertOne({
      _id: organizationId,
      type: 'developer',
      name: 'Интеграционный застройщик',
      status: 'active',
      createdAt: new Date(),
    });
  }

  async function seedVacantPosition(organizationId: Types.ObjectId, fixedRole: 'manager' | 'rop' = 'manager'): Promise<Types.ObjectId> {
    return organizationsService.createVacantPosition({ organizationId, fixedRole });
  }

  async function seedClosedPosition(organizationId: Types.ObjectId): Promise<Types.ObjectId> {
    const positionId = await seedVacantPosition(organizationId);
    await connection.collection('positions').updateOne({ _id: positionId }, { $set: { status: 'closed' } });
    return positionId;
  }

  async function seedLead(organizationId: Types.ObjectId, overrides?: { stage?: string; ownerPositionId?: Types.ObjectId }): Promise<Types.ObjectId> {
    const contactId = new Types.ObjectId();
    await connection.collection('contacts').insertOne({
      _id: contactId,
      organizationId,
      name: 'Иван Интеграционный',
      phone: '+79990000000',
      roles: ['buyer'],
      createdAt: new Date(),
    });
    const leadId = new Types.ObjectId();
    await connection.collection('leads').insertOne({
      _id: leadId,
      organizationId,
      contactId,
      ownerPositionId: overrides?.ownerPositionId,
      stage: overrides?.stage ?? 'new',
      // Прямая запись через native driver (не Mongoose) — schema default:0
      // не применяется автоматически, нужно явно (changeStageWithVersionCheck
      // фильтрует по version:expectedVersion, undefined никогда не совпадает).
      version: 0,
      source: { route: '/developments/integration-test' },
      createdAt: new Date(),
    });
    return leadId;
  }

  describe('assignLead — tenant isolation и Position boundary (D-05B security fix)', () => {
    it('чужая организация — assign отклоняется NotFoundException, ownerPositionId не меняется', async () => {
      const orgA = new Types.ObjectId();
      const orgB = new Types.ObjectId();
      await seedOrganization(orgA);
      await seedOrganization(orgB);
      const leadId = await seedLead(orgA);
      const foreignPositionId = await seedVacantPosition(orgB);

      await expect(
        crmService.assignLead({
          leadId,
          assigneePositionId: foreignPositionId,
          actorPositionId: new Types.ObjectId(),
          actorIdentityId: new Types.ObjectId(),
          expectedOrganizationId: orgA,
          correlationId: 'integration-test-correlation-id',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      const leadDoc = await connection.collection('leads').findOne({ _id: leadId });
      // MongoDB insertOne сериализует undefined-поле как null (не как
      // отсутствующее поле) — seedLead передаёт ownerPositionId:undefined,
      // когда overrides его не задаёт, драйвер сохраняет null. Реальный
      // инвариант "ownerPositionId не изменился" от этого не меняется.
      expect(leadDoc?.ownerPositionId).toBeFalsy();
    });

    it('closed Position — assign отклоняется ConflictException, ownerPositionId не меняется', async () => {
      const organizationId = new Types.ObjectId();
      await seedOrganization(organizationId);
      const leadId = await seedLead(organizationId);
      const closedPositionId = await seedClosedPosition(organizationId);

      await expect(
        crmService.assignLead({
          leadId,
          assigneePositionId: closedPositionId,
          actorPositionId: new Types.ObjectId(),
          actorIdentityId: new Types.ObjectId(),
          expectedOrganizationId: organizationId,
          correlationId: 'integration-test-correlation-id',
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      const leadDoc = await connection.collection('leads').findOne({ _id: leadId });
      // MongoDB insertOne сериализует undefined-поле как null (не как
      // отсутствующее поле) — seedLead передаёт ownerPositionId:undefined,
      // когда overrides его не задаёт, драйвер сохраняет null. Реальный
      // инвариант "ownerPositionId не изменился" от этого не меняется.
      expect(leadDoc?.ownerPositionId).toBeFalsy();
      // Реальная транзакция: LeadEvent/Audit тоже не должны были записаться —
      // проверка Position происходит ДО assignOwner внутри той же транзакции.
      const eventCount = await connection.collection('lead_events').countDocuments({ leadId });
      expect(eventCount).toBe(0);
      const auditCount = await connection.collection('audit_events').countDocuments({ resourceId: leadId });
      expect(auditCount).toBe(0);
    });

    it('несуществующая Position — assign отклоняется NotFoundException', async () => {
      const organizationId = new Types.ObjectId();
      await seedOrganization(organizationId);
      const leadId = await seedLead(organizationId);

      await expect(
        crmService.assignLead({
          leadId,
          assigneePositionId: new Types.ObjectId(),
          actorPositionId: new Types.ObjectId(),
          actorIdentityId: new Types.ObjectId(),
          expectedOrganizationId: organizationId,
          correlationId: 'integration-test-correlation-id',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('успешный assign — LeadEvent+Audit записаны реальной транзакцией, ownerPositionId обновлён', async () => {
      const organizationId = new Types.ObjectId();
      await seedOrganization(organizationId);
      const leadId = await seedLead(organizationId, { stage: 'qualified' });
      const positionId = await seedVacantPosition(organizationId);
      const actorPositionId = new Types.ObjectId();
      const actorIdentityId = new Types.ObjectId();

      const result = await crmService.assignLead({
        leadId,
        assigneePositionId: positionId,
        actorPositionId,
        actorIdentityId,
        expectedOrganizationId: organizationId,
        correlationId: 'integration-test-correlation-id',
      });

      expect(result.ownerPositionId).toBe(positionId.toString());

      const leadDoc = await connection.collection('leads').findOne({ _id: leadId });
      expect(leadDoc?.ownerPositionId?.toString()).toBe(positionId.toString());

      const eventDocs = await connection.collection('lead_events').find({ leadId }).toArray();
      expect(eventDocs).toHaveLength(1);
      expect(eventDocs[0]?.changedBy).toMatchObject({ type: 'position', positionId: actorPositionId });

      const auditDocs = await connection.collection('audit_events').find({ resourceId: leadId }).toArray();
      expect(auditDocs).toHaveLength(1);
      expect(auditDocs[0]?.action).toBe('lead.assign');
    });

    it('конкурентный assign — оба запроса завершаются успешно, финальный ownerPositionId одна из двух позиций (не версионировано, задокументированное поведение)', async () => {
      const organizationId = new Types.ObjectId();
      await seedOrganization(organizationId);
      const leadId = await seedLead(organizationId);
      const positionA = await seedVacantPosition(organizationId);
      const positionB = await seedVacantPosition(organizationId);

      const [resultA, resultB] = await Promise.all([
        crmService.assignLead({
          leadId,
          assigneePositionId: positionA,
          actorPositionId: new Types.ObjectId(),
          actorIdentityId: new Types.ObjectId(),
          expectedOrganizationId: organizationId,
          correlationId: 'integration-test-correlation-id-a',
        }),
        crmService.assignLead({
          leadId,
          assigneePositionId: positionB,
          actorPositionId: new Types.ObjectId(),
          actorIdentityId: new Types.ObjectId(),
          expectedOrganizationId: organizationId,
          correlationId: 'integration-test-correlation-id-b',
        }),
      ]);

      expect(resultA.ownerPositionId).toBeTruthy();
      expect(resultB.ownerPositionId).toBeTruthy();

      const leadDoc = await connection.collection('leads').findOne({ _id: leadId });
      const finalOwner = leadDoc?.ownerPositionId?.toString();
      expect([positionA.toString(), positionB.toString()]).toContain(finalOwner);

      // Оба assign успешно записали свой LeadEvent+Audit — "последний write
      // выигрывает" применяется только к самому Lead.ownerPositionId, не к
      // истории/аудиту (append-only, обе попытки реальны и произошли).
      const eventCount = await connection.collection('lead_events').countDocuments({ leadId });
      expect(eventCount).toBe(2);
      const auditCount = await connection.collection('audit_events').countDocuments({ resourceId: leadId });
      expect(auditCount).toBe(2);
    });
  });

  describe('changeLeadStage — transition-матрица (D-05B)', () => {
    it('запрещённый переход (converted→contacted) — AppException VALIDATION_FAILED, stage не меняется', async () => {
      const organizationId = new Types.ObjectId();
      await seedOrganization(organizationId);
      const leadId = await seedLead(organizationId, { stage: 'converted' });

      await expect(
        crmService.changeLeadStage({
          leadId,
          newStage: 'contacted',
          expectedVersion: 0,
          actorPositionId: new Types.ObjectId(),
          actorIdentityId: new Types.ObjectId(),
          expectedOrganizationId: organizationId,
          correlationId: 'integration-test-correlation-id',
        }),
      ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });

      const leadDoc = await connection.collection('leads').findOne({ _id: leadId });
      expect(leadDoc?.stage).toBe('converted');
      const eventCount = await connection.collection('lead_events').countDocuments({ leadId });
      expect(eventCount).toBe(0);
    });

    it('разрешённая цепочка new→contacted→qualified→converted — все переходы успешны, LeadEvent на каждый шаг', async () => {
      const organizationId = new Types.ObjectId();
      await seedOrganization(organizationId);
      const leadId = await seedLead(organizationId, { stage: 'new' });
      const actorPositionId = new Types.ObjectId();
      const actorIdentityId = new Types.ObjectId();

      let expectedVersion = 0;
      for (const newStage of ['contacted', 'qualified', 'converted'] as const) {
        const result = await crmService.changeLeadStage({
          leadId,
          newStage,
          expectedVersion,
          actorPositionId,
          actorIdentityId,
          expectedOrganizationId: organizationId,
          correlationId: `integration-test-${newStage}`,
        });
        expectedVersion = result.version;
      }

      const leadDoc = await connection.collection('leads').findOne({ _id: leadId });
      expect(leadDoc?.stage).toBe('converted');
      expect(leadDoc?.version).toBe(3);
      const eventCount = await connection.collection('lead_events').countDocuments({ leadId });
      expect(eventCount).toBe(3);
    });

    it('lost→new разрешён', async () => {
      const organizationId = new Types.ObjectId();
      await seedOrganization(organizationId);
      const leadId = await seedLead(organizationId, { stage: 'lost' });

      await crmService.changeLeadStage({
        leadId,
        newStage: 'new',
        expectedVersion: 0,
        actorPositionId: new Types.ObjectId(),
        actorIdentityId: new Types.ObjectId(),
        expectedOrganizationId: organizationId,
        correlationId: 'integration-test-correlation-id',
      });

      const leadDoc = await connection.collection('leads').findOne({ _id: leadId });
      expect(leadDoc?.stage).toBe('new');
    });

    it('lost→qualified запрещён (не восстановление прогресса задним числом)', async () => {
      const organizationId = new Types.ObjectId();
      await seedOrganization(organizationId);
      const leadId = await seedLead(organizationId, { stage: 'lost' });

      await expect(
        crmService.changeLeadStage({
          leadId,
          newStage: 'qualified',
          expectedVersion: 0,
          actorPositionId: new Types.ObjectId(),
          actorIdentityId: new Types.ObjectId(),
          expectedOrganizationId: organizationId,
          correlationId: 'integration-test-correlation-id',
        }),
      ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
    });
  });

  describe('changeLeadStage — own-scope сужение (manager меняет только свой лид, D-05B)', () => {
    it('manager меняет стадию своего лида (requiredOwnerPositionId совпадает с ownerPositionId лида)', async () => {
      const organizationId = new Types.ObjectId();
      await seedOrganization(organizationId);
      const managerPositionId = await seedVacantPosition(organizationId, 'manager');
      const leadId = await seedLead(organizationId, { stage: 'new', ownerPositionId: managerPositionId });

      const result = await crmService.changeLeadStage({
        leadId,
        newStage: 'contacted',
        expectedVersion: 0,
        actorPositionId: managerPositionId,
        actorIdentityId: new Types.ObjectId(),
        expectedOrganizationId: organizationId,
        requiredOwnerPositionId: managerPositionId,
        correlationId: 'integration-test-correlation-id',
      });

      expect(result.stage).toBe('contacted');
    });

    it('manager НЕ может менять стадию чужого лида — NotFoundException (non-disclosure), stage не меняется', async () => {
      const organizationId = new Types.ObjectId();
      await seedOrganization(organizationId);
      const managerPositionId = await seedVacantPosition(organizationId, 'manager');
      const otherOwnerPositionId = await seedVacantPosition(organizationId, 'manager');
      const leadId = await seedLead(organizationId, { stage: 'new', ownerPositionId: otherOwnerPositionId });

      await expect(
        crmService.changeLeadStage({
          leadId,
          newStage: 'contacted',
          expectedVersion: 0,
          actorPositionId: managerPositionId,
          actorIdentityId: new Types.ObjectId(),
          expectedOrganizationId: organizationId,
          requiredOwnerPositionId: managerPositionId,
          correlationId: 'integration-test-correlation-id',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      const leadDoc = await connection.collection('leads').findOne({ _id: leadId });
      expect(leadDoc?.stage).toBe('new');
    });
  });

});

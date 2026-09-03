import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { CrmModule } from '../../src/modules/crm/crm.module';
import { LeadMigrationService } from '../../src/modules/crm/lead-migration.service';
import { OrganizationsModule } from '../../src/modules/organizations/organizations.module';
import { OrganizationsService } from '../../src/modules/organizations/organizations.service';
import type { LegacyLead } from '../../src/modules/crm/legacy-lead.types';

/**
 * `[lead-legacy-migration-tool]`: LeadMigrationService против РЕАЛЬНОЙ
 * MongoDB транзакции (не моки) — тот же DI-only bootstrap, что
 * lead-management.integration-spec.ts (CrmController/HTTP не участвуют).
 * Проверяет то, что unit-тесты с мок-репозиториями в принципе не могут:
 * unique sparse индекс `{organizationId, legacyId}`, реальное сохранение
 * исторических `createdAt`/`changedAt` через настоящий Mongoose driver,
 * поведение транзакции при ошибке одного лида в батче.
 */
describe('LeadMigrationService — импорт легаси-лидов (real MongoDB transactions)', () => {
  let replSet: MongoMemoryReplSet;
  let connection: Connection;
  let leadMigrationService: LeadMigrationService;
  let organizationsService: OrganizationsService;
  let moduleRef: TestingModule;

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

    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), MongooseModule.forRoot(uri), CrmModule, OrganizationsModule],
    }).compile();

    connection = moduleRef.get<Connection>(getConnectionToken());
    leadMigrationService = moduleRef.get(LeadMigrationService);
    organizationsService = moduleRef.get(OrganizationsService);
  }, 120_000);

  afterAll(async () => {
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
    await connection.collection('permission_grants').deleteMany({});
  });

  async function seedOrganization(): Promise<Types.ObjectId> {
    const organizationId = new Types.ObjectId();
    await connection.collection('organizations').insertOne({
      _id: organizationId,
      type: 'agency',
      name: 'Интеграционное агентство',
      status: 'active',
      createdAt: new Date(),
    });
    return organizationId;
  }

  function makeLegacyLead(overrides: Partial<LegacyLead> = {}): LegacyLead {
    return {
      _id: `legacy-${new Types.ObjectId().toString()}`,
      name: 'Иван Легаси',
      phone: `+7999${Math.floor(Math.random() * 1_000_000)
        .toString()
        .padStart(7, '0')}`,
      email: 'ivan@example.test',
      city: 'Москва',
      stage: 'network_new_lead',
      productType: 'network',
      assignedTo: 'legacy-manager-1',
      createdBy: 'legacy-manager-1',
      notes: 'Заметка легаси',
      history: [
        {
          fromStage: 'network_new_lead',
          toStage: 'network_call_later',
          changedAt: '2020-01-02T00:00:00.000Z',
          changedBy: 'legacy-manager-1',
          userName: 'Пётр',
          userRole: 'manager',
          comment: 'Перезвонить позже',
        },
      ],
      dealValue: 1000,
      tags: ['vip'],
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-02T00:00:00.000Z',
      ...overrides,
    };
  }

  it('создаёт Contact + Lead (legacyId, реальный исторический createdAt) + LeadEvent (реальный historical changedAt)', async () => {
    const organizationId = await seedOrganization();
    const positionId = await organizationsService.createVacantPosition({ organizationId, fixedRole: 'manager' });
    const defaultActorIdentityId = new Types.ObjectId();
    const legacyLead = makeLegacyLead();

    const report = await leadMigrationService.importLegacyLeads({
      organizationId,
      leads: [legacyLead],
      managerMapping: { 'legacy-manager-1': positionId.toString() },
      defaultActorIdentityId,
    });

    expect(report).toMatchObject({ total: 1, created: 1, updated: 0, errors: [], warnings: [] });

    const leadDoc = await connection.collection('leads').findOne({ organizationId, legacyId: legacyLead._id });
    expect(leadDoc).not.toBeNull();
    expect(leadDoc!.createdAt.toISOString()).toBe('2020-01-01T00:00:00.000Z');
    expect(leadDoc!.stage).toBe('network_new_lead');
    expect(leadDoc!.ownerPositionId.toString()).toBe(positionId.toString());

    const contactDoc = await connection.collection('contacts').findOne({ _id: leadDoc!.contactId });
    expect(contactDoc).toMatchObject({ name: 'Иван Легаси', email: 'ivan@example.test' });

    const events = await connection.collection('lead_events').find({ leadId: leadDoc!._id }).toArray();
    expect(events).toHaveLength(1);
    expect(events[0]!.stage).toBe('network_call_later');
    expect(events[0]!.changedAt.toISOString()).toBe('2020-01-02T00:00:00.000Z');
    expect(events[0]!.changedBy).toMatchObject({ type: 'position', positionId });
  });

  it('повторный импорт того же файла: обновляет существующий лид, НЕ создаёт дубль, история не дублируется', async () => {
    const organizationId = await seedOrganization();
    const defaultActorIdentityId = new Types.ObjectId();
    const legacyLead = makeLegacyLead();

    await leadMigrationService.importLegacyLeads({
      organizationId,
      leads: [legacyLead],
      managerMapping: {},
      defaultActorIdentityId,
    });

    const secondReport = await leadMigrationService.importLegacyLeads({
      organizationId,
      leads: [{ ...legacyLead, notes: 'Обновлённая заметка' }],
      managerMapping: {},
      defaultActorIdentityId,
    });

    expect(secondReport).toMatchObject({ created: 0, updated: 1 });

    const leadDocs = await connection.collection('leads').find({ organizationId, legacyId: legacyLead._id }).toArray();
    expect(leadDocs).toHaveLength(1);
    expect(leadDocs[0]!.notes).toBe('Обновлённая заметка');

    const events = await connection.collection('lead_events').find({ leadId: leadDocs[0]!._id }).toArray();
    expect(events).toHaveLength(1);
  });

  it('невалидная стадия у одного лида в батче — ошибка по нему, второй лид переносится, транзакция первого не откатывает второй', async () => {
    const organizationId = await seedOrganization();
    const defaultActorIdentityId = new Types.ObjectId();
    const badLead = makeLegacyLead({ _id: 'bad-legacy-id', stage: 'not-a-real-stage', history: [] });
    const goodLead = makeLegacyLead({ _id: 'good-legacy-id', history: [] });

    const report = await leadMigrationService.importLegacyLeads({
      organizationId,
      leads: [badLead, goodLead],
      managerMapping: {},
      defaultActorIdentityId,
    });

    expect(report.total).toBe(2);
    expect(report.created).toBe(1);
    expect(report.errors).toEqual([{ legacyId: 'bad-legacy-id', message: expect.stringContaining('not-a-real-stage') }]);

    const leadDocs = await connection.collection('leads').find({ organizationId }).toArray();
    expect(leadDocs).toHaveLength(1);
    expect(leadDocs[0]!.legacyId).toBe('good-legacy-id');
  });

  it('dry-run: отчёт создан/обновлён считается верно, но ни один документ не пишется', async () => {
    const organizationId = await seedOrganization();
    const defaultActorIdentityId = new Types.ObjectId();
    const legacyLead = makeLegacyLead();

    const report = await leadMigrationService.importLegacyLeads({
      organizationId,
      leads: [legacyLead],
      managerMapping: {},
      defaultActorIdentityId,
      dryRun: true,
    });

    expect(report).toMatchObject({ created: 1, updated: 0 });

    const leadCount = await connection.collection('leads').countDocuments({ organizationId });
    const contactCount = await connection.collection('contacts').countDocuments({ organizationId });
    expect(leadCount).toBe(0);
    expect(contactCount).toBe(0);
  });

  it('организация A и организация B с одинаковым legacyId — оба лида создаются независимо (unique sparse индекс per-organization)', async () => {
    const organizationA = await seedOrganization();
    const organizationB = await seedOrganization();
    const defaultActorIdentityId = new Types.ObjectId();
    const legacyLead = makeLegacyLead({ _id: 'shared-legacy-id', history: [] });

    await leadMigrationService.importLegacyLeads({
      organizationId: organizationA,
      leads: [legacyLead],
      managerMapping: {},
      defaultActorIdentityId,
    });
    const reportB = await leadMigrationService.importLegacyLeads({
      organizationId: organizationB,
      leads: [{ ...legacyLead, phone: '+79995551234' }],
      managerMapping: {},
      defaultActorIdentityId,
    });

    expect(reportB).toMatchObject({ created: 1, updated: 0, errors: [] });

    const leadA = await connection.collection('leads').findOne({ organizationId: organizationA, legacyId: 'shared-legacy-id' });
    const leadB = await connection.collection('leads').findOne({ organizationId: organizationB, legacyId: 'shared-legacy-id' });
    expect(leadA).not.toBeNull();
    expect(leadB).not.toBeNull();
    expect(leadA!._id.toString()).not.toBe(leadB!._id.toString());
  });
});

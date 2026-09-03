import { Types } from 'mongoose';
import { LeadMigrationService } from './lead-migration.service';
import type { ContactRepository } from './repository/contact.repository';
import type { LeadRepository } from './repository/lead.repository';
import type { LeadEventRepository } from './repository/lead-event.repository';
import type { LegacyLead } from './legacy-lead.types';

function makeMockConnection() {
  return {
    startSession: jest.fn().mockResolvedValue({
      withTransaction: async (work: () => Promise<unknown>) => work(),
      endSession: jest.fn().mockResolvedValue(undefined),
    }),
  };
}

function makeLegacyLead(overrides: Partial<LegacyLead> = {}): LegacyLead {
  return {
    _id: 'legacy-lead-1',
    name: 'Иван Легаси',
    phone: '+79990000001',
    email: 'ivan@example.test',
    city: 'Москва',
    stage: 'network_new_lead',
    productType: 'network',
    assignedTo: 'legacy-manager-1',
    createdBy: 'legacy-manager-1',
    notes: 'Заметка',
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

function makeService(overrides: {
  connection?: unknown;
  contactRepository?: Partial<ContactRepository>;
  leadRepository?: Partial<LeadRepository>;
  leadEventRepository?: Partial<LeadEventRepository>;
} = {}) {
  const connection = overrides.connection ?? makeMockConnection();

  const contact = { _id: new Types.ObjectId() };
  const contactRepository = {
    findByPhone: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue(contact),
    ...overrides.contactRepository,
  };

  const createdLead = { _id: new Types.ObjectId() };
  const leadRepository = {
    findByLegacyId: jest.fn().mockResolvedValue(null),
    createFromMigration: jest.fn().mockResolvedValue(createdLead),
    updateFields: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    ...overrides.leadRepository,
  };

  const leadEventRepository = {
    append: jest.fn().mockResolvedValue(undefined),
    ...overrides.leadEventRepository,
  };

  const service = new LeadMigrationService(
    connection as never,
    contactRepository as unknown as ContactRepository,
    leadRepository as unknown as LeadRepository,
    leadEventRepository as unknown as LeadEventRepository,
  );

  return { service, connection, contactRepository, leadRepository, leadEventRepository, contact, createdLead };
}

const organizationId = new Types.ObjectId();
const defaultActorIdentityId = new Types.ObjectId();

describe('LeadMigrationService.importLegacyLeads — успешный импорт', () => {
  it('новый лид с полной историей: contact создан, лид создан через createFromMigration, история перенесена, legacyId проставлен', async () => {
    const positionId = new Types.ObjectId().toString();
    const { service, contactRepository, leadRepository, leadEventRepository, contact, createdLead } = makeService();
    const legacyLead = makeLegacyLead();

    const report = await service.importLegacyLeads({
      organizationId,
      leads: [legacyLead],
      managerMapping: { 'legacy-manager-1': positionId },
      defaultActorIdentityId,
    });

    expect(report).toMatchObject({ total: 1, created: 1, updated: 0, skipped: 0, errors: [], warnings: [] });

    expect(contactRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        name: 'Иван Легаси',
        phone: '+79990000001',
        email: 'ivan@example.test',
        roles: ['buyer'],
      }),
      expect.anything(),
    );

    expect(leadRepository.createFromMigration).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        contactId: contact._id,
        legacyId: 'legacy-lead-1',
        productType: 'network',
        stage: 'network_new_lead',
        ownerPositionId: new Types.ObjectId(positionId),
        city: 'Москва',
        notes: 'Заметка',
        tags: ['vip'],
        dealValue: 1000,
        createdAt: new Date('2020-01-01T00:00:00.000Z'),
      }),
      expect.anything(),
    );

    expect(leadEventRepository.append).toHaveBeenCalledTimes(1);
    expect(leadEventRepository.append).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: createdLead._id,
        organizationId,
        stage: 'network_call_later',
        changedBy: { type: 'position', positionId: new Types.ObjectId(positionId) },
        comment: 'Перезвонить позже',
        changedAt: new Date('2020-01-02T00:00:00.000Z'),
      }),
      expect.anything(),
    );
  });

  it('sales-продукт: легаси-стадия переводится по таблице, не копируется напрямую', async () => {
    const { service, leadRepository } = makeService();
    const legacyLead = makeLegacyLead({
      productType: 'sales',
      stage: 'rejected',
      history: [],
    });

    await service.importLegacyLeads({
      organizationId,
      leads: [legacyLead],
      managerMapping: {},
      defaultActorIdentityId,
    });

    expect(leadRepository.createFromMigration).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'defective' }),
      expect.anything(),
    );
  });
});

describe('LeadMigrationService.importLegacyLeads — идемпотентность', () => {
  it('повторный импорт того же legacyId обновляет лид, не создаёт дубль, история не дублируется', async () => {
    const existingLead = { _id: new Types.ObjectId() };
    const { service, leadRepository, leadEventRepository } = makeService({
      leadRepository: { findByLegacyId: jest.fn().mockResolvedValue(existingLead) },
    });
    const legacyLead = makeLegacyLead();

    const report = await service.importLegacyLeads({
      organizationId,
      leads: [legacyLead],
      managerMapping: {},
      defaultActorIdentityId,
    });

    expect(report).toMatchObject({ created: 0, updated: 1 });
    expect(leadRepository.createFromMigration).not.toHaveBeenCalled();
    expect(leadRepository.updateFields).toHaveBeenCalledWith(
      existingLead._id,
      organizationId,
      expect.objectContaining({ stage: 'network_new_lead' }),
      expect.anything(),
    );
    expect(leadEventRepository.append).not.toHaveBeenCalled();
  });
});

describe('LeadMigrationService.importLegacyLeads — испорченные данные не роняют батч', () => {
  it('невалидная стадия — ошибка по этой строке, остальные лиды переносятся', async () => {
    const { service, leadRepository } = makeService();
    const badLead = makeLegacyLead({ _id: 'bad-lead', stage: 'no-such-stage' });
    const goodLead = makeLegacyLead({ _id: 'good-lead' });

    const report = await service.importLegacyLeads({
      organizationId,
      leads: [badLead, goodLead],
      managerMapping: {},
      defaultActorIdentityId,
    });

    expect(report.total).toBe(2);
    expect(report.created).toBe(1);
    expect(report.errors).toEqual([
      { legacyId: 'bad-lead', message: expect.stringContaining('no-such-stage') },
    ]);
    expect(leadRepository.createFromMigration).toHaveBeenCalledTimes(1);
  });

  it('невалидный productType — ошибка по строке, не падение всего вызова', async () => {
    const { service } = makeService();
    const badLead = makeLegacyLead({ productType: 'unknown-product' });

    const report = await service.importLegacyLeads({
      organizationId,
      leads: [badLead],
      managerMapping: {},
      defaultActorIdentityId,
    });

    expect(report.errors).toEqual([
      { legacyId: 'legacy-lead-1', message: expect.stringContaining('unknown-product') },
    ]);
  });
});

describe('LeadMigrationService.importLegacyLeads — managerMapping', () => {
  it('assignedTo без соответствия в managerMapping — лид без owner, зафиксировано в warnings', async () => {
    const { service, leadRepository } = makeService();
    const legacyLead = makeLegacyLead({ history: [] });

    const report = await service.importLegacyLeads({
      organizationId,
      leads: [legacyLead],
      managerMapping: {},
      defaultActorIdentityId,
    });

    expect(leadRepository.createFromMigration).toHaveBeenCalledWith(
      expect.objectContaining({ ownerPositionId: undefined }),
      expect.anything(),
    );
    expect(report.warnings).toEqual([
      { legacyId: 'legacy-lead-1', message: 'не назначен, нет в managerMapping' },
    ]);
  });

  it('history[].changedBy без соответствия в managerMapping — LeadEvent на системного identity-актора', async () => {
    const { service, leadEventRepository } = makeService();
    const legacyLead = makeLegacyLead();

    await service.importLegacyLeads({
      organizationId,
      leads: [legacyLead],
      managerMapping: {},
      defaultActorIdentityId,
    });

    expect(leadEventRepository.append).toHaveBeenCalledWith(
      expect.objectContaining({ changedBy: { type: 'identity', id: defaultActorIdentityId } }),
      expect.anything(),
    );
  });
});

describe('LeadMigrationService.importLegacyLeads — dry-run', () => {
  it('не пишет в базу, но отдаёт тот же формат отчёта', async () => {
    const { service, contactRepository, leadRepository, leadEventRepository } = makeService();
    const legacyLead = makeLegacyLead();

    const report = await service.importLegacyLeads({
      organizationId,
      leads: [legacyLead],
      managerMapping: {},
      defaultActorIdentityId,
      dryRun: true,
    });

    expect(report).toMatchObject({ total: 1, created: 1, updated: 0, skipped: 0, errors: [] });
    expect(contactRepository.create).not.toHaveBeenCalled();
    expect(leadRepository.createFromMigration).not.toHaveBeenCalled();
    expect(leadRepository.updateFields).not.toHaveBeenCalled();
    expect(leadEventRepository.append).not.toHaveBeenCalled();
  });

  it('dry-run различает created/updated по факту существования legacyId', async () => {
    const existingLead = { _id: new Types.ObjectId() };
    const { service, leadRepository } = makeService({
      leadRepository: { findByLegacyId: jest.fn().mockResolvedValue(existingLead) },
    });

    const report = await service.importLegacyLeads({
      organizationId,
      leads: [makeLegacyLead()],
      managerMapping: {},
      defaultActorIdentityId,
      dryRun: true,
    });

    expect(report).toMatchObject({ created: 0, updated: 1 });
    expect(leadRepository.createFromMigration).not.toHaveBeenCalled();
  });
});

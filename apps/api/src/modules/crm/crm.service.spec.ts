import { ConflictException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { CrmService } from './crm.service';
import { AppException } from '../../shared/errors/app-exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import type { MarketplacePublicationRepository } from '@baza/publication';
import type { DevelopmentRepository } from '@baza/development';
import type { ContactRepository } from './repository/contact.repository';
import type { LeadRepository } from './repository/lead.repository';
import type { LeadEventRepository } from './repository/lead-event.repository';
import type { AuditService } from '../audit/audit.service';
import type { OrganizationsService } from '../organizations/organizations.service';

/**
 * Тот же паттерн, что organizations.service.spec.ts/developments.service.spec.ts:
 * withTransaction выполняет work() напрямую, атомарность самой транзакции
 * проверяется integration-тестом, не здесь.
 */
function makeMockConnection() {
  return {
    startSession: jest.fn().mockResolvedValue({
      withTransaction: async (work: () => Promise<unknown>) => work(),
      endSession: jest.fn().mockResolvedValue(undefined),
    }),
  };
}

function makeDevelopment(overrides: Partial<{ organizationId: Types.ObjectId }> = {}) {
  return {
    _id: new Types.ObjectId(),
    organizationId: overrides.organizationId ?? new Types.ObjectId(),
    contact: { phone: '+79991234567', whatsapp: '+79991234567', telegram: undefined },
  };
}

function makePublication(overrides: Partial<{ sourceType: string; sourceId: Types.ObjectId }> = {}) {
  return {
    _id: new Types.ObjectId(),
    sourceType: overrides.sourceType ?? 'development',
    sourceId: overrides.sourceId ?? new Types.ObjectId(),
  };
}

describe('CrmService.revealContact', () => {
  it('создаёт Contact+Lead+LeadEvent+audit транзакционно и возвращает контактные каналы Development', async () => {
    const organizationId = new Types.ObjectId();
    const development = makeDevelopment({ organizationId });
    const publication = makePublication({ sourceId: development._id });
    const contactId = new Types.ObjectId();
    const leadId = new Types.ObjectId();

    const findBySlugSpy = jest.fn().mockResolvedValue(publication);
    const findByIdSpy = jest.fn().mockResolvedValue(development);
    const findByPhoneSpy = jest.fn().mockResolvedValue(null);
    const createContactSpy = jest.fn().mockResolvedValue({ _id: contactId });
    const createLeadSpy = jest.fn().mockResolvedValue({ _id: leadId });
    const appendEventSpy = jest.fn().mockResolvedValue(undefined);
    const auditAppendSpy = jest.fn().mockResolvedValue(undefined);

    const service = new CrmService(
      makeMockConnection() as never,
      { findBySlug: findBySlugSpy } as unknown as MarketplacePublicationRepository,
      { findById: findByIdSpy } as unknown as DevelopmentRepository,
      { findByPhone: findByPhoneSpy, create: createContactSpy } as unknown as ContactRepository,
      { create: createLeadSpy } as unknown as LeadRepository,
      { append: appendEventSpy } as unknown as LeadEventRepository,
      { append: auditAppendSpy } as unknown as AuditService,
      {
        findAssignablePosition: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), status: 'vacant' }),
      } as unknown as OrganizationsService,
    );

    const result = await service.revealContact({
      slug: 'zhk-solnechnyy',
      requesterName: 'Иван',
      requesterPhone: '+79997654321',
      correlationId: 'test-correlation-id',
    });

    expect(createContactSpy).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId, phone: '+79997654321', name: 'Иван', roles: ['buyer'] }),
      expect.anything(),
    );
    expect(createLeadSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        contactId,
        source: expect.objectContaining({ route: '/developments/zhk-solnechnyy', publicationId: publication._id }),
      }),
      expect.anything(),
    );
    expect(appendEventSpy).toHaveBeenCalledWith(
      expect.objectContaining({ leadId, organizationId, stage: 'new', changedBy: { type: 'system' } }),
      expect.anything(),
    );
    expect(auditAppendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { type: 'system' },
        action: 'lead.create_from_reveal',
        resource: 'lead',
        resourceId: leadId,
      }),
      expect.anything(),
    );
    expect(result).toEqual({ phone: '+79991234567', whatsapp: '+79991234567', telegram: undefined, leadId });
  });

  it('переиспользует существующий Contact по tenant-local phone dedupe, но создаёт новый Lead', async () => {
    const organizationId = new Types.ObjectId();
    const development = makeDevelopment({ organizationId });
    const publication = makePublication({ sourceId: development._id });
    const existingContact = { _id: new Types.ObjectId() };

    const findByPhoneSpy = jest.fn().mockResolvedValue(existingContact);
    const createContactSpy = jest.fn();
    const createLeadSpy = jest.fn().mockResolvedValue({ _id: new Types.ObjectId() });

    const service = new CrmService(
      makeMockConnection() as never,
      { findBySlug: jest.fn().mockResolvedValue(publication) } as unknown as MarketplacePublicationRepository,
      { findById: jest.fn().mockResolvedValue(development) } as unknown as DevelopmentRepository,
      { findByPhone: findByPhoneSpy, create: createContactSpy } as unknown as ContactRepository,
      { create: createLeadSpy } as unknown as LeadRepository,
      { append: jest.fn().mockResolvedValue(undefined) } as unknown as LeadEventRepository,
      { append: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService,
      {
        findAssignablePosition: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), status: 'vacant' }),
      } as unknown as OrganizationsService,
    );

    await service.revealContact({
      slug: 'zhk-solnechnyy',
      requesterPhone: '+79997654321',
      correlationId: 'test-correlation-id',
    });

    expect(createContactSpy).not.toHaveBeenCalled();
    expect(createLeadSpy).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: existingContact._id }),
      expect.anything(),
    );
  });

  it('отклоняет запрос без requesterPhone как VALIDATION_FAILED, не создаёт ничего', async () => {
    const development = makeDevelopment();
    const publication = makePublication({ sourceId: development._id });
    const createContactSpy = jest.fn();
    const createLeadSpy = jest.fn();

    const service = new CrmService(
      makeMockConnection() as never,
      { findBySlug: jest.fn().mockResolvedValue(publication) } as unknown as MarketplacePublicationRepository,
      { findById: jest.fn().mockResolvedValue(development) } as unknown as DevelopmentRepository,
      { findByPhone: jest.fn(), create: createContactSpy } as unknown as ContactRepository,
      { create: createLeadSpy } as unknown as LeadRepository,
      { append: jest.fn() } as unknown as LeadEventRepository,
      { append: jest.fn() } as unknown as AuditService,
      {
        findAssignablePosition: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), status: 'vacant' }),
      } as unknown as OrganizationsService,
    );

    await expect(
      service.revealContact({ slug: 'zhk-solnechnyy', correlationId: 'test-correlation-id' }),
    ).rejects.toMatchObject(new AppException(ErrorCode.VALIDATION_FAILED, 'requesterPhone is required to create a lead'));

    expect(createContactSpy).not.toHaveBeenCalled();
    expect(createLeadSpy).not.toHaveBeenCalled();
  });

  it('бросает NotFoundException, если publication не найдена по slug', async () => {
    const service = new CrmService(
      makeMockConnection() as never,
      { findBySlug: jest.fn().mockResolvedValue(null) } as unknown as MarketplacePublicationRepository,
      { findById: jest.fn() } as unknown as DevelopmentRepository,
      {} as unknown as ContactRepository,
      {} as unknown as LeadRepository,
      {} as unknown as LeadEventRepository,
      {} as unknown as AuditService,
      {
        findAssignablePosition: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), status: 'vacant' }),
      } as unknown as OrganizationsService,
    );

    await expect(
      service.revealContact({
        slug: 'unknown-slug',
        requesterPhone: '+79997654321',
        correlationId: 'test-correlation-id',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('бросает NotFoundException, если publication.sourceType не development', async () => {
    const publication = makePublication({ sourceType: 'unit' });

    const service = new CrmService(
      makeMockConnection() as never,
      { findBySlug: jest.fn().mockResolvedValue(publication) } as unknown as MarketplacePublicationRepository,
      { findById: jest.fn() } as unknown as DevelopmentRepository,
      {} as unknown as ContactRepository,
      {} as unknown as LeadRepository,
      {} as unknown as LeadEventRepository,
      {} as unknown as AuditService,
      {
        findAssignablePosition: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), status: 'vacant' }),
      } as unknown as OrganizationsService,
    );

    await expect(
      service.revealContact({
        slug: 'zhk-solnechnyy',
        requesterPhone: '+79997654321',
        correlationId: 'test-correlation-id',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('бросает NotFoundException, если publication опубликована, но Development недоступен (рассинхронизация)', async () => {
    const publication = makePublication();

    const service = new CrmService(
      makeMockConnection() as never,
      { findBySlug: jest.fn().mockResolvedValue(publication) } as unknown as MarketplacePublicationRepository,
      { findById: jest.fn().mockResolvedValue(null) } as unknown as DevelopmentRepository,
      {} as unknown as ContactRepository,
      {} as unknown as LeadRepository,
      {} as unknown as LeadEventRepository,
      {} as unknown as AuditService,
      {
        findAssignablePosition: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), status: 'vacant' }),
      } as unknown as OrganizationsService,
    );

    await expect(
      service.revealContact({
        slug: 'zhk-solnechnyy',
        requesterPhone: '+79997654321',
        correlationId: 'test-correlation-id',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

function makeLead(overrides: Partial<{ organizationId: Types.ObjectId; stage: string; ownerPositionId: Types.ObjectId; version: number }> = {}) {
  return {
    _id: new Types.ObjectId(),
    organizationId: overrides.organizationId ?? new Types.ObjectId(),
    contactId: new Types.ObjectId(),
    ownerPositionId: overrides.ownerPositionId,
    stage: overrides.stage ?? 'new',
    version: overrides.version ?? 0,
    source: { route: '/developments/x' },
  };
}

describe('CrmService.assignLead', () => {
  it('назначает owner, пишет LeadEvent с ТЕКУЩИМ stage (не меняет его) и audit', async () => {
    const organizationId = new Types.ObjectId();
    const lead = makeLead({ organizationId, stage: 'qualified' });
    const assigneePositionId = new Types.ObjectId();
    const actorPositionId = new Types.ObjectId();
    const actorIdentityId = new Types.ObjectId();
    const assignOwnerSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
    const appendEventSpy = jest.fn().mockResolvedValue(undefined);
    const auditAppendSpy = jest.fn().mockResolvedValue(undefined);

    const service = new CrmService(
      makeMockConnection() as never,
      {} as unknown as MarketplacePublicationRepository,
      {} as unknown as DevelopmentRepository,
      {} as unknown as ContactRepository,
      {
        findByIdForOrganization: jest.fn().mockResolvedValue(lead),
        assignOwner: assignOwnerSpy,
      } as unknown as LeadRepository,
      { append: appendEventSpy } as unknown as LeadEventRepository,
      { append: auditAppendSpy } as unknown as AuditService,
      {
        findAssignablePosition: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), status: 'vacant' }),
      } as unknown as OrganizationsService,
    );

    const result = await service.assignLead({
      leadId: lead._id,
      assigneePositionId,
      actorPositionId,
      actorIdentityId,
      expectedOrganizationId: organizationId,
      correlationId: 'test-correlation-id',
    });

    // Реальный найденный баг (second-opinion ревью): assignOwner вызывался
    // без session, хотя внутри runInTransaction — write не откатывался бы
    // вместе с audit/event при ошибке транзакции. expect.anything() — тот
    // же session-объект, что видят appendEventSpy/auditAppendSpy ниже.
    expect(assignOwnerSpy).toHaveBeenCalledWith(lead._id, organizationId, assigneePositionId, expect.anything());
    expect(appendEventSpy).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: lead._id, stage: 'qualified', changedBy: { type: 'position', positionId: actorPositionId } }),
      expect.anything(),
    );
    expect(auditAppendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { type: 'identity', id: actorIdentityId },
        action: 'lead.assign',
        after: { ownerPositionId: assigneePositionId.toString() },
      }),
      expect.anything(),
    );
    expect(result.ownerPositionId).toBe(assigneePositionId.toString());
    expect(result.stage).toBe('qualified');
  });

  it('бросает NotFoundException для чужой организации, не вызывает assignOwner', async () => {
    const assignOwnerSpy = jest.fn();
    const service = new CrmService(
      makeMockConnection() as never,
      {} as unknown as MarketplacePublicationRepository,
      {} as unknown as DevelopmentRepository,
      {} as unknown as ContactRepository,
      { findByIdForOrganization: jest.fn().mockResolvedValue(null), assignOwner: assignOwnerSpy } as unknown as LeadRepository,
      { append: jest.fn() } as unknown as LeadEventRepository,
      { append: jest.fn() } as unknown as AuditService,
      {
        findAssignablePosition: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), status: 'vacant' }),
      } as unknown as OrganizationsService,
    );

    await expect(
      service.assignLead({
        leadId: new Types.ObjectId(),
        assigneePositionId: new Types.ObjectId(),
        actorPositionId: new Types.ObjectId(),
        actorIdentityId: new Types.ObjectId(),
        expectedOrganizationId: new Types.ObjectId(),
        correlationId: 'test-correlation-id',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(assignOwnerSpy).not.toHaveBeenCalled();
  });

  it('D-05B: бросает NotFoundException, если findAssignablePosition отклоняет позицию (чужая организация/не существует), не вызывает assignOwner', async () => {
    const organizationId = new Types.ObjectId();
    const lead = makeLead({ organizationId });
    const assignOwnerSpy = jest.fn();
    const findAssignablePositionSpy = jest.fn().mockRejectedValue(new NotFoundException('Position not found'));

    const service = new CrmService(
      makeMockConnection() as never,
      {} as unknown as MarketplacePublicationRepository,
      {} as unknown as DevelopmentRepository,
      {} as unknown as ContactRepository,
      { findByIdForOrganization: jest.fn().mockResolvedValue(lead), assignOwner: assignOwnerSpy } as unknown as LeadRepository,
      { append: jest.fn() } as unknown as LeadEventRepository,
      { append: jest.fn() } as unknown as AuditService,
      { findAssignablePosition: findAssignablePositionSpy } as unknown as OrganizationsService,
    );

    const assigneePositionId = new Types.ObjectId();
    await expect(
      service.assignLead({
        leadId: lead._id,
        assigneePositionId,
        actorPositionId: new Types.ObjectId(),
        actorIdentityId: new Types.ObjectId(),
        expectedOrganizationId: organizationId,
        correlationId: 'test-correlation-id',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(findAssignablePositionSpy).toHaveBeenCalledWith(assigneePositionId, organizationId, expect.anything());
    expect(assignOwnerSpy).not.toHaveBeenCalled();
  });

  it('D-05B: бросает ConflictException, если Position closed, не вызывает assignOwner', async () => {
    const organizationId = new Types.ObjectId();
    const lead = makeLead({ organizationId });
    const assignOwnerSpy = jest.fn();

    const service = new CrmService(
      makeMockConnection() as never,
      {} as unknown as MarketplacePublicationRepository,
      {} as unknown as DevelopmentRepository,
      {} as unknown as ContactRepository,
      { findByIdForOrganization: jest.fn().mockResolvedValue(lead), assignOwner: assignOwnerSpy } as unknown as LeadRepository,
      { append: jest.fn() } as unknown as LeadEventRepository,
      { append: jest.fn() } as unknown as AuditService,
      {
        findAssignablePosition: jest.fn().mockRejectedValue(new ConflictException('Position is closed and cannot be assigned')),
      } as unknown as OrganizationsService,
    );

    await expect(
      service.assignLead({
        leadId: lead._id,
        assigneePositionId: new Types.ObjectId(),
        actorPositionId: new Types.ObjectId(),
        actorIdentityId: new Types.ObjectId(),
        expectedOrganizationId: organizationId,
        correlationId: 'test-correlation-id',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(assignOwnerSpy).not.toHaveBeenCalled();
  });
});

describe('CrmService.changeLeadStage', () => {
  it('меняет stage, пишет LeadEvent с НОВЫМ stage и audit before/after', async () => {
    const organizationId = new Types.ObjectId();
    const lead = makeLead({ organizationId, stage: 'contacted' });
    const actorPositionId = new Types.ObjectId();
    const actorIdentityId = new Types.ObjectId();
    const changeStageSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
    const appendEventSpy = jest.fn().mockResolvedValue(undefined);
    const auditAppendSpy = jest.fn().mockResolvedValue(undefined);

    const service = new CrmService(
      makeMockConnection() as never,
      {} as unknown as MarketplacePublicationRepository,
      {} as unknown as DevelopmentRepository,
      {} as unknown as ContactRepository,
      {
        findByIdForOrganization: jest.fn().mockResolvedValue(lead),
        changeStageWithVersionCheck: changeStageSpy,
      } as unknown as LeadRepository,
      { append: appendEventSpy } as unknown as LeadEventRepository,
      { append: auditAppendSpy } as unknown as AuditService,
      {
        findAssignablePosition: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), status: 'vacant' }),
      } as unknown as OrganizationsService,
    );

    const result = await service.changeLeadStage({
      leadId: lead._id,
      newStage: 'qualified',
      expectedVersion: lead.version,
      actorPositionId,
      actorIdentityId,
      expectedOrganizationId: organizationId,
      correlationId: 'test-correlation-id',
    });

    expect(changeStageSpy).toHaveBeenCalledWith(lead._id, organizationId, lead.version, 'qualified', ['contacted'], expect.anything());
    expect(appendEventSpy).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'qualified', changedBy: { type: 'position', positionId: actorPositionId } }),
      expect.anything(),
    );
    expect(auditAppendSpy).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'lead.change_stage', before: { stage: 'contacted' }, after: { stage: 'qualified' } }),
      expect.anything(),
    );
    expect(result.stage).toBe('qualified');
  });

  it('бросает NotFoundException для несуществующего лида', async () => {
    const service = new CrmService(
      makeMockConnection() as never,
      {} as unknown as MarketplacePublicationRepository,
      {} as unknown as DevelopmentRepository,
      {} as unknown as ContactRepository,
      { findByIdForOrganization: jest.fn().mockResolvedValue(null) } as unknown as LeadRepository,
      { append: jest.fn() } as unknown as LeadEventRepository,
      { append: jest.fn() } as unknown as AuditService,
      {
        findAssignablePosition: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), status: 'vacant' }),
      } as unknown as OrganizationsService,
    );

    await expect(
      service.changeLeadStage({
        leadId: new Types.ObjectId(),
        newStage: 'lost',
        expectedVersion: 0,
        actorPositionId: new Types.ObjectId(),
        actorIdentityId: new Types.ObjectId(),
        expectedOrganizationId: new Types.ObjectId(),
        correlationId: 'test-correlation-id',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  function makeChangeStageService(lead: ReturnType<typeof makeLead>, changeStageSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 })) {
    return new CrmService(
      makeMockConnection() as never,
      {} as unknown as MarketplacePublicationRepository,
      {} as unknown as DevelopmentRepository,
      {} as unknown as ContactRepository,
      {
        findByIdForOrganization: jest.fn().mockResolvedValue(lead),
        changeStageWithVersionCheck: changeStageSpy,
      } as unknown as LeadRepository,
      { append: jest.fn().mockResolvedValue(undefined) } as unknown as LeadEventRepository,
      { append: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService,
      { findAssignablePosition: jest.fn() } as unknown as OrganizationsService,
    );
  }

  describe('D-05B: transition-матрица', () => {
    it.each([
      ['new', 'contacted'],
      ['new', 'lost'],
      ['contacted', 'qualified'],
      ['contacted', 'lost'],
      ['qualified', 'converted'],
      ['qualified', 'lost'],
      ['lost', 'new'],
    ] as const)('разрешает переход %s → %s', async (from, to) => {
      const organizationId = new Types.ObjectId();
      const lead = makeLead({ organizationId, stage: from });
      const service = makeChangeStageService(lead);

      await expect(
        service.changeLeadStage({
          leadId: lead._id,
          newStage: to,
          expectedVersion: lead.version,
          actorPositionId: new Types.ObjectId(),
          actorIdentityId: new Types.ObjectId(),
          expectedOrganizationId: organizationId,
          correlationId: 'test-correlation-id',
        }),
      ).resolves.toBeDefined();
    });

    it.each([
      ['converted', 'contacted'],
      ['converted', 'new'],
      ['new', 'qualified'],
      ['new', 'converted'],
      ['contacted', 'converted'],
      ['lost', 'qualified'],
      ['lost', 'contacted'],
      ['lost', 'converted'],
    ] as const)('запрещает переход %s → %s', async (from, to) => {
      const organizationId = new Types.ObjectId();
      const lead = makeLead({ organizationId, stage: from });
      const changeStageSpy = jest.fn();
      const service = makeChangeStageService(lead, changeStageSpy);

      await expect(
        service.changeLeadStage({
          leadId: lead._id,
          newStage: to,
          expectedVersion: lead.version,
          actorPositionId: new Types.ObjectId(),
          actorIdentityId: new Types.ObjectId(),
          expectedOrganizationId: organizationId,
          correlationId: 'test-correlation-id',
        }),
      ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
      expect(changeStageSpy).not.toHaveBeenCalled();
    });
  });

  describe('optimistic concurrency (27.08.2026) — modifiedCount:0 disambiguation', () => {
    /**
     * Реальный баг, найденный integration-тестом (lead-stage-change-race.
     * integration-spec.ts), не гипотетически: два параллельных запроса с
     * РАЗНЫМИ newStage из одного and того же previousStage — проигравший
     * (version уже устарела) НЕ должен получать VALIDATION_FAILED только
     * потому, что его целевая стадия недостижима из НОВОГО current.stage
     * (current.stage сдвинулся из-за победителя) — это ЕЩЁ конкурентный
     * конфликт (ретрай после refresh валиден), не постоянная невозможность.
     * Различие делается по current.version !== expectedVersion, не по
     * current.stage transition-таблице.
     */
    it('version устарела (current.version !== expectedVersion) — ConflictException 409, даже если newStage недостижим из НОВОГО current.stage', async () => {
      const organizationId = new Types.ObjectId();
      const lead = makeLead({ organizationId, stage: 'new', version: 0 });
      // Конкурентный победитель уже перевёл лид new→contacted (version:1) —
      // наш запрос целился в 'lost' от 'new' (валидный переход изначально),
      // но 'contacted'→'lost' тоже валиден, поэтому нужен второй сценарий
      // ниже для действительно недостижимого случая; здесь просто
      // подтверждаем: 409, не 400, когда version разошлась.
      const currentAfterRace = { ...lead, stage: 'converted', version: 1 };
      const service = new CrmService(
        makeMockConnection() as never,
        {} as unknown as MarketplacePublicationRepository,
        {} as unknown as DevelopmentRepository,
        {} as unknown as ContactRepository,
        {
          findByIdForOrganization: jest
            .fn()
            .mockResolvedValueOnce(lead)
            .mockResolvedValueOnce(currentAfterRace),
          changeStageWithVersionCheck: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
        } as unknown as LeadRepository,
        { append: jest.fn() } as unknown as LeadEventRepository,
        { append: jest.fn() } as unknown as AuditService,
        { findAssignablePosition: jest.fn() } as unknown as OrganizationsService,
      );

      await expect(
        service.changeLeadStage({
          leadId: lead._id,
          newStage: 'lost',
          expectedVersion: 0,
          actorPositionId: new Types.ObjectId(),
          actorIdentityId: new Types.ObjectId(),
          expectedOrganizationId: organizationId,
          correlationId: 'test-correlation-id',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('version совпадает с current, но атомарный write всё равно вернул modifiedCount:0 (защитная ветка) — VALIDATION_FAILED, не ConflictException', async () => {
      const organizationId = new Types.ObjectId();
      // Валидный переход по pre-транзакционной проверке (new→contacted
      // разрешён) — модель не должна дойти сюда в норме, это чисто
      // defensive-ветка disambiguation на случай рассинхрона между
      // pre-check и атомарным Mongo-фильтром (например, будущий рефакторинг
      // LEAD_STAGE_TRANSITIONS без обновления обеих проверок синхронно).
      const lead = makeLead({ organizationId, stage: 'new', version: 0 });
      const service = new CrmService(
        makeMockConnection() as never,
        {} as unknown as MarketplacePublicationRepository,
        {} as unknown as DevelopmentRepository,
        {} as unknown as ContactRepository,
        {
          findByIdForOrganization: jest.fn().mockResolvedValue(lead),
          changeStageWithVersionCheck: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
        } as unknown as LeadRepository,
        { append: jest.fn() } as unknown as LeadEventRepository,
        { append: jest.fn() } as unknown as AuditService,
        { findAssignablePosition: jest.fn() } as unknown as OrganizationsService,
      );

      await expect(
        service.changeLeadStage({
          leadId: lead._id,
          newStage: 'contacted',
          expectedVersion: 0,
          actorPositionId: new Types.ObjectId(),
          actorIdentityId: new Types.ObjectId(),
          expectedOrganizationId: organizationId,
          correlationId: 'test-correlation-id',
        }),
      ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
    });

    it('лид исчез между атомарным write и re-fetch (крайне редкая гонка с параллельным удалением) — NotFoundException', async () => {
      const organizationId = new Types.ObjectId();
      const lead = makeLead({ organizationId, stage: 'new', version: 0 });
      const service = new CrmService(
        makeMockConnection() as never,
        {} as unknown as MarketplacePublicationRepository,
        {} as unknown as DevelopmentRepository,
        {} as unknown as ContactRepository,
        {
          findByIdForOrganization: jest.fn().mockResolvedValueOnce(lead).mockResolvedValueOnce(null),
          changeStageWithVersionCheck: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
        } as unknown as LeadRepository,
        { append: jest.fn() } as unknown as LeadEventRepository,
        { append: jest.fn() } as unknown as AuditService,
        { findAssignablePosition: jest.fn() } as unknown as OrganizationsService,
      );

      await expect(
        service.changeLeadStage({
          leadId: lead._id,
          newStage: 'contacted',
          expectedVersion: 0,
          actorPositionId: new Types.ObjectId(),
          actorIdentityId: new Types.ObjectId(),
          expectedOrganizationId: organizationId,
          correlationId: 'test-correlation-id',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('D-05B: own-scope сужение (manager меняет только свой лид)', () => {
    it('requiredOwnerPositionId передаётся в findByIdForOrganization — manager видит только свой лид', async () => {
      const organizationId = new Types.ObjectId();
      const managerPositionId = new Types.ObjectId();
      const lead = makeLead({ organizationId, stage: 'new', ownerPositionId: managerPositionId });
      const findByIdForOrganizationSpy = jest.fn().mockResolvedValue(lead);
      const service = new CrmService(
        makeMockConnection() as never,
        {} as unknown as MarketplacePublicationRepository,
        {} as unknown as DevelopmentRepository,
        {} as unknown as ContactRepository,
        {
          findByIdForOrganization: findByIdForOrganizationSpy,
          changeStageWithVersionCheck: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
        } as unknown as LeadRepository,
        { append: jest.fn().mockResolvedValue(undefined) } as unknown as LeadEventRepository,
        { append: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService,
        { findAssignablePosition: jest.fn() } as unknown as OrganizationsService,
      );

      await service.changeLeadStage({
        leadId: lead._id,
        newStage: 'contacted',
        expectedVersion: lead.version,
        actorPositionId: managerPositionId,
        actorIdentityId: new Types.ObjectId(),
        expectedOrganizationId: organizationId,
        requiredOwnerPositionId: managerPositionId,
        correlationId: 'test-correlation-id',
      });

      expect(findByIdForOrganizationSpy).toHaveBeenCalledWith(lead._id, organizationId, managerPositionId);
    });

    it('чужой лид (requiredOwnerPositionId задан, но repository не находит по этому фильтру) → NotFoundException', async () => {
      const organizationId = new Types.ObjectId();
      const managerPositionId = new Types.ObjectId();
      const service = new CrmService(
        makeMockConnection() as never,
        {} as unknown as MarketplacePublicationRepository,
        {} as unknown as DevelopmentRepository,
        {} as unknown as ContactRepository,
        { findByIdForOrganization: jest.fn().mockResolvedValue(null) } as unknown as LeadRepository,
        { append: jest.fn() } as unknown as LeadEventRepository,
        { append: jest.fn() } as unknown as AuditService,
        { findAssignablePosition: jest.fn() } as unknown as OrganizationsService,
      );

      await expect(
        service.changeLeadStage({
          leadId: new Types.ObjectId(),
          newStage: 'contacted',
          expectedVersion: 0,
          actorPositionId: managerPositionId,
          actorIdentityId: new Types.ObjectId(),
          expectedOrganizationId: organizationId,
          requiredOwnerPositionId: managerPositionId,
          correlationId: 'test-correlation-id',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

describe('CrmService — read leads', () => {
  it('возвращает tenant-scoped лиды с контактами и передаёт owner/stage фильтры в repository', async () => {
    const organizationId = new Types.ObjectId();
    const ownerPositionId = new Types.ObjectId();
    const contactId = new Types.ObjectId();
    const leadId = new Types.ObjectId();
    const listForOrganization = jest.fn().mockResolvedValue([
      {
        _id: leadId,
        organizationId,
        contactId,
        ownerPositionId,
        stage: 'new',
        source: { route: '/developments/test' },
        createdAt: new Date('2026-08-26T10:00:00Z'),
      },
    ]);
    const findByIdsForOrganization = jest.fn().mockResolvedValue([
      { _id: contactId, name: 'Иван', phone: '+995555000000', email: 'ivan@example.test' },
    ]);

    const service = new CrmService(
      makeMockConnection() as never,
      {} as unknown as MarketplacePublicationRepository,
      {} as unknown as DevelopmentRepository,
      { findByIdsForOrganization } as unknown as ContactRepository,
      { listForOrganization } as unknown as LeadRepository,
      {} as unknown as LeadEventRepository,
      {} as unknown as AuditService,
      {
        findAssignablePosition: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), status: 'vacant' }),
      } as unknown as OrganizationsService,
    );

    const readService = service as unknown as {
      listLeads(params: {
        organizationId: Types.ObjectId;
        ownerPositionId?: Types.ObjectId;
        stage?: 'new' | 'contacted' | 'qualified' | 'converted' | 'lost';
        limit: number;
      }): Promise<unknown>;
    };

    await expect(
      readService.listLeads({ organizationId, ownerPositionId, stage: 'new', limit: 20 }),
    ).resolves.toEqual({
      items: [
        {
          id: leadId.toString(),
          organizationId: organizationId.toString(),
          ownerPositionId: ownerPositionId.toString(),
          stage: 'new',
          version: 0,
          source: { route: '/developments/test' },
          createdAt: '2026-08-26T10:00:00.000Z',
          contact: { id: contactId.toString(), name: 'Иван', phone: '+995555000000', email: 'ivan@example.test' },
        },
      ],
    });

    expect(listForOrganization).toHaveBeenCalledWith(organizationId, {
      ownerPositionId,
      stage: 'new',
      limit: 20,
    });
    expect(findByIdsForOrganization).toHaveBeenCalledWith(organizationId, [contactId]);
  });

  it('возвращает карточку только из своей организации и не раскрывает чужой lead', async () => {
    const organizationId = new Types.ObjectId();
    const contactId = new Types.ObjectId();
    const leadId = new Types.ObjectId();
    const lead = {
      _id: leadId,
      organizationId,
      contactId,
      stage: 'qualified',
      source: { route: '/developments/test' },
      createdAt: new Date('2026-08-26T10:00:00Z'),
    };
    const findByIdForOrganization = jest.fn().mockResolvedValue(lead);
    const findByIdForOrganizationContact = jest
      .fn()
      .mockResolvedValue({ _id: contactId, name: 'Анна', phone: '+995555111111' });

    const service = new CrmService(
      makeMockConnection() as never,
      {} as unknown as MarketplacePublicationRepository,
      {} as unknown as DevelopmentRepository,
      { findByIdForOrganization: findByIdForOrganizationContact } as unknown as ContactRepository,
      { findByIdForOrganization } as unknown as LeadRepository,
      {} as unknown as LeadEventRepository,
      {} as unknown as AuditService,
      {
        findAssignablePosition: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), status: 'vacant' }),
      } as unknown as OrganizationsService,
    );
    const readService = service as unknown as {
      getLead(params: { leadId: Types.ObjectId; organizationId: Types.ObjectId }): Promise<unknown>;
    };

    await expect(readService.getLead({ leadId, organizationId })).resolves.toEqual({
      id: leadId.toString(),
      organizationId: organizationId.toString(),
      ownerPositionId: null,
      stage: 'qualified',
      version: 0,
      source: { route: '/developments/test' },
      createdAt: '2026-08-26T10:00:00.000Z',
      contact: { id: contactId.toString(), name: 'Анна', phone: '+995555111111', email: undefined },
    });
    expect(findByIdForOrganization).toHaveBeenCalledWith(leadId, organizationId, undefined);
    expect(findByIdForOrganizationContact).toHaveBeenCalledWith(contactId, organizationId);

    findByIdForOrganization.mockResolvedValueOnce(null);
    await expect(readService.getLead({ leadId, organizationId })).rejects.toBeInstanceOf(NotFoundException);
    expect(findByIdForOrganizationContact).toHaveBeenCalledTimes(1);
  });
});

import { NotFoundException } from '@nestjs/common';
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

function makeLead(overrides: Partial<{ organizationId: Types.ObjectId; stage: string; ownerPositionId: Types.ObjectId }> = {}) {
  return {
    _id: new Types.ObjectId(),
    organizationId: overrides.organizationId ?? new Types.ObjectId(),
    contactId: new Types.ObjectId(),
    ownerPositionId: overrides.ownerPositionId,
    stage: overrides.stage ?? 'new',
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
        changeStage: changeStageSpy,
      } as unknown as LeadRepository,
      { append: appendEventSpy } as unknown as LeadEventRepository,
      { append: auditAppendSpy } as unknown as AuditService,
    );

    const result = await service.changeLeadStage({
      leadId: lead._id,
      newStage: 'qualified',
      actorPositionId,
      actorIdentityId,
      expectedOrganizationId: organizationId,
      correlationId: 'test-correlation-id',
    });

    expect(changeStageSpy).toHaveBeenCalledWith(lead._id, organizationId, 'qualified', expect.anything());
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
    );

    await expect(
      service.changeLeadStage({
        leadId: new Types.ObjectId(),
        newStage: 'lost',
        actorPositionId: new Types.ObjectId(),
        actorIdentityId: new Types.ObjectId(),
        expectedOrganizationId: new Types.ObjectId(),
        correlationId: 'test-correlation-id',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

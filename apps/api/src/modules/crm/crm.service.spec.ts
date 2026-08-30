import { ConflictException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { CrmService } from './crm.service';
import { AppException } from '../../shared/errors/app-exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import type { MarketplacePublicationRepository } from '@baza/publication';
import type { DevelopmentRepository } from '@baza/development';
import type { ListingRepository, PropertyAssetRepository } from '@baza/property-assets';
import type { ContactRepository } from './repository/contact.repository';
import type { LeadRepository } from './repository/lead.repository';
import type { LeadEventRepository } from './repository/lead-event.repository';
import type { AuditService } from '../audit/audit.service';
import type { OrganizationsService } from '../organizations/organizations.service';
import type { PublicRevealIdempotencyService } from '../../shared/idempotency/public-reveal-idempotency.service';

import type { TaskRepository } from './repository/task.repository';
import type { DealRepository } from './repository/deal.repository';
import type { DealEventRepository } from './repository/deal-event.repository';

function makeMockConnection() {
  return {
    startSession: jest.fn().mockResolvedValue({
      withTransaction: async (work: () => Promise<unknown>) => work(),
      endSession: jest.fn().mockResolvedValue(undefined),
    }),
  };
}

function createTestCrmService(overrides: {
  connection?: unknown;
  publicationRepository?: unknown;
  developmentRepository?: unknown;
  listingRepository?: unknown;
  propertyAssetRepository?: unknown;
  contactRepository?: unknown;
  leadRepository?: unknown;
  leadEventRepository?: unknown;
  auditService?: unknown;
  organizationsService?: unknown;
  publicRevealIdempotencyService?: unknown;
  taskRepository?: unknown;
  dealRepository?: unknown;
  dealEventRepository?: unknown;
} = {}) {
  return new CrmService(
    (overrides.connection ?? makeMockConnection()) as never,
    (overrides.publicationRepository ?? {}) as unknown as MarketplacePublicationRepository,
    (overrides.developmentRepository ?? {}) as unknown as DevelopmentRepository,
    (overrides.listingRepository ?? {}) as unknown as ListingRepository,
    (overrides.propertyAssetRepository ?? {}) as unknown as PropertyAssetRepository,
    (overrides.contactRepository ?? {}) as unknown as ContactRepository,
    (overrides.leadRepository ?? {}) as unknown as LeadRepository,
    (overrides.leadEventRepository ?? {}) as unknown as LeadEventRepository,
    (overrides.auditService ?? {}) as unknown as AuditService,
    (overrides.organizationsService ?? {
      findAssignablePosition: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), status: 'vacant' }),
    }) as unknown as OrganizationsService,
    (overrides.publicRevealIdempotencyService ?? {
      checkReplay: jest.fn().mockResolvedValue(null),
      record: jest.fn().mockResolvedValue(undefined),
    }) as unknown as PublicRevealIdempotencyService,
    (overrides.taskRepository ?? {}) as unknown as TaskRepository,
    (overrides.dealRepository ?? {}) as unknown as DealRepository,
    (overrides.dealEventRepository ?? {}) as unknown as DealEventRepository,
  );
}

function makeDevelopment(overrides: Partial<{ organizationId: Types.ObjectId }> = {}) {
  return {
    _id: new Types.ObjectId(),
    organizationId: overrides.organizationId ?? new Types.ObjectId(),
    contact: { phone: '+79991234567', whatsapp: '+79991234567', telegram: undefined },
  };
}

function makePublication(overrides: Partial<{ sourceType: string; sourceId: Types.ObjectId; slug: string }> = {}) {
  return {
    _id: new Types.ObjectId(),
    sourceType: overrides.sourceType ?? 'development',
    sourceId: overrides.sourceId ?? new Types.ObjectId(),
    slug: overrides.slug ?? 'test-slug',
  };
}

function makeListing(overrides: Partial<{ propertyAssetId: Types.ObjectId; publisherScope: { type: string; organizationId: Types.ObjectId } }> = {}) {
  return {
    _id: new Types.ObjectId(),
    propertyAssetId: overrides.propertyAssetId ?? new Types.ObjectId(),
    publisherScope: overrides.publisherScope ?? { type: 'organization', organizationId: new Types.ObjectId() },
    status: 'active',
  };
}

function makePropertyAsset(overrides: Partial<{ publisherScope: { type: string; organizationId?: Types.ObjectId }; representativePhone: string }> = {}) {
  return {
    _id: new Types.ObjectId(),
    publisherScope: overrides.publisherScope ?? { type: 'organization', organizationId: new Types.ObjectId() },
    representativePhone: overrides.representativePhone ?? '+995555000111',
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

    const service = createTestCrmService({
      publicationRepository: { findBySlug: findBySlugSpy },
      developmentRepository: { findById: findByIdSpy },
      contactRepository: { findByPhone: findByPhoneSpy, create: createContactSpy },
      leadRepository: { create: createLeadSpy },
      leadEventRepository: { append: appendEventSpy },
      auditService: { append: auditAppendSpy },
    });

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

    const service = createTestCrmService({
      publicationRepository: { findBySlug: jest.fn().mockResolvedValue(publication) },
      developmentRepository: { findById: jest.fn().mockResolvedValue(development) },
      contactRepository: { findByPhone: findByPhoneSpy, create: createContactSpy },
      leadRepository: { create: createLeadSpy },
      leadEventRepository: { append: jest.fn().mockResolvedValue(undefined) },
      auditService: { append: jest.fn().mockResolvedValue(undefined) },
    });

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

    const service = createTestCrmService({
      publicationRepository: { findBySlug: jest.fn().mockResolvedValue(publication) },
      developmentRepository: { findById: jest.fn().mockResolvedValue(development) },
      contactRepository: { findByPhone: jest.fn(), create: createContactSpy },
      leadRepository: { create: createLeadSpy },
      leadEventRepository: { append: jest.fn() },
      auditService: { append: jest.fn() },
    });

    await expect(
      service.revealContact({ slug: 'zhk-solnechnyy', correlationId: 'test-correlation-id' }),
    ).rejects.toMatchObject(new AppException(ErrorCode.VALIDATION_FAILED, 'requesterPhone is required to create a lead'));

    expect(createContactSpy).not.toHaveBeenCalled();
    expect(createLeadSpy).not.toHaveBeenCalled();
  });

  it('бросает NotFoundException, если publication не найдена по slug', async () => {
    const service = createTestCrmService({
      publicationRepository: { findBySlug: jest.fn().mockResolvedValue(null) },
    });

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
    const service = createTestCrmService({
      publicationRepository: { findBySlug: jest.fn().mockResolvedValue(publication) },
    });

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
    const service = createTestCrmService({
      publicationRepository: { findBySlug: jest.fn().mockResolvedValue(publication) },
      developmentRepository: { findById: jest.fn().mockResolvedValue(null) },
    });

    await expect(
      service.revealContact({
        slug: 'zhk-solnechnyy',
        requesterPhone: '+79997654321',
        correlationId: 'test-correlation-id',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('CrmService.revealListingContact — Idempotency-Key (опциональный гостевой механизм)', () => {
  function seedPublishedListingMocks() {
    const organizationId = new Types.ObjectId();
    const propertyAsset = makePropertyAsset({
      publisherScope: { type: 'organization', organizationId },
      representativePhone: '+995555123456',
    });
    const listing = makeListing({ propertyAssetId: propertyAsset._id });
    const publication = makePublication({ sourceType: 'listing', sourceId: listing._id, slug: 'batumi-flat-85k' });
    return { organizationId, propertyAsset, listing, publication };
  }

  it('без заголовка Idempotency-Key — полностью обратно совместимо: не вызывает checkReplay/record', async () => {
    const { propertyAsset, listing, publication } = seedPublishedListingMocks();
    const checkReplaySpy = jest.fn();
    const recordSpy = jest.fn();
    const createLeadSpy = jest.fn().mockResolvedValue({ _id: new Types.ObjectId() });

    const service = createTestCrmService({
      publicationRepository: { findBySlug: jest.fn().mockResolvedValue(publication) },
      listingRepository: { findById: jest.fn().mockResolvedValue(listing) },
      propertyAssetRepository: { findById: jest.fn().mockResolvedValue(propertyAsset) },
      contactRepository: { findByPhone: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }) },
      leadRepository: { create: createLeadSpy },
      leadEventRepository: { append: jest.fn().mockResolvedValue(undefined) },
      auditService: { append: jest.fn().mockResolvedValue(undefined) },
      publicRevealIdempotencyService: { checkReplay: checkReplaySpy, record: recordSpy },
    });

    await service.revealListingContact({
      slug: 'batumi-flat-85k',
      requesterPhone: '+995599887766',
      correlationId: 'test-correlation',
    });

    expect(checkReplaySpy).not.toHaveBeenCalled();
    expect(recordSpy).not.toHaveBeenCalled();
    expect(createLeadSpy).toHaveBeenCalledTimes(1);
  });

  it('с заголовком, найдена совпадающая запись — возвращает сохранённый ответ, НЕ создаёт новый Lead/audit', async () => {
    const { propertyAsset, listing, publication } = seedPublishedListingMocks();
    const storedLeadId = new Types.ObjectId();
    const checkReplaySpy = jest.fn().mockResolvedValue({
      responseStatus: 200,
      responseBody: { phone: '+995555123456', leadId: storedLeadId.toString() },
    });
    const createLeadSpy = jest.fn();
    const auditAppendSpy = jest.fn();

    const service = createTestCrmService({
      publicationRepository: { findBySlug: jest.fn().mockResolvedValue(publication) },
      listingRepository: { findById: jest.fn().mockResolvedValue(listing) },
      propertyAssetRepository: { findById: jest.fn().mockResolvedValue(propertyAsset) },
      leadRepository: { create: createLeadSpy },
      auditService: { append: auditAppendSpy },
      publicRevealIdempotencyService: { checkReplay: checkReplaySpy, record: jest.fn() },
    });

    const result = await service.revealListingContact({
      slug: 'batumi-flat-85k',
      requesterPhone: '+995599887766',
      correlationId: 'test-correlation',
      idempotencyKey: 'client-key-1',
    });

    expect(result).toEqual({ phone: '+995555123456', whatsapp: undefined, telegram: undefined, leadId: storedLeadId });
    expect(createLeadSpy).not.toHaveBeenCalled();
    expect(auditAppendSpy).not.toHaveBeenCalled();
  });

  it('с заголовком, записи нет — создаёт Lead, записывает idempotency-запись ВНУТРИ транзакции', async () => {
    const { propertyAsset, listing, publication } = seedPublishedListingMocks();
    const leadId = new Types.ObjectId();
    const checkReplaySpy = jest.fn().mockResolvedValue(null);
    const recordSpy = jest.fn().mockResolvedValue(undefined);
    const createLeadSpy = jest.fn().mockResolvedValue({ _id: leadId });

    const service = createTestCrmService({
      publicationRepository: { findBySlug: jest.fn().mockResolvedValue(publication) },
      listingRepository: { findById: jest.fn().mockResolvedValue(listing) },
      propertyAssetRepository: { findById: jest.fn().mockResolvedValue(propertyAsset) },
      contactRepository: { findByPhone: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }) },
      leadRepository: { create: createLeadSpy },
      leadEventRepository: { append: jest.fn().mockResolvedValue(undefined) },
      auditService: { append: jest.fn().mockResolvedValue(undefined) },
      publicRevealIdempotencyService: { checkReplay: checkReplaySpy, record: recordSpy },
    });

    const result = await service.revealListingContact({
      slug: 'batumi-flat-85k',
      requesterPhone: '+995599887766',
      correlationId: 'test-correlation',
      idempotencyKey: 'client-key-2',
    });

    expect(result.leadId).toEqual(leadId);
    expect(recordSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        publicationSlug: 'batumi-flat-85k',
        idempotencyKey: 'client-key-2',
        responseStatus: 200,
        responseBody: expect.objectContaining({ phone: '+995555123456', leadId: leadId.toString() }),
        leadId,
      }),
      expect.anything(),
    );
  });

  it('гонка: duplicate key при record() — повторный checkReplay находит запись победителя, возвращает её как replay', async () => {
    const { propertyAsset, listing, publication } = seedPublishedListingMocks();
    const winnerLeadId = new Types.ObjectId();
    const duplicateKeyError = Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });
    const checkReplaySpy = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        responseStatus: 200,
        responseBody: { phone: '+995555123456', leadId: winnerLeadId.toString() },
      });
    const recordSpy = jest.fn().mockRejectedValue(duplicateKeyError);
    const createLeadSpy = jest.fn().mockResolvedValue({ _id: new Types.ObjectId() });

    const service = createTestCrmService({
      publicationRepository: { findBySlug: jest.fn().mockResolvedValue(publication) },
      listingRepository: { findById: jest.fn().mockResolvedValue(listing) },
      propertyAssetRepository: { findById: jest.fn().mockResolvedValue(propertyAsset) },
      contactRepository: { findByPhone: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }) },
      leadRepository: { create: createLeadSpy },
      leadEventRepository: { append: jest.fn().mockResolvedValue(undefined) },
      auditService: { append: jest.fn().mockResolvedValue(undefined) },
      publicRevealIdempotencyService: { checkReplay: checkReplaySpy, record: recordSpy },
    });

    const result = await service.revealListingContact({
      slug: 'batumi-flat-85k',
      requesterPhone: '+995599887766',
      correlationId: 'test-correlation',
      idempotencyKey: 'race-key',
    });

    expect(result.leadId).toEqual(winnerLeadId);
    expect(checkReplaySpy).toHaveBeenCalledTimes(2);
  });

  it('другой requestHash под тем же ключом — пробрасывает IDEMPOTENCY_KEY_CONFLICT (409), не создаёт Lead', async () => {
    const { propertyAsset, listing, publication } = seedPublishedListingMocks();
    const conflictError = new AppException(ErrorCode.IDEMPOTENCY_KEY_CONFLICT, 'conflict');
    const checkReplaySpy = jest.fn().mockRejectedValue(conflictError);
    const createLeadSpy = jest.fn();

    const service = createTestCrmService({
      publicationRepository: { findBySlug: jest.fn().mockResolvedValue(publication) },
      listingRepository: { findById: jest.fn().mockResolvedValue(listing) },
      propertyAssetRepository: { findById: jest.fn().mockResolvedValue(propertyAsset) },
      leadRepository: { create: createLeadSpy },
      publicRevealIdempotencyService: { checkReplay: checkReplaySpy, record: jest.fn() },
    });

    await expect(
      service.revealListingContact({
        slug: 'batumi-flat-85k',
        requesterPhone: '+995599887766',
        correlationId: 'test-correlation',
        idempotencyKey: 'conflict-key',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.IDEMPOTENCY_KEY_CONFLICT });

    expect(createLeadSpy).not.toHaveBeenCalled();
  });
});

describe('CrmService.revealListingContact (LEAD-001 / Secondary & Rent)', () => {
  it('создаёт Contact+Lead+LeadEvent+audit для опубликованного листинга и возвращает representativePhone', async () => {
    const organizationId = new Types.ObjectId();
    const propertyAsset = makePropertyAsset({
      publisherScope: { type: 'organization', organizationId },
      representativePhone: '+995555123456',
    });
    const listing = makeListing({ propertyAssetId: propertyAsset._id });
    const publication = makePublication({ sourceType: 'listing', sourceId: listing._id, slug: 'batumi-flat-85k' });
    const contactId = new Types.ObjectId();
    const leadId = new Types.ObjectId();

    const findBySlugSpy = jest.fn().mockResolvedValue(publication);
    const findListingByIdSpy = jest.fn().mockResolvedValue(listing);
    const findAssetByIdSpy = jest.fn().mockResolvedValue(propertyAsset);
    const findByPhoneSpy = jest.fn().mockResolvedValue(null);
    const createContactSpy = jest.fn().mockResolvedValue({ _id: contactId });
    const createLeadSpy = jest.fn().mockResolvedValue({ _id: leadId });
    const appendEventSpy = jest.fn().mockResolvedValue(undefined);
    const auditAppendSpy = jest.fn().mockResolvedValue(undefined);

    const service = createTestCrmService({
      publicationRepository: { findBySlug: findBySlugSpy },
      listingRepository: { findById: findListingByIdSpy },
      propertyAssetRepository: { findById: findAssetByIdSpy },
      contactRepository: { findByPhone: findByPhoneSpy, create: createContactSpy },
      leadRepository: { create: createLeadSpy },
      leadEventRepository: { append: appendEventSpy },
      auditService: { append: auditAppendSpy },
    });

    const result = await service.revealListingContact({
      slug: 'batumi-flat-85k',
      requesterName: 'Анна',
      requesterPhone: '+995599887766',
      utm: { source: 'google', campaign: 'summer' },
      referrer: 'https://google.com',
      correlationId: 'test-correlation-listing',
    });

    expect(findBySlugSpy).toHaveBeenCalledWith('batumi-flat-85k');
    expect(findListingByIdSpy).toHaveBeenCalledWith(listing._id);
    expect(findAssetByIdSpy).toHaveBeenCalledWith(propertyAsset._id);

    expect(createContactSpy).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId, phone: '+995599887766', name: 'Анна', roles: ['buyer'] }),
      expect.anything(),
    );
    expect(createLeadSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        contactId,
        source: expect.objectContaining({
          route: '/listings/batumi-flat-85k',
          publicationId: publication._id,
          utm: { source: 'google', campaign: 'summer' },
          referrer: 'https://google.com',
        }),
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
    expect(result).toEqual({ phone: '+995555123456', leadId });
    // Proves that no internal fields (organizationId, publisherScope, etc.) are leaked
    expect((result as Record<string, unknown>).organizationId).toBeUndefined();
    expect((result as Record<string, unknown>).publisherScope).toBeUndefined();
  });

  it('переиспользует существующий Contact внутри организации при повторном обращении, но создаёт новый Lead', async () => {
    const organizationId = new Types.ObjectId();
    const propertyAsset = makePropertyAsset({
      publisherScope: { type: 'organization', organizationId },
      representativePhone: '+995555123456',
    });
    const listing = makeListing({ propertyAssetId: propertyAsset._id });
    const publication = makePublication({ sourceType: 'listing', sourceId: listing._id, slug: 'batumi-flat-85k' });
    const existingContact = { _id: new Types.ObjectId(), organizationId, phone: '+995599887766' };

    const findByPhoneSpy = jest.fn().mockResolvedValue(existingContact);
    const createContactSpy = jest.fn();
    const createLeadSpy = jest.fn().mockResolvedValue({ _id: new Types.ObjectId() });

    const service = createTestCrmService({
      publicationRepository: { findBySlug: jest.fn().mockResolvedValue(publication) },
      listingRepository: { findById: jest.fn().mockResolvedValue(listing) },
      propertyAssetRepository: { findById: jest.fn().mockResolvedValue(propertyAsset) },
      contactRepository: { findByPhone: findByPhoneSpy, create: createContactSpy },
      leadRepository: { create: createLeadSpy },
      leadEventRepository: { append: jest.fn().mockResolvedValue(undefined) },
      auditService: { append: jest.fn().mockResolvedValue(undefined) },
    });

    await service.revealListingContact({
      slug: 'batumi-flat-85k',
      requesterPhone: '+995599887766',
      correlationId: 'test-correlation-listing',
    });

    expect(createContactSpy).not.toHaveBeenCalled();
    expect(createLeadSpy).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: existingContact._id, organizationId }),
      expect.anything(),
    );
  });

  it('отклоняет запрос без requesterPhone как VALIDATION_FAILED', async () => {
    const propertyAsset = makePropertyAsset();
    const listing = makeListing({ propertyAssetId: propertyAsset._id });
    const publication = makePublication({ sourceType: 'listing', sourceId: listing._id });

    const service = createTestCrmService({
      publicationRepository: { findBySlug: jest.fn().mockResolvedValue(publication) },
      listingRepository: { findById: jest.fn().mockResolvedValue(listing) },
      propertyAssetRepository: { findById: jest.fn().mockResolvedValue(propertyAsset) },
    });

    await expect(
      service.revealListingContact({ slug: 'batumi-flat-85k', correlationId: 'test-correlation' }),
    ).rejects.toMatchObject(new AppException(ErrorCode.VALIDATION_FAILED, 'requesterPhone is required to create a lead'));
  });

  it('бросает NotFoundException, если slug не найден', async () => {
    const service = createTestCrmService({
      publicationRepository: { findBySlug: jest.fn().mockResolvedValue(null) },
    });

    await expect(
      service.revealListingContact({ slug: 'non-existent', requesterPhone: '+995555123456', correlationId: 'test' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('бросает NotFoundException, если publication.sourceType === development (не listing)', async () => {
    const publication = makePublication({ sourceType: 'development' });
    const service = createTestCrmService({
      publicationRepository: { findBySlug: jest.fn().mockResolvedValue(publication) },
    });

    await expect(
      service.revealListingContact({ slug: 'zhk-solnechnyy', requesterPhone: '+995555123456', correlationId: 'test' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('бросает NotFoundException, если canonical Listing не найден (рассинхронизация)', async () => {
    const publication = makePublication({ sourceType: 'listing' });
    const service = createTestCrmService({
      publicationRepository: { findBySlug: jest.fn().mockResolvedValue(publication) },
      listingRepository: { findById: jest.fn().mockResolvedValue(null) },
    });

    await expect(
      service.revealListingContact({ slug: 'batumi-flat-85k', requesterPhone: '+995555123456', correlationId: 'test' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('бросает NotFoundException, если canonical PropertyAsset не найден (рассинхронизация)', async () => {
    const listing = makeListing();
    const publication = makePublication({ sourceType: 'listing', sourceId: listing._id });
    const service = createTestCrmService({
      publicationRepository: { findBySlug: jest.fn().mockResolvedValue(publication) },
      listingRepository: { findById: jest.fn().mockResolvedValue(listing) },
      propertyAssetRepository: { findById: jest.fn().mockResolvedValue(null) },
    });

    await expect(
      service.revealListingContact({ slug: 'batumi-flat-85k', requesterPhone: '+995555123456', correlationId: 'test' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('бросает NotFoundException, если publisherScope PropertyAsset не organization', async () => {
    const propertyAsset = makePropertyAsset({ publisherScope: { type: 'marketplace_account' } });
    const listing = makeListing({ propertyAssetId: propertyAsset._id });
    const publication = makePublication({ sourceType: 'listing', sourceId: listing._id });
    const service = createTestCrmService({
      publicationRepository: { findBySlug: jest.fn().mockResolvedValue(publication) },
      listingRepository: { findById: jest.fn().mockResolvedValue(listing) },
      propertyAssetRepository: { findById: jest.fn().mockResolvedValue(propertyAsset) },
    });

    await expect(
      service.revealListingContact({ slug: 'batumi-flat-85k', requesterPhone: '+995555123456', correlationId: 'test' }),
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

    const service = createTestCrmService({
      leadRepository: {
        findByIdForOrganization: jest.fn().mockResolvedValue(lead),
        assignOwner: assignOwnerSpy,
      },
      leadEventRepository: { append: appendEventSpy },
      auditService: { append: auditAppendSpy },
    });

    const result = await service.assignLead({
      leadId: lead._id,
      assigneePositionId,
      actorPositionId,
      actorIdentityId,
      expectedOrganizationId: organizationId,
      correlationId: 'test-correlation-id',
    });

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
    const service = createTestCrmService({
      leadRepository: { findByIdForOrganization: jest.fn().mockResolvedValue(null), assignOwner: assignOwnerSpy },
    });

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

    const service = createTestCrmService({
      leadRepository: { findByIdForOrganization: jest.fn().mockResolvedValue(lead), assignOwner: assignOwnerSpy },
      organizationsService: { findAssignablePosition: findAssignablePositionSpy },
    });

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

    const service = createTestCrmService({
      leadRepository: { findByIdForOrganization: jest.fn().mockResolvedValue(lead), assignOwner: assignOwnerSpy },
      organizationsService: {
        findAssignablePosition: jest.fn().mockRejectedValue(new ConflictException('Position is closed and cannot be assigned')),
      },
    });

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

    const service = createTestCrmService({
      leadRepository: {
        findByIdForOrganization: jest.fn().mockResolvedValue(lead),
        changeStageWithVersionCheck: changeStageSpy,
      },
      leadEventRepository: { append: appendEventSpy },
      auditService: { append: auditAppendSpy },
    });

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
    const service = createTestCrmService({
      leadRepository: { findByIdForOrganization: jest.fn().mockResolvedValue(null) },
    });

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
    return createTestCrmService({
      leadRepository: {
        findByIdForOrganization: jest.fn().mockResolvedValue(lead),
        changeStageWithVersionCheck: changeStageSpy,
      },
      leadEventRepository: { append: jest.fn().mockResolvedValue(undefined) },
      auditService: { append: jest.fn().mockResolvedValue(undefined) },
    });
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
    it('устаревшая version отклоняется как ConflictException до проверки перехода по старому snapshot', async () => {
      const organizationId = new Types.ObjectId();
      const lead = makeLead({ organizationId, stage: 'lost', version: 1 });
      const changeStageSpy = jest.fn();
      const service = makeChangeStageService(lead, changeStageSpy);

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
      ).rejects.toBeInstanceOf(ConflictException);
      expect(changeStageSpy).not.toHaveBeenCalled();
    });

    it('version устарела (current.version !== expectedVersion) — ConflictException 409, даже если newStage недостижим из НОВОГО current.stage', async () => {
      const organizationId = new Types.ObjectId();
      const lead = makeLead({ organizationId, stage: 'new', version: 0 });
      const currentAfterRace = { ...lead, stage: 'converted', version: 1 };
      const service = createTestCrmService({
        leadRepository: {
          findByIdForOrganization: jest
            .fn()
            .mockResolvedValueOnce(lead)
            .mockResolvedValueOnce(currentAfterRace),
          changeStageWithVersionCheck: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
        },
        leadEventRepository: { append: jest.fn() },
        auditService: { append: jest.fn() },
      });

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
      const lead = makeLead({ organizationId, stage: 'new', version: 0 });
      const service = createTestCrmService({
        leadRepository: {
          findByIdForOrganization: jest.fn().mockResolvedValue(lead),
          changeStageWithVersionCheck: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
        },
        leadEventRepository: { append: jest.fn() },
        auditService: { append: jest.fn() },
      });

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
      const service = createTestCrmService({
        leadRepository: {
          findByIdForOrganization: jest.fn().mockResolvedValueOnce(lead).mockResolvedValueOnce(null),
          changeStageWithVersionCheck: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
        },
        leadEventRepository: { append: jest.fn() },
        auditService: { append: jest.fn() },
      });

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
      const service = createTestCrmService({
        leadRepository: {
          findByIdForOrganization: findByIdForOrganizationSpy,
          changeStageWithVersionCheck: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
        },
        leadEventRepository: { append: jest.fn().mockResolvedValue(undefined) },
        auditService: { append: jest.fn().mockResolvedValue(undefined) },
      });

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
      const service = createTestCrmService({
        leadRepository: { findByIdForOrganization: jest.fn().mockResolvedValue(null) },
      });

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

    const service = createTestCrmService({
      contactRepository: { findByIdsForOrganization },
      leadRepository: { listForOrganization },
    });

    const readService = service as unknown as {
      listLeads(params: {
        organizationId: Types.ObjectId;
        ownerPositionId?: Types.ObjectId;
        stage?: 'new' | 'contacted' | 'qualified' | 'converted' | 'lost';
        cursor?: Types.ObjectId;
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
          stalled: false,
          contact: { id: contactId.toString(), name: 'Иван', phone: '+995555000000', email: 'ivan@example.test' },
        },
      ],
      nextCursor: null,
    });

    expect(listForOrganization).toHaveBeenCalledWith(organizationId, {
      ownerPositionId,
      stage: 'new',
      stalled: undefined,
      cursor: undefined,
      // limit+1: repository запрашивается на одну запись больше params.limit
      // для однозначного hasMore/nextCursor без отдельного count().
      limit: 21,
    });
    expect(findByIdsForOrganization).toHaveBeenCalledWith(organizationId, [contactId]);
  });

  it('limit+1: repository возвращает limit+1 строк → nextCursor указывает на последнюю ВОЗВРАЩЁННУЮ (не лишнюю) запись', async () => {
    const organizationId = new Types.ObjectId();
    const contactId = new Types.ObjectId();
    const leadIds = [new Types.ObjectId(), new Types.ObjectId()];
    const rows = leadIds.map((id, index) => ({
      _id: id,
      organizationId,
      contactId,
      ownerPositionId: undefined,
      stage: 'new' as const,
      source: { route: '/developments/test' },
      createdAt: new Date(`2026-08-2${6 - index}T10:00:00Z`),
    }));
    const listForOrganization = jest.fn().mockResolvedValue(rows);
    const findByIdsForOrganization = jest.fn().mockResolvedValue([{ _id: contactId, name: 'Иван', phone: '+995555000000' }]);

    const service = createTestCrmService({
      contactRepository: { findByIdsForOrganization },
      leadRepository: { listForOrganization },
    });

    const readService = service as unknown as {
      listLeads(params: { organizationId: Types.ObjectId; limit: number }): Promise<{ items: unknown[]; nextCursor: string | null }>;
    };

    const result = await readService.listLeads({ organizationId, limit: 1 });

    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBe(leadIds[0]!.toString());
  });

  it('cursor из controller пробрасывается repository как есть', async () => {
    const organizationId = new Types.ObjectId();
    const cursor = new Types.ObjectId();
    const listForOrganization = jest.fn().mockResolvedValue([]);
    const service = createTestCrmService({
      contactRepository: { findByIdsForOrganization: jest.fn().mockResolvedValue([]) },
      leadRepository: { listForOrganization },
    });

    const readService = service as unknown as {
      listLeads(params: { organizationId: Types.ObjectId; cursor?: Types.ObjectId; limit: number }): Promise<unknown>;
    };

    await readService.listLeads({ organizationId, cursor, limit: 20 });

    expect(listForOrganization).toHaveBeenCalledWith(organizationId, {
      ownerPositionId: undefined,
      stage: undefined,
      stalled: undefined,
      cursor,
      limit: 21,
    });
  });

  it('возвращает отдельный лид с контактом', async () => {
    const organizationId = new Types.ObjectId();
    const contactId = new Types.ObjectId();
    const leadId = new Types.ObjectId();
    const lead = {
      _id: leadId,
      organizationId,
      contactId,
      ownerPositionId: null,
      stage: 'new',
      source: { route: '/developments/test' },
      createdAt: new Date('2026-08-26T10:00:00Z'),
    };
    const contact = { _id: contactId, name: 'Иван', phone: '+995555000000', email: 'ivan@example.test' };

    const service = createTestCrmService({
      contactRepository: { findByIdForOrganization: jest.fn().mockResolvedValue(contact) },
      leadRepository: { findByIdForOrganization: jest.fn().mockResolvedValue(lead) },
      taskRepository: { countOpenForLead: jest.fn().mockResolvedValue(1) },
    });

    const readService = service as unknown as {
      getLead(params: {
        leadId: Types.ObjectId;
        organizationId: Types.ObjectId;
        ownerPositionId?: Types.ObjectId;
      }): Promise<unknown>;
    };

    await expect(readService.getLead({ leadId, organizationId })).resolves.toEqual({
      id: leadId.toString(),
      organizationId: organizationId.toString(),
      ownerPositionId: null,
      stage: 'new',
      version: 0,
      source: { route: '/developments/test' },
      createdAt: '2026-08-26T10:00:00.000Z',
      stalled: false,
      contact: { id: contactId.toString(), name: 'Иван', phone: '+995555000000', email: 'ivan@example.test' },
    });
  });

  it('бросает NotFoundException при чтении несуществующего лида', async () => {
    const service = createTestCrmService({
      leadRepository: { findByIdForOrganization: jest.fn().mockResolvedValue(null) },
    });

    const readService = service as unknown as {
      getLead(params: {
        leadId: Types.ObjectId;
        organizationId: Types.ObjectId;
        ownerPositionId?: Types.ObjectId;
      }): Promise<unknown>;
    };

    await expect(
      readService.getLead({ leadId: new Types.ObjectId(), organizationId: new Types.ObjectId() }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('CrmService.listLeadEvents', () => {
  function makeReadEventsService(overrides: {
    leadRepository?: unknown;
    leadEventRepository?: unknown;
  }) {
    const service = createTestCrmService(overrides);
    return service as unknown as {
      listLeadEvents(params: {
        leadId: Types.ObjectId;
        organizationId: Types.ObjectId;
        ownerPositionId?: Types.ObjectId;
        cursor?: Types.ObjectId;
        limit: number;
      }): Promise<{ items: unknown[]; nextCursor: string | null }>;
    };
  }

  it('проверяет tenant/owner scope ДО чтения lead_events (findByIdForOrganization вызывается первым)', async () => {
    const organizationId = new Types.ObjectId();
    const leadId = new Types.ObjectId();
    const lead = { _id: leadId, organizationId };
    const findByIdForOrganization = jest.fn().mockResolvedValue(lead);
    const listForLead = jest.fn().mockResolvedValue([]);

    const service = makeReadEventsService({
      leadRepository: { findByIdForOrganization },
      leadEventRepository: { listForLead },
    });

    await service.listLeadEvents({ leadId, organizationId, limit: 20 });

    expect(findByIdForOrganization).toHaveBeenCalledWith(leadId, organizationId, undefined);
    expect(listForLead).toHaveBeenCalledWith(leadId, organizationId, { cursor: undefined, limit: 21 });
  });

  it('чужой (другая организация) лид → NotFoundException, lead_events НЕ читается', async () => {
    const listForLead = jest.fn();
    const service = makeReadEventsService({
      leadRepository: { findByIdForOrganization: jest.fn().mockResolvedValue(null) },
      leadEventRepository: { listForLead },
    });

    await expect(
      service.listLeadEvents({ leadId: new Types.ObjectId(), organizationId: new Types.ObjectId(), limit: 20 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(listForLead).not.toHaveBeenCalled();
  });

  it('несуществующий leadId даёт ТОТ ЖЕ NotFoundException, что чужой лид (non-disclosure)', async () => {
    const service = makeReadEventsService({
      leadRepository: { findByIdForOrganization: jest.fn().mockResolvedValue(null) },
      leadEventRepository: { listForLead: jest.fn() },
    });

    await expect(
      service.listLeadEvents({ leadId: new Types.ObjectId(), organizationId: new Types.ObjectId(), limit: 20 }),
    ).rejects.toThrow('Lead not found');
  });

  it('own-scope: чужой (не свой) лид даёт NotFoundException — findByIdForOrganization применяет ownerPositionId', async () => {
    const ownerPositionId = new Types.ObjectId();
    const findByIdForOrganization = jest.fn().mockResolvedValue(null);
    const service = makeReadEventsService({
      leadRepository: { findByIdForOrganization },
      leadEventRepository: { listForLead: jest.fn() },
    });

    const leadId = new Types.ObjectId();
    const organizationId = new Types.ObjectId();
    await expect(
      service.listLeadEvents({ leadId, organizationId, ownerPositionId, limit: 20 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(findByIdForOrganization).toHaveBeenCalledWith(leadId, organizationId, ownerPositionId);
  });

  it('пустая история — items:[], nextCursor:null, не ошибка', async () => {
    const leadId = new Types.ObjectId();
    const organizationId = new Types.ObjectId();
    const service = makeReadEventsService({
      leadRepository: { findByIdForOrganization: jest.fn().mockResolvedValue({ _id: leadId, organizationId }) },
      leadEventRepository: { listForLead: jest.fn().mockResolvedValue([]) },
    });

    await expect(service.listLeadEvents({ leadId, organizationId, limit: 20 })).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
  });

  it('маппит LeadEventDocument в CrmLeadEventReadModel и вычисляет nextCursor по limit+1 паттерну', async () => {
    const leadId = new Types.ObjectId();
    const organizationId = new Types.ObjectId();
    const positionId = new Types.ObjectId();
    const eventIds = [new Types.ObjectId(), new Types.ObjectId()];
    const rows = [
      {
        _id: eventIds[0],
        leadId,
        stage: 'contacted' as const,
        changedBy: { type: 'position' as const, positionId },
        changedAt: new Date('2026-08-27T09:00:00Z'),
      },
      {
        _id: eventIds[1],
        leadId,
        stage: 'new' as const,
        changedBy: { type: 'system' as const },
        changedAt: new Date('2026-08-26T09:00:00Z'),
      },
    ];
    const service = makeReadEventsService({
      leadRepository: { findByIdForOrganization: jest.fn().mockResolvedValue({ _id: leadId, organizationId }) },
      leadEventRepository: { listForLead: jest.fn().mockResolvedValue(rows) },
    });

    const result = await service.listLeadEvents({ leadId, organizationId, limit: 1 });

    expect(result.items).toEqual([
      {
        id: eventIds[0]!.toString(),
        leadId: leadId.toString(),
        stage: 'contacted',
        changedBy: { type: 'position', positionId: positionId.toString() },
        changedAt: '2026-08-27T09:00:00.000Z',
      },
    ]);
    expect(result.nextCursor).toBe(eventIds[0]!.toString());
  });
});

describe('CrmService.listContacts', () => {
  function makeReadContactsService(overrides: { leadRepository?: unknown; contactRepository?: unknown }) {
    const service = createTestCrmService(overrides);
    return service as unknown as {
      listContacts(params: {
        organizationId: Types.ObjectId;
        ownerPositionId?: Types.ObjectId;
        q?: string;
        cursor?: Types.ObjectId;
        limit: number;
      }): Promise<{ items: unknown[]; nextCursor: string | null }>;
    };
  }

  it('organization-scope: не резолвит contactIds, listForOrganization вызывается без contactIds', async () => {
    const organizationId = new Types.ObjectId();
    const distinctContactIdsForOwner = jest.fn();
    const listForOrganization = jest.fn().mockResolvedValue([]);
    const service = makeReadContactsService({
      leadRepository: { distinctContactIdsForOwner },
      contactRepository: { listForOrganization },
    });

    await service.listContacts({ organizationId, limit: 20 });

    expect(distinctContactIdsForOwner).not.toHaveBeenCalled();
    expect(listForOrganization).toHaveBeenCalledWith(organizationId, {
      contactIds: undefined,
      q: undefined,
      cursor: undefined,
      limit: 21,
    });
  });

  it('own-scope: резолвит contactIds через LeadRepository ДО чтения contacts, передаёт множество в фильтр', async () => {
    const organizationId = new Types.ObjectId();
    const ownerPositionId = new Types.ObjectId();
    const contactIds = [new Types.ObjectId(), new Types.ObjectId()];
    const distinctContactIdsForOwner = jest.fn().mockResolvedValue(contactIds);
    const listForOrganization = jest.fn().mockResolvedValue([]);
    const service = makeReadContactsService({
      leadRepository: { distinctContactIdsForOwner },
      contactRepository: { listForOrganization },
    });

    await service.listContacts({ organizationId, ownerPositionId, limit: 20 });

    expect(distinctContactIdsForOwner).toHaveBeenCalledWith(organizationId, ownerPositionId);
    expect(listForOrganization).toHaveBeenCalledWith(organizationId, {
      contactIds,
      q: undefined,
      cursor: undefined,
      limit: 21,
    });
  });

  it('q передаётся как экранированный regex, метасимволы не интерпретируются', async () => {
    const organizationId = new Types.ObjectId();
    const listForOrganization = jest.fn().mockResolvedValue([]);
    const service = makeReadContactsService({
      contactRepository: { listForOrganization },
    });

    await service.listContacts({ organizationId, q: 'a.b+c', limit: 20 });

    const callArgs = listForOrganization.mock.calls[0]![1] as { q: RegExp };
    expect(callArgs.q).toBeInstanceOf(RegExp);
    expect(callArgs.q.source).toBe('a\\.b\\+c');
    expect(callArgs.q.flags).toBe('i');
  });

  it('limit+1: nextCursor указывает на последнюю ВОЗВРАЩЁННУЮ запись, лишняя отбрасывается', async () => {
    const organizationId = new Types.ObjectId();
    const contactIds = [new Types.ObjectId(), new Types.ObjectId()];
    const rows = contactIds.map((id) => ({
      _id: id,
      organizationId,
      name: 'Иван',
      phone: '+79990000000',
      createdAt: new Date('2026-08-30T10:00:00Z'),
    }));
    const service = makeReadContactsService({
      contactRepository: { listForOrganization: jest.fn().mockResolvedValue(rows) },
    });

    const result = await service.listContacts({ organizationId, limit: 1 });

    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBe(contactIds[0]!.toString());
  });

  it('маппит ContactDocument в CrmContactReadModel — email:null, если отсутствует', async () => {
    const organizationId = new Types.ObjectId();
    const contactId = new Types.ObjectId();
    const service = makeReadContactsService({
      contactRepository: {
        listForOrganization: jest.fn().mockResolvedValue([
          {
            _id: contactId,
            organizationId,
            name: 'Иван',
            phone: '+79990000000',
            createdAt: new Date('2026-08-30T10:00:00Z'),
          },
        ]),
      },
    });

    const result = await service.listContacts({ organizationId, limit: 20 });

    expect(result.items).toEqual([
      {
        id: contactId.toString(),
        organizationId: organizationId.toString(),
        name: 'Иван',
        phone: '+79990000000',
        email: null,
        createdAt: '2026-08-30T10:00:00.000Z',
      },
    ]);
  });
});

describe('CrmService.getContact', () => {
  function makeReadContactService(overrides: { leadRepository?: unknown; contactRepository?: unknown }) {
    const service = createTestCrmService(overrides);
    return service as unknown as {
      getContact(params: {
        contactId: Types.ObjectId;
        organizationId: Types.ObjectId;
        ownerPositionId?: Types.ObjectId;
      }): Promise<unknown>;
    };
  }

  it('organization-scope: не резолвит contactIds, читает напрямую по organizationId', async () => {
    const contactId = new Types.ObjectId();
    const organizationId = new Types.ObjectId();
    const distinctContactIdsForOwner = jest.fn();
    const findByIdForOrganizationScoped = jest.fn().mockResolvedValue({
      _id: contactId,
      organizationId,
      name: 'Иван',
      phone: '+79990000000',
      createdAt: new Date('2026-08-30T10:00:00Z'),
    });
    const service = makeReadContactService({
      leadRepository: { distinctContactIdsForOwner },
      contactRepository: { findByIdForOrganizationScoped },
    });

    await service.getContact({ contactId, organizationId });

    expect(distinctContactIdsForOwner).not.toHaveBeenCalled();
    expect(findByIdForOrganizationScoped).toHaveBeenCalledWith(contactId, organizationId, undefined);
  });

  it('own-scope: резолвит contactIds ДО чтения, передаёт в findByIdForOrganizationScoped', async () => {
    const contactId = new Types.ObjectId();
    const organizationId = new Types.ObjectId();
    const ownerPositionId = new Types.ObjectId();
    const contactIds = [contactId];
    const distinctContactIdsForOwner = jest.fn().mockResolvedValue(contactIds);
    const findByIdForOrganizationScoped = jest.fn().mockResolvedValue({
      _id: contactId,
      organizationId,
      name: 'Иван',
      phone: '+79990000000',
      createdAt: new Date('2026-08-30T10:00:00Z'),
    });
    const service = makeReadContactService({
      leadRepository: { distinctContactIdsForOwner },
      contactRepository: { findByIdForOrganizationScoped },
    });

    await service.getContact({ contactId, organizationId, ownerPositionId });

    expect(distinctContactIdsForOwner).toHaveBeenCalledWith(organizationId, ownerPositionId);
    expect(findByIdForOrganizationScoped).toHaveBeenCalledWith(contactId, organizationId, contactIds);
  });

  it('чужой (другая организация) контакт — NotFoundException', async () => {
    const service = makeReadContactService({
      contactRepository: { findByIdForOrganizationScoped: jest.fn().mockResolvedValue(null) },
    });

    await expect(
      service.getContact({ contactId: new Types.ObjectId(), organizationId: new Types.ObjectId() }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('несуществующий contactId даёт ТОТ ЖЕ NotFoundException, что чужой (non-disclosure)', async () => {
    const service = makeReadContactService({
      contactRepository: { findByIdForOrganizationScoped: jest.fn().mockResolvedValue(null) },
    });

    await expect(
      service.getContact({ contactId: new Types.ObjectId(), organizationId: new Types.ObjectId() }),
    ).rejects.toThrow('Contact not found');
  });

  it('own-scope: контакт вне множества "своих" — NotFoundException (репозиторий возвращает null)', async () => {
    const contactId = new Types.ObjectId();
    const organizationId = new Types.ObjectId();
    const ownerPositionId = new Types.ObjectId();
    const service = makeReadContactService({
      leadRepository: { distinctContactIdsForOwner: jest.fn().mockResolvedValue([new Types.ObjectId()]) },
      contactRepository: { findByIdForOrganizationScoped: jest.fn().mockResolvedValue(null) },
    });

    await expect(
      service.getContact({ contactId, organizationId, ownerPositionId }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('CrmService — getLeadTimeline & getContactTimeline', () => {
  it('getLeadTimeline: агрегирует lead_events, tasks и audit_events в хронологическом порядке', async () => {
    const organizationId = new Types.ObjectId();
    const leadId = new Types.ObjectId();
    const taskId = new Types.ObjectId();
    const positionId = new Types.ObjectId();

    const lead = {
      _id: leadId,
      organizationId,
      stage: 'contacted',
      createdAt: new Date('2026-08-01T10:00:00Z'),
    };

    const leadEvents = [
      {
        _id: new Types.ObjectId(),
        leadId,
        stage: 'contacted',
        changedBy: { type: 'position', positionId },
        changedAt: new Date('2026-08-02T12:00:00Z'),
      },
    ];

    const tasks = [
      {
        _id: taskId,
        organizationId,
        title: 'Перезвонить клиенту',
        status: 'completed',
        assignedPositionId: positionId,
        completedByPositionId: positionId,
        createdAt: new Date('2026-08-03T10:00:00Z'),
        completedAt: new Date('2026-08-04T15:00:00Z'),
      },
    ];

    const auditEvents = [
      {
        _id: new Types.ObjectId(),
        action: 'lead.assign',
        actor: { type: 'position', id: positionId },
        createdAt: new Date('2026-08-02T11:00:00Z'),
        resourceId: leadId,
        after: { ownerPositionId: positionId.toString() },
      },
    ];

    const service = createTestCrmService({
      leadRepository: { findByIdForOrganization: jest.fn().mockResolvedValue(lead) },
      leadEventRepository: { listForLead: jest.fn().mockResolvedValue(leadEvents) },
      taskRepository: { listForLead: jest.fn().mockResolvedValue(tasks) },
      auditService: { findByResources: jest.fn().mockResolvedValue(auditEvents) },
    });

    const readService = service as unknown as {
      getLeadTimeline(params: {
        leadId: Types.ObjectId;
        organizationId: Types.ObjectId;
        limit: number;
      }): Promise<{ items: Array<{ id: string; type: string; happenedAt: string }>; nextCursor: string | null }>;
    };

    const result = await readService.getLeadTimeline({ leadId, organizationId, limit: 10 });

    expect(result.items).toHaveLength(4);
    // Newest first:
    expect(result.items[0]!.type).toBe('task_completed');
    expect(result.items[1]!.type).toBe('task_created');
    expect(result.items[2]!.type).toBe('lead_stage_changed');
    expect(result.items[3]!.type).toBe('lead_assigned');
  });

  it('getContactTimeline: own-scope non-disclosure: 404 если нет лидов у менеджера', async () => {
    const organizationId = new Types.ObjectId();
    const contactId = new Types.ObjectId();
    const ownerPositionId = new Types.ObjectId();

    const service = createTestCrmService({
      contactRepository: { findByIdForOrganization: jest.fn().mockResolvedValue({ _id: contactId, organizationId }) },
      leadRepository: { findLeadIdsForContact: jest.fn().mockResolvedValue([]) },
    });

    const readService = service as unknown as {
      getContactTimeline(params: {
        contactId: Types.ObjectId;
        organizationId: Types.ObjectId;
        ownerPositionId: Types.ObjectId;
        limit: number;
      }): Promise<unknown>;
    };

    await expect(
      readService.getContactTimeline({ contactId, organizationId, ownerPositionId, limit: 10 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('Deal Core (DEAL-001)', () => {
    it('createDeal: throws NotFoundException when primary contact does not exist in organization', async () => {
      const organizationId = new Types.ObjectId();
      const contactId = new Types.ObjectId();
      const service = createTestCrmService({
        contactRepository: { findByIdForOrganization: jest.fn().mockResolvedValue(null) },
      });

      await expect(
        service.createDeal({
          organizationId,
          contactId,
          ownerPositionId: new Types.ObjectId(),
          title: 'Deal 1',
          actorPositionId: new Types.ObjectId(),
          actorIdentityId: new Types.ObjectId(),
          correlationId: 'corr-1',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('createDeal: creates deal, appends deal event, records audit', async () => {
      const organizationId = new Types.ObjectId();
      const contactId = new Types.ObjectId();
      const ownerPositionId = new Types.ObjectId();
      const actorPositionId = new Types.ObjectId();
      const actorIdentityId = new Types.ObjectId();
      const dealId = new Types.ObjectId();

      const createdDeal = {
        _id: dealId,
        organizationId,
        contactId,
        ownerPositionId,
        title: 'Penthouse sale',
        stage: 'showing',
        version: 0,
        participants: [],
        checklistItems: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const dealRepo = {
        create: jest.fn().mockResolvedValue(createdDeal),
      };
      const dealEventRepo = {
        append: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
      };
      const auditService = {
        append: jest.fn().mockResolvedValue(undefined),
      };
      const contactRepo = {
        findByIdForOrganization: jest.fn().mockResolvedValue({
          _id: contactId,
          name: 'Alice',
          phone: '+995555111222',
        }),
        findByIdsForOrganization: jest.fn().mockResolvedValue([]),
      };

      const service = createTestCrmService({
        dealRepository: dealRepo,
        dealEventRepository: dealEventRepo,
        auditService,
        contactRepository: contactRepo,
      });

      const res = await service.createDeal({
        organizationId,
        contactId,
        ownerPositionId,
        title: 'Penthouse sale',
        actorPositionId,
        actorIdentityId,
        correlationId: 'corr-create-deal',
      });

      expect(res.id).toBe(dealId.toString());
      expect(res.title).toBe('Penthouse sale');
      expect(res.stage).toBe('showing');
      expect(dealRepo.create).toHaveBeenCalled();
      expect(dealEventRepo.append).toHaveBeenCalledWith(
        expect.objectContaining({ dealId, stage: 'showing' }),
        expect.anything(),
      );
      expect(auditService.append).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'deal.create', resourceId: dealId }),
        expect.anything(),
      );
    });

    it('changeDealStage: throws AppException on invalid transition (showing -> referral)', async () => {
      const organizationId = new Types.ObjectId();
      const dealId = new Types.ObjectId();
      const deal = {
        _id: dealId,
        organizationId,
        stage: 'showing',
        version: 0,
      };

      const service = createTestCrmService({
        dealRepository: {
          findByIdForOrganization: jest.fn().mockResolvedValue(deal),
        },
      });

      await expect(
        service.changeDealStage({
          dealId,
          organizationId,
          newStage: 'referral',
          expectedVersion: 0,
          actorPositionId: new Types.ObjectId(),
          actorIdentityId: new Types.ObjectId(),
          correlationId: 'corr-stage',
        }),
      ).rejects.toThrow(AppException);
    });

    it('changeDealStage: throws ConflictException when expectedVersion mismatches', async () => {
      const organizationId = new Types.ObjectId();
      const dealId = new Types.ObjectId();
      const deal = {
        _id: dealId,
        organizationId,
        stage: 'showing',
        version: 2,
      };

      const service = createTestCrmService({
        dealRepository: {
          findByIdForOrganization: jest.fn().mockResolvedValue(deal),
        },
      });

      await expect(
        service.changeDealStage({
          dealId,
          organizationId,
          newStage: 'deposit',
          expectedVersion: 1, // Expected 1, actual 2
          actorPositionId: new Types.ObjectId(),
          actorIdentityId: new Types.ObjectId(),
          correlationId: 'corr-stage',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('changeDealStage: executes valid transition (showing -> deposit) and records audit', async () => {
      const organizationId = new Types.ObjectId();
      const dealId = new Types.ObjectId();
      const contactId = new Types.ObjectId();
      const ownerPositionId = new Types.ObjectId();
      const actorPositionId = new Types.ObjectId();
      const actorIdentityId = new Types.ObjectId();

      const dealBefore = {
        _id: dealId,
        organizationId,
        contactId,
        ownerPositionId,
        title: 'Deal 1',
        stage: 'showing',
        version: 0,
        participants: [],
        checklistItems: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const dealAfter = {
        ...dealBefore,
        stage: 'deposit',
        version: 1,
      };

      const dealRepo = {
        findByIdForOrganization: jest.fn()
          .mockResolvedValueOnce(dealBefore)
          .mockResolvedValueOnce(dealAfter),
        changeStageWithVersionCheck: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      };
      const dealEventRepo = {
        append: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
      };
      const auditService = {
        append: jest.fn().mockResolvedValue(undefined),
      };
      const contactRepo = {
        findByIdsForOrganization: jest.fn().mockResolvedValue([{ _id: contactId, name: 'Bob', phone: '+995555123456' }]),
      };

      const service = createTestCrmService({
        dealRepository: dealRepo,
        dealEventRepository: dealEventRepo,
        auditService,
        contactRepository: contactRepo,
      });

      const res = await service.changeDealStage({
        dealId,
        organizationId,
        newStage: 'deposit',
        expectedVersion: 0,
        reason: 'Deposit payment received',
        actorPositionId,
        actorIdentityId,
        correlationId: 'corr-stage-valid',
      });

      expect(res.stage).toBe('deposit');
      expect(res.version).toBe(1);
      expect(dealEventRepo.append).toHaveBeenCalledWith(
        expect.objectContaining({ dealId, stage: 'deposit', fromStage: 'showing', reason: 'Deposit payment received' }),
        expect.anything(),
      );
      expect(auditService.append).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'deal.change_stage',
          before: { stage: 'showing', version: 0 },
          after: { stage: 'deposit', version: 1, reason: 'Deposit payment received' },
        }),
        expect.anything(),
      );
    });
  });
});

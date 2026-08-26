import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AdminPublicationService } from './admin-publication.service';
import type { AdminContext } from '../../shared/admin/admin-context';
import type { MarketplacePublicationRepository } from '@baza/publication';
import type { PublicationService } from '../publication/publication.service';
import type { AdminPolicyService } from './admin-policy.service';

function makeAdminContext(overrides: Partial<AdminContext> = {}): AdminContext {
  return {
    identityId: new Types.ObjectId().toString(),
    adminAccountId: new Types.ObjectId().toString(),
    isSuperAdmin: false,
    ...overrides,
  };
}

function makeMockConnection() {
  return {
    startSession: jest.fn().mockResolvedValue({
      withTransaction: async (work: () => Promise<unknown>) => work(),
      endSession: jest.fn().mockResolvedValue(undefined),
    }),
  };
}

function makePublication(overrides: Partial<{ sourceType: string; searchProjection: Record<string, unknown> }> = {}) {
  return {
    _id: new Types.ObjectId(),
    sourceType: overrides.sourceType ?? 'development',
    sourceId: new Types.ObjectId(),
    status: 'published',
    slug: 'zhk-solnechnyy',
    unpublishReason: null,
    searchProjection: overrides.searchProjection ?? { city: 'batumi' },
  };
}

describe('AdminPublicationService.unpublish', () => {
  it('резолвит resource=sourceType/action=unpublish/scopeValue=city из searchProjection и требует grant', async () => {
    const publication = makePublication({ sourceType: 'development', searchProjection: { city: 'batumi' } });
    const adminContext = makeAdminContext();
    const requireGrantSpy = jest.fn().mockResolvedValue(undefined);
    const requireReasonSpy = jest.fn();
    const unpublishSpy = jest.fn().mockResolvedValue(undefined);
    const findByIdSpy = jest.fn().mockResolvedValue(publication);

    const service = new AdminPublicationService(
      makeMockConnection() as never,
      { findById: findByIdSpy } as unknown as MarketplacePublicationRepository,
      { unpublish: unpublishSpy } as unknown as PublicationService,
      { requireGrant: requireGrantSpy, requireReason: requireReasonSpy } as unknown as AdminPolicyService,
    );

    await service.unpublish(adminContext, {
      publicationId: publication._id,
      reason: 'Duplicate listing detected',
      correlationId: 'test-correlation-id',
    });

    expect(requireReasonSpy).toHaveBeenCalledWith('Duplicate listing detected');
    expect(requireGrantSpy).toHaveBeenCalledWith({
      adminContext,
      resource: 'development',
      action: 'unpublish',
      scopeValue: 'batumi',
    });
  });

  it('вызывает PublicationService.unpublish с actorType:admin_account и adminAccountId как actorId', async () => {
    const publication = makePublication();
    const adminContext = makeAdminContext();
    const unpublishSpy = jest.fn().mockResolvedValue(undefined);

    const service = new AdminPublicationService(
      makeMockConnection() as never,
      { findById: jest.fn().mockResolvedValue(publication) } as unknown as MarketplacePublicationRepository,
      { unpublish: unpublishSpy } as unknown as PublicationService,
      { requireGrant: jest.fn().mockResolvedValue(undefined), requireReason: jest.fn() } as unknown as AdminPolicyService,
    );

    await service.unpublish(adminContext, {
      publicationId: publication._id,
      reason: 'Duplicate listing detected',
      correlationId: 'test-correlation-id',
    });

    expect(unpublishSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: publication.sourceType,
        sourceId: publication.sourceId,
        reason: 'Duplicate listing detected',
        actorType: 'admin_account',
        actorId: new Types.ObjectId(adminContext.adminAccountId),
      }),
      expect.anything(),
    );
  });

  it('бросает NotFoundException, если publication не найдена по id', async () => {
    const service = new AdminPublicationService(
      makeMockConnection() as never,
      { findById: jest.fn().mockResolvedValue(null) } as unknown as MarketplacePublicationRepository,
      { unpublish: jest.fn() } as unknown as PublicationService,
      { requireGrant: jest.fn(), requireReason: jest.fn() } as unknown as AdminPolicyService,
    );

    await expect(
      service.unpublish(makeAdminContext(), {
        publicationId: new Types.ObjectId(),
        reason: 'Duplicate listing detected',
        correlationId: 'test-correlation-id',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('требует reason ДО чтения publication из БД (fail fast)', async () => {
    const findByIdSpy = jest.fn();
    const requireReasonSpy = jest.fn().mockImplementation(() => {
      throw new Error('reason invalid');
    });

    const service = new AdminPublicationService(
      makeMockConnection() as never,
      { findById: findByIdSpy } as unknown as MarketplacePublicationRepository,
      { unpublish: jest.fn() } as unknown as PublicationService,
      { requireGrant: jest.fn(), requireReason: requireReasonSpy } as unknown as AdminPolicyService,
    );

    await expect(
      service.unpublish(makeAdminContext(), {
        publicationId: new Types.ObjectId(),
        reason: 'too short',
        correlationId: 'test-correlation-id',
      }),
    ).rejects.toThrow('reason invalid');

    expect(findByIdSpy).not.toHaveBeenCalled();
  });

  it('scopeValue отсутствует (undefined), если searchProjection.city не задан (publication ещё не собрана worker-ом)', async () => {
    const publication = makePublication({ searchProjection: {} });
    const requireGrantSpy = jest.fn().mockResolvedValue(undefined);

    const service = new AdminPublicationService(
      makeMockConnection() as never,
      { findById: jest.fn().mockResolvedValue(publication) } as unknown as MarketplacePublicationRepository,
      { unpublish: jest.fn().mockResolvedValue(undefined) } as unknown as PublicationService,
      { requireGrant: requireGrantSpy, requireReason: jest.fn() } as unknown as AdminPolicyService,
    );

    await service.unpublish(makeAdminContext(), {
      publicationId: publication._id,
      reason: 'Duplicate listing detected',
      correlationId: 'test-correlation-id',
    });

    expect(requireGrantSpy).toHaveBeenCalledWith(expect.objectContaining({ scopeValue: undefined }));
  });
});

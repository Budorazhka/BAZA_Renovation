import { ConflictException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AdminComplaintService } from './admin-complaint.service';
import type { AdminContext } from '../../shared/admin/admin-context';
import type { ComplaintService } from '../property-assets/complaint.service';
import type { AdminPolicyService } from './admin-policy.service';
import type { AdminPublicationService } from './admin-publication.service';
import type { PolicyEvaluatorService } from '../authorization/policy-evaluator.service';
import type { MarketplacePublicationRepository } from '@baza/publication';

function makeAdminContext(overrides: Partial<AdminContext> = {}): AdminContext {
  return {
    identityId: new Types.ObjectId().toString(),
    adminAccountId: new Types.ObjectId().toString(),
    isSuperAdmin: false,
    ...overrides,
  };
}

function makeComplaint(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    _id: new Types.ObjectId(),
    listingId: new Types.ObjectId(),
    propertyAssetId: new Types.ObjectId(),
    scopeCity: 'batumi',
    status: 'pending',
    category: 'not_available',
    respondentScope: { type: 'organization', organizationId: new Types.ObjectId() },
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    ...overrides,
  };
}

function makeService(overrides: {
  complaintService?: Partial<ComplaintService>;
  publicationRepository?: Partial<MarketplacePublicationRepository>;
  adminPublicationService?: Partial<AdminPublicationService>;
  adminPolicy?: Partial<AdminPolicyService>;
  policyEvaluator?: Partial<PolicyEvaluatorService>;
} = {}) {
  return new AdminComplaintService(
    (overrides.complaintService ?? {}) as ComplaintService,
    (overrides.publicationRepository ?? { findBySource: jest.fn().mockResolvedValue(null) }) as MarketplacePublicationRepository,
    (overrides.adminPublicationService ?? { unpublish: jest.fn().mockResolvedValue(undefined) }) as unknown as AdminPublicationService,
    (overrides.adminPolicy ?? { requireReason: jest.fn(), requireGrant: jest.fn().mockResolvedValue(undefined) }) as unknown as AdminPolicyService,
    (overrides.policyEvaluator ?? {}) as PolicyEvaluatorService,
  );
}

describe('AdminComplaintService.list', () => {
  it('super_admin видит все города без вызова resolveListScope', async () => {
    const listForAdminReviewSpy = jest.fn().mockResolvedValue([]);
    const resolveListScopeSpy = jest.fn();
    const service = makeService({
      complaintService: { listForAdminReview: listForAdminReviewSpy } as never,
      policyEvaluator: { resolveListScope: resolveListScopeSpy } as never,
    });

    await service.list(makeAdminContext({ isSuperAdmin: true }), { limit: 20 });

    expect(resolveListScopeSpy).not.toHaveBeenCalled();
    expect(listForAdminReviewSpy).toHaveBeenCalledWith(
      expect.objectContaining({ cities: 'all', statuses: ['pending'], limit: 21 }),
    );
  });

  it('обычный admin без city-грантов на complaint.resolve получает пустой список, не 403', async () => {
    const listForAdminReviewSpy = jest.fn();
    const service = makeService({
      complaintService: { listForAdminReview: listForAdminReviewSpy } as never,
      policyEvaluator: { resolveListScope: jest.fn().mockResolvedValue({ global: false, scopeValues: [] }) } as never,
    });

    const result = await service.list(makeAdminContext(), { limit: 20 });

    expect(result).toEqual({ items: [], nextCursor: null });
    expect(listForAdminReviewSpy).not.toHaveBeenCalled();
  });

  it('admin с city-грантом сужает очередь на свои города, статус по умолчанию pending', async () => {
    const complaint = makeComplaint();
    const listForAdminReviewSpy = jest.fn().mockResolvedValue([complaint]);
    const service = makeService({
      complaintService: { listForAdminReview: listForAdminReviewSpy } as never,
      policyEvaluator: { resolveListScope: jest.fn().mockResolvedValue({ global: false, scopeValues: ['batumi'] }) } as never,
    });

    const result = await service.list(makeAdminContext(), { limit: 20 });

    expect(listForAdminReviewSpy).toHaveBeenCalledWith(
      expect.objectContaining({ cities: ['batumi'], statuses: ['pending'] }),
    );
    expect(result.items[0]).toMatchObject({ id: complaint._id.toString(), scopeCity: 'batumi' });
  });
});

describe('AdminComplaintService.resolve', () => {
  it('требует reason и grant complaint.resolve.city(X), где X = scopeCity жалобы', async () => {
    const complaint = makeComplaint({ scopeCity: 'batumi' });
    const requireReasonSpy = jest.fn();
    const requireGrantSpy = jest.fn().mockResolvedValue(undefined);
    const resolveSpy = jest.fn().mockResolvedValue(undefined);
    const service = makeService({
      complaintService: { findById: jest.fn().mockResolvedValue(complaint), resolve: resolveSpy } as never,
      adminPolicy: { requireReason: requireReasonSpy, requireGrant: requireGrantSpy } as never,
    });

    await service.resolve(makeAdminContext(), {
      complaintId: complaint._id,
      decision: 'dismissed',
      reason: 'Listing is genuinely still available',
      correlationId: 'corr-1',
    });

    expect(requireReasonSpy).toHaveBeenCalledWith('Listing is genuinely still available');
    expect(requireGrantSpy).toHaveBeenCalledWith({
      adminContext: expect.anything(),
      resource: 'complaint',
      action: 'resolve',
      scopeValue: 'batumi',
    });
    expect(resolveSpy).toHaveBeenCalledWith(
      expect.objectContaining({ complaintId: complaint._id, decision: 'dismissed' }),
    );
  });

  it('upheld с текущей published-публикацией вызывает AdminPublicationService.unpublish с тем же reason', async () => {
    const complaint = makeComplaint();
    const publicationId = new Types.ObjectId();
    const unpublishSpy = jest.fn().mockResolvedValue(undefined);
    const service = makeService({
      complaintService: { findById: jest.fn().mockResolvedValue(complaint), resolve: jest.fn().mockResolvedValue(undefined) } as never,
      publicationRepository: {
        findBySource: jest.fn().mockResolvedValue({ _id: publicationId, status: 'published' }),
      } as never,
      adminPublicationService: { unpublish: unpublishSpy } as never,
    });

    await service.resolve(makeAdminContext(), {
      complaintId: complaint._id,
      decision: 'upheld',
      reason: 'Confirmed the unit was already sold two weeks ago',
      correlationId: 'corr-2',
    });

    expect(unpublishSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ publicationId, reason: 'Confirmed the unit was already sold two weeks ago' }),
    );
  });

  it('upheld без опубликованной публикации НЕ вызывает unpublish, но резолюцирует жалобу (domain invariant: жалоба не требует существующей публикации)', async () => {
    const complaint = makeComplaint();
    const unpublishSpy = jest.fn();
    const resolveSpy = jest.fn().mockResolvedValue(undefined);
    const service = makeService({
      complaintService: { findById: jest.fn().mockResolvedValue(complaint), resolve: resolveSpy } as never,
      publicationRepository: { findBySource: jest.fn().mockResolvedValue(null) } as never,
      adminPublicationService: { unpublish: unpublishSpy } as never,
    });

    await service.resolve(makeAdminContext(), {
      complaintId: complaint._id,
      decision: 'upheld',
      reason: 'Confirmed the unit was already sold two weeks ago',
      correlationId: 'corr-3',
    });

    expect(unpublishSpy).not.toHaveBeenCalled();
    expect(resolveSpy).toHaveBeenCalled();
  });

  it('уже резолюцированная жалоба — ConflictException до вызова unpublish/resolve', async () => {
    const complaint = makeComplaint({ status: 'resolved_dismissed' });
    const unpublishSpy = jest.fn();
    const resolveSpy = jest.fn();
    const service = makeService({
      complaintService: { findById: jest.fn().mockResolvedValue(complaint), resolve: resolveSpy } as never,
      adminPublicationService: { unpublish: unpublishSpy } as never,
    });

    await expect(
      service.resolve(makeAdminContext(), {
        complaintId: complaint._id,
        decision: 'upheld',
        reason: 'Trying to resolve twice, should be rejected',
        correlationId: 'corr-4',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(unpublishSpy).not.toHaveBeenCalled();
    expect(resolveSpy).not.toHaveBeenCalled();
  });

  it('несуществующая жалоба — 404', async () => {
    const service = makeService({ complaintService: { findById: jest.fn().mockResolvedValue(null) } as never });

    await expect(
      service.resolve(makeAdminContext(), {
        complaintId: new Types.ObjectId(),
        decision: 'upheld',
        reason: 'irrelevant, not found first',
        correlationId: 'corr-5',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

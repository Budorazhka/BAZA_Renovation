import { Types } from 'mongoose';
import { AdminDuplicateCandidateService } from './admin-duplicate-candidate.service';
import type { AdminContext } from '../../shared/admin/admin-context';
import type { DedupeService } from '../property-assets/dedupe.service';
import type { AdminPolicyService } from './admin-policy.service';

function makeAdminContext(overrides: Partial<AdminContext> = {}): AdminContext {
  return {
    identityId: new Types.ObjectId().toString(),
    adminAccountId: new Types.ObjectId().toString(),
    isSuperAdmin: false,
    ...overrides,
  };
}

function makeAsset(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    _id: new Types.ObjectId(),
    propertyType: 'apartment',
    location: { city: 'Batumi', address: '1 Rustaveli St' },
    characteristics: { area: 55, rooms: 2, floor: 5 },
    representativePhone: '+995500000001',
    publisherScope: { type: 'organization', organizationId: new Types.ObjectId() },
    ...overrides,
  };
}

function makeCandidate(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    _id: new Types.ObjectId(),
    status: 'detected',
    signals: { phoneMatch: true, addressMatch: false, roomsAreaFloorMatch: false },
    detectedAt: new Date('2026-08-31T10:00:00.000Z'),
    overrideReason: undefined,
    overrideAt: undefined,
    confirmReason: undefined,
    confirmedAt: undefined,
    ...overrides,
  };
}

describe('AdminDuplicateCandidateService.list', () => {
  it('требует grant duplicate_candidate.read перед вызовом DedupeService', async () => {
    const adminContext = makeAdminContext();
    const requireGrantSpy = jest.fn().mockResolvedValue(undefined);
    const candidate = makeCandidate();
    const assetA = makeAsset();
    const assetB = makeAsset();
    const listForAdminReviewSpy = jest
      .fn()
      .mockResolvedValue([{ candidate, assetA, assetB }]);

    const service = new AdminDuplicateCandidateService(
      { listForAdminReview: listForAdminReviewSpy } as unknown as DedupeService,
      { requireGrant: requireGrantSpy } as unknown as AdminPolicyService,
    );

    await service.list(adminContext, { limit: 20 });

    expect(requireGrantSpy).toHaveBeenCalledWith({ adminContext, resource: 'duplicate_candidate', action: 'read' });
  });

  it('без явного status дефолтит на [detected, override_not_duplicate], передаёт limit+1', async () => {
    const listForAdminReviewSpy = jest.fn().mockResolvedValue([]);
    const service = new AdminDuplicateCandidateService(
      { listForAdminReview: listForAdminReviewSpy } as unknown as DedupeService,
      { requireGrant: jest.fn().mockResolvedValue(undefined) } as unknown as AdminPolicyService,
    );

    await service.list(makeAdminContext(), { limit: 20 });

    expect(listForAdminReviewSpy).toHaveBeenCalledWith({
      statuses: ['detected', 'override_not_duplicate'],
      cursor: undefined,
      limit: 21,
    });
  });

  it('явный status сужает до одного значения, cursor конвертируется в ObjectId', async () => {
    const listForAdminReviewSpy = jest.fn().mockResolvedValue([]);
    const service = new AdminDuplicateCandidateService(
      { listForAdminReview: listForAdminReviewSpy } as unknown as DedupeService,
      { requireGrant: jest.fn().mockResolvedValue(undefined) } as unknown as AdminPolicyService,
    );
    const cursor = new Types.ObjectId();

    await service.list(makeAdminContext(), { status: 'confirmed_duplicate', cursor: cursor.toString(), limit: 10 });

    expect(listForAdminReviewSpy).toHaveBeenCalledWith({
      statuses: ['confirmed_duplicate'],
      cursor: expect.objectContaining({ _bsontype: 'ObjectId' }) as unknown as Types.ObjectId,
      limit: 11,
    });
    const call = listForAdminReviewSpy.mock.calls[0][0] as { cursor: Types.ObjectId };
    expect(call.cursor.equals(cursor)).toBe(true);
  });

  it('nextCursor null, когда результатов не больше limit; отсекает лишнюю (limit+1-ю) запись', async () => {
    const items = Array.from({ length: 3 }, () => ({ candidate: makeCandidate(), assetA: null, assetB: null }));
    const service = new AdminDuplicateCandidateService(
      { listForAdminReview: jest.fn().mockResolvedValue(items) } as unknown as DedupeService,
      { requireGrant: jest.fn().mockResolvedValue(undefined) } as unknown as AdminPolicyService,
    );

    const result = await service.list(makeAdminContext(), { limit: 3 });

    expect(result.items).toHaveLength(3);
    expect(result.nextCursor).toBeNull();
  });

  it('nextCursor заполнен, когда результатов больше limit (limit+1-я запись отрезается)', async () => {
    const items = Array.from({ length: 4 }, () => ({ candidate: makeCandidate(), assetA: null, assetB: null }));
    const service = new AdminDuplicateCandidateService(
      { listForAdminReview: jest.fn().mockResolvedValue(items) } as unknown as DedupeService,
      { requireGrant: jest.fn().mockResolvedValue(undefined) } as unknown as AdminPolicyService,
    );

    const result = await service.list(makeAdminContext(), { limit: 3 });

    expect(result.items).toHaveLength(3);
    expect(result.nextCursor).toBe(items[2]!.candidate._id.toString());
  });

  it('маппит asset в summary с publisherScope.organizationId для organization и null для marketplace_account', async () => {
    const orgId = new Types.ObjectId();
    const assetA = makeAsset({ publisherScope: { type: 'organization', organizationId: orgId } });
    const assetB = makeAsset({ publisherScope: { type: 'marketplace_account', identityId: new Types.ObjectId() } });
    const candidate = makeCandidate();
    const service = new AdminDuplicateCandidateService(
      { listForAdminReview: jest.fn().mockResolvedValue([{ candidate, assetA, assetB }]) } as unknown as DedupeService,
      { requireGrant: jest.fn().mockResolvedValue(undefined) } as unknown as AdminPolicyService,
    );

    const result = await service.list(makeAdminContext(), { limit: 20 });

    expect(result.items[0]!.assetA).toMatchObject({
      publisherScope: { type: 'organization', organizationId: orgId.toString() },
    });
    expect(result.items[0]!.assetB).toMatchObject({
      publisherScope: { type: 'marketplace_account', organizationId: null },
    });
  });

  it('отсутствующий asset (null) маппится в null, не бросает', async () => {
    const candidate = makeCandidate();
    const service = new AdminDuplicateCandidateService(
      { listForAdminReview: jest.fn().mockResolvedValue([{ candidate, assetA: null, assetB: null }]) } as unknown as DedupeService,
      { requireGrant: jest.fn().mockResolvedValue(undefined) } as unknown as AdminPolicyService,
    );

    const result = await service.list(makeAdminContext(), { limit: 20 });

    expect(result.items[0]).toMatchObject({ assetA: null, assetB: null });
  });
});

describe('AdminDuplicateCandidateService.confirm', () => {
  it('требует reason и grant duplicate_candidate.confirm перед вызовом DedupeService.confirmDuplicate', async () => {
    const adminContext = makeAdminContext({ adminAccountId: new Types.ObjectId().toString() });
    const requireReasonSpy = jest.fn();
    const requireGrantSpy = jest.fn().mockResolvedValue(undefined);
    const confirmDuplicateSpy = jest.fn().mockResolvedValue(undefined);
    const duplicateCandidateId = new Types.ObjectId();

    const service = new AdminDuplicateCandidateService(
      { confirmDuplicate: confirmDuplicateSpy } as unknown as DedupeService,
      { requireReason: requireReasonSpy, requireGrant: requireGrantSpy } as unknown as AdminPolicyService,
    );

    await service.confirm(adminContext, {
      duplicateCandidateId,
      reason: 'Verified same physical unit by phone',
      correlationId: 'corr-1',
    });

    expect(requireReasonSpy).toHaveBeenCalledWith('Verified same physical unit by phone');
    expect(requireGrantSpy).toHaveBeenCalledWith({ adminContext, resource: 'duplicate_candidate', action: 'confirm' });
    expect(confirmDuplicateSpy).toHaveBeenCalledWith({
      duplicateCandidateId,
      confirmByAdminAccountId: new Types.ObjectId(adminContext.adminAccountId),
      reason: 'Verified same physical unit by phone',
      correlationId: 'corr-1',
    });
  });
});

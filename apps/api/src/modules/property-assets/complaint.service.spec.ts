import { ConflictException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ComplaintService } from './complaint.service';
import type { ComplaintRepository, ListingRepository, PropertyAssetRepository } from '@baza/property-assets';
import type { AuditService } from '../audit/audit.service';

function makeMockConnection() {
  return {
    startSession: jest.fn().mockResolvedValue({
      withTransaction: async (work: () => Promise<unknown>) => work(),
      endSession: jest.fn().mockResolvedValue(undefined),
    }),
  };
}

function makeService(overrides: {
  complaintRepository?: Partial<ComplaintRepository>;
  listingRepository?: Partial<ListingRepository>;
  propertyAssetRepository?: Partial<PropertyAssetRepository>;
  auditService?: Partial<AuditService>;
} = {}) {
  return new ComplaintService(
    (overrides.complaintRepository ?? {}) as ComplaintRepository,
    (overrides.listingRepository ?? {}) as ListingRepository,
    (overrides.propertyAssetRepository ?? {}) as PropertyAssetRepository,
    (overrides.auditService ?? { append: jest.fn().mockResolvedValue(undefined) }) as AuditService,
    makeMockConnection() as never,
  );
}

describe('ComplaintService.submit', () => {
  it('резолвит listing/asset, денормализует scopeCity/respondentScope и создаёт pending-жалобу (без tenant-фильтра — анонимный жалобщик)', async () => {
    const listingId = new Types.ObjectId();
    const assetId = new Types.ObjectId();
    const organizationId = new Types.ObjectId();
    const createSpy = jest.fn().mockResolvedValue({ _id: new Types.ObjectId() });
    const service = makeService({
      listingRepository: { findById: jest.fn().mockResolvedValue({ _id: listingId, propertyAssetId: assetId }) } as never,
      propertyAssetRepository: {
        findById: jest.fn().mockResolvedValue({
          _id: assetId,
          publisherScope: { type: 'organization', organizationId },
          location: { city: 'Batumi', address: '1 Rustaveli St' },
        }),
      } as never,
      complaintRepository: { create: createSpy } as never,
    });

    await service.submit({ listingId, category: 'not_available', reporterPhone: '+995500000002' });

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        propertyAssetId: assetId,
        listingId,
        scopeCity: 'Batumi',
        respondentScope: { type: 'organization', organizationId },
        category: 'not_available',
        reporterPhone: '+995500000002',
      }),
    );
  });

  it('несуществующий listing — 404', async () => {
    const service = makeService({ listingRepository: { findById: jest.fn().mockResolvedValue(null) } as never });

    await expect(service.submit({ listingId: new Types.ObjectId(), category: 'other' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('ComplaintService.resolve', () => {
  it('CAS на status:pending, пишет audit с actor:admin_account и reason', async () => {
    const complaintId = new Types.ObjectId();
    const resolvedByAdminId = new Types.ObjectId();
    const resolveSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
    const appendSpy = jest.fn().mockResolvedValue(undefined);
    const service = makeService({
      complaintRepository: {
        findById: jest.fn().mockResolvedValue({ _id: complaintId, status: 'pending' }),
        resolve: resolveSpy,
      } as never,
      auditService: { append: appendSpy } as never,
    });

    await service.resolve({
      complaintId,
      decision: 'upheld',
      reason: 'Confirmed unit is not for sale anymore',
      resolvedByAdminId,
      correlationId: 'corr-1',
    });

    expect(resolveSpy).toHaveBeenCalledWith(
      complaintId,
      { status: 'resolved_upheld', resolvedByAdminId, resolutionReason: 'Confirmed unit is not for sale anymore' },
      expect.anything(),
    );
    expect(appendSpy).toHaveBeenCalledWith(
      expect.objectContaining({ actor: { type: 'admin_account', id: resolvedByAdminId }, action: 'complaint.resolve' }),
      expect.anything(),
    );
  });

  it('уже резолюцированная жалоба — ConflictException, не переписывает решение', async () => {
    const complaintId = new Types.ObjectId();
    const service = makeService({
      complaintRepository: {
        findById: jest.fn().mockResolvedValue({ _id: complaintId, status: 'resolved_upheld' }),
        resolve: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
      } as never,
    });

    await expect(
      service.resolve({
        complaintId,
        decision: 'dismissed',
        reason: 'Second admin trying to override',
        resolvedByAdminId: new Types.ObjectId(),
        correlationId: 'corr-2',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('несуществующая жалоба — 404', async () => {
    const service = makeService({ complaintRepository: { findById: jest.fn().mockResolvedValue(null) } as never });

    await expect(
      service.resolve({
        complaintId: new Types.ObjectId(),
        decision: 'upheld',
        reason: 'irrelevant, not found first',
        resolvedByAdminId: new Types.ObjectId(),
        correlationId: 'corr-3',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

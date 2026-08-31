import { ConflictException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { DedupeService } from './dedupe.service';
import type { PropertyAssetRepository, DuplicateCandidateRepository } from '@baza/property-assets';
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
  propertyAssetRepository?: Partial<PropertyAssetRepository>;
  duplicateCandidateRepository?: Partial<DuplicateCandidateRepository>;
  auditService?: Partial<AuditService>;
} = {}) {
  return new DedupeService(
    (overrides.propertyAssetRepository ?? {}) as PropertyAssetRepository,
    (overrides.duplicateCandidateRepository ?? {}) as DuplicateCandidateRepository,
    (overrides.auditService ?? { append: jest.fn().mockResolvedValue(undefined) }) as AuditService,
    makeMockConnection() as never,
  );
}

function makeAsset(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    _id: new Types.ObjectId(),
    representativePhone: '+995500000001',
    location: { city: 'Batumi', address: '1 Rustaveli St' },
    characteristics: { area: 55, rooms: 2, floor: 5 },
    ...overrides,
  };
}

describe('DedupeService', () => {
  describe('scanForDuplicates', () => {
    it('бросает NotFoundException, если asset не найден', async () => {
      const service = makeService({ propertyAssetRepository: { findById: jest.fn().mockResolvedValue(null) } as never });

      await expect(service.scanForDuplicates(new Types.ObjectId())).rejects.toBeInstanceOf(NotFoundException);
    });

    it('upsertDetected вызывается для кандидата с реальным phone/address совпадением', async () => {
      const assetId = new Types.ObjectId();
      const asset = makeAsset({ _id: assetId });
      const otherId = new Types.ObjectId();
      const other = makeAsset({ _id: otherId, representativePhone: asset.representativePhone });
      const upsertDetectedSpy = jest.fn().mockResolvedValue(undefined);

      const service = makeService({
        propertyAssetRepository: {
          findById: jest.fn().mockResolvedValue(asset),
          findPotentialDuplicates: jest.fn().mockResolvedValue([other]),
        } as never,
        duplicateCandidateRepository: { upsertDetected: upsertDetectedSpy } as never,
      });

      await service.scanForDuplicates(assetId);

      expect(upsertDetectedSpy).toHaveBeenCalledWith(assetId, otherId, expect.objectContaining({ phoneMatch: true }));
    });

    it('НЕ вызывает upsertDetected для кандидата без phone/address совпадения (только roomsAreaFloorMatch без остальных не возникает без addressMatch)', async () => {
      const assetId = new Types.ObjectId();
      const asset = makeAsset({ _id: assetId, representativePhone: '+995500000001' });
      const other = makeAsset({ _id: new Types.ObjectId(), representativePhone: '+995500000099', location: { city: 'Tbilisi', address: 'Different St' } });
      const upsertDetectedSpy = jest.fn();

      const service = makeService({
        propertyAssetRepository: {
          findById: jest.fn().mockResolvedValue(asset),
          findPotentialDuplicates: jest.fn().mockResolvedValue([other]),
        } as never,
        duplicateCandidateRepository: { upsertDetected: upsertDetectedSpy } as never,
      });

      await service.scanForDuplicates(assetId);

      expect(upsertDetectedSpy).not.toHaveBeenCalled();
    });

    it('передаёт representativePhone/city/address найденного asset в findPotentialDuplicates', async () => {
      const assetId = new Types.ObjectId();
      const asset = makeAsset({ _id: assetId });
      const findPotentialDuplicatesSpy = jest.fn().mockResolvedValue([]);

      const service = makeService({
        propertyAssetRepository: { findById: jest.fn().mockResolvedValue(asset), findPotentialDuplicates: findPotentialDuplicatesSpy } as never,
      });

      await service.scanForDuplicates(assetId);

      expect(findPotentialDuplicatesSpy).toHaveBeenCalledWith({
        excludeId: assetId,
        representativePhone: asset.representativePhone,
        city: asset.location.city,
        address: asset.location.address,
      });
    });
  });

  describe('assertNoBlockingDuplicates', () => {
    it('не бросает, если blocking-кандидатов нет', async () => {
      const service = makeService({ duplicateCandidateRepository: { findBlockingCandidates: jest.fn().mockResolvedValue([]) } as never });

      await expect(service.assertNoBlockingDuplicates(new Types.ObjectId())).resolves.toBeUndefined();
    });

    it('бросает ConflictException при explicit-сигнале (phoneMatch)', async () => {
      const service = makeService({
        duplicateCandidateRepository: {
          findBlockingCandidates: jest.fn().mockResolvedValue([{ signals: { phoneMatch: true, addressMatch: false, roomsAreaFloorMatch: false } }]),
        } as never,
      });

      await expect(service.assertNoBlockingDuplicates(new Types.ObjectId())).rejects.toBeInstanceOf(ConflictException);
    });

    it('бросает ConflictException при explicit-сигнале (addressMatch И roomsAreaFloorMatch)', async () => {
      const service = makeService({
        duplicateCandidateRepository: {
          findBlockingCandidates: jest.fn().mockResolvedValue([{ signals: { phoneMatch: false, addressMatch: true, roomsAreaFloorMatch: true } }]),
        } as never,
      });

      await expect(service.assertNoBlockingDuplicates(new Types.ObjectId())).rejects.toBeInstanceOf(ConflictException);
    });

    it('НЕ бросает при только слабом сигнале (addressMatch без roomsAreaFloorMatch — тот же дом, другая квартира)', async () => {
      const service = makeService({
        duplicateCandidateRepository: {
          findBlockingCandidates: jest.fn().mockResolvedValue([{ signals: { phoneMatch: false, addressMatch: true, roomsAreaFloorMatch: false } }]),
        } as never,
      });

      await expect(service.assertNoBlockingDuplicates(new Types.ObjectId())).resolves.toBeUndefined();
    });
  });

  describe('overrideDuplicate', () => {
    it('CAS modifiedCount:0 (не detected) даёт ConflictException, не пишет audit', async () => {
      const appendSpy = jest.fn();
      const orgId = new Types.ObjectId();
      const assetAId = new Types.ObjectId();
      const assetBId = new Types.ObjectId();
      const service = makeService({
        propertyAssetRepository: {
          findById: jest.fn().mockImplementation((id: Types.ObjectId) => {
            if (id.equals(assetAId)) return Promise.resolve(makeAsset({ _id: assetAId, publisherScope: { type: 'organization', organizationId: orgId } }));
            return Promise.resolve(makeAsset({ _id: assetBId, publisherScope: { type: 'organization', organizationId: new Types.ObjectId() } }));
          }),
        } as never,
        duplicateCandidateRepository: {
          findById: jest.fn().mockResolvedValue({
            status: 'confirmed_duplicate',
            propertyAssetIdA: assetAId,
            propertyAssetIdB: assetBId,
          }),
          override: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
        } as never,
        auditService: { append: appendSpy } as never,
      });

      await expect(
        service.overrideDuplicate({
          duplicateCandidateId: new Types.ObjectId(),
          reason: 'Verified in person, not the same unit',
          actorScope: { type: 'organization', organizationId: orgId },
          actorIdentityId: new Types.ObjectId(),
          correlationId: 'corr',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(appendSpy).not.toHaveBeenCalled();
    });

    it('успешный override пишет audit с reason и actor, если actor владеет assetA', async () => {
      const appendSpy = jest.fn().mockResolvedValue(undefined);
      const actorIdentityId = new Types.ObjectId();
      const duplicateCandidateId = new Types.ObjectId();
      const orgId = new Types.ObjectId();
      const assetAId = new Types.ObjectId();
      const assetBId = new Types.ObjectId();

      const service = makeService({
        propertyAssetRepository: {
          findById: jest.fn().mockImplementation((id: Types.ObjectId) => {
            if (id.equals(assetAId)) return Promise.resolve(makeAsset({ _id: assetAId, publisherScope: { type: 'organization', organizationId: orgId } }));
            return Promise.resolve(makeAsset({ _id: assetBId, publisherScope: { type: 'organization', organizationId: new Types.ObjectId() } }));
          }),
        } as never,
        duplicateCandidateRepository: {
          findById: jest.fn().mockResolvedValue({
            status: 'detected',
            propertyAssetIdA: assetAId,
            propertyAssetIdB: assetBId,
          }),
          override: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
        } as never,
        auditService: { append: appendSpy } as never,
      });

      await service.overrideDuplicate({
        duplicateCandidateId,
        reason: 'Verified in person, not the same unit',
        actorScope: { type: 'organization', organizationId: orgId },
        actorIdentityId,
        correlationId: 'corr',
      });

      await service.overrideDuplicate({
        duplicateCandidateId,
        reason: 'Verified in person, not the same unit',
        actorScope: { type: 'organization', organizationId: orgId },
        actorIdentityId,
        correlationId: 'corr',
      });

      expect(appendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: { type: 'identity', id: actorIdentityId },
          action: 'duplicate_candidate.override',
          resourceId: duplicateCandidateId,
          reason: 'Verified in person, not the same unit',
        }),
        expect.anything(),
      );
    });

    it('успешный override, если marketplace actor владеет assetB', async () => {
      const appendSpy = jest.fn().mockResolvedValue(undefined);
      const actorIdentityId = new Types.ObjectId();
      const duplicateCandidateId = new Types.ObjectId();
      const assetAId = new Types.ObjectId();
      const assetBId = new Types.ObjectId();

      const service = makeService({
        propertyAssetRepository: {
          findById: jest.fn().mockImplementation((id: Types.ObjectId) => {
            if (id.equals(assetAId)) return Promise.resolve(makeAsset({ _id: assetAId, publisherScope: { type: 'organization', organizationId: new Types.ObjectId() } }));
            return Promise.resolve(makeAsset({ _id: assetBId, publisherScope: { type: 'marketplace_account', identityId: actorIdentityId } }));
          }),
        } as never,
        duplicateCandidateRepository: {
          findById: jest.fn().mockResolvedValue({
            status: 'detected',
            propertyAssetIdA: assetAId,
            propertyAssetIdB: assetBId,
          }),
          override: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
        } as never,
        auditService: { append: appendSpy } as never,
      });

      await expect(
        service.overrideDuplicate({
          duplicateCandidateId,
          reason: 'I am the owner on marketplace',
          actorScope: { type: 'marketplace_account', identityId: actorIdentityId },
          actorIdentityId,
          correlationId: 'corr',
        }),
      ).resolves.toBeUndefined();
    });

    it('actor не владеет ни одной из сторон — NotFoundException (404, non-disclosure)', async () => {
      const actorIdentityId = new Types.ObjectId();
      const strangerOrgId = new Types.ObjectId();
      const assetAId = new Types.ObjectId();
      const assetBId = new Types.ObjectId();

      const service = makeService({
        propertyAssetRepository: {
          findById: jest.fn().mockImplementation((id: Types.ObjectId) => {
            if (id.equals(assetAId)) return Promise.resolve(makeAsset({ _id: assetAId, publisherScope: { type: 'organization', organizationId: new Types.ObjectId() } }));
            return Promise.resolve(makeAsset({ _id: assetBId, publisherScope: { type: 'marketplace_account', identityId: new Types.ObjectId() } }));
          }),
        } as never,
        duplicateCandidateRepository: {
          findById: jest.fn().mockResolvedValue({
            status: 'detected',
            propertyAssetIdA: assetAId,
            propertyAssetIdB: assetBId,
          }),
          override: jest.fn(),
        } as never,
      });

      await expect(
        service.overrideDuplicate({
          duplicateCandidateId: new Types.ObjectId(),
          reason: 'Trying to override someone elses candidate',
          actorScope: { type: 'organization', organizationId: strangerOrgId },
          actorIdentityId,
          correlationId: 'corr',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('несуществующая запись candidate — NotFoundException', async () => {
      const service = makeService({ duplicateCandidateRepository: { findById: jest.fn().mockResolvedValue(null) } as never });

      await expect(
        service.overrideDuplicate({
          duplicateCandidateId: new Types.ObjectId(),
          reason: 'reason text long enough',
          actorScope: { type: 'marketplace_account', identityId: new Types.ObjectId() },
          actorIdentityId: new Types.ObjectId(),
          correlationId: 'corr',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('listForAdminReview', () => {
    it('резолвит asset-пары для каждого кандидата по обеим сторонам без дублирующих findById для общего asset', async () => {
      const assetAId = new Types.ObjectId();
      const assetBId = new Types.ObjectId();
      const assetCId = new Types.ObjectId();
      const assetA = makeAsset({ _id: assetAId });
      const assetB = makeAsset({ _id: assetBId });
      const assetC = makeAsset({ _id: assetCId });
      const findByIdSpy = jest.fn().mockImplementation((id: Types.ObjectId) => {
        if (id.equals(assetAId)) return Promise.resolve(assetA);
        if (id.equals(assetBId)) return Promise.resolve(assetB);
        if (id.equals(assetCId)) return Promise.resolve(assetC);
        return Promise.resolve(null);
      });
      const listForReviewSpy = jest.fn().mockResolvedValue([
        { _id: new Types.ObjectId(), propertyAssetIdA: assetAId, propertyAssetIdB: assetBId, status: 'detected' },
        // assetB встречается во второй паре тоже — не должен резолвиться дважды.
        { _id: new Types.ObjectId(), propertyAssetIdA: assetBId, propertyAssetIdB: assetCId, status: 'detected' },
      ]);

      const service = makeService({
        propertyAssetRepository: { findById: findByIdSpy } as never,
        duplicateCandidateRepository: { listForReview: listForReviewSpy } as never,
      });

      const result = await service.listForAdminReview({ statuses: ['detected'], limit: 20 });

      expect(listForReviewSpy).toHaveBeenCalledWith(['detected'], { cursor: undefined, limit: 20 });
      expect(findByIdSpy).toHaveBeenCalledTimes(3); // A, B, C — не 4 (B резолвится один раз, не дважды)
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ assetA, assetB });
      expect(result[1]).toMatchObject({ assetA: assetB, assetB: assetC });
    });

    it('отсутствующий asset (удалён/несогласован) резолвится в null, не бросает', async () => {
      const assetAId = new Types.ObjectId();
      const assetBId = new Types.ObjectId();
      const service = makeService({
        propertyAssetRepository: { findById: jest.fn().mockResolvedValue(null) } as never,
        duplicateCandidateRepository: {
          listForReview: jest
            .fn()
            .mockResolvedValue([{ _id: new Types.ObjectId(), propertyAssetIdA: assetAId, propertyAssetIdB: assetBId, status: 'detected' }]),
        } as never,
      });

      const result = await service.listForAdminReview({ statuses: ['detected'], limit: 20 });

      expect(result[0]).toMatchObject({ assetA: null, assetB: null });
    });
  });

  describe('confirmDuplicate', () => {
    it('бросает NotFoundException, если candidate не найден', async () => {
      const service = makeService({ duplicateCandidateRepository: { findById: jest.fn().mockResolvedValue(null) } as never });

      await expect(
        service.confirmDuplicate({
          duplicateCandidateId: new Types.ObjectId(),
          confirmByAdminAccountId: new Types.ObjectId(),
          reason: 'Verified same physical unit by phone',
          correlationId: 'corr',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('бросает ConflictException, если уже confirmed_duplicate (modifiedCount:0), не пишет audit', async () => {
      const appendSpy = jest.fn();
      const service = makeService({
        duplicateCandidateRepository: {
          findById: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), status: 'confirmed_duplicate' }),
          markConfirmedDuplicate: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
        } as never,
        auditService: { append: appendSpy } as never,
      });

      await expect(
        service.confirmDuplicate({
          duplicateCandidateId: new Types.ObjectId(),
          confirmByAdminAccountId: new Types.ObjectId(),
          reason: 'Verified same physical unit by phone',
          correlationId: 'corr',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(appendSpy).not.toHaveBeenCalled();
    });

    it('успешный confirm пишет audit с actor:admin_account, action и reason', async () => {
      const appendSpy = jest.fn().mockResolvedValue(undefined);
      const duplicateCandidateId = new Types.ObjectId();
      const confirmByAdminAccountId = new Types.ObjectId();
      const markSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
      const service = makeService({
        duplicateCandidateRepository: {
          findById: jest.fn().mockResolvedValue({ _id: duplicateCandidateId, status: 'detected' }),
          markConfirmedDuplicate: markSpy,
        } as never,
        auditService: { append: appendSpy } as never,
      });

      await service.confirmDuplicate({
        duplicateCandidateId,
        confirmByAdminAccountId,
        reason: 'Verified same physical unit by phone',
        correlationId: 'corr',
      });

      expect(markSpy).toHaveBeenCalledWith(
        duplicateCandidateId,
        { reason: 'Verified same physical unit by phone', confirmByAdminAccountId },
        expect.anything(),
      );
      expect(appendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: { type: 'admin_account', id: confirmByAdminAccountId },
          action: 'duplicate_candidate.confirm',
          resourceId: duplicateCandidateId,
          reason: 'Verified same physical unit by phone',
        }),
        expect.anything(),
      );
    });
  });
});

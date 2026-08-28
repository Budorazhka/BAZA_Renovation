import { ConflictException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ActualityService } from './actuality.service';
import type { ListingRepository, PropertyAssetRepository } from '@baza/property-assets';
import type { PublicationService } from '../publication/publication.service';

function makeMockConnection() {
  return {
    startSession: jest.fn().mockResolvedValue({
      withTransaction: async (work: () => Promise<unknown>) => work(),
      endSession: jest.fn().mockResolvedValue(undefined),
    }),
  };
}

function makeService(overrides: {
  listingRepository?: Partial<ListingRepository>;
  propertyAssetRepository?: Partial<PropertyAssetRepository>;
  publicationService?: Partial<PublicationService>;
} = {}) {
  return new ActualityService(
    (overrides.listingRepository ?? {}) as ListingRepository,
    (overrides.propertyAssetRepository ?? {}) as PropertyAssetRepository,
    (overrides.publicationService ?? {}) as PublicationService,
    makeMockConnection() as never,
  );
}

describe('ActualityService', () => {
  describe('confirmActuality', () => {
    it('чужая организация — NotFoundException', async () => {
      const service = makeService({ listingRepository: { findByIdForOrganization: jest.fn().mockResolvedValue(null) } as never });

      await expect(
        service.confirmActuality({ listingId: new Types.ObjectId(), assetId: new Types.ObjectId(), organizationId: new Types.ObjectId(), expectedVersion: 0 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('отклоняет для listing в статусе draft/archived', async () => {
      const listingId = new Types.ObjectId();
      const assetId = new Types.ObjectId();
      const draftService = makeService({
        listingRepository: { findByIdForOrganization: jest.fn().mockResolvedValue({ _id: listingId, propertyAssetId: assetId, status: 'draft' }) } as never,
      });
      const archivedService = makeService({
        listingRepository: { findByIdForOrganization: jest.fn().mockResolvedValue({ _id: listingId, propertyAssetId: assetId, status: 'archived' }) } as never,
      });

      await expect(
        draftService.confirmActuality({ listingId, assetId, organizationId: new Types.ObjectId(), expectedVersion: 0 }),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        archivedService.confirmActuality({ listingId, assetId, organizationId: new Types.ObjectId(), expectedVersion: 0 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('РАЗРЕШАЕТ для listing в статусе expired (owner decision xlsx #57 — единственный путь реактивации просроченного listing)', async () => {
      const listingId = new Types.ObjectId();
      const assetId = new Types.ObjectId();
      const confirmActualitySpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
      const service = makeService({
        listingRepository: {
          findByIdForOrganization: jest.fn().mockResolvedValue({ _id: listingId, propertyAssetId: assetId, status: 'expired' }),
          confirmActuality: confirmActualitySpy,
        } as never,
      });

      await expect(
        service.confirmActuality({ listingId, assetId, organizationId: new Types.ObjectId(), expectedVersion: 0 }),
      ).resolves.toBeUndefined();
      expect(confirmActualitySpy).toHaveBeenCalled();
    });

    it('вызывает listingRepository.confirmActuality с expectedVersion и текущей датой', async () => {
      const listingId = new Types.ObjectId();
      const assetId = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const confirmActualitySpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
      const service = makeService({
        listingRepository: {
          findByIdForOrganization: jest.fn().mockResolvedValue({ _id: listingId, propertyAssetId: assetId, status: 'active' }),
          confirmActuality: confirmActualitySpy,
        } as never,
      });

      await service.confirmActuality({ listingId, assetId, organizationId, expectedVersion: 3 });

      expect(confirmActualitySpy).toHaveBeenCalledWith(listingId, organizationId, 3, expect.any(Date));
    });

    it('modifiedCount:0 — ConflictException (version conflict)', async () => {
      const listingId = new Types.ObjectId();
      const assetId = new Types.ObjectId();
      const service = makeService({
        listingRepository: {
          findByIdForOrganization: jest.fn().mockResolvedValue({ _id: listingId, propertyAssetId: assetId, status: 'active' }),
          confirmActuality: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
        } as never,
      });

      await expect(
        service.confirmActuality({ listingId, assetId, organizationId: new Types.ObjectId(), expectedVersion: 3 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('getActualityState', () => {
    it('вычисляет category/thresholds/state по dealType+propertyType', async () => {
      const listingId = new Types.ObjectId();
      const assetId = new Types.ObjectId();
      const lastConfirmedAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const service = makeService({
        listingRepository: {
          findByIdForOrganization: jest.fn().mockResolvedValue({ _id: listingId, propertyAssetId: assetId, status: 'active', dealType: 'sale', lastConfirmedAt }),
        } as never,
        propertyAssetRepository: { findById: jest.fn().mockResolvedValue({ propertyType: 'apartment' }) } as never,
      });

      const result = await service.getActualityState(listingId, assetId, new Types.ObjectId());

      expect(result.category).toBe('secondary');
      expect(result.thresholds).toEqual({ warningDays: 28, overdueDays: 60 });
      expect(result.state).toBe('needs_attention');
    });

    it('state:null для listing не в статусе active (actuality не имеет смысла для draft/expired/archived)', async () => {
      const listingId = new Types.ObjectId();
      const assetId = new Types.ObjectId();
      const service = makeService({
        listingRepository: {
          findByIdForOrganization: jest.fn().mockResolvedValue({ _id: listingId, propertyAssetId: assetId, status: 'draft', dealType: 'sale', createdAt: new Date() }),
        } as never,
        propertyAssetRepository: { findById: jest.fn().mockResolvedValue({ propertyType: 'apartment' }) } as never,
      });

      const result = await service.getActualityState(listingId, assetId, new Types.ObjectId());

      expect(result.state).toBeNull();
    });
  });

  describe('marketplace publishing wizard — identity-scoped методы', () => {
    it('confirmActualityForIdentity делегирует в listingRepository.confirmActualityForIdentity', async () => {
      const listingId = new Types.ObjectId();
      const assetId = new Types.ObjectId();
      const identityId = new Types.ObjectId();
      const confirmActualityForIdentitySpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
      const service = makeService({
        listingRepository: {
          findByIdForIdentity: jest.fn().mockResolvedValue({ _id: listingId, propertyAssetId: assetId, status: 'active' }),
          confirmActualityForIdentity: confirmActualityForIdentitySpy,
        } as never,
      });

      await service.confirmActualityForIdentity({ listingId, assetId, identityId, expectedVersion: 2 });

      expect(confirmActualityForIdentitySpy).toHaveBeenCalledWith(listingId, identityId, 2, expect.any(Date));
    });

    it('confirmActualityForIdentity бросает единый 404 для чужого identityId', async () => {
      const service = makeService({ listingRepository: { findByIdForIdentity: jest.fn().mockResolvedValue(null) } as never });

      await expect(
        service.confirmActualityForIdentity({ listingId: new Types.ObjectId(), assetId: new Types.ObjectId(), identityId: new Types.ObjectId(), expectedVersion: 0 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('getActualityStateForIdentity вычисляет category/thresholds/state по dealType+propertyType', async () => {
      const listingId = new Types.ObjectId();
      const assetId = new Types.ObjectId();
      const lastConfirmedAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      const service = makeService({
        listingRepository: {
          findByIdForIdentity: jest.fn().mockResolvedValue({ _id: listingId, propertyAssetId: assetId, status: 'active', dealType: 'rent_long', lastConfirmedAt }),
        } as never,
        propertyAssetRepository: { findById: jest.fn().mockResolvedValue({ propertyType: 'apartment' }) } as never,
      });

      const result = await service.getActualityStateForIdentity(listingId, assetId, new Types.ObjectId());

      expect(result.category).toBe('rent');
      expect(result.thresholds).toEqual({ warningDays: 14, overdueDays: 21 });
    });
  });

  describe('expireOverdueListings', () => {
    it('переводит просроченный listing в expired и вызывает PublicationService.unpublish с actorType:system', async () => {
      const listingId = new Types.ObjectId();
      const assetId = new Types.ObjectId();
      const overdueDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
      const markExpiredSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
      const unpublishSpy = jest.fn().mockResolvedValue(undefined);

      const service = makeService({
        listingRepository: {
          findActiveListingsConfirmedBefore: jest
            .fn()
            .mockResolvedValueOnce([{ _id: listingId, propertyAssetId: assetId, dealType: 'sale', version: 2, lastConfirmedAt: overdueDate, createdAt: overdueDate }])
            .mockResolvedValueOnce([]),
          markExpired: markExpiredSpy,
        } as never,
        propertyAssetRepository: { findById: jest.fn().mockResolvedValue({ propertyType: 'apartment' }) } as never,
        publicationService: { unpublish: unpublishSpy } as never,
      });

      const result = await service.expireOverdueListings();

      expect(markExpiredSpy).toHaveBeenCalledWith(listingId, 2, expect.anything());
      expect(unpublishSpy).toHaveBeenCalledWith(expect.objectContaining({ sourceType: 'listing', sourceId: listingId, actorType: 'system' }), expect.anything());
      expect(result.expiredCount).toBe(1);
      expect(result.errors).toBe(0);
    });

    it('НЕ трогает listing, чей СОБСТВЕННЫЙ (более узкий) порог ещё не истёк, даже если попал в широкий pre-filter', async () => {
      const listingId = new Types.ObjectId();
      const assetId = new Types.ObjectId();
      // 25 дней просрочки: попадает в widestCutoff (secondary=60д), но НЕ
      // достаточно для rent (21д)... на самом деле 25 > 21, значит это ПЛОХОЙ
      // пример — нужен диапазон между rent(21) и secondary(60) для rent-listing,
      // где 25 дней уже просрочены для rent. Используем 15 дней — просрочены
      // для 'other' (15д), но НЕ для rent (21д) — тест должен показать, что
      // rent-listing с 15-дневной просрочкой НЕ считается expired.
      const notYetOverdueForRent = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
      const markExpiredSpy = jest.fn();

      const service = makeService({
        listingRepository: {
          findActiveListingsConfirmedBefore: jest
            .fn()
            .mockResolvedValueOnce([{ _id: listingId, propertyAssetId: assetId, dealType: 'rent_long', version: 0, lastConfirmedAt: notYetOverdueForRent, createdAt: notYetOverdueForRent }])
            .mockResolvedValueOnce([]),
          markExpired: markExpiredSpy,
        } as never,
        propertyAssetRepository: { findById: jest.fn().mockResolvedValue({ propertyType: 'apartment' }) } as never,
      });

      const result = await service.expireOverdueListings();

      expect(markExpiredSpy).not.toHaveBeenCalled();
      expect(result.expiredCount).toBe(0);
    });

    it('продолжает обработку остальных listings, если один упал с ошибкой (errors counter)', async () => {
      const listingId1 = new Types.ObjectId();
      const listingId2 = new Types.ObjectId();
      const assetId = new Types.ObjectId();
      const overdueDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);

      const service = makeService({
        listingRepository: {
          findActiveListingsConfirmedBefore: jest
            .fn()
            .mockResolvedValueOnce([
              { _id: listingId1, propertyAssetId: assetId, dealType: 'sale', version: 0, lastConfirmedAt: overdueDate, createdAt: overdueDate },
              { _id: listingId2, propertyAssetId: assetId, dealType: 'sale', version: 0, lastConfirmedAt: overdueDate, createdAt: overdueDate },
            ])
            .mockResolvedValueOnce([]),
          markExpired: jest.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ modifiedCount: 1 }),
        } as never,
        propertyAssetRepository: { findById: jest.fn().mockResolvedValue({ propertyType: 'apartment' }) } as never,
        publicationService: { unpublish: jest.fn().mockResolvedValue(undefined) } as never,
      });

      const result = await service.expireOverdueListings();

      expect(result.errors).toBe(1);
      expect(result.expiredCount).toBe(1);
    });

    it('не бросает, если PublicationService.unpublish упал (например publication не published) — listing остаётся expired', async () => {
      const listingId = new Types.ObjectId();
      const assetId = new Types.ObjectId();
      const overdueDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);

      const service = makeService({
        listingRepository: {
          findActiveListingsConfirmedBefore: jest
            .fn()
            .mockResolvedValueOnce([{ _id: listingId, propertyAssetId: assetId, dealType: 'sale', version: 0, lastConfirmedAt: overdueDate, createdAt: overdueDate }])
            .mockResolvedValueOnce([]),
          markExpired: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
        } as never,
        propertyAssetRepository: { findById: jest.fn().mockResolvedValue({ propertyType: 'apartment' }) } as never,
        publicationService: { unpublish: jest.fn().mockRejectedValue(new ConflictException('not published')) } as never,
      });

      const result = await service.expireOverdueListings();

      expect(result.expiredCount).toBe(1);
      expect(result.errors).toBe(0);
    });
  });
});

import { ConflictException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { MarketplacePropertyAssetsService } from './marketplace-property-assets.service';
import type { PropertyAssetRepository, ListingRepository } from '@baza/property-assets';
import type { PublicationService } from '../publication/publication.service';
import type { MarketplacePublicationRepository } from '@baza/publication';
import type { IdempotencyService } from '../../shared/idempotency/idempotency.service';
import type { DedupeService } from './dedupe.service';
import type { MediaService } from '../media/media.service';

const assetDto = {
  propertyType: 'apartment' as const,
  location: {
    country: 'GE',
    city: 'Batumi',
    address: '1 Rustaveli St',
    geo: { type: 'Point' as const, coordinates: [41.6, 41.64] as [number, number] },
  },
  characteristics: { area: 55, rooms: 2 },
  representativePhone: '+995500000001',
};

const price = { amountMinorUnits: 100_000_00, currency: 'USD' as const };

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
  listingRepository?: Partial<ListingRepository>;
  publicationService?: Partial<PublicationService>;
  publicationRepository?: Partial<MarketplacePublicationRepository>;
  idempotencyService?: Partial<IdempotencyService>;
  dedupeService?: Partial<DedupeService>;
  mediaService?: Partial<MediaService>;
} = {}) {
  return new MarketplacePropertyAssetsService(
    (overrides.propertyAssetRepository ?? {}) as PropertyAssetRepository,
    (overrides.listingRepository ?? {}) as ListingRepository,
    (overrides.publicationService ?? {}) as PublicationService,
    (overrides.publicationRepository ?? { findBySource: jest.fn().mockResolvedValue(null) }) as MarketplacePublicationRepository,
    // MKT-002-IDEMP-RACE-001: awaitReplay по умолчанию null, см. тот же
    // комментарий в property-assets.service.spec.ts.
    ({
      record: jest.fn().mockResolvedValue(undefined),
      checkReplay: jest.fn().mockResolvedValue(null),
      awaitReplay: jest.fn().mockResolvedValue(null),
      ...overrides.idempotencyService,
    }) as IdempotencyService,
    (overrides.dedupeService ?? { assertNoBlockingDuplicates: jest.fn().mockResolvedValue(undefined), scanForDuplicates: jest.fn().mockResolvedValue(undefined) }) as DedupeService,
    (overrides.mediaService ?? { createUploadIntent: jest.fn(), confirmUpload: jest.fn(), getAssetsForOwnerScope: jest.fn(), getPublicUrl: jest.fn((k: string) => `https://cdn.example.com/${k}`) }) as unknown as MediaService,
    makeMockConnection() as never,
  );
}

describe('MarketplacePropertyAssetsService', () => {
  it('createAsset записывает publisherScope:{type:marketplace_account, identityId}, не organization', async () => {
    const identityId = new Types.ObjectId();
    const assetRepository = { create: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }) };
    const service = makeService({ propertyAssetRepository: assetRepository as never });

    await service.createAsset(identityId, assetDto);

    expect(assetRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ publisherScope: { type: 'marketplace_account', identityId }, representativePhone: assetDto.representativePhone }),
    );
  });

  it('createAsset запускает DedupeService.scanForDuplicates (best-effort, не откатывает создание при сбое)', async () => {
    const assetId = new Types.ObjectId();
    const assetRepository = { create: jest.fn().mockResolvedValue({ _id: assetId }) };
    const scanForDuplicatesSpy = jest.fn().mockRejectedValue(new Error('boom'));
    const service = makeService({
      propertyAssetRepository: assetRepository as never,
      dedupeService: { scanForDuplicates: scanForDuplicatesSpy, assertNoBlockingDuplicates: jest.fn() } as never,
    });

    const result = await service.createAsset(new Types.ObjectId(), assetDto);

    expect(scanForDuplicatesSpy).toHaveBeenCalledWith(assetId);
    expect(result._id).toBe(assetId);
  });

  it('getAsset делегирует в findByIdForIdentity, бросает единый 404 для чужого identityId', async () => {
    const service = makeService({ propertyAssetRepository: { findByIdForIdentity: jest.fn().mockResolvedValue(null) } as never });

    await expect(service.getAsset(new Types.ObjectId(), new Types.ObjectId())).rejects.toBeInstanceOf(NotFoundException);
  });

  it('createListing записывает publisherScope:marketplace_account на Listing', async () => {
    const assetId = new Types.ObjectId();
    const identityId = new Types.ObjectId();
    const assetRepository = { findByIdForIdentity: jest.fn().mockResolvedValue({ _id: assetId }) };
    const listingRepository = { create: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }) };
    const service = makeService({ propertyAssetRepository: assetRepository as never, listingRepository: listingRepository as never });

    await service.createListing(assetId, identityId, { dealType: 'sale', price });

    expect(listingRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ publisherScope: { type: 'marketplace_account', identityId }, dealType: 'sale' }),
    );
  });

  describe('publishListing', () => {
    it('CAS-инкрементирует version через markPublishingForIdentity и вызывает requestPublication с publisherScope:marketplace_account', async () => {
      const listingId = new Types.ObjectId();
      const assetId = new Types.ObjectId();
      const identityId = new Types.ObjectId();
      const markPublishingForIdentitySpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
      const requestPublicationSpy = jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), status: 'publication_pending' });

      const service = makeService({
        listingRepository: {
          findByIdForIdentity: jest.fn().mockResolvedValue({ _id: listingId, propertyAssetId: assetId, status: 'active', version: 1 }),
          markPublishingForIdentity: markPublishingForIdentitySpy,
        } as never,
        publicationService: { requestPublication: requestPublicationSpy } as never,
      });

      await service.publishListing({ listingId, assetId, identityId, idempotencyKey: 'key', correlationId: 'corr' });

      expect(markPublishingForIdentitySpy).toHaveBeenCalledWith(listingId, identityId, 1, expect.anything());
      expect(requestPublicationSpy).toHaveBeenCalledWith(
        expect.objectContaining({ sourceType: 'listing', sourceId: listingId, publisherScope: { type: 'marketplace_account', identityId } }),
        expect.anything(),
      );
    });

    it('DEDUPE-001 gate: отклоняет publish, если assertNoBlockingDuplicates бросает (тот же gate, что ERP-сторона)', async () => {
      const listingId = new Types.ObjectId();
      const assetId = new Types.ObjectId();
      const markPublishingForIdentitySpy = jest.fn();
      const service = makeService({
        listingRepository: {
          findByIdForIdentity: jest.fn().mockResolvedValue({ _id: listingId, propertyAssetId: assetId, status: 'active', version: 1 }),
          markPublishingForIdentity: markPublishingForIdentitySpy,
        } as never,
        dedupeService: { assertNoBlockingDuplicates: jest.fn().mockRejectedValue(new ConflictException('duplicate')) } as never,
      });

      await expect(
        service.publishListing({ listingId, assetId, identityId: new Types.ObjectId(), idempotencyKey: 'key', correlationId: 'corr' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(markPublishingForIdentitySpy).not.toHaveBeenCalled();
    });

    it('чужой identityId получает единый 404, не раскрывает существование listing', async () => {
      const service = makeService({ listingRepository: { findByIdForIdentity: jest.fn().mockResolvedValue(null) } as never });

      await expect(
        service.publishListing({ listingId: new Types.ObjectId(), assetId: new Types.ObjectId(), identityId: new Types.ObjectId(), idempotencyKey: 'key', correlationId: 'corr' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('отклоняет повторный publish с новым ключом на уже published listing (тот же re-publish guard, что ERP)', async () => {
      const listingId = new Types.ObjectId();
      const assetId = new Types.ObjectId();
      const markPublishingForIdentitySpy = jest.fn();
      const service = makeService({
        listingRepository: {
          findByIdForIdentity: jest.fn().mockResolvedValue({ _id: listingId, propertyAssetId: assetId, status: 'active', version: 1 }),
          markPublishingForIdentity: markPublishingForIdentitySpy,
        } as never,
        publicationRepository: { findBySource: jest.fn().mockResolvedValue({ status: 'published' }) } as never,
      });

      await expect(
        service.publishListing({ listingId, assetId, identityId: new Types.ObjectId(), idempotencyKey: 'new-key', correlationId: 'corr' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(markPublishingForIdentitySpy).not.toHaveBeenCalled();
    });
  });

  describe('unpublishListing', () => {
    it('вызывает PublicationService.unpublish с actorType:identity', async () => {
      const listingId = new Types.ObjectId();
      const assetId = new Types.ObjectId();
      const identityId = new Types.ObjectId();
      const unpublishSpy = jest.fn().mockResolvedValue(undefined);
      const service = makeService({
        listingRepository: { findByIdForIdentity: jest.fn().mockResolvedValue({ _id: listingId, propertyAssetId: assetId }) } as never,
        publicationService: { unpublish: unpublishSpy } as never,
      });

      await service.unpublishListing({ listingId, assetId, identityId, reason: 'No longer available', correlationId: 'corr' });

      expect(unpublishSpy).toHaveBeenCalledWith(
        expect.objectContaining({ sourceType: 'listing', sourceId: listingId, actorType: 'identity', actorId: identityId, reason: 'No longer available' }),
        expect.anything(),
      );
    });
  });

  describe('getListingPublicationStatus', () => {
    it('делегирует в publicationRepository.findBySource, бросает PUBLICATION_NOT_FOUND если не запускалась', async () => {
      const listingId = new Types.ObjectId();
      const assetId = new Types.ObjectId();
      const service = makeService({
        listingRepository: { findByIdForIdentity: jest.fn().mockResolvedValue({ _id: listingId, propertyAssetId: assetId }) } as never,
        publicationRepository: { findBySource: jest.fn().mockResolvedValue(null) } as never,
      });

      await expect(service.getListingPublicationStatus(listingId, assetId, new Types.ObjectId())).rejects.toMatchObject({ code: 'PUBLICATION_NOT_FOUND' });
    });
  });
  describe('Marketplace Media vertical (MKT-004)', () => {
    it('createMediaUploadIntent sets ownerScope type: marketplace_account', async () => {
      const assetId = new Types.ObjectId();
      const identityId = new Types.ObjectId();
      const assetRepo = {
        findByIdForIdentity: jest.fn().mockResolvedValue({ _id: assetId, media: [] }),
      };
      const mediaService = {
        createUploadIntent: jest.fn().mockResolvedValue({ assetId: 'media-999', uploadUrl: 'https://minio.test/upload' }),
      };
      const service = makeService({ propertyAssetRepository: assetRepo as unknown as PropertyAssetRepository, mediaService });

      const res = await service.createMediaUploadIntent(assetId, identityId, {
        declaredMimeType: 'image/png',
        sizeBytes: 500_000,
      });

      expect(res.mediaAssetId).toBe('media-999');
      expect(mediaService.createUploadIntent).toHaveBeenCalledWith({
        ownerScope: { type: 'marketplace_account', identityId },
        declaredMimeType: 'image/png',
        sizeBytes: 500_000,
        purpose: 'property_photo',
        bucket: 'public',
      });
    });
  });

});

import { ConflictException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { PropertyAssetsService } from './property-assets.service';
import type { PropertyAssetRepository, ListingRepository, PropertyAssetMediaItem } from '@baza/property-assets';
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
  return new PropertyAssetsService(
    (overrides.propertyAssetRepository ?? {}) as PropertyAssetRepository,
    (overrides.listingRepository ?? {}) as ListingRepository,
    (overrides.publicationService ?? {}) as PublicationService,
    // Дефолт — null (нет существующей публикации), чтобы существующие
    // publishListing-тесты (не про этот guard) не ломались новым
    // pre-publish check'ом; тесты именно на re-publish guard переопределяют
    // findBySource явно.
    (overrides.publicationRepository ?? { findBySource: jest.fn().mockResolvedValue(null) }) as MarketplacePublicationRepository,
    // awaitReplay по умолчанию null (не находит replay в течение окна) —
    // тесты именно на MKT-002-IDEMP-RACE-001 bounded-retry переопределяют
    // его явно; остальные publishListing-тесты, ожидающие "чистый"
    // ConflictException без гонки, не должны молча начать делать реальный
    // (медленный) bounded-retry с настоящими setTimeout по умолчанию.
    ({
      record: jest.fn().mockResolvedValue(undefined),
      checkReplay: jest.fn().mockResolvedValue(null),
      awaitReplay: jest.fn().mockResolvedValue(null),
      ...overrides.idempotencyService,
    }) as IdempotencyService,
    // Дефолт — no-op (нет блокирующих дублей), чтобы существующие
    // publishListing-тесты (не про DEDUPE-001) не ломались новым gate'ом;
    // тесты именно на dedupe-блокировку переопределяют assertNoBlockingDuplicates.
    (overrides.dedupeService ?? { assertNoBlockingDuplicates: jest.fn().mockResolvedValue(undefined), scanForDuplicates: jest.fn().mockResolvedValue(undefined) }) as DedupeService,
    (overrides.mediaService ?? { createUploadIntent: jest.fn(), confirmUpload: jest.fn(), getAssetsForOwnerScope: jest.fn(), getPublicUrl: jest.fn((k: string) => `https://cdn.example.com/${k}`) }) as unknown as MediaService,
    makeMockConnection() as never,
  );
}

describe('PropertyAssetsService', () => {
  it('creates organization-owned assets without trusting client scope', async () => {
    const assetRepository = { create: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }) };
    const service = makeService({ propertyAssetRepository: assetRepository as never });
    const organizationId = new Types.ObjectId();

    await service.createAsset(organizationId, assetDto);

    expect(assetRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ publisherScope: { type: 'organization', organizationId }, representativePhone: assetDto.representativePhone }),
    );
  });

  describe('createAsset — DEDUPE-001 scan (best-effort)', () => {
    it('вызывает dedupeService.scanForDuplicates с id только что созданного asset', async () => {
      const assetId = new Types.ObjectId();
      const assetRepository = { create: jest.fn().mockResolvedValue({ _id: assetId }) };
      const scanForDuplicatesSpy = jest.fn().mockResolvedValue(undefined);
      const service = makeService({
        propertyAssetRepository: assetRepository as never,
        dedupeService: { scanForDuplicates: scanForDuplicatesSpy, assertNoBlockingDuplicates: jest.fn() } as never,
      });

      await service.createAsset(new Types.ObjectId(), assetDto);

      expect(scanForDuplicatesSpy).toHaveBeenCalledWith(assetId);
    });

    it('НЕ откатывает создание asset, если scanForDuplicates упал (best-effort, не критическая часть транзакции)', async () => {
      const assetId = new Types.ObjectId();
      const assetRepository = { create: jest.fn().mockResolvedValue({ _id: assetId }) };
      const service = makeService({
        propertyAssetRepository: assetRepository as never,
        dedupeService: { scanForDuplicates: jest.fn().mockRejectedValue(new Error('dedupe scan boom')), assertNoBlockingDuplicates: jest.fn() } as never,
      });

      const result = await service.createAsset(new Types.ObjectId(), assetDto);

      expect(result._id).toBe(assetId);
    });
  });

  it('allows independent sale and long-rent listings on one asset', async () => {
    const assetId = new Types.ObjectId();
    const organizationId = new Types.ObjectId();
    const assetRepository = { findByIdForOrganization: jest.fn().mockResolvedValue({ _id: assetId }) };
    const listingRepository = { create: jest.fn().mockImplementation(async (input) => ({ _id: new Types.ObjectId(), ...input })) };
    const service = makeService({ propertyAssetRepository: assetRepository as never, listingRepository: listingRepository as never });

    await service.createListing(assetId, organizationId, { dealType: 'sale', price });
    await service.createListing(assetId, organizationId, { dealType: 'rent_long', price });

    expect(listingRepository.create).toHaveBeenCalledTimes(2);
    expect(listingRepository.create.mock.calls.map(([input]) => input.dealType)).toEqual(['sale', 'rent_long']);
  });

  it('does not create a listing for another organization asset', async () => {
    const assetRepository = { findByIdForOrganization: jest.fn().mockResolvedValue(null) };
    const listingRepository = { create: jest.fn() };
    const service = makeService({ propertyAssetRepository: assetRepository as never, listingRepository: listingRepository as never });

    await expect(
      service.createListing(new Types.ObjectId(), new Types.ObjectId(), { dealType: 'sale', price }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(listingRepository.create).not.toHaveBeenCalled();
  });

  it('rejects a second active listing for the same deal type', async () => {
    const listingId = new Types.ObjectId();
    const assetId = new Types.ObjectId();
    const organizationId = new Types.ObjectId();
    const assetRepository = { findByIdForOrganization: jest.fn() };
    const listingRepository = {
      findByIdForOrganization: jest.fn().mockResolvedValue({ _id: listingId, propertyAssetId: assetId, dealType: 'sale' }),
      findActiveForDealType: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
      activate: jest.fn(),
    };
    const service = makeService({ propertyAssetRepository: assetRepository as never, listingRepository: listingRepository as never });

    await expect(service.activateListing(listingId, assetId, organizationId)).rejects.toBeInstanceOf(ConflictException);
    expect(listingRepository.activate).not.toHaveBeenCalled();
  });

  it('rejects a listing when the parent asset in the URL does not match', async () => {
    const listingAssetId = new Types.ObjectId();
    const wrongAssetId = new Types.ObjectId();
    const listingId = new Types.ObjectId();
    const listingRepository = {
      findByIdForOrganization: jest.fn().mockResolvedValue({ _id: listingId, propertyAssetId: listingAssetId, dealType: 'sale' }),
    };
    const service = makeService({ listingRepository: listingRepository as never });

    await expect(service.activateListing(listingId, wrongAssetId, new Types.ObjectId())).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('publishListing', () => {
    it('CAS-инкрементирует version только из status:active И вызывает PublicationService.requestPublication И записывает idempotency-record', async () => {
      const listingId = new Types.ObjectId();
      const assetId = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const actorIdentityId = new Types.ObjectId();
      const markPublishingSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
      const requestPublicationSpy = jest.fn().mockResolvedValue({
        _id: new Types.ObjectId(),
        status: 'publication_pending',
      });
      const recordSpy = jest.fn().mockResolvedValue(undefined);

      const service = makeService({
        listingRepository: {
          findByIdForOrganization: jest.fn().mockResolvedValue({ _id: listingId, propertyAssetId: assetId, status: 'active', version: 5 }),
          markPublishing: markPublishingSpy,
        } as never,
        publicationService: { requestPublication: requestPublicationSpy } as never,
        idempotencyService: { record: recordSpy, checkReplay: jest.fn().mockResolvedValue(null) } as never,
      });

      const result = await service.publishListing({
        listingId,
        assetId,
        organizationId,
        actorIdentityId,
        idempotencyKey: 'test-idempotency-key',
        correlationId: 'test-correlation-id',
      });

      expect(markPublishingSpy).toHaveBeenCalledWith(listingId, organizationId, 5, expect.anything());
      expect(requestPublicationSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceType: 'listing',
          sourceId: listingId,
          publisherScope: { type: 'organization', organizationId },
        }),
        expect.anything(),
      );
      expect(result).toEqual({ publicationId: expect.any(Types.ObjectId), status: 'publication_pending' });

      expect(recordSpy).toHaveBeenCalledTimes(1);
      const [recordParams] = recordSpy.mock.calls[0] as [
        { identityId: typeof actorIdentityId; operation: string; key: string; responseStatus: number },
      ];
      expect(recordParams.identityId).toBe(actorIdentityId);
      expect(recordParams.operation).toBe('publishListing');
      expect(recordParams.key).toBe('test-idempotency-key');
      expect(recordParams.responseStatus).toBe(202);
    });

    it('DEDUPE-001: отклоняет publish, если dedupeService.assertNoBlockingDuplicates бросает (явный дубль блокирует публикацию)', async () => {
      const listingId = new Types.ObjectId();
      const assetId = new Types.ObjectId();
      const markPublishingSpy = jest.fn();
      const service = makeService({
        listingRepository: {
          findByIdForOrganization: jest.fn().mockResolvedValue({ _id: listingId, propertyAssetId: assetId, status: 'active', version: 1 }),
          markPublishing: markPublishingSpy,
        } as never,
        dedupeService: { assertNoBlockingDuplicates: jest.fn().mockRejectedValue(new ConflictException('duplicate')) } as never,
        idempotencyService: { checkReplay: jest.fn().mockResolvedValue(null), record: jest.fn() } as never,
      });

      await expect(
        service.publishListing({
          listingId,
          assetId,
          organizationId: new Types.ObjectId(),
          actorIdentityId: new Types.ObjectId(),
          idempotencyKey: 'key',
          correlationId: 'corr',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(markPublishingSpy).not.toHaveBeenCalled();
    });

    it('DEDUPE-001: вызывает assertNoBlockingDuplicates с assetId, не listingId', async () => {
      const listingId = new Types.ObjectId();
      const assetId = new Types.ObjectId();
      const assertNoBlockingDuplicatesSpy = jest.fn().mockResolvedValue(undefined);
      const service = makeService({
        listingRepository: {
          findByIdForOrganization: jest.fn().mockResolvedValue({ _id: listingId, propertyAssetId: assetId, status: 'active', version: 1 }),
          markPublishing: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
        } as never,
        dedupeService: { assertNoBlockingDuplicates: assertNoBlockingDuplicatesSpy } as never,
        publicationService: { requestPublication: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), status: 'publication_pending' }) } as never,
        idempotencyService: { checkReplay: jest.fn().mockResolvedValue(null), record: jest.fn().mockResolvedValue(undefined) } as never,
      });

      await service.publishListing({
        listingId,
        assetId,
        organizationId: new Types.ObjectId(),
        actorIdentityId: new Types.ObjectId(),
        idempotencyKey: 'key',
        correlationId: 'corr',
      });

      expect(assertNoBlockingDuplicatesSpy).toHaveBeenCalledWith(assetId);
    });

    it('отклоняет publish для listing в статусе draft (ещё не активирован)', async () => {
      const listingId = new Types.ObjectId();
      const assetId = new Types.ObjectId();
      const service = makeService({
        listingRepository: {
          findByIdForOrganization: jest.fn().mockResolvedValue({ _id: listingId, propertyAssetId: assetId, status: 'draft' }),
        } as never,
        idempotencyService: { checkReplay: jest.fn().mockResolvedValue(null), record: jest.fn() } as never,
      });

      await expect(
        service.publishListing({
          listingId,
          assetId,
          organizationId: new Types.ObjectId(),
          actorIdentityId: new Types.ObjectId(),
          idempotencyKey: 'key',
          correlationId: 'corr',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('отклоняет publish для listing в статусе expired (actuality-выбытие)', async () => {
      const listingId = new Types.ObjectId();
      const assetId = new Types.ObjectId();
      const service = makeService({
        listingRepository: {
          findByIdForOrganization: jest.fn().mockResolvedValue({ _id: listingId, propertyAssetId: assetId, status: 'expired' }),
        } as never,
        idempotencyService: { checkReplay: jest.fn().mockResolvedValue(null), record: jest.fn() } as never,
      });

      await expect(
        service.publishListing({
          listingId,
          assetId,
          organizationId: new Types.ObjectId(),
          actorIdentityId: new Types.ObjectId(),
          idempotencyKey: 'key',
          correlationId: 'corr',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('отклоняет publish для listing в статусе archived (duplicate-заблокированные listings трактуются как archived до ACT-001/DEDUPE-001)', async () => {
      const listingId = new Types.ObjectId();
      const assetId = new Types.ObjectId();
      const service = makeService({
        listingRepository: {
          findByIdForOrganization: jest.fn().mockResolvedValue({ _id: listingId, propertyAssetId: assetId, status: 'archived' }),
        } as never,
        idempotencyService: { checkReplay: jest.fn().mockResolvedValue(null), record: jest.fn() } as never,
      });

      await expect(
        service.publishListing({
          listingId,
          assetId,
          organizationId: new Types.ObjectId(),
          actorIdentityId: new Types.ObjectId(),
          idempotencyKey: 'key',
          correlationId: 'corr',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('отклоняет повторный publish с НОВЫМ ключом, если публикация уже published (не создаёт лишний version/outbox)', async () => {
      const listingId = new Types.ObjectId();
      const assetId = new Types.ObjectId();
      const markPublishingSpy = jest.fn();
      const requestPublicationSpy = jest.fn();
      const service = makeService({
        listingRepository: {
          findByIdForOrganization: jest.fn().mockResolvedValue({ _id: listingId, propertyAssetId: assetId, status: 'active', version: 1 }),
          markPublishing: markPublishingSpy,
        } as never,
        publicationRepository: { findBySource: jest.fn().mockResolvedValue({ status: 'published' }) } as never,
        publicationService: { requestPublication: requestPublicationSpy } as never,
        idempotencyService: { checkReplay: jest.fn().mockResolvedValue(null), record: jest.fn() } as never,
      });

      await expect(
        service.publishListing({
          listingId,
          assetId,
          organizationId: new Types.ObjectId(),
          actorIdentityId: new Types.ObjectId(),
          idempotencyKey: 'a-brand-new-key',
          correlationId: 'corr',
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(markPublishingSpy).not.toHaveBeenCalled();
      expect(requestPublicationSpy).not.toHaveBeenCalled();
    });

    it('отклоняет повторный publish с НОВЫМ ключом, если публикация уже publication_pending', async () => {
      const listingId = new Types.ObjectId();
      const assetId = new Types.ObjectId();
      const markPublishingSpy = jest.fn();
      const service = makeService({
        listingRepository: {
          findByIdForOrganization: jest.fn().mockResolvedValue({ _id: listingId, propertyAssetId: assetId, status: 'active', version: 1 }),
          markPublishing: markPublishingSpy,
        } as never,
        publicationRepository: { findBySource: jest.fn().mockResolvedValue({ status: 'publication_pending' }) } as never,
        idempotencyService: { checkReplay: jest.fn().mockResolvedValue(null), record: jest.fn() } as never,
      });

      await expect(
        service.publishListing({
          listingId,
          assetId,
          organizationId: new Types.ObjectId(),
          actorIdentityId: new Types.ObjectId(),
          idempotencyKey: 'a-brand-new-key',
          correlationId: 'corr',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(markPublishingSpy).not.toHaveBeenCalled();
    });

    it('разрешает publish, если предыдущая публикация unpublished (rebuild-эквивалент, не заблокирован навсегда)', async () => {
      const listingId = new Types.ObjectId();
      const assetId = new Types.ObjectId();
      const markPublishingSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
      const service = makeService({
        listingRepository: {
          findByIdForOrganization: jest.fn().mockResolvedValue({ _id: listingId, propertyAssetId: assetId, status: 'active', version: 1 }),
          markPublishing: markPublishingSpy,
        } as never,
        publicationRepository: { findBySource: jest.fn().mockResolvedValue({ status: 'unpublished' }) } as never,
        publicationService: { requestPublication: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), status: 'publication_pending' }) } as never,
        idempotencyService: { checkReplay: jest.fn().mockResolvedValue(null), record: jest.fn().mockResolvedValue(undefined) } as never,
      });

      await service.publishListing({
        listingId,
        assetId,
        organizationId: new Types.ObjectId(),
        actorIdentityId: new Types.ObjectId(),
        idempotencyKey: 'key',
        correlationId: 'corr',
      });

      expect(markPublishingSpy).toHaveBeenCalled();
    });

    it('разрешает publish, если предыдущая попытка build_failed', async () => {
      const listingId = new Types.ObjectId();
      const assetId = new Types.ObjectId();
      const markPublishingSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
      const service = makeService({
        listingRepository: {
          findByIdForOrganization: jest.fn().mockResolvedValue({ _id: listingId, propertyAssetId: assetId, status: 'active', version: 1 }),
          markPublishing: markPublishingSpy,
        } as never,
        publicationRepository: { findBySource: jest.fn().mockResolvedValue({ status: 'build_failed' }) } as never,
        publicationService: { requestPublication: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), status: 'publication_pending' }) } as never,
        idempotencyService: { checkReplay: jest.fn().mockResolvedValue(null), record: jest.fn().mockResolvedValue(undefined) } as never,
      });

      await service.publishListing({
        listingId,
        assetId,
        organizationId: new Types.ObjectId(),
        actorIdentityId: new Types.ObjectId(),
        idempotencyKey: 'key',
        correlationId: 'corr',
      });

      expect(markPublishingSpy).toHaveBeenCalled();
    });

    it('чужая организация получает единый 404 (NotFoundException), не раскрывает существование listing', async () => {
      const service = makeService({
        listingRepository: { findByIdForOrganization: jest.fn().mockResolvedValue(null) } as never,
      });

      await expect(
        service.publishListing({
          listingId: new Types.ObjectId(),
          assetId: new Types.ObjectId(),
          organizationId: new Types.ObjectId(),
          actorIdentityId: new Types.ObjectId(),
          idempotencyKey: 'key',
          correlationId: 'corr',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('гонка: два параллельных publish с одним Idempotency-Key — modifiedCount:0 БЕЗ существующего record даёт реальный ConflictException', async () => {
      const listingId = new Types.ObjectId();
      const assetId = new Types.ObjectId();
      const service = makeService({
        listingRepository: {
          findByIdForOrganization: jest.fn().mockResolvedValue({ _id: listingId, propertyAssetId: assetId, status: 'active' }),
          markPublishing: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
        } as never,
        idempotencyService: { checkReplay: jest.fn().mockResolvedValue(null), record: jest.fn() } as never,
      });

      await expect(
        service.publishListing({
          listingId,
          assetId,
          organizationId: new Types.ObjectId(),
          actorIdentityId: new Types.ObjectId(),
          idempotencyKey: 'key',
          correlationId: 'corr',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('гонка: retry с уже записанным idempotency-record возвращает replay СРАЗУ после чтения listing, не вызывает markPublishing повторно', async () => {
      const listingId = new Types.ObjectId();
      const assetId = new Types.ObjectId();
      const replay = { responseStatus: 202, responseBody: { id: listingId.toString(), status: 'publication_pending' } };
      const markPublishingSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
      const service = makeService({
        listingRepository: {
          // retry-сценарий: конкурент УЖЕ закоммитил, поэтому version здесь
          // уже "обновлённая" (2, не исходная 1) — реальный баг, найденный
          // integration-тестом, был в том, что при таком чтении сервис
          // проходил ВЕСЬ markPublishing заново с новой version и падал на
          // повторной записи idempotency-record (unhandled duplicate key),
          // вместо короткого замыкания здесь.
          findByIdForOrganization: jest.fn().mockResolvedValue({ _id: listingId, propertyAssetId: assetId, status: 'active', version: 2 }),
          markPublishing: markPublishingSpy,
        } as never,
        idempotencyService: { checkReplay: jest.fn().mockResolvedValue(replay), record: jest.fn() } as never,
      });

      const result = await service.publishListing({
        listingId,
        assetId,
        organizationId: new Types.ObjectId(),
        actorIdentityId: new Types.ObjectId(),
        idempotencyKey: 'key',
        correlationId: 'corr',
      });

      expect(result.replay).toBe(replay);
      expect(markPublishingSpy).not.toHaveBeenCalled();
    });

    it('гонка: modifiedCount:0 без существующего record для ДРУГОГО конкурентного запроса (иной ключ) даёт реальный ConflictException, не проглатывается', async () => {
      const listingId = new Types.ObjectId();
      const assetId = new Types.ObjectId();
      const service = makeService({
        listingRepository: {
          findByIdForOrganization: jest.fn().mockResolvedValue({ _id: listingId, propertyAssetId: assetId, status: 'active', version: 1 }),
          markPublishing: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
        } as never,
        idempotencyService: { checkReplay: jest.fn().mockResolvedValue(null), record: jest.fn() } as never,
      });

      await expect(
        service.publishListing({
          listingId,
          assetId,
          organizationId: new Types.ObjectId(),
          actorIdentityId: new Types.ObjectId(),
          idempotencyKey: 'different-key',
          correlationId: 'corr',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('unpublishListing', () => {
    it('вызывает PublicationService.unpublish с actorType:identity и propagированным reason', async () => {
      const listingId = new Types.ObjectId();
      const assetId = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const actorIdentityId = new Types.ObjectId();
      const unpublishSpy = jest.fn().mockResolvedValue(undefined);
      const service = makeService({
        listingRepository: {
          findByIdForOrganization: jest.fn().mockResolvedValue({ _id: listingId, propertyAssetId: assetId }),
        } as never,
        publicationService: { unpublish: unpublishSpy } as never,
      });

      await service.unpublishListing({
        listingId,
        assetId,
        organizationId,
        reason: 'Duplicate listing reported by owner',
        actorIdentityId,
        correlationId: 'corr',
      });

      expect(unpublishSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceType: 'listing',
          sourceId: listingId,
          reason: 'Duplicate listing reported by owner',
          actorType: 'identity',
          actorId: actorIdentityId,
        }),
        expect.anything(),
      );
    });

    it('чужая организация получает единый 404, не раскрывает существование listing', async () => {
      const service = makeService({
        listingRepository: { findByIdForOrganization: jest.fn().mockResolvedValue(null) } as never,
      });

      await expect(
        service.unpublishListing({
          listingId: new Types.ObjectId(),
          assetId: new Types.ObjectId(),
          organizationId: new Types.ObjectId(),
          reason: 'reason text long enough',
          actorIdentityId: new Types.ObjectId(),
          correlationId: 'corr',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getListingPublicationStatus', () => {
    it('делегирует в publicationRepository.findBySource с sourceType:listing и listingId', async () => {
      const listingId = new Types.ObjectId();
      const assetId = new Types.ObjectId();
      const findBySourceSpy = jest.fn().mockResolvedValue({
        _id: new Types.ObjectId(),
        sourceType: 'listing',
        sourceId: listingId,
        status: 'published',
        slug: 'test-slug',
      });
      const service = makeService({
        listingRepository: {
          findByIdForOrganization: jest.fn().mockResolvedValue({ _id: listingId, propertyAssetId: assetId }),
        } as never,
        publicationRepository: { findBySource: findBySourceSpy } as never,
      });

      await service.getListingPublicationStatus(listingId, assetId, new Types.ObjectId());

      expect(findBySourceSpy).toHaveBeenCalledWith('listing', listingId);
    });

    it('отклоняет с PUBLICATION_NOT_FOUND, если Listing существует, но публикация никогда не запускалась', async () => {
      const listingId = new Types.ObjectId();
      const assetId = new Types.ObjectId();
      const service = makeService({
        listingRepository: {
          findByIdForOrganization: jest.fn().mockResolvedValue({ _id: listingId, propertyAssetId: assetId }),
        } as never,
        publicationRepository: { findBySource: jest.fn().mockResolvedValue(null) } as never,
      });

      await expect(service.getListingPublicationStatus(listingId, assetId, new Types.ObjectId())).rejects.toMatchObject({
        code: 'PUBLICATION_NOT_FOUND',
      });
    });

    it('отклоняет с единым 404, если listing не найден в организации (не раскрывает существование чужого)', async () => {
      const service = makeService({
        listingRepository: { findByIdForOrganization: jest.fn().mockResolvedValue(null) } as never,
      });

      await expect(
        service.getListingPublicationStatus(new Types.ObjectId(), new Types.ObjectId(), new Types.ObjectId()),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
  describe('Media vertical (MKT-004)', () => {
    it('createMediaUploadIntent rejects non-image MIME types', async () => {
      const assetId = new Types.ObjectId();
      const orgId = new Types.ObjectId();
      const assetRepo = {
        findByIdForOrganization: jest.fn().mockResolvedValue({ _id: assetId, media: [] }),
      };
      const service = makeService({ propertyAssetRepository: assetRepo as unknown as PropertyAssetRepository });

      await expect(
        service.createMediaUploadIntent(assetId, orgId, {
          declaredMimeType: 'application/pdf',
          sizeBytes: 1024,
        }),
      ).rejects.toThrow('Only JPEG, PNG, and WebP images are supported');
    });

    it('createMediaUploadIntent rejects oversized files', async () => {
      const assetId = new Types.ObjectId();
      const orgId = new Types.ObjectId();
      const assetRepo = {
        findByIdForOrganization: jest.fn().mockResolvedValue({ _id: assetId, media: [] }),
      };
      const service = makeService({ propertyAssetRepository: assetRepo as unknown as PropertyAssetRepository });

      await expect(
        service.createMediaUploadIntent(assetId, orgId, {
          declaredMimeType: 'image/jpeg',
          sizeBytes: 25 * 1024 * 1024, // 25 MB > 20 MB limit
        }),
      ).rejects.toThrow('exceeds maximum allowed limit');
    });

    it('createMediaUploadIntent creates upload intent with property_photo purpose and public bucket', async () => {
      const assetId = new Types.ObjectId();
      const orgId = new Types.ObjectId();
      const assetRepo = {
        findByIdForOrganization: jest.fn().mockResolvedValue({ _id: assetId, media: [] }),
      };
      const mediaService = {
        createUploadIntent: jest.fn().mockResolvedValue({ assetId: 'media-123', uploadUrl: 'https://minio.test/upload' }),
      };
      const service = makeService({ propertyAssetRepository: assetRepo as unknown as PropertyAssetRepository, mediaService });

      const res = await service.createMediaUploadIntent(assetId, orgId, {
        declaredMimeType: 'image/jpeg',
        sizeBytes: 2 * 1024 * 1024,
      });

      expect(res).toEqual({
        assetId: assetId.toString(),
        mediaAssetId: 'media-123',
        uploadUrl: 'https://minio.test/upload',
      });
      expect(mediaService.createUploadIntent).toHaveBeenCalledWith({
        ownerScope: { type: 'organization', organizationId: orgId },
        declaredMimeType: 'image/jpeg',
        sizeBytes: 2 * 1024 * 1024,
        purpose: 'property_photo',
        bucket: 'public',
      });
    });

    it('confirmMediaUpload throws if media verification failed', async () => {
      const assetId = new Types.ObjectId();
      const mediaAssetId = new Types.ObjectId();
      const orgId = new Types.ObjectId();
      const actorId = new Types.ObjectId();
      const assetRepo = {
        findByIdForOrganization: jest.fn().mockResolvedValue({ _id: assetId, media: [] }),
      };
      const mediaService = {
        confirmUpload: jest.fn().mockResolvedValue({ status: 'rejected' }),
      };
      const service = makeService({ propertyAssetRepository: assetRepo as unknown as PropertyAssetRepository, mediaService });

      await expect(
        service.confirmMediaUpload(assetId, mediaAssetId, orgId, actorId, 'corr-1'),
      ).rejects.toThrow('Media file verification failed');
    });

    it('confirmMediaUpload attaches media as cover on first upload and returns list', async () => {
      const assetId = new Types.ObjectId();
      const mediaAssetId = new Types.ObjectId();
      const orgId = new Types.ObjectId();
      const actorId = new Types.ObjectId();
      const asset = { _id: assetId, media: [] as PropertyAssetMediaItem[] };
      const assetRepo = {
        findByIdForOrganization: jest.fn().mockResolvedValue(asset),
        mutateMedia: jest.fn().mockImplementation((id, mutator) => {
          asset.media = mutator(asset.media);
          return Promise.resolve(asset);
        }),
      };
      const mediaService = {
        confirmUpload: jest.fn().mockResolvedValue({ status: 'verified' }),
        getAssetsForOwnerScope: jest.fn().mockResolvedValue(
          new Map([
            [
              mediaAssetId.toString(),
              {
                status: 'verified',
                variants: [{ type: 'card', assetPath: 'media-123/card/1.webp' }],
                bucket: 'public',
                declaredMimeType: 'image/jpeg',
                verifiedMimeType: 'image/jpeg',
                sizeBytes: 1024,
                createdAt: new Date(),
              },
            ],
          ]),
        ),
        getPublicUrl: jest.fn((k: string) => `https://cdn.example.com/${k}`),
      };
      const service = makeService({ propertyAssetRepository: assetRepo as unknown as PropertyAssetRepository, mediaService });

      const list = await service.confirmMediaUpload(assetId, mediaAssetId, orgId, actorId, 'corr-1', {
        alt: 'Фасад здания',
      });

      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({
        mediaAssetId: mediaAssetId.toString(),
        role: 'cover',
        sortOrder: 0,
        alt: 'Фасад здания',
        isPrivate: false,
        status: 'verified',
        url: 'https://cdn.example.com/media-123/card/1.webp',
      });
      expect(assetRepo.mutateMedia).toHaveBeenCalledWith(assetId, expect.any(Function));
    });

    it('deleteMedia removes item and promotes next non-private to cover if cover was removed', async () => {
      const assetId = new Types.ObjectId();
      const coverId = new Types.ObjectId();
      const galleryId = new Types.ObjectId();
      const orgId = new Types.ObjectId();
      const asset = {
        _id: assetId,
        media: [
          { id: coverId.toString(), mediaAssetId: coverId, role: 'cover', sortOrder: 0, isPrivate: false },
          { id: galleryId.toString(), mediaAssetId: galleryId, role: 'gallery', sortOrder: 1, isPrivate: false },
        ],
      };
      let capturedMedia: PropertyAssetMediaItem[] | undefined;
      const assetRepo = {
        findByIdForOrganization: jest.fn().mockResolvedValue(asset),
        mutateMedia: jest.fn().mockImplementation((id, mutator) => {
          capturedMedia = mutator(asset.media);
          return Promise.resolve({ ...asset, media: capturedMedia });
        }),
      };
      const service = makeService({ propertyAssetRepository: assetRepo as unknown as PropertyAssetRepository });

      const res = await service.deleteMedia(assetId, coverId, orgId);

      expect(res).toEqual({ success: true });
      expect(assetRepo.mutateMedia).toHaveBeenCalledWith(assetId, expect.any(Function));
      expect(capturedMedia).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ mediaAssetId: galleryId, role: 'cover' }),
        ]),
      );
    });

    it('updateMediaItem updates cover role and demotes previous cover', async () => {
      const assetId = new Types.ObjectId();
      const item1Id = new Types.ObjectId();
      const item2Id = new Types.ObjectId();
      const orgId = new Types.ObjectId();
      const asset = {
        _id: assetId,
        media: [
          { id: item1Id.toString(), mediaAssetId: item1Id, role: 'cover', sortOrder: 0, isPrivate: false },
          { id: item2Id.toString(), mediaAssetId: item2Id, role: 'gallery', sortOrder: 1, isPrivate: false },
        ],
      };
      let capturedMedia: PropertyAssetMediaItem[] | undefined;
      const assetRepo = {
        findByIdForOrganization: jest.fn().mockResolvedValue(asset),
        mutateMedia: jest.fn().mockImplementation((id, mutator) => {
          capturedMedia = mutator(asset.media);
          return Promise.resolve({ ...asset, media: capturedMedia });
        }),
      };
      const mediaService = {
        getAssetsForOwnerScope: jest.fn().mockResolvedValue(new Map()),
        getPublicUrl: jest.fn(),
      };
      const service = makeService({ propertyAssetRepository: assetRepo as unknown as PropertyAssetRepository, mediaService });

      await service.updateMediaItem(assetId, item2Id, orgId, { role: 'cover' });

      expect(assetRepo.mutateMedia).toHaveBeenCalledWith(assetId, expect.any(Function));
      expect(capturedMedia).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ mediaAssetId: item1Id, role: 'gallery' }),
          expect.objectContaining({ mediaAssetId: item2Id, role: 'cover' }),
        ]),
      );
    });
  });

});

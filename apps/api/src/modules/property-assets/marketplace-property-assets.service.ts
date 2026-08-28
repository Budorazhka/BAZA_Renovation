import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { PropertyAssetRepository, ListingRepository } from '@baza/property-assets';
import { MarketplacePublicationRepository } from '@baza/publication';
import { runInTransaction } from '../../shared/transactions/run-in-transaction';
import { AppException } from '../../shared/errors/app-exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { PublicationService } from '../publication/publication.service';
import { IdempotencyService, type IdempotentReplay } from '../../shared/idempotency/idempotency.service';
import { DedupeService } from './dedupe.service';
import type { CreatePropertyAssetDto } from './dto/create-property-asset.dto';
import type { CreateListingDto } from './dto/create-listing.dto';

/**
 * Owner/realtor marketplace publishing wizard: зеркало PropertyAssetsService
 * (ERP-сторона), но авторизация по identityId (MarketplaceAccountContext),
 * не organizationId (TenantContext) — publisherScope записывается как
 * `{type:'marketplace_account', identityId}` (@baza/tenant-scope), тот же
 * discriminated-union паттерн, что MediaAssetDocument.ownerScope уже
 * использует.
 *
 * Отдельный сервис, не условная ветка внутри PropertyAssetsService — тот
 * же архитектурный выбор, что уже сделан для Admin (AdminPublicationService
 * отдельно от PropertyAssetsService/DevelopmentsService, не общий метод с
 * if-веткой на audience). DEDUPE-001/ACT-001 gates (DedupeService) уже НЕ
 * organization-scoped — переиспользуются как есть, без каких-либо
 * изменений в самом DedupeService.
 */
@Injectable()
export class MarketplacePropertyAssetsService {
  private readonly logger = new Logger(MarketplacePropertyAssetsService.name);

  constructor(
    private readonly propertyAssetRepository: PropertyAssetRepository,
    private readonly listingRepository: ListingRepository,
    private readonly publicationService: PublicationService,
    private readonly publicationRepository: MarketplacePublicationRepository,
    private readonly idempotencyService: IdempotencyService,
    private readonly dedupeService: DedupeService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async createAsset(identityId: Types.ObjectId, dto: CreatePropertyAssetDto) {
    const asset = await this.propertyAssetRepository.create({
      publisherScope: { type: 'marketplace_account', identityId },
      propertyType: dto.propertyType,
      commercialSubtype: dto.commercialSubtype,
      location: dto.location,
      characteristics: dto.characteristics,
      representativePhone: dto.representativePhone,
      version: 0,
    });

    try {
      await this.dedupeService.scanForDuplicates(asset._id);
    } catch (error) {
      // Best-effort — тот же принцип, что PropertyAssetsService.createAsset
      // (ERP-сторона): скан не критичен для самого создания записи.
      this.logger.error(`scanForDuplicates failed for asset ${asset._id.toString()}: ${(error as Error).message}`);
    }

    return asset;
  }

  async getAsset(id: Types.ObjectId, identityId: Types.ObjectId) {
    const asset = await this.propertyAssetRepository.findByIdForIdentity(id, identityId);
    if (!asset) throw new NotFoundException('Property asset not found');
    return asset;
  }

  listAssets(identityId: Types.ObjectId) {
    return this.propertyAssetRepository.listForIdentity(identityId);
  }

  async createListing(assetId: Types.ObjectId, identityId: Types.ObjectId, dto: CreateListingDto) {
    await this.getAsset(assetId, identityId);
    return this.listingRepository.create({
      propertyAssetId: assetId,
      publisherScope: { type: 'marketplace_account', identityId },
      dealType: dto.dealType,
      price: dto.price,
      status: 'draft',
      version: 0,
    });
  }

  async listListings(assetId: Types.ObjectId, identityId: Types.ObjectId) {
    await this.getAsset(assetId, identityId);
    return this.listingRepository.listForAssetIdentity(assetId, identityId);
  }

  async activateListing(listingId: Types.ObjectId, assetId: Types.ObjectId, identityId: Types.ObjectId) {
    const listing = await this.listingRepository.findByIdForIdentity(listingId, identityId);
    if (!listing || !listing.propertyAssetId.equals(assetId)) throw new NotFoundException('Listing not found');
    const existing = await this.listingRepository.findActiveForDealTypeIdentity(listing.propertyAssetId, identityId, listing.dealType);
    if (existing && !existing._id.equals(listingId)) throw new ConflictException('Active listing for this deal type already exists');
    try {
      const activated = await this.listingRepository.activateForIdentity(listingId, identityId, new Date());
      if (!activated) throw new ConflictException('Listing is not in draft status');
      return activated;
    } catch (error) {
      if ((error as { code?: number }).code === 11000) throw new ConflictException('Active listing for this deal type already exists');
      throw error;
    }
  }

  /**
   * Тот же publish-флоу, что PropertyAssetsService.publishListing (MKT-002
   * идемпотентность + DEDUPE-001 gate), identityId вместо organizationId
   * везде. publisherScope в requestPublication — marketplace_account, не
   * organization — MarketplacePublication.publisherScope должен отражать
   * реального владельца, тот же принцип non-disclosure, что ERP-сторона.
   */
  async publishListing(params: {
    listingId: Types.ObjectId;
    assetId: Types.ObjectId;
    identityId: Types.ObjectId;
    idempotencyKey: string;
    correlationId: string;
  }): Promise<{ publicationId: Types.ObjectId; status: string; replay?: IdempotentReplay }> {
    const checkOwnReplay = () =>
      this.idempotencyService.checkReplay({
        identityId: params.identityId,
        operation: 'publishListingMarketplace',
        key: params.idempotencyKey,
        requestBody: { listingId: params.listingId.toString() },
      });

    try {
      return await runInTransaction(this.connection, async (session) => {
        const listing = await this.listingRepository.findByIdForIdentity(params.listingId, params.identityId);
        if (!listing || !listing.propertyAssetId.equals(params.assetId)) {
          throw new NotFoundException('Listing not found');
        }

        const earlyReplay = await checkOwnReplay();
        if (earlyReplay) {
          return { publicationId: params.listingId, status: listing.status, replay: earlyReplay };
        }

        if (listing.status !== 'active') {
          throw new ConflictException(
            `Listing status is '${listing.status}', only 'active' can be published`,
          );
        }

        await this.dedupeService.assertNoBlockingDuplicates(params.assetId);

        const existingPublication = await this.publicationRepository.findBySource('listing', params.listingId);
        if (existingPublication && existingPublication.status !== 'unpublished' && existingPublication.status !== 'build_failed') {
          throw new ConflictException(
            `Listing is already ${existingPublication.status === 'published' ? 'published' : 'being published'} — unpublish first to republish`,
          );
        }

        const { modifiedCount } = await this.listingRepository.markPublishingForIdentity(
          params.listingId,
          params.identityId,
          listing.version,
          session,
        );
        if (modifiedCount === 0) {
          // MKT-002-IDEMP-RACE-001: см. подробный комментарий в
          // PropertyAssetsService.publishListing (ERP-эквивалент) — тот же
          // race-class, тот же fix. Единственный checkOwnReplay() здесь
          // раньше был one-shot попыткой поймать коммит соперника — этого
          // недостаточно (подтверждено интеграционным тестом: ложный 409
          // воспроизводился и с этой one-shot проверкой). bounded-retry
          // теперь снаружи транзакции, в catch ниже.
          throw new ConflictException('Listing was modified by another request — refresh and retry');
        }

        const publication = await this.publicationService.requestPublication(
          {
            sourceType: 'listing',
            sourceId: params.listingId,
            publisherScope: { type: 'marketplace_account', identityId: params.identityId },
            correlationId: params.correlationId,
          },
          session,
        );

        const result = { publicationId: publication._id, status: publication.status };

        await this.idempotencyService.record(
          {
            identityId: params.identityId,
            operation: 'publishListingMarketplace',
            key: params.idempotencyKey,
            requestBody: { listingId: params.listingId.toString() },
            responseStatus: 202,
            responseBody: {
              id: result.publicationId.toString(),
              sourceType: 'listing',
              sourceId: params.listingId.toString(),
              status: result.status,
            },
          },
          session,
        );

        return result;
      });
    } catch (error) {
      if (error instanceof ConflictException) {
        const replay = await this.idempotencyService.awaitReplay({
          identityId: params.identityId,
          operation: 'publishListingMarketplace',
          key: params.idempotencyKey,
          requestBody: { listingId: params.listingId.toString() },
        });
        if (replay) {
          return { publicationId: params.listingId, status: 'publication_pending', replay };
        }
      }
      throw error;
    }
  }

  async unpublishListing(params: {
    listingId: Types.ObjectId;
    assetId: Types.ObjectId;
    identityId: Types.ObjectId;
    reason: string;
    correlationId: string;
  }): Promise<void> {
    const listing = await this.listingRepository.findByIdForIdentity(params.listingId, params.identityId);
    if (!listing || !listing.propertyAssetId.equals(params.assetId)) {
      throw new NotFoundException('Listing not found');
    }

    await runInTransaction(this.connection, (session) =>
      this.publicationService.unpublish(
        {
          sourceType: 'listing',
          sourceId: params.listingId,
          reason: params.reason,
          actorType: 'identity',
          actorId: params.identityId,
          correlationId: params.correlationId,
        },
        session,
      ),
    );
  }

  async getListingPublicationStatus(listingId: Types.ObjectId, assetId: Types.ObjectId, identityId: Types.ObjectId) {
    const listing = await this.listingRepository.findByIdForIdentity(listingId, identityId);
    if (!listing || !listing.propertyAssetId.equals(assetId)) {
      throw new NotFoundException('Listing not found');
    }
    const publication = await this.publicationRepository.findBySource('listing', listingId);
    if (!publication) {
      throw new AppException(ErrorCode.PUBLICATION_NOT_FOUND, 'Publication not found for this listing');
    }
    return {
      publicationId: publication._id.toString(),
      status: publication.status,
      slug: publication.slug,
      version: publication.version,
      publishedAt: publication.publishedAt?.toISOString(),
      unpublishedAt: publication.unpublishedAt?.toISOString(),
      unpublishReason: publication.unpublishReason,
    };
  }
}

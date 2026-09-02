import { MediaService } from '../media/media.service';
import { IMAGE_MIME_TYPES, MAX_UPLOAD_SIZE_BYTES } from '../media/media.constants';
import type { CreatePropertyAssetMediaUploadIntentDto } from './dto/create-property-asset-media-upload-intent.dto';
import type { ConfirmPropertyAssetMediaDto } from './dto/confirm-property-asset-media.dto';
import type { UpdatePropertyAssetMediaDto } from './dto/update-property-asset-media.dto';

export interface PropertyAssetMediaViewItem {
  id: string;
  mediaAssetId: string;
  role: 'cover' | 'gallery';
  sortOrder: number;
  alt?: string;
  isPrivate: boolean;
  status: 'pending' | 'verified' | 'rejected';
  sizeBytes?: number;
  mimeType?: string;
  url?: string;
  createdAt: string;
}
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

/** Mongoose-документ -> обычный объект для сохранения в записи идемпотентности. */
function toPlainRecord(doc: unknown): Record<string, unknown> {
  const candidate = doc as { toObject?: () => Record<string, unknown> };
  return typeof candidate?.toObject === 'function' ? candidate.toObject() : (doc as Record<string, unknown>);
}
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
    private readonly mediaService: MediaService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  /**
   * ADR-006: повтор не должен создавать второй объект. Раньше создание шло
   * одним repository-вызовом без транзакции; теперь запись объекта и запись
   * идемпотентности сохраняются вместе, иначе возможен разрыв — объект создан,
   * отметка потеряна, и повтор создаёт дубль.
   *
   * Скан дублей намеренно ОСТАЁТСЯ ЗА транзакцией: он best-effort (см. catch
   * ниже) и его сбой не должен откатывать уже созданный объект.
   */
  async createAsset(
    identityId: Types.ObjectId,
    dto: CreatePropertyAssetDto,
    idempotency: { key: string; requestBody: Record<string, unknown> },
  ) {
    const asset = await runInTransaction(this.connection, async (session) => {
      const created = await this.propertyAssetRepository.create(
        {
          publisherScope: { type: 'marketplace_account', identityId },
          propertyType: dto.propertyType,
          commercialSubtype: dto.commercialSubtype,
          location: dto.location,
          characteristics: dto.characteristics,
          representativePhone: dto.representativePhone,
          version: 0,
        },
        session,
      );

      await this.idempotencyService.record(
        {
          identityId,
          operation: 'marketplaceCreateAsset',
          key: idempotency.key,
          requestBody: idempotency.requestBody,
          responseStatus: 201,
          responseBody: toPlainRecord(created),
        },
        session,
      );

      return created;
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

  /**
   * Проверка повтора ДО транзакции. Вынесена в сервис, чтобы контроллер не
   * зависел от IdempotencyService напрямую — остальные команды этого модуля
   * (publish) устроены так же.
   */
  checkCreateReplay(
    identityId: Types.ObjectId,
    operation: string,
    key: string,
    requestBody: Record<string, unknown>,
  ): Promise<IdempotentReplay | null> {
    return this.idempotencyService.checkReplay({ identityId, operation, key, requestBody });
  }

  async getAsset(id: Types.ObjectId, identityId: Types.ObjectId) {
    const asset = await this.propertyAssetRepository.findByIdForIdentity(id, identityId);
    if (!asset) throw new NotFoundException('Property asset not found');
    return asset;
  }

  listAssets(identityId: Types.ObjectId) {
    return this.propertyAssetRepository.listForIdentity(identityId);
  }

  /** ADR-006: повтор не должен создавать второй листинг на том же объекте. */
  async createListing(
    assetId: Types.ObjectId,
    identityId: Types.ObjectId,
    dto: CreateListingDto,
    idempotency: { key: string; requestBody: Record<string, unknown> },
  ) {
    await this.getAsset(assetId, identityId);

    return runInTransaction(this.connection, async (session) => {
      const created = await this.listingRepository.create(
        {
          propertyAssetId: assetId,
          publisherScope: { type: 'marketplace_account', identityId },
          dealType: dto.dealType,
          price: dto.price,
          status: 'draft',
          version: 0,
        },
        session,
      );

      await this.idempotencyService.record(
        {
          identityId,
          operation: 'marketplaceCreateListing',
          key: idempotency.key,
          requestBody: idempotency.requestBody,
          responseStatus: 201,
          responseBody: toPlainRecord(created),
        },
        session,
      );

      return created;
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
  // --- MEDIA VERTICAL (MKT-004) ---

  async createMediaUploadIntent(
    assetId: Types.ObjectId,
    identityId: Types.ObjectId,
    dto: CreatePropertyAssetMediaUploadIntentDto,
  ) {
    const asset = await this.getAsset(assetId, identityId);

    if (!IMAGE_MIME_TYPES.has(dto.declaredMimeType)) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        `Only JPEG, PNG, and WebP images are supported, received: ${dto.declaredMimeType}`,
      );
    }
    if (dto.sizeBytes > MAX_UPLOAD_SIZE_BYTES) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        `File size (${dto.sizeBytes}) exceeds maximum allowed limit (${MAX_UPLOAD_SIZE_BYTES})`,
      );
    }

    const uploadIntent = await this.mediaService.createUploadIntent({
      ownerScope: { type: 'marketplace_account', identityId },
      declaredMimeType: dto.declaredMimeType,
      sizeBytes: dto.sizeBytes,
      purpose: dto.purpose || 'property_photo',
      bucket: 'public',
    });

    return {
      assetId: asset._id.toString(),
      mediaAssetId: uploadIntent.assetId,
      uploadUrl: uploadIntent.uploadUrl,
    };
  }

  async confirmMediaUpload(
    assetId: Types.ObjectId,
    mediaAssetId: Types.ObjectId,
    identityId: Types.ObjectId,
    correlationId: string,
    dto?: ConfirmPropertyAssetMediaDto,
  ) {
    const asset = await this.getAsset(assetId, identityId);

    const confirmRes = await this.mediaService.confirmUpload({
      assetId: mediaAssetId,
      actorIdentityId: identityId,
      expectedOwnerScope: { type: 'marketplace_account', identityId },
      correlationId,
    });

    if (confirmRes.status === 'rejected') {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        'Media file verification failed (invalid magic-byte MIME or corrupt file)',
      );
    }

    // MKT-004-MEDIA-RACE-001: mutateMedia re-reads the current media[] on
    // every attempt and retries the CAS on a lost race, so a confirm
    // racing another confirm/delete/reorder on the same asset can no
    // longer silently discard one of the two writes.
    await this.propertyAssetRepository.mutateMedia(asset._id, (currentMedia) => {
      const existingIndex = currentMedia.findIndex((m) => m.mediaAssetId.equals(mediaAssetId));
      let updatedMedia = [...currentMedia];

      if (existingIndex >= 0) {
        const item = updatedMedia[existingIndex]!;
        const newRole = dto?.role ?? item.role;
        if (newRole === 'cover') {
          updatedMedia = updatedMedia.map((m) => ({ ...m, role: 'gallery' as const }));
        }
        updatedMedia[existingIndex] = {
          ...item,
          role: newRole,
          sortOrder: dto?.sortOrder !== undefined ? dto.sortOrder : item.sortOrder,
          alt: dto?.alt !== undefined ? dto.alt : item.alt,
          isPrivate: dto?.isPrivate !== undefined ? dto.isPrivate : item.isPrivate,
        };
      } else {
        const hasCover = updatedMedia.some((m) => m.role === 'cover' && !m.isPrivate);
        const isExplicitCover = dto?.role === 'cover';
        const shouldBeCover = isExplicitCover || (!hasCover && !dto?.isPrivate);

        if (shouldBeCover) {
          updatedMedia = updatedMedia.map((m) => ({ ...m, role: 'gallery' as const }));
        }

        const sortOrder = dto?.sortOrder !== undefined ? dto.sortOrder : updatedMedia.length;
        updatedMedia.push({
          id: mediaAssetId.toString(),
          mediaAssetId,
          role: shouldBeCover ? 'cover' : 'gallery',
          sortOrder,
          alt: dto?.alt,
          isPrivate: dto?.isPrivate ?? false,
          createdAt: new Date(),
        });
      }

      return updatedMedia;
    });

    return this.listMedia(assetId, identityId);
  }

  async listMedia(assetId: Types.ObjectId, identityId: Types.ObjectId): Promise<PropertyAssetMediaViewItem[]> {
    const asset = await this.getAsset(assetId, identityId);
    const mediaItems = asset.media || [];
    if (mediaItems.length === 0) return [];

    const mediaAssetIds = mediaItems.map((m) => m.mediaAssetId);
    const assetsMap = await this.mediaService.getAssetsForOwnerScope(mediaAssetIds, {
      type: 'marketplace_account',
      identityId,
    });

    return mediaItems.map((m) => {
      const mediaAsset = assetsMap.get(m.mediaAssetId.toString());
      let url: string | undefined;
      if (mediaAsset && mediaAsset.variants && mediaAsset.variants.length > 0) {
        const cardOrDetail = mediaAsset.variants.find((v) => v.type === 'card' || v.type === 'detail') ?? mediaAsset.variants[0];
        if (cardOrDetail) {
          url = this.mediaService.getPublicUrl(cardOrDetail.assetPath);
        }
      }

      return {
        id: m.id || m.mediaAssetId.toString(),
        mediaAssetId: m.mediaAssetId.toString(),
        role: m.role,
        sortOrder: m.sortOrder,
        alt: m.alt,
        isPrivate: m.isPrivate ?? false,
        status: mediaAsset?.status ?? 'pending',
        sizeBytes: mediaAsset?.sizeBytes,
        mimeType: mediaAsset?.verifiedMimeType ?? mediaAsset?.declaredMimeType,
        url,
        createdAt: (m.createdAt || new Date()).toISOString(),
      };
    });
  }

  async deleteMedia(assetId: Types.ObjectId, mediaAssetId: Types.ObjectId, identityId: Types.ObjectId) {
    const asset = await this.getAsset(assetId, identityId);
    let notFound = false;

    await this.propertyAssetRepository.mutateMedia(asset._id, (currentMedia) => {
      const index = currentMedia.findIndex((m) => m.mediaAssetId.equals(mediaAssetId));
      if (index < 0) {
        // Nothing to delete on THIS attempt's view of the array — a
        // concurrent delete of the same item already removed it. Return
        // the array unchanged (still a valid, matching write) rather than
        // throwing mid-retry; the flag below reports it once, after the
        // loop, using the same NotFoundException the original code threw.
        notFound = true;
        return currentMedia;
      }
      notFound = false;
      const removed = currentMedia[index]!;
      const updatedMedia = currentMedia.filter((m) => !m.mediaAssetId.equals(mediaAssetId));

      if (removed.role === 'cover' && updatedMedia.length > 0) {
        const firstNonPrivate = updatedMedia.find((m) => !m.isPrivate);
        if (firstNonPrivate) {
          firstNonPrivate.role = 'cover';
        } else if (updatedMedia[0]) {
          updatedMedia[0].role = 'cover';
        }
      }

      return updatedMedia;
    });

    if (notFound) {
      throw new NotFoundException('Media item not found on asset');
    }
    return { success: true };
  }

  async updateMediaItem(
    assetId: Types.ObjectId,
    mediaAssetId: Types.ObjectId,
    identityId: Types.ObjectId,
    dto: UpdatePropertyAssetMediaDto,
  ) {
    const asset = await this.getAsset(assetId, identityId);
    let notFound = false;

    await this.propertyAssetRepository.mutateMedia(asset._id, (currentMedia) => {
      const mediaItems = [...currentMedia];
      const index = mediaItems.findIndex((m) => m.mediaAssetId.equals(mediaAssetId));
      if (index < 0) {
        notFound = true;
        return currentMedia;
      }
      notFound = false;

      const currentItem = mediaItems[index]!;
      if (dto.role === 'cover') {
        for (const m of mediaItems) {
          m.role = 'gallery';
        }
        currentItem.role = 'cover';
      } else if (dto.role === 'gallery') {
        currentItem.role = 'gallery';
      }

      if (dto.sortOrder !== undefined) currentItem.sortOrder = dto.sortOrder;
      if (dto.alt !== undefined) currentItem.alt = dto.alt;
      if (dto.isPrivate !== undefined) currentItem.isPrivate = dto.isPrivate;

      return mediaItems;
    });

    if (notFound) {
      throw new NotFoundException('Media item not found on asset');
    }
    return this.listMedia(assetId, identityId);
  }

  async reorderMedia(
    assetId: Types.ObjectId,
    identityId: Types.ObjectId,
    items: Array<{ mediaAssetId: string; sortOrder: number; role?: 'cover' | 'gallery' }>,
  ) {
    const asset = await this.getAsset(assetId, identityId);

    await this.propertyAssetRepository.mutateMedia(asset._id, (currentMedia) => {
      const mediaItems = [...currentMedia];
      const orderMap = new Map(items.map((it) => [it.mediaAssetId, it]));

      let hasExplicitCover = false;
      for (const m of mediaItems) {
        const override = orderMap.get(m.mediaAssetId.toString());
        if (override) {
          m.sortOrder = override.sortOrder;
          if (override.role) {
            m.role = override.role;
            if (override.role === 'cover') hasExplicitCover = true;
          }
        }
      }

      if (hasExplicitCover) {
        const designatedCovers = items.filter((it) => it.role === 'cover').map((it) => it.mediaAssetId);
        for (const m of mediaItems) {
          if (!designatedCovers.includes(m.mediaAssetId.toString())) {
            m.role = 'gallery';
          }
        }
      }

      mediaItems.sort((a, b) => a.sortOrder - b.sortOrder);
      return mediaItems;
    });

    return this.listMedia(assetId, identityId);
  }

}

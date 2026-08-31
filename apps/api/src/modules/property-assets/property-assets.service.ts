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
import type { CreatePropertyAssetDto } from './dto/create-property-asset.dto';
import type { CreateListingDto } from './dto/create-listing.dto';

@Injectable()
export class PropertyAssetsService {
  private readonly logger = new Logger(PropertyAssetsService.name);

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
   * DEDUPE-001: dedupe-скан запускается сразу после создания — domain-model.md
   * описывает detection как происходящее "при попытке публикации", но на
   * практике выгоднее делать это на создании: admin видит кандидата в
   * очереди раньше, до того как владелец вообще попробует опубликовать.
   * Скан НЕ блокирует createAsset (структурная проверка "дублей" в master
   * plan разд.2.3 относится к публикации, не к созданию черновика) — если
   * скан сам упадёт, актив всё равно создан (см. try/catch — best-effort,
   * не критическая часть транзакции создания).
   */
  async createAsset(organizationId: Types.ObjectId, dto: CreatePropertyAssetDto) {
    const asset = await this.propertyAssetRepository.create({
      publisherScope: { type: 'organization', organizationId },
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
      // Best-effort: скан не критичен для самого создания записи —
      // publishListing всё равно перепроверит blocking-кандидатов через
      // assertNoBlockingDuplicates перед публикацией (реальный gate), этот
      // вызов только заранее наполняет admin-очередь. Сбой здесь не должен
      // откатывать уже успешно созданный PropertyAsset.
      this.logger.error(`scanForDuplicates failed for asset ${asset._id.toString()}: ${(error as Error).message}`);
    }

    return asset;
  }

  async getAsset(id: Types.ObjectId, organizationId: Types.ObjectId) {
    const asset = await this.propertyAssetRepository.findByIdForOrganization(id, organizationId);
    if (!asset) throw new NotFoundException('Property asset not found');
    return asset;
  }

  listAssets(organizationId: Types.ObjectId) {
    return this.propertyAssetRepository.listForOrganization(organizationId);
  }

  async createListing(assetId: Types.ObjectId, organizationId: Types.ObjectId, dto: CreateListingDto) {
    await this.getAsset(assetId, organizationId);
    return this.listingRepository.create({
      propertyAssetId: assetId,
      publisherScope: { type: 'organization', organizationId },
      dealType: dto.dealType,
      price: dto.price,
      status: 'draft',
      version: 0,
    });
  }

  async listListings(assetId: Types.ObjectId, organizationId: Types.ObjectId) {
    await this.getAsset(assetId, organizationId);
    return this.listingRepository.listForAsset(assetId, organizationId);
  }

  async activateListing(listingId: Types.ObjectId, assetId: Types.ObjectId, organizationId: Types.ObjectId) {
    const listing = await this.listingRepository.findByIdForOrganization(listingId, organizationId);
    if (!listing || !listing.propertyAssetId.equals(assetId)) throw new NotFoundException('Listing not found');
    const existing = await this.listingRepository.findActiveForDealType(listing.propertyAssetId, organizationId, listing.dealType);
    if (existing && !existing._id.equals(listingId)) throw new ConflictException('Active listing for this deal type already exists');
    try {
      const activated = await this.listingRepository.activate(listingId, organizationId, new Date());
      if (!activated) throw new ConflictException('Listing is not in draft status');
      return activated;
    } catch (error) {
      if ((error as { code?: number }).code === 11000) throw new ConflictException('Active listing for this deal type already exists');
      throw error;
    }
  }

  /**
   * MKT-002: транзакционно (1) CAS-инкремент version на Listing (только из
   * status:'active' И текущей version, предотвращает publish draft/expired/
   * archived listing) и (2) PublicationService.requestPublication(sourceType:'listing')
   * — тот же двухшаговый паттерн, что DevelopmentsService.publishDevelopment (D-03).
   *
   * Idempotency — гонка двух параллельных publish с одним ключом (найдено
   * РЕАЛЬНЫМ integration-тестом через Promise.all, не гипотетически):
   * в отличие от Development (publish меняет status draft→active — retry
   * проигравшей транзакции видит уже 'active' и попадает в СТАТУС-ветку
   * ДО повторной попытки записи), Listing.status НЕ меняется этой
   * операцией — только version. Если checkOwnReplay() вызывать ТОЛЬКО
   * внутри conflict-веток (по аналогии с Development), проигравшая
   * транзакция на retry видит ОБНОВЛЁННУЮ version (уже инкрементированную
   * победителем), успешно проходит СВОЙ markPublishing с этой новой
   * version, и доходит до записи idempotency-record ВТОРОЙ РАЗ с тем же
   * ключом — unhandled duplicate key error (E11000), не ConflictException/
   * replay. Фикс: checkOwnReplay() вызывается СРАЗУ после чтения listing,
   * ДО проверки status/попытки markPublishing — retry ЛЮБОЙ проигравшей
   * транзакции с уже записанным record коротко замыкается здесь, не
   * доходит до второй попытки записи вообще (тот же результат, что
   * Development получает "бесплатно" через изменение status, но explicit,
   * не полагающийся на побочный эффект transition).
   */
  async publishListing(params: {
    listingId: Types.ObjectId;
    assetId: Types.ObjectId;
    organizationId: Types.ObjectId;
    actorIdentityId: Types.ObjectId;
    idempotencyKey: string;
    correlationId: string;
  }): Promise<{ publicationId: Types.ObjectId; status: string; replay?: IdempotentReplay }> {
    const checkOwnReplay = () =>
      this.idempotencyService.checkReplay({
        identityId: params.actorIdentityId,
        operation: 'publishListing',
        key: params.idempotencyKey,
        requestBody: { listingId: params.listingId.toString() },
      });

    try {
      return await runInTransaction(this.connection, async (session) => {
        const listing = await this.listingRepository.findByIdForOrganization(params.listingId, params.organizationId);
        if (!listing || !listing.propertyAssetId.equals(params.assetId)) {
          throw new NotFoundException('Listing not found');
        }

        const earlyReplay = await checkOwnReplay();
        if (earlyReplay) {
          return { publicationId: params.listingId, status: listing.status, replay: earlyReplay };
        }

        if (listing.status !== 'active') {
          // draft: ещё не прошёл активацию (PROP-001) — публиковать нечего.
          // expired/archived: actuality-выбытие (ACT-001) — просроченный/
          // архивный listing не публикуется, требуется явное confirmActuality
          // (ActualityService) или новый publish-цикл через unpublish.
          throw new ConflictException(
            `Listing status is '${listing.status}', only 'active' can be published`,
          );
        }

        // DEDUPE-001 (master plan разд.2.3: "Явный дубль блокирует
        // публикацию") — проверяется ПОСЛЕ status-гейта (нет смысла
        // проверять дубли для listing, который и так не может публиковаться),
        // ДО version-CAS/requestPublication (дубль-блок дешевле проверить
        // до дорогих write-операций). override_not_duplicate НЕ блокирует —
        // assertNoBlockingDuplicates сама различает статусы кандидатов.
        await this.dedupeService.assertNoBlockingDuplicates(params.assetId);

        // Найдено ревью: без этой проверки publish уже опубликованного/
        // publication_pending listing с НОВЫМ Idempotency-Key (не retry той
        // же попытки — earlyReplay выше это не ловит) молча создавал бы
        // лишний version-инкремент на Listing И лишнее PublicationRequested
        // outbox-событие/upsertPending на уже существующей MarketplacePublication
        // при каждом повторном вызове — Listing.status не меняется публикацией
        // (в отличие от Development), поэтому ничто раньше не мешало повторить
        // всю операцию сколько угодно раз. Publish — команда перехода
        // draft-эквивалент→published, не идемпотентный "убедиться, что
        // опубликовано"; повторная публикация уже опубликованного listing —
        // явная ошибка клиента (используй unpublish, затем publish заново),
        // не тихий no-op и не молчаливое дублирование состояния.
        const existingPublication = await this.publicationRepository.findBySource('listing', params.listingId);
        if (existingPublication && existingPublication.status !== 'unpublished' && existingPublication.status !== 'build_failed') {
          throw new ConflictException(
            `Listing is already ${existingPublication.status === 'published' ? 'published' : 'being published'} — unpublish first to republish`,
          );
        }

        const { modifiedCount } = await this.listingRepository.markPublishing(
          params.listingId,
          params.organizationId,
          listing.version,
          session,
        );
        if (modifiedCount === 0) {
          // MKT-002-IDEMP-RACE-001: НЕ обязательно "другой конкурентный
          // запрос" — earlyReplay выше отсеивает только УЖЕ закоммиченный
          // повтор той же попытки, но при истинно одновременных запросах с
          // ОДНИМ ключом оба проходят earlyReplay почти синхронно (ключа
          // ещё нет ни у одного), и только здесь, на CAS бизнес-сущности,
          // решается, кто "выиграл". Проигравший бросает ConflictException
          // наружу транзакции — bounded-retry replay-check (см. catch ниже)
          // должен успеть увидеть коммит победителя, прежде чем это станет
          // окончательным business-conflict ответом клиенту.
          throw new ConflictException('Listing was modified by another request — refresh and retry');
        }

        const publication = await this.publicationService.requestPublication(
          {
            sourceType: 'listing',
            sourceId: params.listingId,
            publisherScope: { type: 'organization', organizationId: params.organizationId },
            correlationId: params.correlationId,
          },
          session,
        );

        const result = { publicationId: publication._id, status: publication.status };

        await this.idempotencyService.record(
          {
            identityId: params.actorIdentityId,
            operation: 'publishListing',
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
        // MKT-002-IDEMP-RACE-001: CAS-провал (version mismatch) ИЛИ
        // "уже публикуется" могут означать, что мы проиграли гонку
        // сопернику с ТЕМ ЖЕ Idempotency-Key, чья транзакция ещё не
        // успела закоммититься в момент нашего чтения. awaitReplay()
        // — короткий bounded-retry (не бесконечный polling) снаружи
        // нашей уже завершённой/откаченной транзакции: если запись
        // соперника появится в течение окна — это НАШ replay, не чужой
        // конфликт. Если не появится — это ИЛИ другой ключ, ИЛИ
        // реальная другая мутация, ИЛИ соперник упал до commit —
        // honest ConflictException остаётся правильным ответом.
        const replay = await this.idempotencyService.awaitReplay({
          identityId: params.actorIdentityId,
          operation: 'publishListing',
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

  /**
   * MKT-002: owner-unpublish — тот же PublicationService.unpublish, что
   * D-06 admin unpublish использует, actorType:'identity' вместо
   * 'admin_account'. reason обязателен (PublicationService enforces this
   * implicitly — unpublish() всегда требует его в params).
   */
  async unpublishListing(params: {
    listingId: Types.ObjectId;
    assetId: Types.ObjectId;
    organizationId: Types.ObjectId;
    reason: string;
    actorIdentityId: Types.ObjectId;
    correlationId: string;
  }): Promise<void> {
    const listing = await this.listingRepository.findByIdForOrganization(params.listingId, params.organizationId);
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
          actorId: params.actorIdentityId,
          correlationId: params.correlationId,
        },
        session,
      ),
    );
  }

  /**
   * D-03 паттерн: ERP polling после publish читает РЕАЛЬНЫЙ статус
   * MarketplacePublication (publication_pending/published/unpublished/
   * build_failed), не canonical Listing.status. Единый 404 для "Listing не
   * существует/чужой" и "публикация никогда не запускалась".
   */
  async getListingPublicationStatus(
    listingId: Types.ObjectId,
    assetId: Types.ObjectId,
    organizationId: Types.ObjectId,
  ) {
    const listing = await this.listingRepository.findByIdForOrganization(listingId, organizationId);
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
    organizationId: Types.ObjectId,
    dto: CreatePropertyAssetMediaUploadIntentDto,
  ) {
    const asset = await this.getAsset(assetId, organizationId);

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
      ownerScope: { type: 'organization', organizationId },
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
    organizationId: Types.ObjectId,
    actorIdentityId: Types.ObjectId,
    correlationId: string,
    dto?: ConfirmPropertyAssetMediaDto,
  ) {
    const asset = await this.getAsset(assetId, organizationId);

    const confirmRes = await this.mediaService.confirmUpload({
      assetId: mediaAssetId,
      actorIdentityId,
      expectedOwnerScope: { type: 'organization', organizationId },
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

    return this.listMedia(assetId, organizationId);
  }

  async listMedia(assetId: Types.ObjectId, organizationId: Types.ObjectId): Promise<PropertyAssetMediaViewItem[]> {
    const asset = await this.getAsset(assetId, organizationId);
    const mediaItems = asset.media || [];
    if (mediaItems.length === 0) return [];

    const mediaAssetIds = mediaItems.map((m) => m.mediaAssetId);
    const assetsMap = await this.mediaService.getAssetsForOwnerScope(mediaAssetIds, {
      type: 'organization',
      organizationId,
    });

    return mediaItems.map((m) => {
      const mediaAsset = assetsMap.get(m.mediaAssetId.toString());
      let url: string | undefined;
      if (mediaAsset && mediaAsset.variants && mediaAsset.variants.length > 0) {
        const cardOrDetail = mediaAsset.variants.find((v: any) => v.type === 'card' || v.type === 'detail') ?? mediaAsset.variants[0];
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

  async deleteMedia(assetId: Types.ObjectId, mediaAssetId: Types.ObjectId, organizationId: Types.ObjectId) {
    const asset = await this.getAsset(assetId, organizationId);
    let notFound = false;

    await this.propertyAssetRepository.mutateMedia(asset._id, (currentMedia) => {
      const index = currentMedia.findIndex((m) => m.mediaAssetId.equals(mediaAssetId));
      if (index < 0) {
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
    organizationId: Types.ObjectId,
    dto: UpdatePropertyAssetMediaDto,
  ) {
    const asset = await this.getAsset(assetId, organizationId);
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
    return this.listMedia(assetId, organizationId);
  }

  async reorderMedia(
    assetId: Types.ObjectId,
    organizationId: Types.ObjectId,
    items: Array<{ mediaAssetId: string; sortOrder: number; role?: 'cover' | 'gallery' }>,
  ) {
    const asset = await this.getAsset(assetId, organizationId);

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

    return this.listMedia(assetId, organizationId);
  }

}

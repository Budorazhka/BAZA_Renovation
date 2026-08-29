import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import type { OutboxEventDocument } from '@baza/domain-events';
import { DevelopmentRepository } from '@baza/development';
import { ListingRepository, PropertyAssetRepository, type PropertyAssetDocument } from '@baza/property-assets';
import { MarketplacePublicationRepository } from '@baza/publication';
import { MediaAssetRepository, MediaStorageService } from '@baza/media-storage';
import type { EventHandler } from '../outbox/event-handler';
import { buildSlugBase, buildSlugCandidate } from './slug.util';
import { mapDevelopmentToDenormalizedFields, buildDevelopmentSeo, buildSearchProjection } from './development-publication.mapper';
import {
  mapListingToDenormalizedFields,
  buildListingSeo,
  buildListingSearchProjection,
  type PublicMediaItem,
} from './listing-publication.mapper';

const MAX_SLUG_ATTEMPTS = 10;

interface PublicationRequestedPayload {
  publicationId: string;
  sourceType: 'unit' | 'development' | 'listing';
  sourceId: string;
  version: number;
}

@Injectable()
export class PublicationRequestedHandler implements EventHandler {
  private readonly logger = new Logger(PublicationRequestedHandler.name);

  constructor(
    private readonly publicationRepository: MarketplacePublicationRepository,
    private readonly developmentRepository: DevelopmentRepository,
    private readonly listingRepository: ListingRepository,
    private readonly propertyAssetRepository: PropertyAssetRepository,
    private readonly mediaAssetRepository: MediaAssetRepository,
    private readonly storage: MediaStorageService,
  ) {}

  async handle(event: OutboxEventDocument): Promise<void> {
    const payload = event.payload as unknown as PublicationRequestedPayload;
    const publicationId = new Types.ObjectId(payload.publicationId);

    if (payload.sourceType === 'development') {
      await this.handleDevelopment(payload, publicationId);
      return;
    }

    if (payload.sourceType === 'listing') {
      await this.handleListing(payload, publicationId);
      return;
    }

    this.logger.error(
      `PublicationRequested для sourceType '${payload.sourceType}' (publication ${payload.publicationId}) — ` +
        `mapper для этого sourceType ещё не реализован. Помечаю build_failed вместо тихого игнорирования.`,
    );
    await this.publicationRepository.markBuildFailed(publicationId);
  }

  private async handleDevelopment(payload: PublicationRequestedPayload, publicationId: Types.ObjectId): Promise<void> {
    const sourceId = new Types.ObjectId(payload.sourceId);
    const development = await this.developmentRepository.findById(sourceId);
    if (!development) {
      this.logger.error(
        `PublicationRequested (${payload.publicationId}): Development ${payload.sourceId} не найден — ` +
          `canonical-сущность удалена/недоступна между publish и обработкой worker'ом. Помечаю build_failed.`,
      );
      await this.publicationRepository.markBuildFailed(publicationId);
      return;
    }

    await this.publishWithSlugRetry(
      publicationId,
      payload,
      development.name,
      development.location.city,
      (slug) => ({
        seo: buildDevelopmentSeo(development, slug),
        denormalizedFields: mapDevelopmentToDenormalizedFields(development),
        searchProjection: buildSearchProjection(development),
      }),
    );
  }

  private async handleListing(payload: PublicationRequestedPayload, publicationId: Types.ObjectId): Promise<void> {
    const sourceId = new Types.ObjectId(payload.sourceId);
    const listing = await this.listingRepository.findById(sourceId);
    if (!listing) {
      this.logger.error(
        `PublicationRequested (${payload.publicationId}): Listing ${payload.sourceId} не найден — ` +
          `canonical-сущность удалена/недоступна между publish и обработкой worker'ом. Помечаю build_failed.`,
      );
      await this.publicationRepository.markBuildFailed(publicationId);
      return;
    }

    const asset = await this.propertyAssetRepository.findById(listing.propertyAssetId);
    if (!asset) {
      this.logger.error(
        `PublicationRequested (${payload.publicationId}): PropertyAsset ${listing.propertyAssetId.toString()} ` +
          `(родитель Listing ${payload.sourceId}) не найден. Помечаю build_failed.`,
      );
      await this.publicationRepository.markBuildFailed(publicationId);
      return;
    }

    const publicMedia = await this.buildPublicMediaList(asset);

    await this.publishWithSlugRetry(
      publicationId,
      payload,
      `${asset.propertyType}-${listing.dealType}`,
      asset.location.city,
      (slug) => ({
        seo: buildListingSeo(listing, asset, slug),
        denormalizedFields: mapListingToDenormalizedFields(listing, asset, publicMedia),
        searchProjection: buildListingSearchProjection(listing, asset),
      }),
    );
  }

  private async buildPublicMediaList(asset: PropertyAssetDocument): Promise<PublicMediaItem[]> {
    const rawMedia = asset.media || [];
    const publicItems = rawMedia.filter((item) => !item.isPrivate);
    if (publicItems.length === 0) return [];

    const mediaAssetIds = publicItems.map((m) => m.mediaAssetId);
    const mediaDocs = await this.mediaAssetRepository.findByIds(mediaAssetIds);
    const mediaMap = new Map(mediaDocs.map((doc) => [doc._id.toString(), doc]));

    const result: PublicMediaItem[] = [];

    // Sort: cover first, then by sortOrder ascending, then createdAt ascending
    const sorted = [...publicItems].sort((a, b) => {
      if (a.role === 'cover' && b.role !== 'cover') return -1;
      if (b.role === 'cover' && a.role !== 'cover') return 1;
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateA - dateB;
    });

    for (const item of sorted) {
      const doc = mediaMap.get(item.mediaAssetId.toString());
      if (!doc || doc.status !== 'verified' || doc.bucket !== 'public') {
        continue;
      }

      const variant =
        doc.variants.find((v) => v.type === 'card' || v.type === 'detail') || doc.variants[0];
      if (!variant) {
        // No variant yet, skip until variant generation completes
        continue;
      }

      const url = this.storage.getPublicUrl(variant.assetPath);
      result.push({
        url,
        role: item.role,
        sortOrder: item.sortOrder,
        alt: item.alt,
      });
    }

    return result;
  }

  private async publishWithSlugRetry(
    publicationId: Types.ObjectId,
    payload: PublicationRequestedPayload,
    slugNameSeed: string,
    city: string,
    buildProjection: (slug: string) => {
      seo: ReturnType<typeof buildDevelopmentSeo>;
      denormalizedFields: Record<string, unknown>;
      searchProjection: Record<string, unknown>;
    },
  ): Promise<void> {
    const base = buildSlugBase(slugNameSeed, city);
    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
      const candidate = buildSlugCandidate(base, attempt);
      const taken = await this.publicationRepository.isSlugTaken(candidate, publicationId);
      if (taken) {
        continue;
      }

      try {
        const { modifiedCount } = await this.publicationRepository.markPublished(publicationId, {
          expectedVersion: payload.version,
          slug: candidate,
          ...buildProjection(candidate),
        });
        this.logAfterMarkPublished(modifiedCount, payload, candidate);
        return;
      } catch (error) {
        if (isDuplicateSlugError(error)) {
          this.logger.warn(
            `PublicationRequested (${payload.publicationId}): slug "${candidate}" оказался занят между ` +
              `isSlugTaken-проверкой и записью (конкурентный worker) — пробую следующий кандидат.`,
          );
          continue;
        }
        throw error;
      }
    }

    throw new Error(
      `publishWithSlugRetry: не удалось найти свободный slug для "${base}" за ${MAX_SLUG_ATTEMPTS} попыток ` +
        `(publication ${payload.publicationId})`,
    );
  }

  private logAfterMarkPublished(modifiedCount: number, payload: PublicationRequestedPayload, slug: string): void {
    if (modifiedCount === 0) {
      this.logger.log(
        `PublicationRequested (${payload.publicationId}): публикация уже не в publication_pending ` +
          `или её version уже не ${payload.version} (unpublish опередил worker, либо более новое ` +
          `событие обработано раньше) — не перезаписываю.`,
      );
      return;
    }

    this.logger.log(`PublicationRequested (${payload.publicationId}): опубликовано, slug=${slug}.`);
  }
}

function isDuplicateSlugError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: number; keyPattern?: Record<string, unknown>; message?: string };
  if (err.code !== 11000) return false;
  if (err.keyPattern) return 'slug' in err.keyPattern;
  return typeof err.message === 'string' && err.message.includes('slug');
}

import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import type { OutboxEventDocument } from '@baza/domain-events';
import { DevelopmentRepository } from '@baza/development';
import { ListingRepository, PropertyAssetRepository } from '@baza/property-assets';
import { MarketplacePublicationRepository } from '@baza/publication';
import type { EventHandler } from '../outbox/event-handler';
import { buildSlugBase, buildSlugCandidate } from './slug.util';
import { mapDevelopmentToDenormalizedFields, buildDevelopmentSeo, buildSearchProjection } from './development-publication.mapper';
import {
  mapListingToDenormalizedFields,
  buildListingSeo,
  buildListingSearchProjection,
} from './listing-publication.mapper';

const MAX_SLUG_ATTEMPTS = 10;

/**
 * PublicationRequested payload — точная структура, публикуемая
 * apps/api/src/modules/publication/publication.service.ts::requestPublication
 * и rebuildIfCurrentlyPublished.
 */
interface PublicationRequestedPayload {
  publicationId: string;
  sourceType: 'unit' | 'development' | 'listing';
  sourceId: string;
  version: number;
}

/**
 * ADR-005: worker-задача — сборка полной MarketplacePublication проекции
 * (denormalizedFields/seo/searchProjection/slug) по PublicationRequested
 * событию. Explicit whitelist mapper (development-publication.mapper.ts)
 * — единственная точка, решающая, что публично. Идемпотентен через
 * markPublished's условный updateOne (status:publication_pending в
 * фильтре) — если публикация уже перешла в другой статус (unpublish
 * опередил worker), повторная/поздняя обработка не затирает это состояние.
 *
 * Первый проход D-03 обрабатывал ТОЛЬКО sourceType:'development' —
 * MKT-002 добавляет 'listing'. 'unit' mapper всё ещё не реализован (нет
 * соответствующей publish-команды в API-слое), payload с этим sourceType
 * по-прежнему переводится в build_failed явно, не молча игнорируется.
 */
@Injectable()
export class PublicationRequestedHandler implements EventHandler {
  private readonly logger = new Logger(PublicationRequestedHandler.name);

  constructor(
    private readonly publicationRepository: MarketplacePublicationRepository,
    private readonly developmentRepository: DevelopmentRepository,
    private readonly listingRepository: ListingRepository,
    private readonly propertyAssetRepository: PropertyAssetRepository,
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

  /**
   * MKT-002: Listing не самодостаточен для публичной проекции — цена и
   * dealType живут на Listing, но propertyType/location/characteristics на
   * родительском PropertyAsset (та же декомпозиция, что domain-model.md
   * разд.5.5 явно требует: "нельзя смешивать физический объект и
   * коммерческое предложение"). Оба читаются здесь, ОБА отсутствия —
   * build_failed (canonical-рассинхрон между publish и обработкой worker'ом,
   * тот же класс ошибки, что отсутствующий Development).
   */
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

    await this.publishWithSlugRetry(
      publicationId,
      payload,
      `${asset.propertyType}-${listing.dealType}`,
      asset.location.city,
      (slug) => ({
        seo: buildListingSeo(listing, asset, slug),
        denormalizedFields: mapListingToDenormalizedFields(listing, asset),
        searchProjection: buildListingSearchProjection(listing, asset),
      }),
    );
  }

  /**
   * MKT-002 hardening: `resolveUniqueSlug` проверяет занятость slug'а
   * ЗАРАНЕЕ (`isSlugTaken`, отдельный read), но между этой проверкой и
   * фактическим write (`markPublished`) есть окно — два worker'а (ADR-001
   * явно допускает несколько инстансов на один API), обрабатывающих два
   * РАЗНЫХ publish-события, чьи slug-базы совпадают (например, тот же
   * `propertyType-dealType-city` для двух разных Listing одного города),
   * могут оба пройти `isSlugTaken` со значением false ДО того, как любой
   * из них зафиксирует результат — до этого прохода единственной защитой
   * от рассинхрона был уникальный индекс на `slug` (ADR-005), но
   * DUPLICATE-KEY ошибка от него была НЕОБРАБОТАНА — `markPublished`
   * бросил бы наружу, не переходя к следующему slug-кандидату, событие
   * ушло бы в outbox retry/dead-letter без реального прогресса.
   *
   * Исправлено: `markPublished` оборачивается в тот же retry-цикл, что
   * `resolveUniqueSlug` уже использует для pre-check — при duplicate-key
   * именно на индексе `slug` пробуется следующий `buildSlugCandidate`,
   * не любая другая ошибка (та должна проброситься наружу как есть,
   * outbox поймает её как реальный сбой обработки, не slug-коллизию).
   */
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
      // ADR-005 + D-03: publication уже не в status:publication_pending ИЛИ
      // её version уже не совпадает с payload.version — оба случая означают
      // одно и то же для worker'а: более приоритетный путь опередил эту
      // попытку. Либо unpublish (синхронный API-путь) случился между publish
      // и обработкой события, либо более новое PublicationRequested-событие
      // (например rebuild) уже обработано раньше этого (порядок обработки
      // батча не гарантированно совпадает с порядком создания событий). В
      // обоих случаях: не ошибка, не retry — worker не должен перезаписывать
      // уже более актуальное состояние устаревшими данными этого события.
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

/**
 * MongoDB duplicate-key error (code 11000) специфично на unique-индексе
 * `slug` — не любая E11000 вообще (например, {sourceType,sourceId} unique
 * тоже даёт 11000, но это НЕ slug-коллизия, а отдельный класс ошибки,
 * которую этот retry-цикл не должен молча проглатывать как "просто
 * попробуй другой slug"). Проверка через `keyPattern`/`message` — mongodb
 * driver кладёт оба на объект ошибки.
 */
function isDuplicateSlugError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: number; keyPattern?: Record<string, unknown>; message?: string };
  if (err.code !== 11000) return false;
  if (err.keyPattern) return 'slug' in err.keyPattern;
  return typeof err.message === 'string' && err.message.includes('slug');
}

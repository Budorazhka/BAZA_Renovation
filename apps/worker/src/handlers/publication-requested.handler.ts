import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import type { OutboxEventDocument } from '@baza/domain-events';
import { DevelopmentRepository } from '@baza/development';
import { MarketplacePublicationRepository } from '@baza/publication';
import type { EventHandler } from '../outbox/event-handler';
import { buildSlugBase, buildSlugCandidate } from './slug.util';
import { mapDevelopmentToDenormalizedFields, buildDevelopmentSeo, buildSearchProjection } from './development-publication.mapper';

const MAX_SLUG_ATTEMPTS = 10;

/**
 * PublicationRequested payload — точная структура, публикуемая
 * apps/api/src/modules/publication/publication.service.ts::requestPublication.
 */
interface PublicationRequestedPayload {
  publicationId: string;
  sourceType: 'unit' | 'development' | 'listing';
  sourceId: string;
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
 * Первый проход D-03 обрабатывает ТОЛЬКО sourceType:'development' —
 * 'unit'/'listing' mapper'ы не реализованы (нет соответствующих publish-
 * команд в API-слое ещё), payload с этими sourceType переводится в
 * build_failed явно, не молча игнорируется.
 */
@Injectable()
export class PublicationRequestedHandler implements EventHandler {
  private readonly logger = new Logger(PublicationRequestedHandler.name);

  constructor(
    private readonly publicationRepository: MarketplacePublicationRepository,
    private readonly developmentRepository: DevelopmentRepository,
  ) {}

  async handle(event: OutboxEventDocument): Promise<void> {
    const payload = event.payload as unknown as PublicationRequestedPayload;
    const publicationId = new Types.ObjectId(payload.publicationId);

    if (payload.sourceType !== 'development') {
      this.logger.error(
        `PublicationRequested для sourceType '${payload.sourceType}' (publication ${payload.publicationId}) — ` +
          `mapper для этого sourceType ещё не реализован (D-03 первый проход покрывает только 'development'). ` +
          `Помечаю build_failed вместо тихого игнорирования.`,
      );
      await this.publicationRepository.markBuildFailed(publicationId);
      return;
    }

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

    const slug = await this.resolveUniqueSlug(development.name, development.location.city, publicationId);

    const { modifiedCount } = await this.publicationRepository.markPublished(publicationId, {
      slug,
      seo: buildDevelopmentSeo(development, slug),
      denormalizedFields: mapDevelopmentToDenormalizedFields(development),
      searchProjection: buildSearchProjection(development),
    });

    if (modifiedCount === 0) {
      // ADR-005: publication уже не в status:publication_pending — unpublish
      // (синхронный API-путь) опередил этот worker-шаг между publish и
      // обработкой события. Не ошибка, не retry — целевое состояние
      // (unpublished) уже достигнуто более приоритетным путём, worker не
      // должен его перезаписывать обратно в published.
      this.logger.log(
        `PublicationRequested (${payload.publicationId}): публикация уже не в publication_pending ` +
          `(вероятно, unpublish опередил worker) — не перезаписываю.`,
      );
      return;
    }

    this.logger.log(`PublicationRequested (${payload.publicationId}): опубликовано, slug=${slug}.`);
  }

  private async resolveUniqueSlug(name: string, city: string, publicationId: Types.ObjectId): Promise<string> {
    const base = buildSlugBase(name, city);
    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
      const candidate = buildSlugCandidate(base, attempt);
      const taken = await this.publicationRepository.isSlugTaken(candidate, publicationId);
      if (!taken) {
        return candidate;
      }
    }
    // MAX_SLUG_ATTEMPTS исчерпан — крайне маловероятно на MVP-масштабе
    // (25 застройщиков), но не должно привести к бесконечному циклу или
    // падению без объяснения.
    throw new Error(
      `resolveUniqueSlug: не удалось найти свободный slug для "${base}" за ${MAX_SLUG_ATTEMPTS} попыток`,
    );
  }
}

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import type { OwnerScope } from '@baza/tenant-scope';
import {
  MarketplacePublicationDocument,
  PublicationSeo,
  PublicationSourceType,
} from '../schemas/marketplace-publication.schema';

/**
 * Единственная точка доступа к коллекции marketplace_publications
 * (ADR-002 требование 2 применён и здесь). Используется API-процессом
 * (upsertPending/unpublish) и worker-процессом (markPublished/markBuildFailed).
 */
@Injectable()
export class MarketplacePublicationRepository {
  constructor(
    @InjectModel(MarketplacePublicationDocument.name)
    private readonly model: Model<MarketplacePublicationDocument>,
  ) {}

  /**
   * ADR-005: команда publish upsert'ит немедленно со status:publication_pending
   * — публикация видна в системе сразу (например, в ERP как "в процессе"),
   * не отсутствует до завершения worker'а. Unique index {sourceType,sourceId}
   * (не только upsert-соглашение) физически предотвращает дублирующуюся
   * запись при конкурентном/повторном publish.
   */
  async upsertPending(
    params: { sourceType: PublicationSourceType; sourceId: Types.ObjectId; publisherScope: OwnerScope },
    session: ClientSession,
  ): Promise<MarketplacePublicationDocument> {
    const doc = await this.model
      .findOneAndUpdate(
        { sourceType: params.sourceType, sourceId: params.sourceId },
        {
          $set: { status: 'publication_pending', publisherScope: params.publisherScope },
          $inc: { version: 1 },
          $setOnInsert: { denormalizedFields: {}, searchProjection: {} },
        },
        { upsert: true, new: true, session },
      )
      .exec();
    return doc!;
  }

  async findBySource(
    sourceType: PublicationSourceType,
    sourceId: Types.ObjectId,
  ): Promise<MarketplacePublicationDocument | null> {
    return this.model.findOne({ sourceType, sourceId }).exec();
  }

  /**
   * D-03 rebuild: атомарный condition-update — переводит публикацию в
   * publication_pending, ТОЛЬКО ЕСЛИ она СЕЙЧАС published (фильтр
   * findOneAndUpdate, не отдельный read+write). Возвращает null, если
   * условие не выполнено (не published — unpublished/build_failed/никогда
   * не существовала), вызывающий код трактует это как "rebuild не нужен".
   * Атомарность самой MongoDB-операции устраняет TOCTOU-гонку с
   * конкурентным admin unpublish, которая была возможна в первой версии
   * (read isCurrentlyPublished, потом отдельный upsertPending — второй шаг
   * не перепроверял, не изменился ли статус между ними).
   */
  async markPendingIfPublished(
    sourceType: PublicationSourceType,
    sourceId: Types.ObjectId,
    publisherScope: OwnerScope,
    session: ClientSession,
  ): Promise<MarketplacePublicationDocument | null> {
    return this.model
      .findOneAndUpdate(
        { sourceType, sourceId, status: 'published' },
        { $set: { status: 'publication_pending', publisherScope }, $inc: { version: 1 } },
        { new: true, session },
      )
      .exec();
  }

  /**
   * Admin-сторона (D-06): admin unpublish endpoint адресует публикацию по
   * её собственному _id (`/admin/publications/{publicationId}/unpublish`,
   * OpenAPI-контракт), не по паре {sourceType, sourceId} — Admin-оператор
   * работает со списком публикаций, не с конкретным Development/Unit id.
   */
  async findById(id: Types.ObjectId): Promise<MarketplacePublicationDocument | null> {
    return this.model.findOne({ _id: id }).exec();
  }

  async findBySlug(slug: string): Promise<MarketplacePublicationDocument | null> {
    return this.model.findOne({ slug, status: 'published' }).exec();
  }

  /**
   * Worker-side: проверка занятости slug'а для генерации уникального
   * кандидата (ADR-005) — по ЛЮБОМУ статусу, не только published. Unique
   * index на slug не делает исключения по статусу (sparse index допускает
   * только отсутствие поля, не конкретное значение status), значит
   * unpublished/build_failed документ с тем же slug физически столкнулся
   * бы с той же коллизией на уровне БД, что и published — проверка должна
   * это учитывать, не только видимые публично записи.
   */
  async isSlugTaken(slug: string, excludeId?: Types.ObjectId): Promise<boolean> {
    const filter: Record<string, unknown> = { slug };
    if (excludeId) {
      filter._id = { $ne: excludeId };
    }
    const existing = await this.model.findOne(filter).select('_id').exec();
    return existing !== null;
  }

  async listPublished(params: {
    cursor?: Types.ObjectId;
    limit: number;
    city?: string;
    bbox?: { minLng: number; minLat: number; maxLng: number; maxLat: number };
  }): Promise<MarketplacePublicationDocument[]> {
    const filter: Record<string, unknown> = { status: 'published' };
    if (params.cursor) {
      filter._id = { $gt: params.cursor };
    }
    if (params.city) {
      filter['searchProjection.city'] = params.city;
    }
    if (params.bbox) {
      filter['searchProjection.geo'] = {
        $geoWithin: {
          $box: [
            [params.bbox.minLng, params.bbox.minLat],
            [params.bbox.maxLng, params.bbox.maxLat],
          ],
        },
      };
    }
    return this.model.find(filter).sort({ _id: 1 }).limit(params.limit).exec();
  }

  /**
   * ADR-005 worker-сторона: успешная сборка полной проекции. Условие
   * status:'publication_pending' в фильтре — worker не должен затирать
   * уже unpublished (синхронный API-путь опережает асинхронный worker)
   * документ обратно в published, если unpublish случился, пока событие
   * PublicationRequested ещё обрабатывалось.
   */
  async markPublished(
    id: Types.ObjectId,
    params: {
      slug: string;
      seo: PublicationSeo;
      denormalizedFields: Record<string, unknown>;
      searchProjection: Record<string, unknown>;
    },
  ): Promise<{ modifiedCount: number }> {
    const result = await this.model
      .updateOne(
        { _id: id, status: 'publication_pending' },
        {
          $set: {
            status: 'published',
            publishedAt: new Date(),
            slug: params.slug,
            seo: params.seo,
            denormalizedFields: params.denormalizedFields,
            searchProjection: params.searchProjection,
          },
        },
      )
      .exec();
    return { modifiedCount: result.modifiedCount };
  }

  async markBuildFailed(id: Types.ObjectId): Promise<void> {
    await this.model.updateOne({ _id: id, status: 'publication_pending' }, { $set: { status: 'build_failed' } }).exec();
  }

  /**
   * ADR-005: unpublish синхронен, в той же API-транзакции, что смена
   * canonical-статуса — не через worker. session обязателен (тот же
   * принцип, что OutboxEventRepository.create — операция вне транзакции
   * с бизнес-изменением архитектурно бессмысленна для этого паттерна).
   */
  async unpublish(
    sourceType: PublicationSourceType,
    sourceId: Types.ObjectId,
    unpublishReason: string,
    session: ClientSession,
  ): Promise<{ modifiedCount: number }> {
    const result = await this.model
      .updateOne(
        { sourceType, sourceId, status: 'published' },
        { $set: { status: 'unpublished', unpublishedAt: new Date(), unpublishReason } },
        { session },
      )
      .exec();
    return { modifiedCount: result.modifiedCount };
  }
}

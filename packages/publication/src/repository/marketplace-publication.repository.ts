import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import type { OwnerScope } from '@baza/tenant-scope';
import {
  MarketplacePublicationDocument,
  PublicationSeo,
  PublicationSourceType,
} from '../schemas/marketplace-publication.schema';

export type PublicCatalogSort = 'newest' | 'price_asc' | 'price_desc' | 'area_asc' | 'area_desc';

export interface GeoBboxFilter {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

export interface GeoPolygonFilter {
  type: 'Polygon';
  coordinates: [number, number][][];
}

export interface PublicCatalogCursor {
  id: Types.ObjectId;
  value?: number | null;
}

export interface PublicCatalogPage {
  items: MarketplacePublicationDocument[];
  total: number;
}

/**
 * SEARCH-001: строит Mongo $geoWithin-условие для searchProjection.geo
 * (2dsphere index) из bbox ИЛИ polygon — используется во всех трёх местах,
 * где раньше был только bbox (listPublished/listPublishedByFilter/
 * queryPublicPage), вынесено сюда, чтобы условие "как построить фильтр"
 * не расходилось между копиями. Оба параметра одновременно не ожидаются —
 * вызывающий код (public.controller.ts/public-listings.controller.ts)
 * отклоняет такую комбинацию 400 раньше, чем дойдёт сюда; если оба всё же
 * заданы, polygon побеждает как более точный фильтр.
 */
function buildGeoFilter(bbox?: GeoBboxFilter, polygon?: GeoPolygonFilter): Record<string, unknown> | undefined {
  if (polygon) {
    return { $geoWithin: { $geometry: polygon } };
  }
  if (bbox) {
    return {
      $geoWithin: {
        $box: [
          [bbox.minLng, bbox.minLat],
          [bbox.maxLng, bbox.maxLat],
        ],
      },
    };
  }
  return undefined;
}

const SORT_FIELDS: Record<Exclude<PublicCatalogSort, 'newest'>, { field: string; direction: 1 | -1 }> = {
  price_asc: { field: 'searchProjection.priceAmountMinorUnits', direction: 1 },
  price_desc: { field: 'searchProjection.priceAmountMinorUnits', direction: -1 },
  area_asc: { field: 'searchProjection.area', direction: 1 },
  area_desc: { field: 'searchProjection.area', direction: -1 },
};

/**
 * Единственная точка доступа к коллекции marketplace_publications
 * (ADR-002 требование 2 применён и здесь). Используется API-процессом
 * (upsertPending/unpublish) и worker-процессом (markPublished/markBuildFailed).
 */
/**
 * Что видно публике. `status: 'published'` — решение издателя, а
 * `publisherFrozen` — административная мера: заморозка организации убирает
 * её объявления с витрины, не меняя их собственного статуса (решение
 * владельца 11.09.2026).
 *
 * Одна константа на все публичные выборки, а не повтор условия в каждой:
 * забытый фильтр в одном методе означал бы, что замороженная организация
 * по-прежнему видна ровно на одной странице витрины.
 */
export const PUBLICLY_VISIBLE = { status: 'published', publisherFrozen: { $ne: true } } as const;

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
    return this.model.findOne({ slug, ...PUBLICLY_VISIBLE }).exec();
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

  /**
   * Worker-side: обновление проекции опубликованного объекта при изменении цен или статусов.
   * CAS: если передан options.expectedVersion, обновление применится ТОЛЬКО ЕСЛИ
   * текущая версия совпадает с ожидаемой и статус по-прежнему 'published'.
   * Защищает от перезаписи более свежего снимка старым при гонках или перестановке событий.
   */
  async updateProjection(
    id: Types.ObjectId,
    fields: {
      denormalizedFields?: Record<string, unknown>;
      searchProjection?: Record<string, unknown>;
    },
    options?: {
      expectedVersion?: number;
    },
  ): Promise<MarketplacePublicationDocument | null> {
    const filter: Record<string, unknown> = { _id: id, status: 'published' };
    if (typeof options?.expectedVersion === 'number') {
      filter.version = options.expectedVersion;
    }
    const $set: Record<string, unknown> = {};
    if (fields.denormalizedFields) {
      $set.denormalizedFields = fields.denormalizedFields;
    }
    if (fields.searchProjection) {
      $set.searchProjection = fields.searchProjection;
    }
    return this.model
      .findOneAndUpdate(filter, { $set, $inc: { version: 1 } }, { new: true })
      .exec();
  }

  /**
   * Public developments list — filtered by sourceType:'development', not
   * just status:'published'. PublicationSourceType also includes 'unit'
   * and 'listing'; without this filter, a future unit-sourceType publish
   * mapper (not implemented yet — the worker currently marks every 'unit'
   * PublicationRequested event build_failed) could silently start mixing
   * unit publications into the developments list once that mapper exists,
   * rendering them through toPublicCard's development-shaped fields
   * (name/classType/startDate — all undefined for a unit's denormalizedFields
   * shape) instead of a clean, intentional decision about where units
   * belong. Not reachable today, closed now so it can't become a silent
   * surprise later — mirrors the sourceType filter listPublishedByFilter
   * already applies for the listings side.
   */
  async listPublished(params: {
    cursor?: Types.ObjectId;
    limit: number;
    city?: string;
    bbox?: GeoBboxFilter;
    polygon?: GeoPolygonFilter;
  }): Promise<MarketplacePublicationDocument[]> {
    const filter: Record<string, unknown> = { ...PUBLICLY_VISIBLE, sourceType: 'development' };
    if (params.cursor) {
      filter._id = { $gt: params.cursor };
    }
    if (params.city) {
      filter['searchProjection.city'] = params.city;
    }
    const geoFilter = buildGeoFilter(params.bbox, params.polygon);
    if (geoFilter) {
      filter['searchProjection.geo'] = geoFilter;
    }
    return this.model.find(filter).sort({ _id: 1 }).limit(params.limit).exec();
  }

  /**
   * MKT-002: тот же паттерн, что listPublished, дополнительно параметризован
   * sourceType и listing-специфичными полями searchProjection
   * (dealType/propertyType/commercialSubtype — buildListingSearchProjection,
   * apps/worker/src/handlers/listing-publication.mapper.ts). Не расширяет
   * listPublished напрямую — тот метод специфичен под Development-caller'ов
   * (public.controller.ts), у которых нет и не должно быть этих полей в
   * фильтре; отдельный метод явно документирует, какие поля relevant для
   * какого sourceType, вместо одного "универсального" метода с растущим
   * списком опциональных полей на все source-типы сразу.
   */
  async listPublishedByFilter(params: {
    sourceType: PublicationSourceType;
    cursor?: Types.ObjectId;
    limit: number;
    city?: string;
    bbox?: GeoBboxFilter;
    polygon?: GeoPolygonFilter;
    dealType?: string;
    propertyType?: string;
    commercialSubtype?: string;
  }): Promise<MarketplacePublicationDocument[]> {
    const filter: Record<string, unknown> = { ...PUBLICLY_VISIBLE, sourceType: params.sourceType };
    if (params.cursor) {
      filter._id = { $gt: params.cursor };
    }
    if (params.city) {
      filter['searchProjection.city'] = params.city;
    }
    if (params.dealType) {
      filter['searchProjection.dealType'] = params.dealType;
    }
    if (params.propertyType) {
      filter['searchProjection.propertyType'] = params.propertyType;
    }
    if (params.commercialSubtype) {
      filter['searchProjection.commercialSubtype'] = params.commercialSubtype;
    }
    const geoFilter = buildGeoFilter(params.bbox, params.polygon);
    if (geoFilter) {
      filter['searchProjection.geo'] = geoFilter;
    }
    return this.model.find(filter).sort({ _id: 1 }).limit(params.limit).exec();
  }

  /**
   * Public catalogue page with an exact total and a stable, compound cursor.
   * The cursor is applied only to the page query; the count always uses the
   * same visibility/filter predicate without the cursor so it remains honest
   * across subsequent requests.
   */
  async listPublishedPage(params: {
    cursor?: PublicCatalogCursor;
    limit: number;
    city?: string;
    bbox?: GeoBboxFilter;
    polygon?: GeoPolygonFilter;
    publisherOrganizationId?: Types.ObjectId;
    sort?: PublicCatalogSort;
  }): Promise<PublicCatalogPage> {
    return this.queryPublicPage({ ...params, sourceType: 'development', sort: params.sort ?? 'newest' });
  }

  async listPublishedByFilterPage(params: {
    sourceType: PublicationSourceType;
    cursor?: PublicCatalogCursor;
    limit: number;
    city?: string;
    bbox?: GeoBboxFilter;
    polygon?: GeoPolygonFilter;
    dealType?: string;
    propertyType?: string;
    commercialSubtype?: string;
    publisherOrganizationId?: Types.ObjectId;
    sort?: PublicCatalogSort;
  }): Promise<PublicCatalogPage> {
    return this.queryPublicPage({ ...params, sort: params.sort ?? 'newest' });
  }

  private async queryPublicPage(params: {
    sourceType: PublicationSourceType;
    cursor?: PublicCatalogCursor;
    limit: number;
    city?: string;
    bbox?: GeoBboxFilter;
    polygon?: GeoPolygonFilter;
    dealType?: string;
    propertyType?: string;
    commercialSubtype?: string;
    publisherOrganizationId?: Types.ObjectId;
    sort: PublicCatalogSort;
  }): Promise<PublicCatalogPage> {
    const baseFilter: Record<string, unknown> = { ...PUBLICLY_VISIBLE, sourceType: params.sourceType };
    if (params.city) baseFilter['searchProjection.city'] = params.city;
    if (params.dealType) baseFilter['searchProjection.dealType'] = params.dealType;
    if (params.propertyType) baseFilter['searchProjection.propertyType'] = params.propertyType;
    if (params.commercialSubtype) baseFilter['searchProjection.commercialSubtype'] = params.commercialSubtype;
    if (params.publisherOrganizationId) {
      // Фильтр по автору публикации: «показать всё этого застройщика или
      // агентства». Берётся из publisherScope, который и так есть у каждой
      // публикации, а не из searchProjection — денормализовать сюда ничего не
      // нужно, и значение не может разойтись с источником.
      //
      // Тип проверяется явно: у публикации от частного собственника
      // (marketplace_account) organizationId отсутствует, и без проверки типа
      // фильтр по несуществующему полю молча вернул бы пустой список вместо
      // осмысленного ответа.
      baseFilter['publisherScope.type'] = 'organization';
      baseFilter['publisherScope.organizationId'] = params.publisherOrganizationId;
    }
    const geoFilter = buildGeoFilter(params.bbox, params.polygon);
    if (geoFilter) {
      baseFilter['searchProjection.geo'] = geoFilter;
    }

    const filter: Record<string, unknown> = { ...baseFilter };
    if (params.cursor) {
      if (params.sort === 'newest') {
        filter._id = { $gt: params.cursor.id };
      } else {
        const sortField = SORT_FIELDS[params.sort];
        const value = params.cursor.value;
        if (value === null || value === undefined) {
          // Mongo sorts missing values first for ascending order. Once a
          // client has consumed that prefix, only numeric values remain.
          if (sortField.direction === 1) filter[sortField.field] = { $exists: true };
          else filter._id = { $exists: false };
        } else if (sortField.direction === 1) {
          filter.$or = [
            { [sortField.field]: { $gt: value } },
            { [sortField.field]: value, _id: { $gt: params.cursor.id } },
          ];
        } else {
          filter.$or = [
            { [sortField.field]: { $lt: value } },
            { [sortField.field]: value, _id: { $lt: params.cursor.id } },
            { [sortField.field]: { $exists: false } },
          ];
        }
      }
    }

    const sortSpec = params.sort === 'newest'
      ? { _id: 1 as const }
      : (() => {
          const sortField = SORT_FIELDS[params.sort];
          return { [sortField.field]: sortField.direction, _id: sortField.direction };
        })();

    const [items, total] = await Promise.all([
      this.model.find(filter).sort(sortSpec).limit(params.limit).exec(),
      this.model.countDocuments(baseFilter).exec(),
    ]);
    return { items, total };
  }

  /**
   * D-06: admin-listing — НЕ ограничено status:'published' (в отличие от
   * listPublished выше) — admin должен находить publication_pending/
   * unpublished/build_failed тоже, иначе не сможет разобраться в том, что
   * нужно проверить/снять. scopeFilter приходит уже построенным вызывающим
   * кодом (apps/api AdminPublicationService через buildPublicationScopeFilter)
   * — этот repository не знает про PermissionGrant/AdminContext, только
   * исполняет уже готовое Mongo-условие (модульная граница: packages/publication
   * не зависит от authorization-модуля apps/api).
   */
  async listForAdmin(params: {
    scopeFilter: Record<string, unknown>;
    cursor?: Types.ObjectId;
    limit: number;
  }): Promise<MarketplacePublicationDocument[]> {
    const filter: Record<string, unknown> = { ...params.scopeFilter };
    if (params.cursor) {
      filter._id = { $gt: params.cursor };
    }
    return this.model.find(filter).sort({ _id: 1 }).limit(params.limit).exec();
  }

  /**
   * Admin audit feed (apps/api AdminAuditService): audit_events хранит
   * `resource`/`resourceId` (= sourceType/sourceId публикации), НЕ city —
   * city-scoped read-grant (searchProjection.city в этой коллекции) не
   * может быть применён напрямую к audit_events-документу. Этот метод
   * резолвит МНОЖЕСТВО sourceId, попадающих под уже построенный
   * buildPublicationScopeFilter (тот же scopeFilter-контракт, что
   * listForAdmin), чтобы вызывающий код мог построить
   * `resourceId: {$in: [...]}` фильтр по audit_events. Без пагинации —
   * используется только для построения промежуточного $in-списка, не
   * возвращается клиенту напрямую.
   */
  async listSourceIdsByScopeFilter(scopeFilter: Record<string, unknown>): Promise<{ sourceType: string; sourceId: Types.ObjectId }[]> {
    const rows = await this.model.find(scopeFilter, { sourceType: 1, sourceId: 1 }).exec();
    return rows.map((row) => ({ sourceType: row.sourceType, sourceId: row.sourceId }));
  }

  /**
   * ADR-005 worker-сторона: успешная сборка полной проекции. Условие
   * status:'publication_pending' в фильтре — worker не должен затирать
   * уже unpublished (синхронный API-путь опережает асинхронный worker)
   * документ обратно в published, если unpublish случился, пока событие
   * PublicationRequested ещё обрабатывалось.
   *
   * D-03: version — тоже часть CAS-фильтра, не post-hoc сравнение в
   * handler'е (тот же принцип, что markPendingIfPublished/unpublish —
   * атомарное условие в самом updateOne). Защищает от другой гонки: два
   * последовательных PublicationRequested события (например publish, затем
   * rebuild) могут быть обработаны worker'ом не в порядке создания — без
   * version в фильтре более старое событие, обработанное ПОСЛЕ более
   * нового, затёрло бы уже актуальную проекцию устаревшими данными.
   * expectedVersion не совпал → modifiedCount:0, тот же код-путь, что уже
   * обрабатывает unpublish-гонку.
   */
  async markPublished(
    id: Types.ObjectId,
    params: {
      expectedVersion: number;
      slug: string;
      seo: PublicationSeo;
      denormalizedFields: Record<string, unknown>;
      searchProjection: Record<string, unknown>;
    },
  ): Promise<{ modifiedCount: number }> {
    const result = await this.model
      .updateOne(
        { _id: id, status: 'publication_pending', version: params.expectedVersion },
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

  /**
   * Заморозка и разморозка организации: снимает с витрины или возвращает
   * на неё все публикации издателя разом, не трогая их собственный
   * `status` (см. `publisherFrozen` в схеме).
   *
   * Затрагивает публикации в любом статусе намеренно: пока организация
   * заморожена, опубликованная позже запись тоже не должна оказаться на
   * витрине, а `publisherFrozen` у неё проставит publish-путь.
   */
  async setPublisherFrozenForOrganization(
    organizationId: Types.ObjectId,
    frozen: boolean,
    session?: ClientSession,
  ): Promise<{ modifiedCount: number }> {
    const result = await this.model
      .updateMany(
        { 'publisherScope.organizationId': organizationId },
        { $set: { publisherFrozen: frozen } },
        { session },
      )
      .exec();
    return { modifiedCount: result.modifiedCount };
  }
}

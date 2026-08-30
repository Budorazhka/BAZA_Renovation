import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { OwnerScopeSchema, type OwnerScope } from '@baza/tenant-scope';

export type PublicationSourceType = 'unit' | 'development' | 'listing';
export type PublicationStatus = 'publication_pending' | 'published' | 'unpublished' | 'build_failed';

export interface PublicationSeo {
  title: string;
  description: string;
  canonicalUrl: string;
  structuredData: Record<string, unknown>;
}

/**
 * ADR-005: {type, description, canonicalUrl, structuredData} — explicit
 * nested schema, не inline plain-object (structuredData содержит
 * произвольный JSON-LD, но title/description/canonicalUrl — фиксированные
 * строковые поля).
 */
const SeoSchema = new MongooseSchema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    canonicalUrl: { type: String, required: true },
    structuredData: { type: Object, required: true },
  },
  { _id: false },
);

/**
 * docs/architecture/domain-model.md Модуль 5 / mongodb-schema.md
 * `marketplace_publications` (ADR-005). Отдельная read-model коллекция,
 * НЕ читается напрямую из canonical-сущностей (Development/Unit/Listing)
 * на каждый публичный HTTP-запрос — строится worker'ом при publish,
 * переиспользуется на чтение.
 *
 * Живёт в @baza/publication (не в apps/api) — и API-процесс (upsert
 * publication_pending при publish, синхронный unpublish), и worker-процесс
 * (асинхронная сборка полной проекции по PublicationRequested) обращаются
 * к ОДНОЙ и той же коллекции — тот же принцип, что уже применён к
 * outbox_events/media_assets.
 *
 * denormalizedFields/searchProjection — НЕ фиксированная схема здесь:
 * ADR-005 explicit whitelist mapper для каждого sourceType определяет,
 * какие поля туда попадают (архитектурная защита от утечки внутренних
 * полей — поле физически не может утечь, если его нет в определении
 * whitelist-маппера). Схема документа хранит их как Mixed/Object, сам
 * whitelist — ответственность mapper-кода на уровне конкретного sourceType,
 * не общей структуры MarketplacePublication.
 */
@Schema({ collection: 'marketplace_publications', timestamps: { createdAt: 'createdAt', updatedAt: false } })
export class MarketplacePublicationDocument extends Document {
  declare _id: Types.ObjectId;

  @Prop({ required: true, enum: ['unit', 'development', 'listing'] })
  sourceType!: PublicationSourceType;

  @Prop({ required: true, type: Types.ObjectId })
  sourceId!: Types.ObjectId;

  @Prop({ type: OwnerScopeSchema, required: true })
  publisherScope!: OwnerScope;

  /**
   * Уникальный, отдельный от _id (ADR-005: "человекочитаемый, отдельный от
   * _id"). НЕ required на уровне схемы — slug генерируется worker'ом при
   * первой успешной сборке проекции, документ существует в status:
   * publication_pending ДО того, как slug известен (upsert из API-процесса
   * происходит раньше, чем worker успевает сгенерировать slug).
   */
  @Prop({ required: false })
  slug?: string;

  @Prop({ required: true, default: 0 })
  version!: number;

  @Prop({
    required: true,
    enum: ['publication_pending', 'published', 'unpublished', 'build_failed'],
    default: 'publication_pending',
  })
  status!: PublicationStatus;

  @Prop()
  publishedAt?: Date;

  @Prop()
  unpublishedAt?: Date;

  @Prop()
  unpublishReason?: string;

  @Prop({ type: SeoSchema, required: false })
  seo?: PublicationSeo;

  @Prop({ type: Object, default: {} })
  denormalizedFields!: Record<string, unknown>;

  @Prop({ type: Object, default: {} })
  searchProjection!: Record<string, unknown>;

  declare createdAt: Date;
}

export const MarketplacePublicationSchema = SchemaFactory.createForClass(MarketplacePublicationDocument);

// ADR-005 патч: unique compound — enforced worker-идемпотентность, не
// только соглашение "worker всегда делает upsert по этой паре".
MarketplacePublicationSchema.index({ sourceType: 1, sourceId: 1 }, { unique: true });
MarketplacePublicationSchema.index({ slug: 1 }, { unique: true, sparse: true });
MarketplacePublicationSchema.index({ status: 1 });
// D-04A: обслуживает listPublished — {status:'published', _id:{$gt:cursor}}
// + sort({_id:1}) одним индексом (equality+range на compound), а не
// equality-only через {status:1} с последующим in-memory сортом по _id.
// Одиночный {status:1} не убираю — им пользуются другие consumers
// (markPendingIfPublished, admin listing), которым compound не нужен.
MarketplacePublicationSchema.index({ status: 1, _id: 1 });
MarketplacePublicationSchema.index({ 'searchProjection.geo': '2dsphere' });
MarketplacePublicationSchema.index({ status: 1, sourceType: 1, _id: 1 });
MarketplacePublicationSchema.index({ status: 1, sourceType: 1, 'searchProjection.priceAmountMinorUnits': 1, _id: 1 });
MarketplacePublicationSchema.index({ status: 1, sourceType: 1, 'searchProjection.area': 1, _id: 1 });
MarketplacePublicationSchema.index({ status: 1, sourceType: 1, 'searchProjection.city': 1, _id: 1 });

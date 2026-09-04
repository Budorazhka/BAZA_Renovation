import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { OwnerScopeSchema, type OwnerScope } from '@baza/tenant-scope';

export type ListingRevisionActorType = 'identity' | 'admin_account' | 'system';
export type ListingRevisionChangeType =
  | 'asset_created'
  | 'listing_created'
  | 'listing_activated'
  | 'listing_published'
  | 'listing_unpublished'
  // Добавлено 04.09.2026 вместе с редактированием объявления: до этого журнал
  // знал только события жизненного цикла, потому что править было нечем.
  | 'listing_updated';

export interface ListingRevisionCharacteristicsSnapshot {
  area?: number;
  rooms?: number;
  floor?: number;
  totalFloors?: number;
}

export interface ListingRevisionPriceSnapshot {
  amountMinorUnits: number;
  currency: string;
}

/**
 * Та же вложенная-схема-как-отдельный-объект причина, что в
 * audit-event.schema.ts: inline `{ type: { type: String, ... } }` путает
 * Mongoose пользовательское поле `actor.type` с SchemaTypeOptions.type.
 */
const RevisionActorSchema = new MongooseSchema(
  {
    type: { type: String, enum: ['identity', 'admin_account', 'system'], required: true },
    id: { type: MongooseSchema.Types.ObjectId, required: false },
  },
  { _id: false },
);

const RevisionPriceSchema = new MongooseSchema(
  {
    amountMinorUnits: { type: Number, required: true },
    currency: { type: String, required: true },
  },
  { _id: false },
);

const RevisionCharacteristicsSchema = new MongooseSchema(
  {
    area: { type: Number, required: false },
    rooms: { type: Number, required: false },
    floor: { type: Number, required: false },
    totalFloors: { type: Number, required: false },
  },
  { _id: false },
);

/**
 * Часть 1 (хвост Этапа 3 master plan: "недельная история версий карточки").
 * Отдельная append-only коллекция снапшотов, НЕ замена CAS-счётчика
 * `version` на PropertyAsset/Listing (тот защищает от гонки записи, не
 * даёт историю для просмотра) — тот же принцип разделения, что
 * outbox_events (техническая доставка) vs audit_events (человекочитаемая
 * история критических действий). ListingRevision — денормализованный
 * снапшот полей, реально показываемых на карточке (цена/статус/
 * характеристики/медиа-ключи), на момент каждой значимой мутации.
 *
 * `listingId` опционален — снапшот `asset_created` пишется ДО того, как у
 * PropertyAsset появился хоть один Listing.
 *
 * Retention 7 дней (задача явно требует "недельную историю") — TTL-индекс
 * ниже, тот же паттерн, что AuditEventSchema (apps/api/src/modules/audit/
 * schemas/audit-event.schema.ts) и OutboxEventSchema (packages/domain-events).
 */
@Schema({ collection: 'listing_revisions', timestamps: { createdAt: 'changedAt', updatedAt: false } })
export class ListingRevisionDocument extends Document {
  declare _id: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId })
  propertyAssetId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: false })
  listingId?: Types.ObjectId;

  @Prop({ type: OwnerScopeSchema, required: true })
  publisherScope!: OwnerScope;

  @Prop({ type: RevisionActorSchema, required: true })
  actor!: { type: ListingRevisionActorType; id?: Types.ObjectId };

  @Prop({
    required: true,
    enum: [
      'asset_created',
      'listing_created',
      'listing_activated',
      'listing_published',
      'listing_unpublished',
      'listing_updated',
    ],
  })
  changeType!: ListingRevisionChangeType;

  @Prop({ type: RevisionPriceSchema, required: false })
  price?: ListingRevisionPriceSnapshot;

  @Prop({ required: false })
  status?: string;

  @Prop({ type: RevisionCharacteristicsSchema, required: false })
  characteristics?: ListingRevisionCharacteristicsSnapshot;

  @Prop({ type: [String], default: [] })
  mediaKeys!: string[];

  declare changedAt: Date;
}

export const ListingRevisionSchema = SchemaFactory.createForClass(ListingRevisionDocument);

// История карточки, самые свежие снапшоты первыми — основной read-путь.
ListingRevisionSchema.index({ propertyAssetId: 1, changedAt: -1 });
ListingRevisionSchema.index({ listingId: 1, changedAt: -1 }, { sparse: true });

// Retention 7 дней (задача: "недельная история версий карточки") — TTL-индекс.
const SEVEN_DAYS_IN_SECONDS = 60 * 60 * 24 * 7;
ListingRevisionSchema.index({ changedAt: 1 }, { expireAfterSeconds: SEVEN_DAYS_IN_SECONDS });

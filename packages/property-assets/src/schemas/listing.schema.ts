import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { OwnerScopeSchema, type OwnerScope } from '@baza/tenant-scope';
import type { Currency } from '@baza/contracts';

export type ListingDealType = 'sale' | 'rent_long' | 'rent_short';
export type ListingStatus = 'draft' | 'active' | 'expired' | 'archived';

const MoneyAmountSchema = new MongooseSchema(
  {
    amountMinorUnits: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: ['USD', 'GEL', 'RUB'], required: true },
  },
  { _id: false },
);

/**
 * `updatedAt` включён 04.09.2026 вместе с редактированием объявления. До этого
 * стояло `updatedAt: false` — и это было честно: менять у объявления было
 * нечего, ни одного эндпоинта правки не существовало.
 *
 * Решение владельца: при правке меняется именно дата обновления, а дата
 * публикации остаётся прежней. Поэтому `createdAt` не трогается, а
 * `lastConfirmedAt` (часы актуальности) правкой не сбрасывается — иначе
 * поправленная запятая в описании вечно держала бы объявление свежим.
 */
@Schema({ collection: 'listings', timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } })
export class ListingDocument extends Document {
  declare _id: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId })
  propertyAssetId!: Types.ObjectId;

  @Prop({ type: OwnerScopeSchema, required: true })
  publisherScope!: OwnerScope;

  @Prop({ required: true, enum: ['sale', 'rent_long', 'rent_short'] })
  dealType!: ListingDealType;

  @Prop({ type: MoneyAmountSchema, required: true })
  price!: { amountMinorUnits: number; currency: Currency };

  @Prop({ required: true, enum: ['draft', 'active', 'expired', 'archived'], default: 'draft' })
  status!: ListingStatus;

  @Prop({ required: true, default: 0 })
  version!: number;

  @Prop()
  lastConfirmedAt?: Date;

  /**
   * `[listing-legacy-migration]`: id объявления вторичного рынка в старой
   * системе — ключ идемпотентности для будущего одноразового скрипта
   * переноса, тот же принцип, что lead.schema.ts::legacyId. Опционально —
   * только у мигрированных объявлений оно есть, обычная публикация через
   * ERP/marketplace-visitka его никогда не заполняет.
   *
   * Индекс — глобальный unique (не составной с publisherScope):
   * publisherScope — discriminated union (`organization` |
   * `marketplace_account`, см. @baza/tenant-scope), а не единый плоский
   * organizationId-ключ, как у Lead/Development/Building/Unit — составную
   * scoping-пару, которую lead.schema.ts строит из organizationId, здесь
   * нельзя воспроизвести тем же способом (два разных возможных поля scope
   * вместо одного). Глобальная уникальность legacyId по одиночному полю не
   * зависит от формы scope и `sparse:true` для одиночного поля безопасен
   * (не подвержен ловушке compound-индекса из lead.schema.ts).
   */
  @Prop({ required: false })
  legacyId?: string;

  declare createdAt: Date;
  /** Дата последней правки. Отсутствует у объявлений, которые ни разу не правили. */
  declare updatedAt?: Date;
}

export const ListingSchema = SchemaFactory.createForClass(ListingDocument);
ListingSchema.index({ 'publisherScope.organizationId': 1 }, { sparse: true });
ListingSchema.index({ legacyId: 1 }, { unique: true, sparse: true });
// Owner/realtor marketplace publishing wizard: обслуживает
// findByIdForIdentity/listForAssetIdentity — та же sparse-стратегия, что
// organizationId-индекс выше.
ListingSchema.index({ 'publisherScope.identityId': 1 }, { sparse: true });
ListingSchema.index(
  { propertyAssetId: 1, dealType: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } },
);
ListingSchema.index({ 'publisherScope.organizationId': 1, propertyAssetId: 1, status: 1 });

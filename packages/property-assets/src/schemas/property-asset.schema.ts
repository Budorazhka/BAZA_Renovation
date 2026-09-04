import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { OwnerScopeSchema, type OwnerScope } from '@baza/tenant-scope';

export type PropertyType = 'apartment' | 'house' | 'land' | 'commercial';
export type CommercialSubtype = 'office' | 'warehouse' | 'retail' | 'business' | 'free_purpose';
export type PropertyAssetMediaRole = 'cover' | 'gallery';

export interface PropertyAssetMediaItem {
  id: string;
  mediaAssetId: Types.ObjectId;
  role: PropertyAssetMediaRole;
  sortOrder: number;
  alt?: string;
  isPrivate?: boolean;
  createdAt: Date;
}

const PropertyAssetMediaItemSchema = new MongooseSchema(
  {
    id: { type: String, required: true },
    mediaAssetId: { type: MongooseSchema.Types.ObjectId, required: true },
    role: { type: String, enum: ['cover', 'gallery'], required: true },
    sortOrder: { type: Number, required: true, default: 0 },
    alt: { type: String, required: false },
    isPrivate: { type: Boolean, required: false, default: false },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false },
);

const GeoPointSchema = new MongooseSchema(
  {
    type: { type: String, enum: ['Point'], required: true },
    coordinates: { type: [Number], required: true },
  },
  { _id: false },
);

const LocationSchema = new MongooseSchema(
  {
    country: { type: String, required: true },
    city: { type: String, required: true },
    address: { type: String, required: true },
    geo: { type: GeoPointSchema, required: true },
  },
  { _id: false },
);

const CharacteristicsSchema = new MongooseSchema(
  {
    area: { type: Number, required: true },
    rooms: { type: Number, required: false },
    floor: { type: Number, required: false },
    totalFloors: { type: Number, required: false },
  },
  { _id: false },
);

/**
 * `updatedAt` включён 04.09.2026 вместе с редактированием объявления, см.
 * докстринг ListingDocument: характеристики объекта живут здесь, а не в
 * объявлении, поэтому правка площади или числа комнат меняет дату обновления
 * именно этого документа.
 */
@Schema({ collection: 'property_assets', timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } })
export class PropertyAssetDocument extends Document {
  declare _id: Types.ObjectId;

  @Prop({ type: OwnerScopeSchema, required: true })
  publisherScope!: OwnerScope;

  @Prop({ required: true, enum: ['apartment', 'house', 'land', 'commercial'] })
  propertyType!: PropertyType;

  @Prop({ required: false, enum: ['office', 'warehouse', 'retail', 'business', 'free_purpose'] })
  commercialSubtype?: CommercialSubtype;

  @Prop({ type: LocationSchema, required: true })
  location!: {
    country: string;
    city: string;
    address: string;
    geo: { type: 'Point'; coordinates: [number, number] };
  };

  @Prop({ type: CharacteristicsSchema, required: true })
  characteristics!: {
    area: number;
    rooms?: number;
    floor?: number;
    totalFloors?: number;
  };

  /**
   * DEDUPE-001 (owner decision, xlsx #58): "признаки дубля — телефон
   * собственника, адрес, включая этаж и площадь и комнатность".
   */
  @Prop({ required: true })
  representativePhone!: string;

  /**
   * Media-вертикаль (MKT-004): каноническое хранилище медиа-ресурсов
   * физического объекта недвижимости. Хранит массив метаданных медиа,
   * ссылающихся на MediaAssetDocument из @baza/media-storage.
   * Листинги (ListingDocument) не дублируют медиа, а разделяют медиа
   * своего PropertyAsset.
   */
  @Prop({ type: [PropertyAssetMediaItemSchema], default: [] })
  media!: PropertyAssetMediaItem[];

  @Prop({ required: true, default: 0 })
  version!: number;

  declare createdAt: Date;
  /** Дата последней правки характеристик. Отсутствует, если объект не правили. */
  declare updatedAt?: Date;
}

export const PropertyAssetSchema = SchemaFactory.createForClass(PropertyAssetDocument);
PropertyAssetSchema.index({ 'publisherScope.organizationId': 1 }, { sparse: true });
PropertyAssetSchema.index({ 'publisherScope.identityId': 1 }, { sparse: true });
PropertyAssetSchema.index({ 'location.geo': '2dsphere' });
PropertyAssetSchema.index({ 'publisherScope.organizationId': 1, 'location.city': 1 });
PropertyAssetSchema.index({ 'media.mediaAssetId': 1 }, { sparse: true });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { OwnerScopeSchema, type OwnerScope } from '@baza/tenant-scope';

export type PropertyType = 'apartment' | 'house' | 'land' | 'commercial';
export type CommercialSubtype = 'office' | 'warehouse' | 'retail' | 'business' | 'free_purpose';

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

@Schema({ collection: 'property_assets', timestamps: { createdAt: 'createdAt', updatedAt: false } })
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
   * собственника, адрес, включая этаж и площадь и комнатность". Не
   * существовало на схеме до этой задачи (PROP-001 не включал контактное
   * поле вообще) — тот же паттерн, что Development.contact был добавлен
   * в D-03 как обязательное поле уже после первого прохода D-01. Не
   * публикуется напрямую в MarketplacePublication (listing-publication.mapper.ts
   * whitelist не включает это поле) — используется только для
   * server-side dedupe-сопоставления, тот же принцип non-disclosure, что
   * Development.contact не попадает в публичную проекцию без отдельного
   * reveal-механизма.
   */
  @Prop({ required: true })
  representativePhone!: string;

  @Prop({ required: true, default: 0 })
  version!: number;

  declare createdAt: Date;
}

export const PropertyAssetSchema = SchemaFactory.createForClass(PropertyAssetDocument);
PropertyAssetSchema.index({ 'publisherScope.organizationId': 1 }, { sparse: true });
// Owner/realtor marketplace publishing wizard: обслуживает
// findByIdForIdentity/listForIdentity — тот же паттерн, что
// media-asset.schema.ts уже применяет для своего ownerScope.identityId.
PropertyAssetSchema.index({ 'publisherScope.identityId': 1 }, { sparse: true });
PropertyAssetSchema.index({ 'location.geo': '2dsphere' });
PropertyAssetSchema.index({ 'publisherScope.organizationId': 1, 'location.city': 1 });

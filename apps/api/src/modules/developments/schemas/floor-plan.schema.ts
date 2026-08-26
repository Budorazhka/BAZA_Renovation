import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export interface GeoPolygon2D {
  type: 'Polygon';
  coordinates: number[][][];
}

/**
 * Явный new MongooseSchema(...) — см. development.schema.ts::GeoPointSchema
 * для полного объяснения (GeoJSON `type` поле конфликтует с
 * SchemaTypeOptions.type при inline-объявлении).
 */
const PolygonSchema = new MongooseSchema(
  {
    type: { type: String, enum: ['Polygon'], required: true },
    coordinates: { type: [[[Number]]], required: true },
  },
  { _id: false },
);

/**
 * docs/architecture/domain-model.md Модуль 4 / mongodb-schema.md `floor_plans`.
 * Переиспользуемая планировка — many units share one plan (Unit.floorPlanId).
 */
@Schema({ collection: 'floor_plans', timestamps: { createdAt: 'createdAt', updatedAt: false } })
export class FloorPlanDocument extends Document {
  declare _id: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId })
  buildingId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId })
  organizationId!: Types.ObjectId;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  rooms!: number;

  @Prop({ required: true })
  area!: number;

  @Prop()
  isEuro?: boolean;

  /** Media module — MediaAssetDocument._id ссылка, не embedded. */
  @Prop({ type: Types.ObjectId, required: false })
  imageAssetId?: Types.ObjectId;

  @Prop({ type: [String], default: [] })
  tags!: string[];

  @Prop({ type: PolygonSchema, required: false })
  polygon?: GeoPolygon2D;

  declare createdAt: Date;
}

export const FloorPlanSchema = SchemaFactory.createForClass(FloorPlanDocument);

FloorPlanSchema.index({ buildingId: 1 });
FloorPlanSchema.index({ organizationId: 1 });

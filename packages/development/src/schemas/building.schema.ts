import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export interface GeoPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

/**
 * Явный new MongooseSchema(...), не inline plain-object — GeoJSON `type`
 * поле конфликтует с зарезервированным SchemaTypeOptions.type при inline-
 * объявлении (см. development.schema.ts::GeoPointSchema для полного
 * объяснения, тот же паттерн).
 */
const PolygonSchema = new MongooseSchema(
  {
    type: { type: String, enum: ['Polygon'], required: true },
    coordinates: { type: [[[Number]]], required: true },
  },
  { _id: false },
);

/**
 * docs/architecture/domain-model.md Модуль 4 / mongodb-schema.md `buildings`.
 */
@Schema({ collection: 'buildings', timestamps: { createdAt: 'createdAt', updatedAt: false } })
export class BuildingDocument extends Document {
  declare _id: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId })
  developmentId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId })
  organizationId!: Types.ObjectId;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  floorsCount!: number;

  @Prop()
  startDate?: Date;

  @Prop()
  completionDate?: Date;

  @Prop({ type: PolygonSchema, required: false })
  polygon?: GeoPolygon;

  /**
   * `[building-legacy-migration]`: id корпуса (EstateBuilding) в старой
   * системе — ключ идемпотентности для будущего одноразового скрипта
   * переноса, тот же принцип, что lead.schema.ts::legacyId. Опционально —
   * только у мигрированных корпусов оно есть.
   *
   * `partialFilterExpression`, НЕ `sparse:true` — та же причина, что
   * development.schema.ts::legacyId (composite sparse индекс на паре, где
   * organizationId присутствует всегда, индексирует любой немигрированный
   * Building с `legacyId: null` и роняет E11000 на втором таком корпусе).
   */
  @Prop({ required: false })
  legacyId?: string;

  declare createdAt: Date;
}

export const BuildingSchema = SchemaFactory.createForClass(BuildingDocument);

BuildingSchema.index({ developmentId: 1 });
BuildingSchema.index({ organizationId: 1 });
BuildingSchema.index(
  { organizationId: 1, legacyId: 1 },
  { unique: true, partialFilterExpression: { legacyId: { $exists: true } } },
);

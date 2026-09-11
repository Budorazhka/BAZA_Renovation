import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import type { MoneyAmount } from '@baza/contracts';

export type UnitKind = 'apartment' | 'commercial' | 'office' | 'parking' | 'storage' | 'other';
export type UnitStatus = 'available' | 'reserved' | 'sold' | 'hidden';

export interface UnitPriceHistoryEntry {
  price: MoneyAmount;
  changedAt: Date;
  changedBy: Types.ObjectId; // positionId
}

const MoneyAmountSchemaDefinition = {
  amountMinorUnits: { type: Number, required: true },
  currency: { type: String, enum: ['USD', 'GEL', 'RUB'], required: true },
};

const PriceHistoryEntrySchemaDefinition = {
  price: { type: MoneyAmountSchemaDefinition, required: true },
  changedAt: { type: Date, required: true },
  changedBy: { type: Types.ObjectId, required: true },
};

/**
 * docs/architecture/domain-model.md Модуль 4 / mongodb-schema.md `units`.
 * D-01: kind как отдельное поле (parking — отдельная шахматка на уровне
 * query, не отдельная коллекция). priceHistory логируется на каждое
 * изменение (`[owner decision — xlsx #54]`).
 */
@Schema({ collection: 'units', timestamps: { createdAt: 'createdAt', updatedAt: false } })
export class UnitDocument extends Document {
  declare _id: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId })
  buildingId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId })
  floorId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: false })
  sectionId?: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId })
  organizationId!: Types.ObjectId;

  @Prop({ required: true })
  number!: string;

  @Prop({ required: true, enum: ['apartment', 'commercial', 'office', 'parking', 'storage', 'other'] })
  kind!: UnitKind;

  @Prop()
  rooms?: number;

  @Prop({ required: true })
  area!: number;

  @Prop()
  areaLiving?: number;

  @Prop()
  areaBalcony?: number;

  @Prop({ type: MoneyAmountSchemaDefinition, required: true })
  price!: MoneyAmount;

  @Prop({ required: true, enum: ['available', 'reserved', 'sold', 'hidden'], default: 'available' })
  status!: UnitStatus;

  @Prop({ type: Types.ObjectId, required: false })
  floorPlanId?: Types.ObjectId;

  @Prop({ type: [PriceHistoryEntrySchemaDefinition], default: [] })
  priceHistory!: UnitPriceHistoryEntry[];

  @Prop()
  promotion?: string;

  /** conventions.md разд.5 — optimistic concurrency (409 VERSION_CONFLICT). */
  @Prop({ required: true, default: 0 })
  version!: number;

  /**
   * `[unit-legacy-migration]`: id объекта (EstateNewconstructionsApartment/
   * EstateApartment) в старой системе — ключ идемпотентности для будущего
   * одноразового скрипта переноса, тот же принцип, что
   * lead.schema.ts::legacyId. Опционально — только у мигрированных юнитов
   * оно есть.
   *
   * `partialFilterExpression`, НЕ `sparse:true` — та же причина, что
   * development.schema.ts::legacyId (composite sparse индекс на паре, где
   * organizationId присутствует всегда, индексирует любой немигрированный
   * Unit с `legacyId: null` и роняет E11000 на втором таком юните).
   */
  @Prop({ required: false })
  legacyId?: string;

  declare createdAt: Date;
}

export const UnitSchema = SchemaFactory.createForClass(UnitDocument);

UnitSchema.index({ buildingId: 1, kind: 1, status: 1 });
UnitSchema.index({ floorId: 1 });
UnitSchema.index({ organizationId: 1, status: 1 });
UnitSchema.index({ floorPlanId: 1 });
UnitSchema.index(
  { organizationId: 1, legacyId: 1 },
  { unique: true, partialFilterExpression: { legacyId: { $exists: true } } },
);

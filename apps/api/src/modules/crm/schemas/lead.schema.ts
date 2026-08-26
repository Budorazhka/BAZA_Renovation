import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { LEAD_STAGES } from '../lead-stage';

/**
 * Буквальный union literal, НЕ `(typeof LEAD_STAGES)[number]` — найдено
 * смок-тестом: TypeScript emitDecoratorMetadata эмитит design:type как
 * String корректно ТОЛЬКО для буквального union из строковых литералов
 * в объявлении типа, не для производного indexed-access типа через
 * typeof массива, даже если он локально объявлен и структурно эквивалентен
 * (это не то же самое ограничение, что "импортированный union" — более
 * узкое: сама ФОРМА объявления типа имеет значение для reflection, не
 * только его происхождение из другого файла). LEAD_STAGES (runtime-массив
 * из lead-stage.ts) остаётся источником истины для @Prop({enum:...})
 * runtime-валидации — это значение, не TypeScript-тип, decorator metadata
 * reflection его не касается.
 */
export type LeadStage = 'new' | 'contacted' | 'qualified' | 'converted' | 'lost';

export interface LeadSource {
  route: string;
  publicationId?: Types.ObjectId;
  utm?: Record<string, string>;
  referrer?: string;
}

const LeadSourceSchema = new MongooseSchema(
  {
    route: { type: String, required: true },
    publicationId: { type: MongooseSchema.Types.ObjectId, required: false },
    utm: { type: Object, required: false },
    referrer: { type: String, required: false },
  },
  { _id: false },
);

/**
 * docs/architecture/domain-model.md Модуль 7 / mongodb-schema.md `leads`.
 * stage — денормализованное текущее значение для быстрого чтения; история
 * переходов — отдельная append-only коллекция LeadEvent, НЕ embedded массив
 * здесь (не раздувать документ Lead растущей историей).
 */
@Schema({ collection: 'leads', timestamps: { createdAt: 'createdAt', updatedAt: false } })
export class LeadDocument extends Document {
  declare _id: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId })
  organizationId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId })
  contactId!: Types.ObjectId;

  /**
   * Изначально null (не назначен) — назначается explicit командой
   * assignLead, НЕ auto-assignment по умолчанию (owner decision:
   * "Автоматическая раздача может появиться позднее как опция, но не
   * является стартовым поведением").
   */
  @Prop({ type: Types.ObjectId, required: false })
  ownerPositionId?: Types.ObjectId;

  @Prop({ type: LeadSourceSchema, required: true })
  source!: LeadSource;

  @Prop({ required: true, enum: LEAD_STAGES, default: 'new' })
  stage!: LeadStage;

  declare createdAt: Date;
}

export const LeadSchema = SchemaFactory.createForClass(LeadDocument);

LeadSchema.index({ organizationId: 1, ownerPositionId: 1, stage: 1 });
LeadSchema.index({ contactId: 1 });
LeadSchema.index({ 'source.publicationId': 1 });

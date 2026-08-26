import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { LEAD_STAGES } from '../lead-stage';

/**
 * Буквальный union literal — та же находка, что lead.schema.ts (см. его
 * комментарий): TypeScript emitDecoratorMetadata эмитит design:type как
 * String корректно ТОЛЬКО для буквального union из строковых литералов в
 * объявлении типа, не для indexed-access через typeof массива, даже
 * локально. LEAD_STAGES остаётся runtime-источником истины для
 * @Prop({enum:...}) ниже.
 */
export type LeadStage = 'new' | 'contacted' | 'qualified' | 'converted' | 'lost';

export type LeadEventChangedByType = 'position' | 'system';

/**
 * Дискриминированный union — тот же паттерн, что AuditEvent.actor (Module
 * 3): positionId (ручное изменение стадии сотрудником) | 'system'
 * (автоматический переход, например будущий "lead expired без активности").
 * Явная вложенная схема, не inline plain-object — поле `type` внутри
 * объекта конфликтует с зарезервированным SchemaTypeOptions.type при
 * inline-объявлении (та же Mongoose-ловушка, что AuditActorSchema/
 * OwnerScopeSchema/GeoPointSchema — см. их комментарии).
 */
const ChangedBySchema = new MongooseSchema(
  {
    type: { type: String, enum: ['position', 'system'], required: true },
    positionId: { type: MongooseSchema.Types.ObjectId, required: false },
  },
  { _id: false },
);

export interface LeadEventChangedBy {
  type: LeadEventChangedByType;
  positionId?: Types.ObjectId;
}

/**
 * docs/architecture/domain-model.md Модуль 7 / mongodb-schema.md `lead_events`.
 * Immutable запись одного stage-перехода — append-only, никогда не
 * редактируется/удаляется, тот же принцип, что AuditEvent (Module 3), но
 * специфичен для лид-воронки (используется для построения воронки/
 * аналитики по стадиям, не общий audit trail).
 */
@Schema({ collection: 'lead_events', timestamps: { createdAt: 'changedAt', updatedAt: false } })
export class LeadEventDocument extends Document {
  declare _id: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId })
  leadId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId })
  organizationId!: Types.ObjectId;

  @Prop({ required: true, enum: LEAD_STAGES })
  stage!: LeadStage;

  @Prop({ type: ChangedBySchema, required: true })
  changedBy!: LeadEventChangedBy;

  declare changedAt: Date;
}

export const LeadEventSchema = SchemaFactory.createForClass(LeadEventDocument);

LeadEventSchema.index({ leadId: 1, changedAt: 1 });
LeadEventSchema.index({ organizationId: 1, changedAt: -1 });

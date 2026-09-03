import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { ALL_LEAD_STAGE_VALUES } from '../lead-stage';

/**
 * Буквальный union literal — та же находка, что lead.schema.ts (см. его
 * комментарий): TypeScript emitDecoratorMetadata эмитит design:type как
 * String корректно ТОЛЬКО для буквального union из строковых литералов в
 * объявлении типа, не для indexed-access через typeof массива, даже
 * локально. ALL_LEAD_STAGE_VALUES остаётся runtime-источником истины для
 * @Prop({enum:...}) ниже.
 *
 * Продуктовые воронки лида (03.09.2026): значения ниже дублируют
 * GenericLeadStage|ProductLeadStage из lead.schema.ts — та же причина, что
 * оригинальный докстринг объясняет для generic-пятёрки, применена ко всем
 * per-product стадиям тоже (см. lead-stage-definitions.ts докстринг за
 * источником этих значений).
 */
export type LeadStage =
  | 'new' | 'contacted' | 'qualified' | 'converted' | 'lost'
  | 'defective' | 'refused' | 'no_answer_3' | 'no_answer_2' | 'no_answer_1'
  | 'callback' | 'presented' | 'country_discussed' | 'need_identified' | 'need_adjusted'
  | 'kp_sent' | 'objections' | 'deferred' | 'warmup' | 'showing' | 'deposit' | 'deal'
  | 'golden' | 'check_in' | 'referral' | 'new_deals'
  | 'network_rejected_defective' | 'network_rejected' | 'network_no_call_3' | 'network_no_call_2' | 'network_no_call_1'
  | 'network_new_lead' | 'network_call_later' | 'network_company_presented' | 'network_platform_presented'
  | 'network_offer_given' | 'network_objections' | 'network_deferred_demand' | 'network_agreement'
  | 'network_form_filled' | 'network_account_registered' | 'network_offer_signed' | 'network_work_started'
  | 'owner_rejected_defective' | 'owner_rejected_owner' | 'owner_no_call_3' | 'owner_no_call_2' | 'owner_no_call_1'
  | 'owner_new_owner' | 'owner_call_later' | 'owner_company_presented' | 'owner_object_discussed'
  | 'owner_photo_proposed' | 'owner_exclusive_proposed' | 'owner_objections' | 'owner_agreed'
  | 'owner_active_for_sale' | 'owner_get_referral' | 'owner_new_object_inquiry'
  | 'agent_rejected_defective' | 'agent_rejected' | 'agent_no_call_3' | 'agent_no_call_2' | 'agent_no_call_1'
  | 'agent_new_agent' | 'agent_call_later' | 'agent_company_presented' | 'agent_format'
  | 'agent_objections' | 'agent_agreed' | 'agent_active';

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

  @Prop({ required: true, enum: ALL_LEAD_STAGE_VALUES })
  stage!: LeadStage;

  @Prop({ type: ChangedBySchema, required: true })
  changedBy!: LeadEventChangedBy;

  /**
   * `[phase 3]` Легаси getStageComments/createStageComment (api-crm.baza.sale)
   * — комментарий, привязанный к КОНКРЕТНОМУ переходу стадии, не отдельная
   * сущность (owner decision этого прохода: расширить уже существующий
   * append-only LeadEvent, не заводить новую коллекцию/эндпоинт). Опционален
   * — ChangeLeadStageDto.comment опционален, большинство переходов без
   * комментария.
   */
  @Prop({ required: false })
  comment?: string;

  declare changedAt: Date;
}

export const LeadEventSchema = SchemaFactory.createForClass(LeadEventDocument);

LeadEventSchema.index({ leadId: 1, changedAt: 1 });
LeadEventSchema.index({ organizationId: 1, changedAt: -1 });
/** GET /leads/:leadId/events — cursor pagination (LeadEventRepository.listForLead) сортирует по _id внутри leadId+organizationId. */
LeadEventSchema.index({ leadId: 1, organizationId: 1, _id: -1 });

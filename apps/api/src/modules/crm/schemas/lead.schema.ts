import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { ALL_LEAD_STAGE_VALUES } from '../lead-stage';
import { PRODUCT_TYPES } from '../lead-stage-definitions';

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
export type GenericLeadStage = 'new' | 'contacted' | 'qualified' | 'converted' | 'lost';

/**
 * `[technical decision — 03.09.2026]`, продуктовые воронки лида: полный
 * список per-product stage id (см. lead-stage-definitions.ts докстринг —
 * источник этих значений: leads-mock.ts/types.ts/crm-poker-adapter.ts из
 * apps/erp-web, ничего не изобретено). Тот же буквальный union literal
 * приём, что GenericLeadStage выше — не производный тип от
 * LEAD_STAGE_DEFINITIONS (design:type reflection).
 */
export type ProductLeadStage =
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

/** Значение lead.stage — либо одна из 5 generic-стадий (productType не задан), либо одна из per-product стадий (productType задан). */
export type LeadStage = GenericLeadStage | ProductLeadStage;

/**
 * Тот же буквальный union literal приём, что LeadStage выше — НЕ
 * `import type { ProductType } from '../lead-stage-definitions'` в поле
 * @Prop(): design:type reflection ломается именно на импортированных union
 * в декорированной позиции (см. докстринг GenericLeadStage). Значения
 * буквально совпадают с PRODUCT_TYPES (runtime-массив, источник истины
 * для @Prop({enum:...})) — синхронизировать вручную при изменении списка
 * продуктов, ровно тот же контракт, что LEAD_STAGES/LeadStage сегодня.
 */
export type LeadProductType = 'sales' | 'network' | 'owner' | 'agent';

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

  /**
   * Опционально — НЕ required (owner decision, продуктовые воронки лида):
   * на проде уже существуют/создаются лиды без него (marketplace
   * reveal-contact-lead flow, CSV/XLSX импорт, обычная ручная форма) и их
   * создание не должно ломаться. Когда задан — `stage` обязан быть одной
   * из стадий ИМЕННО этого продукта (см. lead-stage-definitions.ts);
   * когда не задан — `stage` остаётся в generic-пятёрке LEAD_STAGES, тот
   * же путь, что и до этого прохода. Точная проверка "stage принадлежит
   * productType" — бизнес-логика CrmService (@Prop-enum ниже НЕ может
   * зависеть от значения соседнего поля), не миграция существующих лидов.
   */
  @Prop({ enum: PRODUCT_TYPES, required: false })
  productType?: LeadProductType;

  @Prop({ required: true, enum: ALL_LEAD_STAGE_VALUES, default: 'new' })
  stage!: LeadStage;

  /**
   * conventions.md разд.5 — optimistic concurrency (409 VERSION_CONFLICT),
   * тот же паттерн, что UnitDocument.version. Добавлено 27.08.2026 — до
   * этого changeStage делал безусловный updateOne({_id,organizationId}),
   * два параллельных PATCH .../stage оба проходили stage-transition-проверку
   * против одного и того же прочитанного состояния и оба безусловно
   * записывали (lost update, "последний write выигрывает" без сигнала
   * конфликта ни одному из вызывающих).
   */
  @Prop({ required: true, default: 0 })
  version!: number;

  declare createdAt: Date;
}

export const LeadSchema = SchemaFactory.createForClass(LeadDocument);

LeadSchema.index({ organizationId: 1, ownerPositionId: 1, stage: 1 });
LeadSchema.index({ contactId: 1 });
LeadSchema.index({ 'source.publicationId': 1 });

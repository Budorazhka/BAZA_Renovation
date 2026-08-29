import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type AuditActorType = 'identity' | 'admin_account' | 'system';

/**
 * Вложенная схема вынесена явным SchemaFactory-независимым объектом, а не
 * inline `{ type: { type: String, ... } }` — при inline-варианте Mongoose
 * путает пользовательское поле `actor.type` с собственным дескриптором
 * SchemaTypeOptions.type (оба называются `type`) и падает на `required`
 * внутри enum-поля. См. https://mongoosejs.com/docs/schematypes.html#type-key.
 */
const AuditActorSchema = new MongooseSchema(
  {
    type: { type: String, enum: ['identity', 'admin_account', 'system'], required: true },
    id: { type: MongooseSchema.Types.ObjectId, required: false },
  },
  { _id: false },
);

/**
 * docs/architecture/domain-model.md Модуль 3 / mongodb-schema.md `audit_events`.
 * Append-only — никогда не редактируется/удаляется программно (master plan
 * разд.6.3). Payload не содержит password/token/provider secret.
 * Retention: 3 месяца (open-decisions.md #3), TTL-индекс ниже.
 */
@Schema({ collection: 'audit_events', timestamps: { createdAt: 'createdAt', updatedAt: false } })
export class AuditEventDocument extends Document {
  declare _id: Types.ObjectId;

  @Prop({ type: AuditActorSchema, required: true })
  actor!: { type: AuditActorType; id?: Types.ObjectId };

  @Prop({ required: true })
  action!: string;

  @Prop({ required: true })
  resource!: string;

  @Prop({ required: true, type: Types.ObjectId })
  resourceId!: Types.ObjectId;

  @Prop()
  reason?: string;

  @Prop({ type: Object })
  before?: Record<string, unknown>;

  @Prop({ type: Object })
  after?: Record<string, unknown>;

  @Prop({ required: true })
  correlationId!: string;

  declare createdAt: Date;
}

export const AuditEventSchema = SchemaFactory.createForClass(AuditEventDocument);

AuditEventSchema.index({ 'actor.id': 1, createdAt: -1 });
AuditEventSchema.index({ resourceId: 1, createdAt: -1 });
AuditEventSchema.index({ correlationId: 1 });

/**
 * Admin audit feed (AuditEventRepository.listForAdmin): newest-first
 * cursor по `_id`, обычно сужено по `resource` (scoped admin — публикационные
 * sourceType; super_admin — любой resource, включая 'admin_account') и/или
 * `action`. `_id` последним полем в обоих индексах — ObjectId encode'ит
 * timestamp, поэтому `sort({_id:-1})` использует индекс напрямую без
 * дополнительной in-memory сортировки при равенстве префикса.
 */
AuditEventSchema.index({ resource: 1, _id: -1 });
AuditEventSchema.index({ action: 1, _id: -1 });

// Retention 3 месяца (open-decisions.md #3) — TTL index на createdAt.
const THREE_MONTHS_IN_SECONDS = 60 * 60 * 24 * 90;
AuditEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: THREE_MONTHS_IN_SECONDS });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Отдельный от ADR-006 idempotency_records механизм (см. idempotency-record.schema.ts
 * докстринг) — reveal-contact вызывается гостями БЕЗ сессии/identity, у которых нет
 * identityId для ключа (identityId в IdempotencyRecordDocument required). Ключ здесь —
 * (publicationSlug, idempotencyKey), не (identityId, operation, key).
 *
 * responseBody хранит ТОЛЬКО санитизированную форму ответа ({phone, whatsapp?,
 * telegram?, leadId}) — тот же non-disclosure принцип, что CrmService.revealContact/
 * revealListingContact возвращают клиенту, никогда raw internal fields
 * (organizationId/publisherScope/identityId).
 */
@Schema({ collection: 'public_reveal_idempotency_records', timestamps: { createdAt: 'createdAt', updatedAt: false } })
export class PublicRevealIdempotencyRecordDocument extends Document {
  declare _id: Types.ObjectId;

  @Prop({ required: true })
  publicationSlug!: string;

  @Prop({ required: true })
  idempotencyKey!: string;

  /** Детерминированный хеш нормализованного RevealContactDto body — тот же принцип, что requestHash в IdempotencyRecordDocument. */
  @Prop({ required: true })
  requestHash!: string;

  @Prop({ required: true })
  responseStatus!: number;

  @Prop({ required: true, type: Object })
  responseBody!: Record<string, unknown>;

  /** Для audit/debug — НЕ возвращается клиенту напрямую (уже есть в responseBody.leadId). */
  @Prop({ required: true, type: Types.ObjectId })
  leadId!: Types.ObjectId;

  declare createdAt: Date;
}

export const PublicRevealIdempotencyRecordSchema = SchemaFactory.createForClass(
  PublicRevealIdempotencyRecordDocument,
);

/**
 * Гостевой ключ scoped к конкретной публикации + конкретному Idempotency-Key,
 * не глобально уникален сам по себе — тот же принцип, что ADR-006 индекс.
 * Конкурентная гонка (два одновременных запроса с одним ключом) даёт
 * duplicate key error на втором — сервис ловит это и трактует как replay
 * (см. PublicRevealIdempotencyService.record).
 */
PublicRevealIdempotencyRecordSchema.index({ publicationSlug: 1, idempotencyKey: 1 }, { unique: true });

/**
 * Записи нужны только чтобы поймать retry реального клиента (браузер/мобильное
 * приложение при потере ответа на reveal-contact), не постоянный архив —
 * консервативный дефолт 48ч, env-configurable через PUBLIC_REVEAL_IDEMPOTENCY_TTL_HOURS,
 * тот же TTL-паттерн, что AuditEventSchema (audit-event.schema.ts). Читается
 * напрямую из process.env (не через ConfigService) — индекс регистрируется на
 * схеме при загрузке модуля, до того как Nest DI-контейнер вообще существует
 * (тот же ограничение, что у THREE_MONTHS_IN_SECONDS в audit-event.schema.ts,
 * там просто нет env-override).
 */
export const DEFAULT_PUBLIC_REVEAL_IDEMPOTENCY_TTL_HOURS = 48;
const ttlHours = Number(process.env.PUBLIC_REVEAL_IDEMPOTENCY_TTL_HOURS ?? DEFAULT_PUBLIC_REVEAL_IDEMPOTENCY_TTL_HOURS);
const PUBLIC_REVEAL_IDEMPOTENCY_TTL_SECONDS =
  (Number.isFinite(ttlHours) && ttlHours > 0 ? ttlHours : DEFAULT_PUBLIC_REVEAL_IDEMPOTENCY_TTL_HOURS) * 60 * 60;

PublicRevealIdempotencyRecordSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: PUBLIC_REVEAL_IDEMPOTENCY_TTL_SECONDS },
);

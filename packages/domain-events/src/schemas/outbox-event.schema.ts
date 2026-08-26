import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OutboxEventStatus = 'pending' | 'processing' | 'done' | 'dead_letter';

/**
 * docs/architecture/domain-model.md Модуль 3 / mongodb-schema.md `outbox_events`.
 * ADR-006: пишется В ТОЙ ЖЕ транзакции, что бизнес-изменение — гарантия,
 * что событие существует тогда и только тогда, когда бизнес-транзакция
 * закоммичена (не окно между коммитом и постановкой в очередь отдельным
 * вызовом).
 *
 * Живёт в @baza/domain-events (не в apps/api), потому что и API-процесс
 * (пишет события в транзакции), и worker-процесс (читает и обрабатывает
 * их) обращаются к ОДНОЙ и той же коллекции — дублирование схемы в двух
 * apps создало бы риск рассинхронизации между процессами (ADR-001:
 * "общие модули домена" между двумя entrypoint'ами одного логического
 * приложения).
 */
@Schema({ collection: 'outbox_events', timestamps: { createdAt: 'createdAt', updatedAt: false } })
export class OutboxEventDocument extends Document {
  declare _id: Types.ObjectId;

  @Prop({ required: true })
  eventType!: string;

  @Prop({ required: true, type: Object })
  payload!: Record<string, unknown>;

  @Prop({ required: true, type: Types.ObjectId })
  aggregateId!: Types.ObjectId;

  @Prop({ required: true })
  aggregateType!: string;

  @Prop()
  processedAt?: Date;

  /**
   * НЕ unique — mongodb-schema.md явно описывает этот индекс как
   * "вспомогательный для ручного разбора dead_letter", не как uniqueness
   * constraint. ADR-006 возлагает идемпотентность worker'а на отдельный
   * механизм (processed_keys-проверка или естественная идемпотентность
   * самой side-effect операции), не на unique-индекс записи outbox-события.
   */
  @Prop({ required: true })
  deduplicationKey!: string;

  @Prop({ required: true, default: 0 })
  attempts!: number;

  @Prop({ required: true, enum: ['pending', 'processing', 'done', 'dead_letter'], default: 'pending' })
  status!: OutboxEventStatus;

  /**
   * Добавлено 25.08.2026 (worker-реализация, вне исходной структуры ADR-006
   * `{_id,eventType,payload,aggregateId,aggregateType,createdAt,processedAt,
   * deduplicationKey,attempts,status}`) — прямое следствие требования того
   * же ADR-006 "применяет exponential backoff", которое иначе не имело бы
   * поля для хранения момента следующей допустимой попытки. Без этого поля
   * failed-событие немедленно возвращалось бы в pending и подбиралось бы на
   * следующем же polling-цикле — retry без задержки, не exponential backoff.
   * undefined/отсутствует — можно забирать сразу (pending, ещё не пытались
   * или это первая попытка).
   */
  @Prop()
  nextRetryAt?: Date;

  declare createdAt: Date;
}

export const OutboxEventSchema = SchemaFactory.createForClass(OutboxEventDocument);

// mongodb-schema.md: worker polling-очередь.
OutboxEventSchema.index({ status: 1, createdAt: 1 });
OutboxEventSchema.index({ aggregateId: 1, createdAt: -1 });
// mongodb-schema.md: вспомогательный для ручного разбора dead_letter — не unique.
OutboxEventSchema.index({ deduplicationKey: 1 });

// TTL на status:'done' записи, 30 дней (ADR-006 operational impact) —
// partial TTL index: expireAfterSeconds применяется только к документам,
// прошедшим partialFilterExpression, не ко всем записям коллекции (pending/
// processing/dead_letter НЕ должны автоматически истекать).
const THIRTY_DAYS_IN_SECONDS = 60 * 60 * 24 * 30;
OutboxEventSchema.index(
  { processedAt: 1 },
  { expireAfterSeconds: THIRTY_DAYS_IN_SECONDS, partialFilterExpression: { status: 'done' } },
);

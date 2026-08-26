import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * ADR-006 "Idempotency key для клиентских критических команд": publish/
 * book/cancel/manual-ledger operations. Отдельный механизм от worker
 * deduplication (outbox deduplicationKey) — защищает от дублирования на
 * уровне API-вызова, ДО того как транзакция вообще началась.
 */
@Schema({ collection: 'idempotency_records', timestamps: { createdAt: 'createdAt', updatedAt: false } })
export class IdempotencyRecordDocument extends Document {
  declare _id: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId })
  identityId!: Types.ObjectId;

  @Prop({ required: true })
  operation!: string;

  @Prop({ required: true })
  key!: string;

  /** Детерминированный хеш "содержимого запроса" (тело для command с body; путь+релевантные параметры для command без тела, например publishDevelopment). */
  @Prop({ required: true })
  requestHash!: string;

  @Prop({ required: true })
  responseStatus!: number;

  @Prop({ required: true, type: Object })
  responseBody!: Record<string, unknown>;

  declare createdAt: Date;
}

export const IdempotencyRecordSchema = SchemaFactory.createForClass(IdempotencyRecordDocument);

/**
 * ADR-006: "ключ scoped к конкретному пользователю и конкретной операции,
 * не глобально уникален сам по себе" — unique index, не просто обычный.
 * Конкурентная гонка (два одновременных запроса с одним ключом) даёт
 * duplicate key error на втором — тот же паттерн перевода в доменную
 * ошибку, что PositionAssignmentRepository.createAssignment.
 */
IdempotencyRecordSchema.index({ identityId: 1, operation: 1, key: 1 }, { unique: true });

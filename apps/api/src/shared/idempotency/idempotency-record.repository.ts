import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { IdempotencyRecordDocument } from './idempotency-record.schema';

/**
 * Единственная точка доступа к коллекции idempotency_records (ADR-002
 * требование 2).
 */
@Injectable()
export class IdempotencyRecordRepository {
  constructor(
    @InjectModel(IdempotencyRecordDocument.name) private readonly model: Model<IdempotencyRecordDocument>,
  ) {}

  async findByKey(
    identityId: Types.ObjectId,
    operation: string,
    key: string,
  ): Promise<IdempotencyRecordDocument | null> {
    return this.model.findOne({ identityId, operation, key }).exec();
  }

  /**
   * ADR-006: "запись создаётся В ТОЙ ЖЕ транзакции, что и сама бизнес-
   * операция" — session обязателен (не опционален), нет легитимного
   * вызова этого метода вне транзакции команды, которую он защищает.
   */
  async create(
    params: {
      identityId: Types.ObjectId;
      operation: string;
      key: string;
      requestHash: string;
      responseStatus: number;
      responseBody: Record<string, unknown>;
    },
    session: ClientSession,
  ): Promise<void> {
    await this.model.create([params], { session });
  }
}

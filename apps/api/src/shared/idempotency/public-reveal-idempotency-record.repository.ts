import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { PublicRevealIdempotencyRecordDocument } from './public-reveal-idempotency-record.schema';

/**
 * Единственная точка доступа к коллекции public_reveal_idempotency_records
 * (ADR-002 требование 2) — тот же принцип, что IdempotencyRecordRepository,
 * но ключ (publicationSlug, idempotencyKey), не (identityId, operation, key).
 */
@Injectable()
export class PublicRevealIdempotencyRecordRepository {
  constructor(
    @InjectModel(PublicRevealIdempotencyRecordDocument.name)
    private readonly model: Model<PublicRevealIdempotencyRecordDocument>,
  ) {}

  async findByKey(
    publicationSlug: string,
    idempotencyKey: string,
  ): Promise<PublicRevealIdempotencyRecordDocument | null> {
    return this.model.findOne({ publicationSlug, idempotencyKey }).exec();
  }

  /**
   * Запись создаётся В ТОЙ ЖЕ транзакции, что Contact/Lead/LeadEvent/audit
   * (см. PublicRevealIdempotencyService докстринг) — session обязателен, тот
   * же принцип, что IdempotencyRecordRepository.create.
   */
  async create(
    params: {
      publicationSlug: string;
      idempotencyKey: string;
      requestHash: string;
      responseStatus: number;
      responseBody: Record<string, unknown>;
      leadId: Types.ObjectId;
    },
    session: ClientSession,
  ): Promise<void> {
    await this.model.create([params], { session });
  }
}

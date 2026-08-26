import { Injectable } from '@nestjs/common';
import { ClientSession, Types } from 'mongoose';
import { OutboxEventRepository } from '@baza/domain-events';

export interface PublishOutboxEventParams {
  eventType: string;
  payload: Record<string, unknown>;
  aggregateId: Types.ObjectId;
  aggregateType: string;
  /**
   * ADR-006: детерминированный ключ идемпотентности worker'а. Если не
   * передан явно, генерируется как `{aggregateType}:{aggregateId}:{eventType}` —
   * подходит для событий "один раз на смену состояния" (PublicationRequested
   * и т.п.); для событий, повторяющихся с разным контекстом на одном
   * aggregate (например, несколько bookings одного unit), вызывающий код
   * ОБЯЗАН передать уникальный ключ явно (например, включающий bookingId).
   */
  deduplicationKey?: string;
}

/**
 * ADR-006: единая точка публикации outbox-событий для всех модулей.
 * Вызывается ВНУТРИ той же runInTransaction, что бизнес-изменение —
 * session обязателен (see OutboxEventRepository.create).
 */
@Injectable()
export class OutboxService {
  constructor(private readonly outboxEventRepository: OutboxEventRepository) {}

  async publish(params: PublishOutboxEventParams, session: ClientSession): Promise<void> {
    const deduplicationKey =
      params.deduplicationKey ?? `${params.aggregateType}:${params.aggregateId.toString()}:${params.eventType}`;

    await this.outboxEventRepository.create(
      {
        eventType: params.eventType,
        payload: params.payload,
        aggregateId: params.aggregateId,
        aggregateType: params.aggregateType,
        deduplicationKey,
      },
      session,
    );
  }
}

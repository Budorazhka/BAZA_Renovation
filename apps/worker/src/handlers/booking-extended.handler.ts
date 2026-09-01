import { Injectable, Logger } from '@nestjs/common';
import type { OutboxEventDocument } from '@baza/domain-events';
import type { EventHandler } from '../outbox/event-handler';

/**
 * Тот же принцип, что остальных booking-событий: durable hand-off точка
 * для будущих notifications/analytics, ни одного downstream side-effect
 * не специфицировано — событие подтверждается, не остаётся в dead_letter
 * как неизвестный тип.
 */
@Injectable()
export class BookingExtendedHandler implements EventHandler {
  private readonly logger = new Logger(BookingExtendedHandler.name);

  async handle(event: OutboxEventDocument): Promise<void> {
    this.logger.log(
      `BookingExtended получен для booking ${event.aggregateId.toString()} ` +
        `(payload: ${JSON.stringify(event.payload)}) — событие подтверждено; follow-up side-effects ещё не специфицированы.`,
    );
  }
}

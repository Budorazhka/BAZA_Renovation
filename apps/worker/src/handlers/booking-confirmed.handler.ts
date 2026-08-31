import { Injectable, Logger } from '@nestjs/common';
import type { OutboxEventDocument } from '@baza/domain-events';
import type { EventHandler } from '../outbox/event-handler';

/**
 * Тот же принцип, что BookingCreatedHandler/BookingCancelledHandler:
 * durable hand-off точка для будущих notifications/analytics. Ни одного
 * downstream side-effect не специфицировано — событие подтверждается, не
 * остаётся в dead_letter как неизвестный тип.
 */
@Injectable()
export class BookingConfirmedHandler implements EventHandler {
  private readonly logger = new Logger(BookingConfirmedHandler.name);

  async handle(event: OutboxEventDocument): Promise<void> {
    this.logger.log(
      `BookingConfirmed получен для booking ${event.aggregateId.toString()} ` +
        `(payload: ${JSON.stringify(event.payload)}) — событие подтверждено; follow-up side-effects ещё не специфицированы.`,
    );
  }
}

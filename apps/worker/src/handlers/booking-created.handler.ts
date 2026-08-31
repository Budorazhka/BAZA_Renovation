import { Injectable, Logger } from '@nestjs/common';
import type { OutboxEventDocument } from '@baza/domain-events';
import type { EventHandler } from '../outbox/event-handler';

/**
 * BookingCreated is the durable hand-off point for future notifications,
 * expiry jobs and analytics. No downstream side-effect is specified yet, but
 * the event must still be acknowledged by the worker instead of accumulating
 * in dead_letter as an unknown event type.
 */
@Injectable()
export class BookingCreatedHandler implements EventHandler {
  private readonly logger = new Logger(BookingCreatedHandler.name);

  async handle(event: OutboxEventDocument): Promise<void> {
    this.logger.log(
      `BookingCreated получен для booking ${event.aggregateId.toString()} ` +
        `(payload: ${JSON.stringify(event.payload)}) — событие подтверждено; follow-up side-effects ещё не специфицированы.`,
    );
  }
}

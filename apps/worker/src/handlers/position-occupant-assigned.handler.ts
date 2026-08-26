import { Injectable, Logger } from '@nestjs/common';
import type { OutboxEventDocument } from '@baza/domain-events';
import type { EventHandler } from '../outbox/event-handler';

/**
 * PositionOccupantAssigned (organizations.service.ts::assignOccupant) —
 * публикуется для occupant'а с УЖЕ существующим identityId (не invite-flow
 * нового человека, ADR-003 упоминает invite отдельно для случая создания
 * Identity "на лету" — это не реализовано текущим assignOccupant). Для
 * существующей identity явного follow-up side-effect (уведомление и т.п.)
 * нигде в Stage B не специфицировано — handler сейчас только подтверждает
 * доставку события до worker'а, не выдумывает несуществующее требование.
 */
@Injectable()
export class PositionOccupantAssignedHandler implements EventHandler {
  private readonly logger = new Logger(PositionOccupantAssignedHandler.name);

  async handle(event: OutboxEventDocument): Promise<void> {
    this.logger.log(
      `PositionOccupantAssigned получен для position ${event.aggregateId.toString()} ` +
        `(payload: ${JSON.stringify(event.payload)}) — нет специфицированного follow-up side-effect, событие подтверждено.`,
    );
  }
}

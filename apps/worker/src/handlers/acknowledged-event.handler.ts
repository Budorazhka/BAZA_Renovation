import { Injectable, Logger } from '@nestjs/common';
import type { OutboxEventDocument } from '@baza/domain-events';
import type { EventHandler } from '../outbox/event-handler';

/**
 * Обработчик для событий, у которых пока НЕТ побочного эффекта, но которые
 * обязаны быть подтверждены воркером.
 *
 * Зачем это нужно (правило уже зафиксировано в BookingCreatedHandler:
 * «событие должно быть подтверждено воркером, а не копиться в dead_letter
 * как неизвестный тип»): OutboxPollerService, не найдя handler'а,
 * НЕМЕДЛЕННО отправляет событие в dead_letter — `markFailedAttempt(id,
 * MAX_ATTEMPTS)`, без единой попытки. То есть каждое такое событие, а среди
 * них рутинные TaskCreated/TaskCompleted/UnitPriceChanged, при каждой
 * публикации пишет строку в dead_letter.
 *
 * Вред не в самих строках, а в том, что dead_letter перестаёт быть
 * сигналом: очередь, всегда полная «поломок по проекту», делает невидимой
 * настоящую поломку — например провал PublicationRequested. Ровно та же
 * болезнь, что у гейта, который всегда красный.
 *
 * ОДИН экземпляр на несколько eventType, а не семь почти одинаковых
 * файлов: EventHandlerRegistry допускает регистрацию одного обработчика под
 * разными ключами, а различающийся текст лога берётся из самого события.
 * Существующие BookingCreated/Cancelled/Confirmed/Extended намеренно
 * оставлены отдельными классами — у них своя история и они первыми обрастут
 * реальной логикой.
 *
 * Когда у события появится настоящий side-effect — оно переезжает в
 * собственный handler и убирается из списка в handlers.module.ts.
 * Страж (handlers-coverage.spec.ts) следит, чтобы список не разошёлся с
 * тем, что реально публикуется.
 */
@Injectable()
export class AcknowledgedEventHandler implements EventHandler {
  private readonly logger = new Logger(AcknowledgedEventHandler.name);

  async handle(event: OutboxEventDocument): Promise<void> {
    this.logger.log(
      `${event.eventType} получен для ${event.aggregateType} ${event.aggregateId.toString()} ` +
        `(payload: ${JSON.stringify(event.payload)}) — событие подтверждено; ` +
        'побочные эффекты для этого типа ещё не специфицированы.',
    );
  }
}

import { Types } from 'mongoose';
import type { OutboxEventDocument } from '@baza/domain-events';
import { AcknowledgedEventHandler } from './acknowledged-event.handler';
import { ACKNOWLEDGED_ONLY_EVENT_TYPES } from './handlers.module';
import { EventHandlerRegistry } from '../outbox/event-handler.registry';

function makeEvent(eventType: string): OutboxEventDocument {
  return {
    _id: new Types.ObjectId(),
    eventType,
    aggregateType: 'task',
    aggregateId: new Types.ObjectId(),
    payload: { some: 'payload' },
    attempts: 0,
  } as unknown as OutboxEventDocument;
}

describe('AcknowledgedEventHandler', () => {
  it('подтверждает событие без ошибки — именно это и уводит его из dead_letter', async () => {
    const handler = new AcknowledgedEventHandler();

    await expect(handler.handle(makeEvent('TaskCreated'))).resolves.toBeUndefined();
  });

  it('обрабатывает любой из типов списка одним экземпляром', async () => {
    const handler = new AcknowledgedEventHandler();

    for (const eventType of ACKNOWLEDGED_ONLY_EVENT_TYPES) {
      await expect(handler.handle(makeEvent(eventType))).resolves.toBeUndefined();
    }
  });

  it('один экземпляр регистрируется под всеми типами без конфликта дублей', () => {
    const registry = new EventHandlerRegistry();
    const handler = new AcknowledgedEventHandler();

    for (const eventType of ACKNOWLEDGED_ONLY_EVENT_TYPES) {
      registry.register(eventType, handler);
    }

    for (const eventType of ACKNOWLEDGED_ONLY_EVENT_TYPES) {
      expect(registry.resolve(eventType)).toBe(handler);
    }
  });

  it('в списке нет повторов — иначе register() бросит на второй регистрации', () => {
    expect(new Set(ACKNOWLEDGED_ONLY_EVENT_TYPES).size).toBe(ACKNOWLEDGED_ONLY_EVENT_TYPES.length);
  });
});

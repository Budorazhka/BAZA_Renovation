import { Types } from 'mongoose';
import { OutboxPollerService } from './outbox-poller.service';
import type { EventHandlerRegistry } from './event-handler.registry';
import type { OutboxEventRepository } from '@baza/domain-events';

/**
 * Минимальный объект-стенд-ин вместо полноценного OutboxEventDocument
 * (реальный Mongoose-документ имеет десятки внутренних методов/полей,
 * которые тестам не нужны) — типизирован явно под то, что реально
 * используется в тестах и в самом OutboxPollerService (event._id,
 * event.eventType, event.attempts), не `as never` (что запрещало бы
 * обращение к любому полю на этапе typecheck).
 */
interface FakeOutboxEvent {
  _id: Types.ObjectId;
  eventType: string;
  payload: Record<string, unknown>;
  aggregateId: Types.ObjectId;
  aggregateType: string;
  attempts: number;
  status: string;
}

function makeEvent(overrides: Partial<FakeOutboxEvent> = {}): FakeOutboxEvent {
  return {
    _id: new Types.ObjectId(),
    eventType: 'TestEvent',
    payload: {},
    aggregateId: new Types.ObjectId(),
    aggregateType: 'test',
    attempts: 0,
    status: 'pending',
    ...overrides,
  };
}

describe('OutboxPollerService', () => {
  it('обрабатывает pending-событие: claim → handler.handle → markDone', async () => {
    const event = makeEvent();
    const markProcessingSpy = jest.fn().mockResolvedValue({ claimed: true });
    const markDoneSpy = jest.fn().mockResolvedValue(undefined);
    const markFailedAttemptSpy = jest.fn();
    const findPendingBatchSpy = jest.fn().mockResolvedValue([event]);
    const handleSpy = jest.fn().mockResolvedValue(undefined);
    const resolveSpy = jest.fn().mockReturnValue({ handle: handleSpy });

    const repository = {
      findPendingBatch: findPendingBatchSpy,
      markProcessing: markProcessingSpy,
      markDone: markDoneSpy,
      markFailedAttempt: markFailedAttemptSpy,
    } as unknown as OutboxEventRepository;
    const registry = { resolve: resolveSpy } as unknown as EventHandlerRegistry;

    const service = new OutboxPollerService(repository, registry);
    // pollOnce приватен — доступ через явный вызов publicly доступного
    // API нет (сервис управляется таймером), тестируем через прямой
    // вызов приватного метода вместо ожидания реального интервала.
    await (service as unknown as { pollOnce(): Promise<void> }).pollOnce();

    expect(markProcessingSpy).toHaveBeenCalledWith(event._id);
    expect(handleSpy).toHaveBeenCalledWith(event);
    expect(markDoneSpy).toHaveBeenCalledWith(event._id);
    expect(markFailedAttemptSpy).not.toHaveBeenCalled();
  });

  it('пропускает событие, если markProcessing вернул claimed:false (уже забрано другим worker)', async () => {
    const event = makeEvent();
    const markProcessingSpy = jest.fn().mockResolvedValue({ claimed: false });
    const resolveSpy = jest.fn();

    const repository = {
      findPendingBatch: jest.fn().mockResolvedValue([event]),
      markProcessing: markProcessingSpy,
      markDone: jest.fn(),
      markFailedAttempt: jest.fn(),
    } as unknown as OutboxEventRepository;
    const registry = { resolve: resolveSpy } as unknown as EventHandlerRegistry;

    const service = new OutboxPollerService(repository, registry);
    await (service as unknown as { pollOnce(): Promise<void> }).pollOnce();

    expect(resolveSpy).not.toHaveBeenCalled();
  });

  it('переводит в failed attempt, если нет зарегистрированного handler для eventType', async () => {
    const event = makeEvent({ eventType: 'UnknownEvent' });
    const markFailedAttemptSpy = jest.fn().mockResolvedValue(undefined);

    const repository = {
      findPendingBatch: jest.fn().mockResolvedValue([event]),
      markProcessing: jest.fn().mockResolvedValue({ claimed: true }),
      markDone: jest.fn(),
      markFailedAttempt: markFailedAttemptSpy,
    } as unknown as OutboxEventRepository;
    const registry = { resolve: jest.fn().mockReturnValue(undefined) } as unknown as EventHandlerRegistry;

    const service = new OutboxPollerService(repository, registry);
    await (service as unknown as { pollOnce(): Promise<void> }).pollOnce();

    expect(markFailedAttemptSpy).toHaveBeenCalledWith(event._id, 5);
  });

  it('переводит в failed attempt, если handler.handle бросает исключение', async () => {
    const event = makeEvent();
    const markDoneSpy = jest.fn();
    const markFailedAttemptSpy = jest.fn().mockResolvedValue(undefined);
    const handleSpy = jest.fn().mockRejectedValue(new Error('side-effect failed'));

    const repository = {
      findPendingBatch: jest.fn().mockResolvedValue([event]),
      markProcessing: jest.fn().mockResolvedValue({ claimed: true }),
      markDone: markDoneSpy,
      markFailedAttempt: markFailedAttemptSpy,
    } as unknown as OutboxEventRepository;
    const registry = { resolve: jest.fn().mockReturnValue({ handle: handleSpy }) } as unknown as EventHandlerRegistry;

    const service = new OutboxPollerService(repository, registry);
    await (service as unknown as { pollOnce(): Promise<void> }).pollOnce();

    expect(markFailedAttemptSpy).toHaveBeenCalledWith(event._id, 5);
    expect(markDoneSpy).not.toHaveBeenCalled();
  });

  it('не падает и не бросает наружу, если findPendingBatch отклоняется (транзиентная ошибка БД)', async () => {
    const repository = {
      findPendingBatch: jest.fn().mockRejectedValue(new Error('connection lost')),
      markProcessing: jest.fn(),
      markDone: jest.fn(),
      markFailedAttempt: jest.fn(),
    } as unknown as OutboxEventRepository;
    const registry = { resolve: jest.fn() } as unknown as EventHandlerRegistry;

    const service = new OutboxPollerService(repository, registry);

    await expect(
      (service as unknown as { pollOnce(): Promise<void> }).pollOnce(),
    ).resolves.toBeUndefined();
  });

  it('обрабатывает несколько событий из batch последовательно', async () => {
    const eventA = makeEvent();
    const eventB = makeEvent();
    const handleSpy = jest.fn().mockResolvedValue(undefined);

    const repository = {
      findPendingBatch: jest.fn().mockResolvedValue([eventA, eventB]),
      markProcessing: jest.fn().mockResolvedValue({ claimed: true }),
      markDone: jest.fn().mockResolvedValue(undefined),
      markFailedAttempt: jest.fn(),
    } as unknown as OutboxEventRepository;
    const registry = { resolve: jest.fn().mockReturnValue({ handle: handleSpy }) } as unknown as EventHandlerRegistry;

    const service = new OutboxPollerService(repository, registry);
    await (service as unknown as { pollOnce(): Promise<void> }).pollOnce();

    expect(handleSpy).toHaveBeenCalledTimes(2);
  });
});

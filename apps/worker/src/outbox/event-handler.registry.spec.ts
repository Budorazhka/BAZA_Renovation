import { EventHandlerRegistry } from './event-handler.registry';
import type { EventHandler } from './event-handler';

describe('EventHandlerRegistry', () => {
  function makeHandler(): EventHandler {
    return { handle: jest.fn().mockResolvedValue(undefined) };
  }

  it('resolve возвращает зарегистрированный handler для его eventType', () => {
    const registry = new EventHandlerRegistry();
    const handler = makeHandler();
    registry.register('SomeEvent', handler);

    expect(registry.resolve('SomeEvent')).toBe(handler);
  });

  it('resolve возвращает undefined для незарегистрированного eventType', () => {
    const registry = new EventHandlerRegistry();
    expect(registry.resolve('Unregistered')).toBeUndefined();
  });

  it('бросает при попытке зарегистрировать два handler на один eventType', () => {
    const registry = new EventHandlerRegistry();
    registry.register('SomeEvent', makeHandler());

    expect(() => registry.register('SomeEvent', makeHandler())).toThrow(/уже зарегистрирован/);
  });
});

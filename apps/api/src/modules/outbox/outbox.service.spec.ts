import { Types } from 'mongoose';
import { OutboxService } from './outbox.service';
import type { OutboxEventRepository } from '@baza/domain-events';

describe('OutboxService', () => {
  it('генерирует детерминированный deduplicationKey, если не передан явно (ADR-006)', async () => {
    const createSpy = jest.fn().mockResolvedValue(undefined);
    const mockRepository = { create: createSpy } as unknown as OutboxEventRepository;
    const service = new OutboxService(mockRepository);
    const aggregateId = new Types.ObjectId();
    const fakeSession = {} as never;

    await service.publish(
      {
        eventType: 'PublicationRequested',
        payload: { foo: 'bar' },
        aggregateId,
        aggregateType: 'development',
      },
      fakeSession,
    );

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        deduplicationKey: `development:${aggregateId.toString()}:PublicationRequested`,
      }),
      fakeSession,
    );
  });

  it('использует явно переданный deduplicationKey, не генерирует свой', async () => {
    const createSpy = jest.fn().mockResolvedValue(undefined);
    const mockRepository = { create: createSpy } as unknown as OutboxEventRepository;
    const service = new OutboxService(mockRepository);
    const fakeSession = {} as never;

    await service.publish(
      {
        eventType: 'BookingCreated',
        payload: {},
        aggregateId: new Types.ObjectId(),
        aggregateType: 'unit',
        deduplicationKey: 'custom-key-123',
      },
      fakeSession,
    );

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ deduplicationKey: 'custom-key-123' }),
      fakeSession,
    );
  });

  it('передаёт session в repository — обязательный параметр атомарности (ADR-006)', async () => {
    const createSpy = jest.fn().mockResolvedValue(undefined);
    const mockRepository = { create: createSpy } as unknown as OutboxEventRepository;
    const service = new OutboxService(mockRepository);
    const fakeSession = { id: 'session-marker' } as never;

    await service.publish(
      {
        eventType: 'X',
        payload: {},
        aggregateId: new Types.ObjectId(),
        aggregateType: 'x',
      },
      fakeSession,
    );

    expect(createSpy).toHaveBeenCalledWith(expect.anything(), fakeSession);
  });
});

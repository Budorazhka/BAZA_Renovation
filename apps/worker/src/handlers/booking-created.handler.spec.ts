import { Types } from 'mongoose';
import { BookingCreatedHandler } from './booking-created.handler';

describe('BookingCreatedHandler', () => {
  it('acknowledges the durable event without throwing', async () => {
    const handler = new BookingCreatedHandler();
    await expect(
      handler.handle({
        _id: new Types.ObjectId(),
        eventType: 'BookingCreated',
        payload: { bookingId: new Types.ObjectId().toString() },
        aggregateId: new Types.ObjectId(),
        aggregateType: 'booking',
        createdAt: new Date(),
        processedAt: null,
        deduplicationKey: 'booking:created:test',
        attempts: 0,
        status: 'pending',
      } as never),
    ).resolves.toBeUndefined();
  });
});

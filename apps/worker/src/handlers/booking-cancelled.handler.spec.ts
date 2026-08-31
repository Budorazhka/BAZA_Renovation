import { Types } from 'mongoose';
import { BookingCancelledHandler } from './booking-cancelled.handler';

describe('BookingCancelledHandler', () => {
  it('acknowledges the durable event without throwing', async () => {
    const handler = new BookingCancelledHandler();
    await expect(
      handler.handle({
        _id: new Types.ObjectId(),
        eventType: 'BookingCancelled',
        payload: { bookingId: new Types.ObjectId().toString(), reason: 'клиент передумал' },
        aggregateId: new Types.ObjectId(),
        aggregateType: 'booking',
        createdAt: new Date(),
        processedAt: null,
        deduplicationKey: 'booking:cancelled:test',
        attempts: 0,
        status: 'pending',
      } as never),
    ).resolves.toBeUndefined();
  });
});

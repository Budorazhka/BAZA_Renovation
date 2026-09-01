import { Types } from 'mongoose';
import { BookingConfirmedHandler } from './booking-confirmed.handler';

describe('BookingConfirmedHandler', () => {
  it('acknowledges the durable event without throwing', async () => {
    const handler = new BookingConfirmedHandler();
    await expect(
      handler.handle({
        _id: new Types.ObjectId(),
        eventType: 'BookingConfirmed',
        payload: { bookingId: new Types.ObjectId().toString() },
        aggregateId: new Types.ObjectId(),
        aggregateType: 'booking',
        createdAt: new Date(),
        processedAt: null,
        deduplicationKey: 'booking:confirmed:test',
        attempts: 0,
        status: 'pending',
      } as never),
    ).resolves.toBeUndefined();
  });
});

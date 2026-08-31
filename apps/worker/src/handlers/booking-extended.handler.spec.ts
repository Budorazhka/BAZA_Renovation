import { Types } from 'mongoose';
import { BookingExtendedHandler } from './booking-extended.handler';

describe('BookingExtendedHandler', () => {
  it('acknowledges the durable event without throwing', async () => {
    const handler = new BookingExtendedHandler();
    await expect(
      handler.handle({
        _id: new Types.ObjectId(),
        eventType: 'BookingExtended',
        payload: { bookingId: new Types.ObjectId().toString(), newExpiresAt: new Date().toISOString() },
        aggregateId: new Types.ObjectId(),
        aggregateType: 'booking',
        createdAt: new Date(),
        processedAt: null,
        deduplicationKey: 'booking:extended:test',
        attempts: 0,
        status: 'pending',
      } as never),
    ).resolves.toBeUndefined();
  });
});

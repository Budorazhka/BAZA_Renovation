import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { BookingLockDocument } from '../schemas/booking-lock.schema';

@Injectable()
export class BookingLockRepository {
  constructor(@InjectModel(BookingLockDocument.name) private readonly model: Model<BookingLockDocument>) {}

  /**
   * Must be the first write in a booking transaction. MongoDB's write
   * conflict on this per-unit document is what makes the subsequent overlap
   * read effectively serialized (ADR-006).
   */
  async bumpForUnit(unitId: Types.ObjectId, session: ClientSession): Promise<BookingLockDocument> {
    return this.model
      .findOneAndUpdate(
        { _id: unitId },
        { $inc: { currentVersion: 1 }, $set: { updatedAt: new Date() } },
        { upsert: true, new: true, session, setDefaultsOnInsert: false },
      )
      .exec();
  }
}

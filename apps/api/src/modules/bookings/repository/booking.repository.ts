import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import {
  ACTIVE_BOOKING_STATUSES,
  BookingDocument,
  type BookingStatus,
} from '../schemas/booking.schema';

@Injectable()
export class BookingRepository {
  constructor(@InjectModel(BookingDocument.name) private readonly model: Model<BookingDocument>) {}

  async findOverlappingActive(
    unitId: Types.ObjectId,
    startsAt: Date,
    expiresAt: Date,
    session: ClientSession,
  ): Promise<BookingDocument | null> {
    return this.model
      .findOne({
        unitId,
        status: { $in: ACTIVE_BOOKING_STATUSES },
        'dateRange.startsAt': { $lt: expiresAt },
        'dateRange.expiresAt': { $gt: startsAt },
      })
      .session(session)
      .exec();
  }

  async create(
    params: {
      unitId: Types.ObjectId;
      organizationId: Types.ObjectId;
      leadId?: Types.ObjectId;
      dateRange: { startsAt: Date; expiresAt: Date };
      status?: BookingStatus;
      manager: Types.ObjectId;
    },
    session: ClientSession,
  ): Promise<BookingDocument> {
    const [booking] = await this.model.create([{ ...params, status: params.status ?? 'pending' }], { session });
    return booking!;
  }
}

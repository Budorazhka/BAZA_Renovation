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

  /**
   * ADR-002 требование 1 (tenant escape prevention) — organizationId
   * позиционный параметр, тот же паттерн, что findByIdForOrganization в
   * остальных модулях: не существует и "существует, но чужая организация"
   * не различаются на этом уровне (404 в сервисе одинаков для обоих).
   */
  async findByIdForOrganization(
    bookingId: Types.ObjectId,
    organizationId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<BookingDocument | null> {
    return this.model.findOne({ _id: bookingId, organizationId }).session(session ?? null).exec();
  }

  /**
   * Cancel — единственный переход этого среза (booking.confirm/extend/paid
   * остаются отдельными срезами, book-001-decision-memo). Условный фильтр
   * `status: {$in: ['pending','booked']}` — не CAS по отдельному version
   * (у Booking его нет, в отличие от Development/Listing): concurrency-
   * защита здесь не про гонку двух cancel (обе безопасно idempotent —
   * вторая просто получит modifiedCount:0), а про то, чтобы cancel не мог
   * молча "откатить" уже paid/уже terminal бронь. modifiedCount:0 в сервисе
   * трактуется как BOOKING_INVALID_STATE_TRANSITION.
   */
  async cancelIfActive(
    bookingId: Types.ObjectId,
    organizationId: Types.ObjectId,
    session: ClientSession,
  ): Promise<{ modifiedCount: number }> {
    const result = await this.model
      .updateOne(
        { _id: bookingId, organizationId, status: { $in: ['pending', 'booked'] as BookingStatus[] } },
        { $set: { status: 'rejected' as BookingStatus } },
      )
      .session(session)
      .exec();
    return { modifiedCount: result.modifiedCount };
  }
}

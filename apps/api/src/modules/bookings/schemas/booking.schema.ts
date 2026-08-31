import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type BookingStatus = 'pending' | 'booked' | 'rejected' | 'expired' | 'paid';
export const ACTIVE_BOOKING_STATUSES: readonly BookingStatus[] = ['pending', 'booked', 'paid'];

const BookingDateRangeSchema = new MongooseSchema(
  {
    startsAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { _id: false },
);

/**
 * Booking domain model (domain-model.md Module 7). `manager` is the
 * Position that created/owns the booking; it is always derived from the
 * server-side TenantContext, never accepted from the request body.
 */
@Schema({ collection: 'bookings', timestamps: { createdAt: 'createdAt', updatedAt: false } })
export class BookingDocument extends Document {
  declare _id: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId })
  unitId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId })
  organizationId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: false })
  leadId?: Types.ObjectId;

  @Prop({ type: BookingDateRangeSchema, required: true })
  dateRange!: { startsAt: Date; expiresAt: Date };

  @Prop({ required: true, enum: ['pending', 'booked', 'rejected', 'expired', 'paid'], default: 'pending' })
  status!: BookingStatus;

  @Prop({ required: true, type: Types.ObjectId })
  manager!: Types.ObjectId;

  declare createdAt: Date;
}

export const BookingSchema = SchemaFactory.createForClass(BookingDocument);

// The partial index is the database-side accelerator for the serialized
// BookingLock overlap query. Rejected/expired bookings do not occupy a unit.
BookingSchema.index(
  { unitId: 1, status: 1, 'dateRange.startsAt': 1 },
  {
    partialFilterExpression: { status: { $in: ACTIVE_BOOKING_STATUSES } },
  },
);
BookingSchema.index({ organizationId: 1, createdAt: -1 });

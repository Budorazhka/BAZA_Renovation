import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * One lock document per unit (ADR-006). The document is deliberately keyed
 * by unitId so concurrent booking transactions must serialize on the same
 * MongoDB write before checking the booking overlap snapshot.
 */
@Schema({ collection: 'booking_locks', timestamps: false })
export class BookingLockDocument extends Document {
  declare _id: Types.ObjectId;

  @Prop({ required: true })
  currentVersion!: number;

  @Prop({ required: true, default: Date.now })
  updatedAt!: Date;
}

export const BookingLockSchema = SchemaFactory.createForClass(BookingLockDocument);

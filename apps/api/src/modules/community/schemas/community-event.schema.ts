import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EventFormat = 'online' | 'offline';

@Schema({ collection: 'community_events', timestamps: true })
export class CommunityEventDocument extends Document {
  @Prop({ required: true, unique: true, index: true })
  eventId!: string;

  @Prop({ required: true })
  title!: string;

  @Prop({ required: true })
  description!: string;

  @Prop({ required: true })
  date!: string;

  @Prop({ required: true })
  location!: string;

  @Prop({ required: true, enum: ['online', 'offline'] })
  format!: EventFormat;

  @Prop({ type: [Types.ObjectId], default: [] })
  attendeeIdentityIds!: Types.ObjectId[];

  @Prop({ default: 0 })
  attendeeCount!: number;

  createdAt!: Date;
  updatedAt!: Date;
}

export const CommunityEventSchema = SchemaFactory.createForClass(CommunityEventDocument);
CommunityEventSchema.index({ date: 1 });

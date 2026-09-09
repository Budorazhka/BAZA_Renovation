import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ collection: 'lms_progress', timestamps: true })
export class LmsProgressDocument extends Document {
  declare _id: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId })
  organizationId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId })
  positionId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId })
  identityId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  courseId!: string;

  @Prop({ type: [String], default: [] })
  completedItems!: string[];

  @Prop({ required: false, type: Boolean })
  finalQuizPassed?: boolean;

  @Prop({ required: false, type: Number })
  finalQuizScore?: number;

  @Prop({ required: false, type: Date })
  completedAt?: Date;
}

export const LmsProgressSchema = SchemaFactory.createForClass(LmsProgressDocument);

LmsProgressSchema.index(
  { organizationId: 1, positionId: 1, courseId: 1 },
  { unique: true },
);

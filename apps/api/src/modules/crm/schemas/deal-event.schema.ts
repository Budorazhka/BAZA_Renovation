import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { DEAL_STAGES } from '../deal-stage';

export type DealStage =
  | 'showing'
  | 'deposit'
  | 'deal'
  | 'golden'
  | 'check_in'
  | 'referral'
  | 'closed_lost';

export interface DealEventChangedBy {
  type: 'position' | 'system';
  positionId?: Types.ObjectId;
}

const DealEventChangedBySchema = new MongooseSchema(
  {
    type: { type: String, enum: ['position', 'system'], required: true },
    positionId: { type: MongooseSchema.Types.ObjectId, required: false },
  },
  { _id: false },
);

/**
 * DEAL-001: Append-only event history for Deal stage transitions.
 */
@Schema({ collection: 'deal_events', timestamps: false })
export class DealEventDocument extends Document {
  declare _id: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId })
  dealId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId })
  organizationId!: Types.ObjectId;

  @Prop({
    required: true,
    type: String,
    enum: DEAL_STAGES,
  })
  stage!: DealStage;

  @Prop({
    type: String,
    enum: DEAL_STAGES,
    required: false,
  })
  fromStage?: DealStage;

  @Prop({ type: String, required: false, maxlength: 2000 })
  reason?: string;

  @Prop({ required: true, type: DealEventChangedBySchema })
  changedBy!: DealEventChangedBy;

  @Prop({ required: true, type: Date, default: Date.now })
  changedAt!: Date;
}

export const DealEventSchema = SchemaFactory.createForClass(DealEventDocument);

DealEventSchema.index({ organizationId: 1, dealId: 1, _id: -1 });

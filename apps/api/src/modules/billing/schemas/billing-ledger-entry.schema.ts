import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BillingAction =
  | 'plan_activated'
  | 'plan_renewed'
  | 'plan_changed'
  | 'limit_adjusted'
  | 'payment_recorded'
  | 'frozen';

@Schema({ collection: 'billing_ledger', timestamps: true })
export class BillingLedgerEntryDocument extends Document {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  organizationId!: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    enum: [
      'plan_activated',
      'plan_renewed',
      'plan_changed',
      'limit_adjusted',
      'payment_recorded',
      'frozen',
    ],
  })
  action!: BillingAction;

  @Prop({ type: Number, required: true, default: 0 })
  amountMinorUnits!: number;

  @Prop({ type: String, required: true, default: 'USD' })
  currency!: string;

  @Prop({ type: String, required: true })
  planCode!: string;

  @Prop({ type: Number, required: true, default: 30 })
  periodDays!: number;

  @Prop({ type: String, required: true })
  reason!: string;

  @Prop({ type: Types.ObjectId, required: true })
  recordedBy!: Types.ObjectId;

  @Prop({ type: String, default: '' })
  correlationId!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const BillingLedgerEntrySchema = SchemaFactory.createForClass(BillingLedgerEntryDocument);

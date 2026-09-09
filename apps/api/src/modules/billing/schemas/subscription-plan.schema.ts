import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TargetAudience = 'developer' | 'agency' | 'independent_realtor';

@Schema({ _id: false })
export class PlanLimits {
  @Prop({ type: Number, required: true, default: 20 })
  maxActiveListings!: number;

  @Prop({ type: Number, required: true, default: 5 })
  maxTeamPositions!: number;

  @Prop({ type: Boolean, required: true, default: true })
  crmAccess!: boolean;

  @Prop({ type: Boolean, required: true, default: true })
  chessboardAccess!: boolean;

  @Prop({ type: Boolean, required: true, default: false })
  landingAccess!: boolean;
}

export const PlanLimitsSchema = SchemaFactory.createForClass(PlanLimits);

@Schema({ _id: false })
export class PricePerMonth {
  @Prop({ type: Number, required: true })
  amountMinorUnits!: number;

  @Prop({ type: String, required: true, default: 'USD' })
  currency!: string;
}

export const PricePerMonthSchema = SchemaFactory.createForClass(PricePerMonth);

@Schema({ collection: 'subscription_plans', timestamps: true })
export class SubscriptionPlanDocument extends Document {
  @Prop({ type: String, required: true, unique: true, index: true })
  code!: string;

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String, required: true, enum: ['developer', 'agency', 'independent_realtor'] })
  targetAudience!: TargetAudience;

  @Prop({ type: PlanLimitsSchema, required: true })
  limits!: PlanLimits;

  @Prop({ type: PricePerMonthSchema, required: true })
  pricePerMonth!: PricePerMonth;

  @Prop({ type: Boolean, required: true, default: true })
  isActive!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}

export const SubscriptionPlanSchema = SchemaFactory.createForClass(SubscriptionPlanDocument);

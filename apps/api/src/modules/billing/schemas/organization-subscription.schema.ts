import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { PlanLimits, PlanLimitsSchema } from './subscription-plan.schema';

export type SubscriptionStatus = 'trial' | 'active' | 'grace_period' | 'frozen' | 'cancelled';

@Schema({ _id: false })
export class ResourceUsage {
  @Prop({ type: Number, required: true, default: 0 })
  activeListings!: number;

  @Prop({ type: Number, required: true, default: 0 })
  teamPositions!: number;
}

export const ResourceUsageSchema = SchemaFactory.createForClass(ResourceUsage);

@Schema({ collection: 'organization_subscriptions', timestamps: true })
export class OrganizationSubscriptionDocument extends Document {
  @Prop({ type: Types.ObjectId, required: true, unique: true, index: true })
  organizationId!: Types.ObjectId;

  @Prop({ type: String, required: true })
  planCode!: string;

  @Prop({
    type: String,
    required: true,
    enum: ['trial', 'active', 'grace_period', 'frozen', 'cancelled'],
    default: 'trial',
  })
  status!: SubscriptionStatus;

  @Prop({ type: Date, required: true })
  startedAt!: Date;

  @Prop({ type: Date, required: true })
  expiresAt!: Date;

  @Prop({ type: Date, default: null })
  gracePeriodEndsAt!: Date | null;

  @Prop({ type: PlanLimitsSchema, default: null })
  customLimits!: PlanLimits | null;

  @Prop({ type: ResourceUsageSchema, default: () => ({ activeListings: 0, teamPositions: 0 }) })
  currentUsage!: ResourceUsage;

  createdAt!: Date;
  updatedAt!: Date;
}

export const OrganizationSubscriptionSchema = SchemaFactory.createForClass(OrganizationSubscriptionDocument);

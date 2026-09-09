import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { SubscriptionPlanDocument, TargetAudience } from '../schemas/subscription-plan.schema';

@Injectable()
export class SubscriptionPlanRepository {
  constructor(
    @InjectModel(SubscriptionPlanDocument.name)
    private readonly model: Model<SubscriptionPlanDocument>,
  ) {}

  async findByCode(code: string, session?: ClientSession): Promise<SubscriptionPlanDocument | null> {
    return this.model.findOne({ code, isActive: true }, null, { session }).exec();
  }

  async listActive(targetAudience?: TargetAudience, session?: ClientSession): Promise<SubscriptionPlanDocument[]> {
    const filter: Record<string, unknown> = { isActive: true };
    if (targetAudience) {
      filter.targetAudience = targetAudience;
    }
    return this.model.find(filter, null, { session }).sort({ 'pricePerMonth.amountMinorUnits': 1 }).exec();
  }

  async upsertPlan(
    plan: Partial<SubscriptionPlanDocument> & { code: string },
    session?: ClientSession,
  ): Promise<SubscriptionPlanDocument> {
    return this.model
      .findOneAndUpdate({ code: plan.code }, { $set: plan }, { upsert: true, new: true, session })
      .exec();
  }
}

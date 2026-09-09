import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import {
  OrganizationSubscriptionDocument,
  ResourceUsage,
  SubscriptionStatus,
} from '../schemas/organization-subscription.schema';
import { PlanLimits } from '../schemas/subscription-plan.schema';

@Injectable()
export class OrganizationSubscriptionRepository {
  constructor(
    @InjectModel(OrganizationSubscriptionDocument.name)
    private readonly model: Model<OrganizationSubscriptionDocument>,
  ) {}

  async findByOrganizationId(
    organizationId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<OrganizationSubscriptionDocument | null> {
    return this.model.findOne({ organizationId }, null, { session }).exec();
  }

  async upsertSubscription(
    params: {
      organizationId: Types.ObjectId;
      planCode: string;
      status: SubscriptionStatus;
      startedAt: Date;
      expiresAt: Date;
      gracePeriodEndsAt?: Date | null;
      customLimits?: PlanLimits | null;
      currentUsage?: ResourceUsage;
    },
    session?: ClientSession,
  ): Promise<OrganizationSubscriptionDocument> {
    const doc = await this.model
      .findOneAndUpdate(
        { organizationId: params.organizationId },
        {
          $set: {
            planCode: params.planCode,
            status: params.status,
            startedAt: params.startedAt,
            expiresAt: params.expiresAt,
            gracePeriodEndsAt: params.gracePeriodEndsAt ?? null,
            ...(params.customLimits !== undefined ? { customLimits: params.customLimits } : {}),
            ...(params.currentUsage !== undefined ? { currentUsage: params.currentUsage } : {}),
          },
          $setOnInsert: {
            ...(params.currentUsage === undefined
              ? { currentUsage: { activeListings: 0, teamPositions: 0 } }
              : {}),
          },
        },
        { upsert: true, new: true, session },
      )
      .exec();

    return doc as OrganizationSubscriptionDocument;
  }

  async updateUsage(
    organizationId: Types.ObjectId,
    usage: { activeListings: number; teamPositions: number },
    session?: ClientSession,
  ): Promise<void> {
    await this.model
      .updateOne({ organizationId }, { $set: { currentUsage: usage } }, { session })
      .exec();
  }

  async updateStatus(
    organizationId: Types.ObjectId,
    status: SubscriptionStatus,
    gracePeriodEndsAt?: Date | null,
    session?: ClientSession,
  ): Promise<OrganizationSubscriptionDocument | null> {
    return this.model
      .findOneAndUpdate(
        { organizationId },
        {
          $set: {
            status,
            ...(gracePeriodEndsAt !== undefined ? { gracePeriodEndsAt } : {}),
          },
        },
        { new: true, session },
      )
      .exec();
  }
}

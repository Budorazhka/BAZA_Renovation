import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { DealEventChangedBy, DealEventDocument, type DealStage } from '../schemas/deal-event.schema';

/**
 * Append-only repository for Deal stage transition history.
 */
@Injectable()
export class DealEventRepository {
  constructor(
    @InjectModel(DealEventDocument.name) private readonly model: Model<DealEventDocument>,
  ) {}

  async append(
    params: {
      dealId: Types.ObjectId;
      organizationId: Types.ObjectId;
      stage: DealStage;
      fromStage?: DealStage;
      reason?: string;
      changedBy: DealEventChangedBy;
    },
    session?: ClientSession,
  ): Promise<void> {
    await this.model.create([params], { session });
  }

  async listForDeal(
    dealId: Types.ObjectId,
    organizationId: Types.ObjectId,
    params?: { cursor?: Types.ObjectId; limit?: number },
  ): Promise<DealEventDocument[]> {
    const filter: Record<string, unknown> = { dealId, organizationId };
    if (params?.cursor) {
      filter._id = { $lt: params.cursor };
    }
    let query = this.model.find(filter).sort({ _id: -1 });
    if (params?.limit) {
      query = query.limit(params.limit);
    }
    return query.exec();
  }

  async listForDealIds(
    organizationId: Types.ObjectId,
    dealIds: Types.ObjectId[],
  ): Promise<DealEventDocument[]> {
    if (dealIds.length === 0) return [];
    return this.model.find({ organizationId, dealId: { $in: dealIds } }).sort({ _id: -1 }).exec();
  }
}

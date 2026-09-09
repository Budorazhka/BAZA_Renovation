import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { BillingLedgerEntryDocument } from '../schemas/billing-ledger-entry.schema';

@Injectable()
export class BillingLedgerRepository {
  constructor(
    @InjectModel(BillingLedgerEntryDocument.name)
    private readonly model: Model<BillingLedgerEntryDocument>,
  ) {}

  async appendEntry(
    entry: Partial<BillingLedgerEntryDocument>,
    session?: ClientSession,
  ): Promise<BillingLedgerEntryDocument> {
    const doc = new this.model(entry);
    return doc.save({ session });
  }

  async listByOrganizationId(
    organizationId: Types.ObjectId,
    limit = 50,
    session?: ClientSession,
  ): Promise<BillingLedgerEntryDocument[]> {
    return this.model
      .find({ organizationId }, null, { session })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }
}

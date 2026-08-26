import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { LeadEventDocument, LeadEventChangedBy } from '../schemas/lead-event.schema';
import type { LeadStage } from '../schemas/lead.schema';

/**
 * Единственная точка доступа к коллекции lead_events (ADR-002 требование
 * 2). Намеренно БЕЗ update/delete методов вообще — append-only, тот же
 * принцип, что AuditEventRepository (Module 3).
 */
@Injectable()
export class LeadEventRepository {
  constructor(
    @InjectModel(LeadEventDocument.name) private readonly model: Model<LeadEventDocument>,
  ) {}

  async append(
    params: {
      leadId: Types.ObjectId;
      organizationId: Types.ObjectId;
      stage: LeadStage;
      changedBy: LeadEventChangedBy;
    },
    session?: ClientSession,
  ): Promise<void> {
    await this.model.create([params], { session });
  }
}

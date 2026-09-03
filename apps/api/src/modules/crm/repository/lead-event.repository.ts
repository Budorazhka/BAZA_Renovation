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
      comment?: string;
    },
    session?: ClientSession,
  ): Promise<void> {
    await this.model.create([params], { session });
  }

  /**
   * GET /leads/:leadId/events — cursor pagination по `_id`, тот же принцип,
   * что LeadRepository.listForOrganization/AuditEventRepository.listForAdmin:
   * ObjectId монотонно возрастает и уникален, `_id`-курсор не имеет
   * дублей/пропусков даже когда несколько событий одного лида записаны в
   * одну транзакцию (одинаковый changedAt). Newest-first (`$lt` на курсор).
   * organizationId в фильтре — defense-in-depth, не единственная граница
   * tenant/owner-изоляции: вызывающий код (CrmService.listLeadEvents)
   * обязан проверить, что сам lead принадлежит organization/owner scope
   * ДО вызова этого метода (см. его докстринг) — 404 для чужого/
   * несуществующего лида решается на уровне lead, не lead_events.
   */
  async listForLead(
    leadId: Types.ObjectId,
    organizationId: Types.ObjectId,
    params?: { cursor?: Types.ObjectId; limit?: number },
  ): Promise<LeadEventDocument[]> {
    const filter: Record<string, unknown> = { leadId, organizationId };
    if (params?.cursor) {
      filter._id = { $lt: params.cursor };
    }
    let query = this.model.find(filter).sort({ _id: -1 });
    if (params?.limit) {
      query = query.limit(params.limit);
    }
    return query.exec();
  }

  async listForLeadIds(
    organizationId: Types.ObjectId,
    leadIds: Types.ObjectId[],
  ): Promise<LeadEventDocument[]> {
    if (leadIds.length === 0) return [];
    return this.model.find({ organizationId, leadId: { $in: leadIds } }).sort({ _id: -1 }).exec();
  }
}

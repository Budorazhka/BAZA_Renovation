import type { LegacyLead, LegacyLeadHistoryEntry } from '../../modules/crm/legacy-lead.types';
import { isStageChangeEntry } from './legacy-api-types';
import type { RawLegacyLead, RawLegacyHistoryEntry } from './legacy-api-types';

/**
 * `[lead-legacy-export-tool]`: чистый маппинг сырого ответа легаси-backend
 * в форму `LegacyLead` (`legacy-lead.types.ts`) — контракт уже готового
 * импортёра (`LeadMigrationService`). Без сети, легко тестируется отдельно.
 *
 * Отбрасывает записи истории типа `stage_comment` (комментарии к этапу, не
 * переходы этапа) — они не имеют формы `LegacyLeadHistoryEntry`, см.
 * докстринг `legacy-api-types.ts`.
 */
export function mapLegacyLeadResponse(lead: RawLegacyLead, history: RawLegacyHistoryEntry[]): LegacyLead {
  const stageChangeHistory: LegacyLeadHistoryEntry[] = history.filter(isStageChangeEntry).map((entry) => ({
    fromStage: entry.fromStage,
    toStage: entry.toStage,
    changedAt: entry.changedAt,
    changedBy: entry.changedBy,
    userName: entry.userName,
    userRole: entry.userRole,
    ...(entry.comment ? { comment: entry.comment } : {}),
  }));

  return {
    _id: lead._id,
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    city: lead.city,
    stage: lead.stage,
    productType: lead.productType,
    realtorStage: lead.realtorStage,
    curatorStage: lead.curatorStage,
    assignedTo: lead.assignedTo,
    createdBy: lead.createdBy,
    source: lead.source,
    notes: lead.notes,
    rejectionReason: lead.rejectionReason,
    rejectionComment: lead.rejectionComment,
    history: stageChangeHistory,
    dealValue: lead.dealValue,
    expectedCloseDate: lead.expectedCloseDate,
    budgetValue: lead.budgetValue,
    budgetCurrency: lead.budgetCurrency,
    tags: lead.tags,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
  };
}

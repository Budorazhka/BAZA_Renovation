/**
 * `[lead-legacy-migration-tool]`: форма ОДНОГО лида в JSON-файле, выгруженном
 * из легаси-backend (`api-crm.baza.sale`). Прямой перенос полей интерфейса
 * `Lead`/`LeadHistory` из `apps/erp-web/src/features/crm/services/api/
 * types.ts` (легаси фронтенд, читает от того же легаси-backend), СУЖЕННЫЙ до
 * полей, которые реально нужны инструменту переноса (`files`/`roles`/
 * `aiSummary` не переносятся — см. LeadMigrationService докстринг за честными
 * пробелами). Ничего не выдумано сверх этого интерфейса.
 *
 * `stage`/`realtorStage`/`curatorStage`/`productType`/`rejectionReason` —
 * намеренно `string`, не литеральные union: это данные ИЗ ФАЙЛА (могут быть
 * испорчены), валидация значений — обязанность LeadMigrationService
 * (lead-stage-legacy-mapping.ts), не форма входного типа.
 */
export interface LegacyLeadHistoryEntry {
  fromStage: string;
  toStage: string;
  changedAt: string;
  changedBy: string;
  userName: string;
  userRole: string;
  comment?: string;
}

export interface LegacyLead {
  _id: string;
  name: string;
  phone: string;
  email?: string;
  city?: string;
  stage: string;
  productType: string;
  realtorStage?: string;
  curatorStage?: string;
  assignedTo: string;
  createdBy: string;
  source?: string;
  notes?: string;
  rejectionReason?: string;
  rejectionComment?: string;
  history: LegacyLeadHistoryEntry[];
  dealValue: number;
  expectedCloseDate?: string;
  budgetValue?: number;
  budgetCurrency?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

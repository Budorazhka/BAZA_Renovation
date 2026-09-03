/**
 * `[lead-legacy-export-tool]`: формы СЫРОГО ответа легаси-backend
 * (`api-crm.baza.sale`), воспроизведённые из `apps/erp-web/src/features/crm/
 * services/api/leads.ts`/`types.ts` (эталон контракта, не импортируется
 * напрямую — эти файлы полны браузерных зависимостей, см. докстринг
 * `export-legacy-leads.script.ts`).
 *
 * РАСХОЖДЕНИЕ С ПЕРВОНАЧАЛЬНЫМ ОПИСАНИЕМ ЗАДАЧИ: легаси-backend оборачивает
 * ВСЕ ответы в конверт `{success, data, message}` (см. `leads.ts::getLeads`
 * → `ApiResponse<{items,...}>`, `getLeadHistory` → `ApiResponse<Array<...>>`)
 * — не голый `{items, total,...}`/`LeadHistory[]`, как было предположено в
 * постановке. HTTP-клиент разворачивает `data` из конверта.
 */
export interface LegacyApiEnvelope<T> {
  success: boolean;
  data?: T;
  message?: string;
}

export interface RawLegacyLead {
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
  dealValue: number;
  expectedCloseDate?: string;
  budgetValue?: number;
  budgetCurrency?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  /**
   * Легаси `Lead` (см. `types.ts`) уже содержит embedded `history: LeadHistory[]`
   * в ответе списка лидов. Экспортёр намеренно ИГНОРИРУЕТ это поле в пользу
   * отдельного запроса `/crm/leads/{id}/history` — так предписано постановкой
   * (N+1, "у легаси нет batch-эндпоинта"), и так он получает более полную
   * картину истории (включая записи, которых нет в списке). См.
   * `map-legacy-lead.ts` докстринг.
   */
  history?: unknown;
}

export interface RawLeadsPage {
  items: RawLegacyLead[];
  total: number;
  page: number;
  totalPages: number;
}

/** Запись реального перехода этапа — форма, которую понимает `LegacyLeadHistoryEntry`. */
export interface RawLegacyHistoryStageChangeEntry {
  fromStage: string;
  toStage: string;
  changedAt: string;
  changedBy: string;
  userName: string;
  userRole: string;
  comment?: string;
}

/**
 * Легаси `/crm/leads/{id}/history` также возвращает записи-комментарии к
 * этапу (`type: 'stage_comment'`) — они не описывают переход этапа и не
 * входят в форму `LegacyLeadHistoryEntry` (нет `fromStage`/`toStage`).
 * Маппинг их отбрасывает, см. `map-legacy-lead.ts`.
 */
export interface RawLegacyHistoryStageCommentEntry {
  type: 'stage_comment';
  stage: string;
  stageName: string;
  comment: string;
  createdAt: string;
  updatedAt: string;
  createdBy: { _id: string; name: string; email: string };
  updatedBy?: { _id: string; name: string; email: string };
}

export type RawLegacyHistoryEntry = RawLegacyHistoryStageChangeEntry | RawLegacyHistoryStageCommentEntry;

export function isStageChangeEntry(entry: RawLegacyHistoryEntry): entry is RawLegacyHistoryStageChangeEntry {
  return (entry as RawLegacyHistoryStageChangeEntry).fromStage !== undefined
    && (entry as RawLegacyHistoryStageChangeEntry).toStage !== undefined;
}

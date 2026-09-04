/**
 * Типы нового API CRM-отчётов BAZA (apps/api/src/modules/crm/crm-report.controller.ts).
 * Зеркалит backend-контракт 1:1 — см. CrmService.getLeadFunnelReport/
 * getPositionsReport докстринги.
 */

/** apps/api/src/modules/crm/lead-stage-definitions.ts::PRODUCT_TYPES. */
export const CRM_REPORT_PRODUCT_TYPES = ['sales', 'network', 'owner', 'agent'] as const
export type CrmReportProductType = (typeof CRM_REPORT_PRODUCT_TYPES)[number]

export interface LeadFunnelStageV2 {
  stage: string
  /** Число РАЗНЫХ лидов, достигших этой стадии за период — не число событий. */
  leadCount: number
}

export interface LeadFunnelReportV2Response {
  stages: LeadFunnelStageV2[]
}

export interface MoneyAmountSumV2 {
  currency: string
  amountMinorUnits: number
}

export interface PositionReportV2 {
  /** null — ещё не назначенные лиды/сделки (ownerPositionId отсутствует). */
  positionId: string | null
  leadsTotal: number
  leadsByStage: Record<string, number>
  dealsTotal: number
  dealsByStage: Record<string, number>
  dealsCommission: MoneyAmountSumV2[]
}

export interface PositionsReportV2Response {
  positions: PositionReportV2[]
}

export interface LeadFunnelReportV2Params {
  productType?: CrmReportProductType
  from?: string
  to?: string
}

export interface PositionsReportV2Params {
  from?: string
  to?: string
}

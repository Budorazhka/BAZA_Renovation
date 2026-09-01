/**
 * Допустимые стадии лида в BAZA (источник истины: apps/api/src/modules/crm/lead-stage.ts).
 */
export const LEAD_STAGES_V2 = ['new', 'contacted', 'qualified', 'converted', 'lost'] as const

export type LeadStageV2 = (typeof LEAD_STAGES_V2)[number]

export interface LeadSourceV2 {
  route: string
  publicationId?: string
  utm?: Record<string, string>
  referrer?: string
}

export interface LeadContactV2 {
  id: string
  name: string
  phone: string
  email?: string
}

export interface LeadV2 {
  id: string
  organizationId: string
  ownerPositionId: string | null
  stage: LeadStageV2
  /** Optimistic concurrency (27.08.2026) — обязателен в PATCH .../stage как expectedVersion. */
  version: number
  source: LeadSourceV2
  createdAt: string
  contact: LeadContactV2 | null
}

/** Ответ команды PATCH stage. Это не полная read-модель LeadV2. */
export interface LeadStageChangeResult {
  id: string
  organizationId: string
  contactId: string
  ownerPositionId: string | null
  stage: LeadStageV2
  version: number
  source: LeadSourceV2
}

export interface ListLeadsV2Params {
  stage?: LeadStageV2
  limit?: number
}

export interface ListLeadsV2Response {
  items: LeadV2[]
}

export interface ChangeLeadStagePayload {
  stage: LeadStageV2
  expectedVersion: number
}

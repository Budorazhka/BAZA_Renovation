import axios from 'axios'
import { PLATFORM_API_BASE_URL } from '@/config/backend'
import type {
  LeadStageV2,
  LeadStageChangeResult,
  LeadV2,
  ListLeadsV2Params,
  ListLeadsV2Response,
} from '@/types/leadsV2'

export * from '@/types/leadsV2'

/**
 * Изолированный клиент к новому API лидов BAZA (apps/api/src/modules/crm/lead.controller.ts).
 *
 * Эндпоинты:
 * - GET /api/v1/leads?stage=<optional>&limit=<1..100>
 * - GET /api/v1/leads/:leadId
 * - PATCH /api/v1/leads/:leadId/stage body: { stage: string, expectedVersion: number }
 * - POST /api/v1/leads/:leadId/assign body: { assigneePositionId: string }
 *
 * Авторизация только через cookie (withCredentials: true).
 * Tenant и права проверяются бэкендом (organizationId не передаётся клиентом).
 */
const api = axios.create({
  baseURL: PLATFORM_API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

export const leadsApiV2 = {
  /** GET /api/v1/leads?stage=<optional>&limit=<1..100> */
  async list(params?: ListLeadsV2Params): Promise<ListLeadsV2Response> {
    const { data } = await api.get<ListLeadsV2Response>('/api/v1/leads', { params })
    return data
  },

  /** GET /api/v1/leads/:id */
  async getById(id: string): Promise<LeadV2> {
    const { data } = await api.get<LeadV2>(`/api/v1/leads/${id}`)
    return data
  },

  /**
   * PATCH /api/v1/leads/:id/stage. expectedVersion — прочитанная клиентом
   * version лида (см. LeadV2.version) — backend отклонит запрос с 409
   * VERSION_CONFLICT, если лид изменился с момента, когда клиент его читал
   * (optimistic concurrency, 27.08.2026). Вызывающий код должен перечитать
   * лид и повторить попытку с новой version при 409, не считать это фатальной
   * ошибкой.
   */
  async changeStage(id: string, stage: LeadStageV2, expectedVersion: number): Promise<LeadStageChangeResult> {
    const { data } = await api.patch<LeadStageChangeResult>(`/api/v1/leads/${id}/stage`, { stage, expectedVersion })
    return data
  },

  /** POST /api/v1/leads/:id/assign */
  async assign(id: string, assigneePositionId: string): Promise<LeadStageChangeResult> {
    const { data } = await api.post<LeadStageChangeResult>(`/api/v1/leads/${id}/assign`, { assigneePositionId })
    return data
  },
}

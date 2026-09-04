import axios from 'axios'
import { PLATFORM_API_BASE_URL } from '@/config/backend'
import type {
  LeadFunnelReportV2Params,
  LeadFunnelReportV2Response,
  PositionsReportV2Params,
  PositionsReportV2Response,
} from '@/types/crmReportV2'

export * from '@/types/crmReportV2'

/**
 * Изолированный клиент к новому API CRM-отчётов BAZA
 * (apps/api/src/modules/crm/crm-report.controller.ts), по образцу
 * dealsApiV2.ts/calendarApiV2.ts.
 *
 * Эндпоинты:
 * - GET /api/v1/crm/reports/lead-funnel?productType=&from=&to=
 * - GET /api/v1/crm/reports/positions?from=&to=
 *
 * Оба требуют право `crm_report.read` (organization scope —
 * owner/director/rop/developer); manager/administrator/marketer получат 403.
 * Авторизация только через cookie (withCredentials: true).
 */
const api = axios.create({
  baseURL: PLATFORM_API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

export const crmReportApiV2 = {
  /** GET /api/v1/crm/reports/lead-funnel */
  async getLeadFunnel(params?: LeadFunnelReportV2Params): Promise<LeadFunnelReportV2Response> {
    const { data } = await api.get<LeadFunnelReportV2Response>('/api/v1/crm/reports/lead-funnel', { params })
    return data
  },

  /** GET /api/v1/crm/reports/positions */
  async getPositionsReport(params?: PositionsReportV2Params): Promise<PositionsReportV2Response> {
    const { data } = await api.get<PositionsReportV2Response>('/api/v1/crm/reports/positions', { params })
    return data
  },
}

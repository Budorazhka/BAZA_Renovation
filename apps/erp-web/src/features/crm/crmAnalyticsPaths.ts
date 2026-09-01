/**
 * Аналитика сети CRM внутри дашборда (HashRouter).
 * Раньше использовались пути `/analytics`, которые не были зарегистрированы.
 */
export const CRM_ANALYTICS_BASE = '/dashboard/crm/analytics'

export const CRM_ANALYTICS_ME = `${CRM_ANALYTICS_BASE}/me`

export function crmAnalyticsPartnerPath(partnerId: string): string {
  return `${CRM_ANALYTICS_BASE}/partners/${encodeURIComponent(partnerId)}`
}

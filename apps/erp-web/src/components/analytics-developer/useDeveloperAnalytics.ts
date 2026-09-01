import { useCallback, useEffect, useMemo, useState } from 'react'

import { developmentApi } from '@/services/developmentApi'
import {
  buildDeveloperAnalytics,
  developerPeriodRange,
  EMPTY_DEVELOPER_SUMMARY,
  type DeveloperAnalyticsSummaryResponse,
} from '@/lib/developer-analytics'
import type { DeveloperAnalyticsQuery, DeveloperAnalyticsSnapshot } from '@/types/developer-analytics'

/**
 * Реальные данные аналитики девелопера из
 * `GET /api/development/analytics/summary` (ЖК текущего пользователя).
 * Снапшот собирается на клиенте — см. buildDeveloperAnalytics.
 */
export function useDeveloperAnalytics(query: DeveloperAnalyticsQuery): {
  analytics: DeveloperAnalyticsSnapshot & { unavailable: string[] }
  loading: boolean
  error: string | null
  refetch: () => void
} {
  const [summary, setSummary] = useState<DeveloperAnalyticsSummaryResponse>(EMPTY_DEVELOPER_SUMMARY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { period, projectId } = query
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { from, to } = developerPeriodRange(period)
    try {
      const resp = await developmentApi.getAnalyticsSummary({
        from,
        to,
        projectId: projectId && projectId !== 'all' ? projectId : undefined,
      })
      if (resp.success) {
        setSummary(resp.data)
      } else {
        setSummary(EMPTY_DEVELOPER_SUMMARY)
        setError(resp.message ?? 'Не удалось загрузить аналитику')
      }
    } catch (err) {
      setSummary(EMPTY_DEVELOPER_SUMMARY)
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (err instanceof Error ? err.message : 'Не удалось загрузить аналитику'),
      )
    } finally {
      setLoading(false)
    }
  }, [period, projectId])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (cancelled) return
      await load()
    })()
    return () => { cancelled = true }
  }, [load])

  const analytics = useMemo(() => buildDeveloperAnalytics(summary, query), [summary, query])

  return { analytics, loading, error, refetch: load }
}

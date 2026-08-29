import { useCallback, useEffect, useRef, useState } from 'react'
import { adminApi, AdminApiError } from '../api/admin-api'
import type { AdminAuditEventView, AuditResource } from '../types/admin'

export type AuditEventsState =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'ready'; items: AdminAuditEventView[]; nextCursor: string | null; loadingMore: boolean }
  | { status: 'error'; message: string; retry: () => void }

export interface AuditEventsFilter {
  resource?: AuditResource
  action?: string
  resourceId?: string
  from?: string
  to?: string
}

/**
 * Тот же discriminated-union + requestId-race-guard паттерн, что
 * useAdminPublications (PublicationsPage) — 'empty' отдельно от 'error',
 * cursor держится в ref (не в render-состоянии), устаревшие ответы после
 * смены фильтра отбрасываются через requestIdRef.
 */
export function useAdminAuditEvents(filter: AuditEventsFilter): {
  state: AuditEventsState
  loadMore: () => void
} {
  const [state, setState] = useState<AuditEventsState>({ status: 'loading' })
  const nextCursorRef = useRef<string | null>(null)
  const requestIdRef = useRef(0)
  const { resource, action, resourceId, from, to } = filter

  const loadFirstPage = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setState({ status: 'loading' })
    try {
      const response = await adminApi.listAuditEvents({ resource, action, resourceId, from, to, limit: 20 })
      if (requestIdRef.current !== requestId) return
      nextCursorRef.current = response.nextCursor
      if (response.items.length === 0) {
        setState({ status: 'empty' })
      } else {
        setState({ status: 'ready', items: response.items, nextCursor: response.nextCursor, loadingMore: false })
      }
    } catch (cause) {
      if (requestIdRef.current !== requestId) return
      nextCursorRef.current = null
      const message = cause instanceof AdminApiError ? cause.message : 'Не удалось загрузить журнал событий.'
      setState({ status: 'error', message, retry: () => void loadFirstPage() })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource, action, resourceId, from, to])

  useEffect(() => {
    void loadFirstPage()
  }, [loadFirstPage])

  const loadMore = useCallback(() => {
    const cursor = nextCursorRef.current
    if (!cursor) return
    const requestId = requestIdRef.current
    setState((current) => (current.status === 'ready' ? { ...current, loadingMore: true } : current))
    void adminApi.listAuditEvents({ resource, action, resourceId, from, to, cursor, limit: 20 }).then(
      (response) => {
        if (requestIdRef.current !== requestId) return
        nextCursorRef.current = response.nextCursor
        setState((current) =>
          current.status === 'ready'
            ? { status: 'ready', items: [...current.items, ...response.items], nextCursor: response.nextCursor, loadingMore: false }
            : current,
        )
      },
      (cause: unknown) => {
        if (requestIdRef.current !== requestId) return
        const message = cause instanceof AdminApiError ? cause.message : 'Не удалось загрузить следующую страницу.'
        setState({ status: 'error', message, retry: () => void loadFirstPage() })
      },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource, action, resourceId, from, to, loadFirstPage])

  return { state, loadMore }
}

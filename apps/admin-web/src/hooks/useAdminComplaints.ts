import { useCallback, useEffect, useRef, useState } from 'react'
import { adminApi, AdminApiError } from '../api/admin-api'
import type { AdminComplaintListItem, ComplaintStatus } from '../types/admin'

export type ComplaintsState =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'ready'; items: AdminComplaintListItem[]; nextCursor: string | null; loadingMore: boolean }
  | { status: 'error'; message: string; retry: () => void }

export interface ComplaintsFilter {
  status?: ComplaintStatus
}

/**
 * ADMIN-OPS-001 / permission-matrix.md разд.2.2: модерация жалоб
 * с привязкой к scope города. Тот же discriminated-union паттерн,
 * что useAdminPublications.
 */
export function useAdminComplaints(filter: ComplaintsFilter = {}): {
  state: ComplaintsState
  loadMore: () => void
  applyResolved: (updated: { id: string; status: ComplaintStatus; resolutionReason?: string | null; resolvedAt?: string | null }) => void
} {
  const [state, setState] = useState<ComplaintsState>({ status: 'loading' })
  const nextCursorRef = useRef<string | null>(null)
  const requestIdRef = useRef(0)
  const { status } = filter

  const loadFirstPage = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setState({ status: 'loading' })
    try {
      const response = await adminApi.listComplaints({ status, limit: 20 })
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
      const message = cause instanceof AdminApiError ? cause.message : 'Не удалось загрузить список жалоб.'
      setState({ status: 'error', message, retry: () => void loadFirstPage() })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  useEffect(() => {
    void loadFirstPage()
  }, [loadFirstPage])

  const loadMore = useCallback(() => {
    const cursor = nextCursorRef.current
    if (!cursor) return
    const requestId = requestIdRef.current
    setState((current) => (current.status === 'ready' ? { ...current, loadingMore: true } : current))
    void adminApi.listComplaints({ status, cursor, limit: 20 }).then(
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
  }, [status, loadFirstPage])

  const applyResolved = useCallback(
    (updated: { id: string; status: ComplaintStatus; resolutionReason?: string | null; resolvedAt?: string | null }) => {
      setState((current) =>
        current.status === 'ready'
          ? {
              ...current,
              items: current.items.map((item) =>
                item.id === updated.id
                  ? {
                      ...item,
                      status: updated.status,
                      resolvedAt: updated.resolvedAt ?? new Date().toISOString(),
                      resolutionReason: updated.resolutionReason ?? item.resolutionReason,
                    }
                  : item,
              ),
            }
          : current,
      )
    },
    [],
  )

  return { state, loadMore, applyResolved }
}

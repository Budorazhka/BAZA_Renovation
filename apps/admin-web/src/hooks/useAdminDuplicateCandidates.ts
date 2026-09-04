import { useCallback, useEffect, useRef, useState } from 'react'
import { adminApi, AdminApiError } from '../api/admin-api'
import type { AdminDuplicateCandidateListItem, DuplicateCandidateStatus } from '../types/admin'

export type DuplicateCandidatesState =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'ready'; items: AdminDuplicateCandidateListItem[]; nextCursor: string | null; loadingMore: boolean }
  | { status: 'error'; message: string; retry: () => void }

export interface DuplicateCandidatesFilter {
  status?: DuplicateCandidateStatus
}

/**
 * DEDUPE-001 / master plan разд.2.3: Admin review queue для дубликатов объявлений.
 * Тот же discriminated-union паттерн, что useAdminPublications.
 */
export function useAdminDuplicateCandidates(filter: DuplicateCandidatesFilter = {}): {
  state: DuplicateCandidatesState
  loadMore: () => void
  applyConfirmed: (updated: { id: string; status: DuplicateCandidateStatus; confirmReason?: string | null; confirmedAt?: string | null }) => void
} {
  const [state, setState] = useState<DuplicateCandidatesState>({ status: 'loading' })
  const nextCursorRef = useRef<string | null>(null)
  const requestIdRef = useRef(0)
  const { status } = filter

  const loadFirstPage = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setState({ status: 'loading' })
    try {
      const response = await adminApi.listDuplicateCandidates({ status, limit: 20 })
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
      const message = cause instanceof AdminApiError ? cause.message : 'Не удалось загрузить очередь дубликатов.'
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
    void adminApi.listDuplicateCandidates({ status, cursor, limit: 20 }).then(
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

  const applyConfirmed = useCallback(
    (updated: { id: string; status: DuplicateCandidateStatus; confirmReason?: string | null; confirmedAt?: string | null }) => {
      setState((current) =>
        current.status === 'ready'
          ? {
              ...current,
              items: current.items.map((item) =>
                item.id === updated.id
                  ? {
                      ...item,
                      status: updated.status,
                      confirmedAt: updated.confirmedAt ?? new Date().toISOString(),
                      confirmReason: updated.confirmReason ?? item.confirmReason,
                    }
                  : item,
              ),
            }
          : current,
      )
    },
    [],
  )

  return { state, loadMore, applyConfirmed }
}

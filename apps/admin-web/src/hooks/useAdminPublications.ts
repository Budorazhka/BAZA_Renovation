import { useCallback, useEffect, useRef, useState } from 'react'
import { adminApi, AdminApiError } from '../api/admin-api'
import type { AdminPublicationListItem, PublicationSourceType } from '../types/admin'

export type PublicationsState =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'ready'; items: AdminPublicationListItem[]; nextCursor: string | null; loadingMore: boolean }
  | { status: 'error'; message: string; retry: () => void }

export interface PublicationsFilter {
  sourceType?: PublicationSourceType
  city?: string
}

/**
 * Тот же discriminated-union паттерн, что useCatalogue (marketplace-web) —
 * 'empty' (успешный fetch, 0 items) отдельно от 'error' (запрос не
 * удался). После unpublish UI должен СИНХРОНИЗИРОВАТЬСЯ с сервером, не
 * "притвориться" — applyUnpublished обновляет локальный item из ответа
 * реального unpublish-запроса (status/unpublishReason), не удаляет его
 * оптимистично из списка до подтверждения сервера.
 */
export function useAdminPublications(filter: PublicationsFilter): {
  state: PublicationsState
  loadMore: () => void
  applyUnpublished: (updated: { id: string; status: string; unpublishReason: string | null }) => void
} {
  const [state, setState] = useState<PublicationsState>({ status: 'loading' })
  const nextCursorRef = useRef<string | null>(null)
  const requestIdRef = useRef(0)
  const { sourceType, city } = filter

  const loadFirstPage = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setState({ status: 'loading' })
    try {
      const response = await adminApi.listPublications({ sourceType, city: city || undefined, limit: 20 })
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
      const message = cause instanceof AdminApiError ? cause.message : 'Не удалось загрузить список публикаций.'
      setState({ status: 'error', message, retry: () => void loadFirstPage() })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceType, city])

  useEffect(() => {
    void loadFirstPage()
  }, [loadFirstPage])

  const loadMore = useCallback(() => {
    const cursor = nextCursorRef.current
    if (!cursor) return
    const requestId = requestIdRef.current
    setState((current) => (current.status === 'ready' ? { ...current, loadingMore: true } : current))
    void adminApi.listPublications({ sourceType, city: city || undefined, cursor, limit: 20 }).then(
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
  }, [sourceType, city, loadFirstPage])

  const applyUnpublished = useCallback(
    (updated: { id: string; status: string; unpublishReason: string | null }) => {
      setState((current) =>
        current.status === 'ready'
          ? {
              ...current,
              items: current.items.map((item) =>
                item.id === updated.id ? { ...item, status: updated.status, unpublishReason: updated.unpublishReason } : item,
              ),
            }
          : current,
      )
    },
    [],
  )

  return { state, loadMore, applyUnpublished }
}

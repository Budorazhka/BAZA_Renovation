import { useCallback, useEffect, useState } from 'react'
import { MarketplaceApiError, marketplaceApi } from '../api/marketplace-api'
import type { PublicDevelopmentCard } from '../types/marketplace'

export type DetailState =
  | { status: 'loading' }
  | { status: 'ready'; item: PublicDevelopmentCard }
  | { status: 'not-found' }
  | { status: 'error'; message: string; statusCode?: number; retry: () => void }

export function useDevelopmentDetail(slug: string | undefined): DetailState {
  const [state, setState] = useState<DetailState>({ status: 'loading' })

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!slug) return
    setState({ status: 'loading' })
    try {
      const item = await marketplaceApi.getDevelopment(slug, { signal })
      if (signal?.aborted) return
      setState({ status: 'ready', item })
    } catch (cause) {
      if (signal?.aborted || (cause instanceof DOMException && cause.name === 'AbortError')) {
        return
      }
      if (cause instanceof MarketplaceApiError && cause.status === 404) {
        setState({ status: 'not-found' })
        return
      }
      const statusCode = cause instanceof MarketplaceApiError ? cause.status : undefined
      const message =
        cause instanceof Error
          ? cause.message
          : 'Не удалось загрузить жилой комплекс. Пожалуйста, попробуйте снова.'
      setState({ status: 'error', message, statusCode, retry: () => void load() })
    }
  }, [slug])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)

    return () => {
      controller.abort()
    }
  }, [load])

  return state
}

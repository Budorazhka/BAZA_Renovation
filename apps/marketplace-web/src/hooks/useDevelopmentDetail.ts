import { useCallback, useEffect, useRef, useState } from 'react'
import { MarketplaceApiError, marketplaceApi } from '../api/marketplace-api'
import { isAbortError } from '../lib/async'
import { useI18n } from '../i18n'
import type { PublicDevelopmentCard } from '../types/marketplace'

export type DetailState =
  | { status: 'loading' }
  | { status: 'ready'; item: PublicDevelopmentCard }
  | { status: 'not-found' }
  | { status: 'error'; message: string; statusCode?: number; retry: () => void }

export function useDevelopmentDetail(slug: string | undefined): DetailState {
  const { t } = useI18n()
  const [state, setState] = useState<DetailState>({ status: 'loading' })
  const activeControllerRef = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    if (!slug) return
    activeControllerRef.current?.abort()
    const controller = new AbortController()
    activeControllerRef.current = controller
    setState({ status: 'loading' })
    try {
      const item = await marketplaceApi.getDevelopment(slug, { signal: controller.signal })
      if (controller.signal.aborted) return
      setState({ status: 'ready', item })
    } catch (cause) {
      if (controller.signal.aborted || isAbortError(cause)) {
        return
      }
      if (cause instanceof MarketplaceApiError && cause.status === 404) {
        setState({ status: 'not-found' })
        return
      }
      const statusCode = cause instanceof MarketplaceApiError ? cause.status : undefined
      const message = cause instanceof Error ? cause.message : t('errors.developmentDetail')
      setState({ status: 'error', message, statusCode, retry: () => void load() })
    } finally {
      if (activeControllerRef.current === controller) activeControllerRef.current = null
    }
  }, [slug, t])

  useEffect(() => {
    void load()

    return () => {
      activeControllerRef.current?.abort()
    }
  }, [load])

  return state
}

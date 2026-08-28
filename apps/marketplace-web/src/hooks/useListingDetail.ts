import { useEffect, useState } from 'react'
import { MarketplaceApiError, marketplaceApi } from '../api/marketplace-api'
import type { PublicListingCard } from '../types/marketplace'

export type ListingDetailState =
  | { status: 'loading' }
  | { status: 'ready'; item: PublicListingCard }
  | { status: 'not-found' }
  | { status: 'error'; message: string; retry: () => void }

export function useListingDetail(slug: string | undefined): ListingDetailState {
  const [state, setState] = useState<ListingDetailState>({ status: 'loading' })

  useEffect(() => {
    if (!slug) return
    let active = true

    async function load() {
      setState({ status: 'loading' })
      try {
        const item = await marketplaceApi.getListing(slug!)
        if (!active) return
        setState({ status: 'ready', item })
      } catch (cause) {
        if (!active) return
        if (cause instanceof MarketplaceApiError && cause.status === 404) {
          setState({ status: 'not-found' })
          return
        }
        const message = cause instanceof Error ? cause.message : 'Не удалось загрузить объект.'
        setState({ status: 'error', message, retry: () => void load() })
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [slug])

  return state
}

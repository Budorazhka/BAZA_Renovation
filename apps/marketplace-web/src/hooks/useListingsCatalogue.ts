import { useCallback, useEffect, useRef, useState } from 'react'
import { marketplaceApi } from '../api/marketplace-api'
import type { BoundingBox, ListingDealType, ListingPropertyType, PublicListingCard } from '../types/marketplace'

export type ListingsCatalogueState =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'ready'; items: PublicListingCard[]; nextCursor: string | null; loadingMore: boolean }
  | { status: 'error'; message: string; retry: () => void }

export interface UseListingsCatalogueQuery {
  city?: string
  dealType?: ListingDealType
  propertyType?: ListingPropertyType
  commercialSubtype?: string
  bbox?: BoundingBox
}

export function useListingsCatalogue(query: UseListingsCatalogueQuery = {}): {
  state: ListingsCatalogueState
  loadMore: () => void
} {
  const [state, setState] = useState<ListingsCatalogueState>({ status: 'loading' })
  const nextCursorRef = useRef<string | null>(null)
  const requestIdRef = useRef(0)
  const { city, dealType, propertyType, commercialSubtype, bbox } = query
  const bboxKey = bbox ? `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}` : ''

  const loadFirstPage = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setState({ status: 'loading' })
    try {
      const response = await marketplaceApi.listListings({
        city: city || undefined,
        dealType,
        propertyType,
        commercialSubtype,
        bbox,
        limit: 12,
      })
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
      const message = cause instanceof Error ? cause.message : 'Не удалось загрузить каталог листингов.'
      setState({ status: 'error', message, retry: () => void loadFirstPage() })
    }
  }, [city, dealType, propertyType, commercialSubtype, bboxKey])

  useEffect(() => {
    void loadFirstPage()
  }, [loadFirstPage])

  const loadMore = useCallback(() => {
    const cursor = nextCursorRef.current
    if (!cursor) return
    const requestId = requestIdRef.current
    setState((current) => (current.status === 'ready' ? { ...current, loadingMore: true } : current))
    void marketplaceApi
      .listListings({
        city: city || undefined,
        dealType,
        propertyType,
        commercialSubtype,
        bbox,
        cursor,
        limit: 12,
      })
      .then(
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
          const message = cause instanceof Error ? cause.message : 'Не удалось загрузить следующую страницу.'
          setState({ status: 'error', message, retry: () => void loadFirstPage() })
        },
      )
  }, [city, dealType, propertyType, commercialSubtype, bboxKey, loadFirstPage])

  return { state, loadMore }
}

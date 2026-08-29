import { useCallback, useEffect, useRef, useState } from 'react'
import { MarketplaceApiError, marketplaceApi } from '../api/marketplace-api'
import type { BoundingBox, ListingDealType, ListingPropertyType, PublicListingCard } from '../types/marketplace'

export type ListingsCatalogueState =
  | { status: 'loading' }
  | { status: 'empty' }
  | {
      status: 'ready'
      items: PublicListingCard[]
      nextCursor: string | null
      loadingMore: boolean
      loadMoreError: string | null
    }
  | { status: 'error'; message: string; statusCode?: number; retry: () => void }

export interface UseListingsCatalogueQuery {
  city?: string
  dealType?: ListingDealType
  propertyType?: ListingPropertyType
  commercialSubtype?: string
  bbox?: BoundingBox
  limit?: number
}

export function useListingsCatalogue(query: UseListingsCatalogueQuery = {}): {
  state: ListingsCatalogueState
  loadMore: () => void
  retryLoadMore: () => void
} {
  const [state, setState] = useState<ListingsCatalogueState>({ status: 'loading' })
  const nextCursorRef = useRef<string | null>(null)
  const requestIdRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  const { city, dealType, propertyType, commercialSubtype, bbox, limit = 12 } = query
  const bboxKey = bbox ? `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}` : ''

  const loadFirstPage = useCallback(async () => {
    const requestId = ++requestIdRef.current
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const controller = new AbortController()
    abortControllerRef.current = controller

    setState({ status: 'loading' })
    nextCursorRef.current = null

    try {
      const response = await marketplaceApi.listListings(
        {
          city: city?.trim() || undefined,
          dealType,
          propertyType,
          commercialSubtype,
          bbox,
          limit,
        },
        { signal: controller.signal },
      )

      if (requestIdRef.current !== requestId || controller.signal.aborted) return

      nextCursorRef.current = response.nextCursor
      if (response.items.length === 0) {
        setState({ status: 'empty' })
      } else {
        setState({
          status: 'ready',
          items: response.items,
          nextCursor: response.nextCursor,
          loadingMore: false,
          loadMoreError: null,
        })
      }
    } catch (cause) {
      if (
        requestIdRef.current !== requestId ||
        controller.signal.aborted ||
        (cause instanceof DOMException && cause.name === 'AbortError')
      ) {
        return
      }
      nextCursorRef.current = null
      const statusCode = cause instanceof MarketplaceApiError ? cause.status : undefined
      const message =
        cause instanceof Error
          ? cause.message
          : 'Не удалось загрузить каталог объявлений. Проверьте соединение и попробуйте снова.'
      setState({ status: 'error', message, statusCode, retry: () => void loadFirstPage() })
    }
  }, [city, dealType, propertyType, commercialSubtype, bboxKey, limit])

  useEffect(() => {
    void loadFirstPage()
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [loadFirstPage])

  const executeLoadMore = useCallback(() => {
    const cursor = nextCursorRef.current
    if (!cursor) return
    const requestId = requestIdRef.current

    setState((current) => (current.status === 'ready' ? { ...current, loadingMore: true, loadMoreError: null } : current))

    void marketplaceApi
      .listListings({
        city: city?.trim() || undefined,
        dealType,
        propertyType,
        commercialSubtype,
        bbox,
        cursor,
        limit,
      })
      .then(
        (response) => {
          if (requestIdRef.current !== requestId) return
          nextCursorRef.current = response.nextCursor

          setState((current) => {
            if (current.status !== 'ready') return current
            const existingKeys = new Set(
              current.items.map((i) => i.slug || `${i.dealType}-${i.price?.amountMinorUnits}-${i.location?.address}`),
            )
            const newItems = response.items.filter(
              (i) => !existingKeys.has(i.slug || `${i.dealType}-${i.price?.amountMinorUnits}-${i.location?.address}`),
            )
            return {
              status: 'ready',
              items: [...current.items, ...newItems],
              nextCursor: response.nextCursor,
              loadingMore: false,
              loadMoreError: null,
            }
          })
        },
        (cause: unknown) => {
          if (requestIdRef.current !== requestId) return
          const message =
            cause instanceof Error ? cause.message : 'Не удалось загрузить следующую страницу. Попробуйте ещё раз.'
          setState((current) =>
            current.status === 'ready'
              ? {
                  ...current,
                  loadingMore: false,
                  loadMoreError: message,
                }
              : current,
          )
        },
      )
  }, [city, dealType, propertyType, commercialSubtype, bboxKey, limit])

  return { state, loadMore: executeLoadMore, retryLoadMore: executeLoadMore }
}

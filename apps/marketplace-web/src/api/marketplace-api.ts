import type {
  CatalogueQuery,
  PublicDevelopmentCard,
  PublicDevelopmentList,
  ListingCatalogueQuery,
  PublicListingCard,
  PublicListingList,
} from '../types/marketplace'

type Fetcher = typeof fetch

export class MarketplaceApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'MarketplaceApiError'
  }
}

function normalizedBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

function toErrorMessage(status: number): string {
  if (status === 404) return 'Объект не найден или больше не опубликован.'
  return 'Не удалось загрузить данные. Попробуйте ещё раз.'
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new MarketplaceApiError(toErrorMessage(response.status), response.status)
  }
  return response.json() as Promise<T>
}

export function createMarketplaceApi({ baseUrl, fetcher = fetch }: { baseUrl: string; fetcher?: Fetcher }) {
  const apiBaseUrl = normalizedBaseUrl(baseUrl)

  return {
    async listDevelopments(query: CatalogueQuery = {}): Promise<PublicDevelopmentList> {
      const params = new URLSearchParams()
      if (query.city?.trim()) params.set('city', query.city.trim())
      if (query.bbox) {
        const { minLng, minLat, maxLng, maxLat } = query.bbox
        params.set('bbox', `${minLng},${minLat},${maxLng},${maxLat}`)
      }
      if (query.cursor) params.set('cursor', query.cursor)
      if (query.limit) params.set('limit', String(query.limit))
      const suffix = params.size > 0 ? `?${params.toString()}` : ''
      const response = await fetcher(`${apiBaseUrl}/public/developments${suffix}`, {
        headers: { Accept: 'application/json' },
      })
      return parseResponse<PublicDevelopmentList>(response)
    },

    async getDevelopment(slug: string): Promise<PublicDevelopmentCard> {
      const response = await fetcher(`${apiBaseUrl}/public/developments/${encodeURIComponent(slug)}`, {
        headers: { Accept: 'application/json' },
      })
      return parseResponse<PublicDevelopmentCard>(response)
    },

    async listListings(query: ListingCatalogueQuery = {}): Promise<PublicListingList> {
      const params = new URLSearchParams()
      if (query.city?.trim()) params.set('city', query.city.trim())
      if (query.dealType) params.set('dealType', query.dealType)
      if (query.propertyType) params.set('propertyType', query.propertyType)
      if (query.commercialSubtype) params.set('commercialSubtype', query.commercialSubtype)
      if (query.bbox) {
        const { minLng, minLat, maxLng, maxLat } = query.bbox
        params.set('bbox', `${minLng},${minLat},${maxLng},${maxLat}`)
      }
      if (query.cursor) params.set('cursor', query.cursor)
      if (query.limit) params.set('limit', String(query.limit))
      const suffix = params.size > 0 ? `?${params.toString()}` : ''
      const response = await fetcher(`${apiBaseUrl}/public/listings${suffix}`, {
        headers: { Accept: 'application/json' },
      })
      return parseResponse<PublicListingList>(response)
    },

    async getListing(slug: string): Promise<PublicListingCard> {
      const response = await fetcher(`${apiBaseUrl}/public/listings/${encodeURIComponent(slug)}`, {
        headers: { Accept: 'application/json' },
      })
      return parseResponse<PublicListingCard>(response)
    },
  }
}

export const marketplaceApi = createMarketplaceApi({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? '/api/v1',
})

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
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'MarketplaceApiError'
  }
}

export interface RevealContactPayload {
  requesterName?: string
  requesterPhone: string
  utm?: Record<string, string>
}

export interface RevealContactResponse {
  phone: string
  whatsapp?: string | null
  telegram?: string | null
  leadId: string
}

function normalizedBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

function toErrorMessage(status: number): string {
  if (status === 404) return 'Объект не найден или больше не опубликован.'
  if (status === 429) return 'Слишком много запросов. Пожалуйста, повторите попытку позже.'
  return 'Не удалось загрузить данные. Попробуйте ещё раз.'
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let customMessage: string | undefined
    let errorCode: string | undefined
    try {
      const data = await response.json()
      if (data?.message) {
        customMessage = Array.isArray(data.message) ? data.message.join(', ') : data.message
      } else if (data?.error?.message) {
        customMessage = data.error.message
      }
      if (data?.code) errorCode = data.code
      if (data?.error?.code) errorCode = data.error.code
    } catch {
      // json parse error, ignore
    }

    if (response.status === 404) {
      throw new MarketplaceApiError(
        customMessage || 'Объект не найден или больше не опубликован.',
        404,
        errorCode,
      )
    }
    if (response.status === 429) {
      throw new MarketplaceApiError(
        'Слишком много запросов. Пожалуйста, повторите попытку позже.',
        429,
        errorCode,
      )
    }
    if (response.status === 400 || response.status === 422) {
      throw new MarketplaceApiError(
        customMessage || 'Пожалуйста, проверьте введённый номер телефона.',
        response.status,
        errorCode,
      )
    }

    throw new MarketplaceApiError(customMessage || toErrorMessage(response.status), response.status, errorCode)
  }
  return response.json() as Promise<T>
}

export interface RequestOptions {
  signal?: AbortSignal
}

export function createMarketplaceApi({ baseUrl, fetcher = fetch }: { baseUrl: string; fetcher?: Fetcher }) {
  const apiBaseUrl = normalizedBaseUrl(baseUrl)

  return {
    async listDevelopments(query: CatalogueQuery = {}, options?: RequestOptions): Promise<PublicDevelopmentList> {
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
        signal: options?.signal,
      })
      return parseResponse<PublicDevelopmentList>(response)
    },

    async getDevelopment(slug: string, options?: RequestOptions): Promise<PublicDevelopmentCard> {
      const response = await fetcher(`${apiBaseUrl}/public/developments/${encodeURIComponent(slug)}`, {
        headers: { Accept: 'application/json' },
        signal: options?.signal,
      })
      return parseResponse<PublicDevelopmentCard>(response)
    },

    async revealDevelopmentContact(
      slug: string,
      payload: RevealContactPayload,
      options?: RequestOptions,
    ): Promise<RevealContactResponse> {
      const response = await fetcher(
        `${apiBaseUrl}/public/developments/${encodeURIComponent(slug)}/reveal-contact`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(payload),
          signal: options?.signal,
        },
      )
      return parseResponse<RevealContactResponse>(response)
    },

    async listListings(query: ListingCatalogueQuery = {}, options?: RequestOptions): Promise<PublicListingList> {
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
        signal: options?.signal,
      })
      return parseResponse<PublicListingList>(response)
    },

    async getListing(slug: string, options?: RequestOptions): Promise<PublicListingCard> {
      const response = await fetcher(`${apiBaseUrl}/public/listings/${encodeURIComponent(slug)}`, {
        headers: { Accept: 'application/json' },
        signal: options?.signal,
      })
      return parseResponse<PublicListingCard>(response)
    },

    async revealListingContact(
      slug: string,
      payload: RevealContactPayload,
      options?: RequestOptions,
    ): Promise<RevealContactResponse> {
      const response = await fetcher(
        `${apiBaseUrl}/public/listings/${encodeURIComponent(slug)}/reveal-contact`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(payload),
          signal: options?.signal,
        },
      )
      return parseResponse<RevealContactResponse>(response)
    },
  }
}

export const marketplaceApi = createMarketplaceApi({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? '/api/v1',
})

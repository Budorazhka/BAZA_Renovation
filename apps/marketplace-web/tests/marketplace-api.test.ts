import { describe, expect, it, vi } from 'vitest'
import { MarketplaceApiError, createMarketplaceApi } from '../src/api/marketplace-api'

describe('Marketplace API client', () => {
  it('passes only supported public catalogue filters and returns the API payload', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ items: [{ slug: 'seaside', name: 'Seaside' }], nextCursor: 'next-page', total: 42 }),
        { status: 200 },
      ),
    )
    const api = createMarketplaceApi({ baseUrl: 'https://api.example.test/api/v1', fetcher })

    await expect(api.listDevelopments({ city: 'Batumi', cursor: 'cursor-1', limit: 12, sort: 'newest' })).resolves.toEqual({
      items: [{ slug: 'seaside', name: 'Seaside' }],
      nextCursor: 'next-page',
      total: 42,
    })
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/public/developments?city=Batumi&cursor=cursor-1&limit=12&sort=newest',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    )
  })

  it('passes listing filters and returns listings from /public/listings', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [{ slug: 'batumi-flat-1', dealType: 'sale', price: { amountMinorUnits: 5000000, currency: 'USD' } }],
          nextCursor: null,
          total: 1,
        }),
        { status: 200 },
      ),
    )
    const api = createMarketplaceApi({ baseUrl: 'https://api.example.test/api/v1', fetcher })

    await expect(
      api.listListings({ city: 'Batumi', dealType: 'sale', propertyType: 'apartment', limit: 12, sort: 'price_asc' }),
    ).resolves.toEqual({
      items: [{ slug: 'batumi-flat-1', dealType: 'sale', price: { amountMinorUnits: 5000000, currency: 'USD' } }],
      nextCursor: null,
      total: 1,
    })

    expect(fetcher).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/public/listings?city=Batumi&dealType=sale&propertyType=apartment&limit=12&sort=price_asc',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    )
  })

  it('fetches single listing by slug via /public/listings/:slug', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ slug: 'batumi-flat-1', dealType: 'sale' }),
        { status: 200 },
      ),
    )
    const api = createMarketplaceApi({ baseUrl: 'https://api.example.test/api/v1', fetcher })

    await expect(api.getListing('batumi-flat-1')).resolves.toEqual({
      slug: 'batumi-flat-1',
      dealType: 'sale',
    })
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/public/listings/batumi-flat-1',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    )
  })

  it('throws a human-readable API error on a failed public request', async () => {
    const api = createMarketplaceApi({
      baseUrl: 'https://api.example.test/api/v1',
      fetcher: vi.fn().mockResolvedValue(new Response('', { status: 503, statusText: 'Service Unavailable' })),
    })

    await expect(api.getDevelopment('seaside')).rejects.toEqual(
      new MarketplaceApiError('Не удалось загрузить данные. Попробуйте ещё раз.', 503),
    )
  })

  it('serializes bbox as "minLng,minLat,maxLng,maxLat" in the query string', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 }))
    const api = createMarketplaceApi({ baseUrl: 'https://api.example.test/api/v1', fetcher })

    await api.listDevelopments({ bbox: { minLng: 41, minLat: 41, maxLng: 42, maxLat: 42 } })

    expect(fetcher).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/public/developments?bbox=41%2C41%2C42%2C42',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    )
  })

  it('surfaces a 400 validation response as MarketplaceApiError, not a silently empty result', async () => {
    const api = createMarketplaceApi({
      baseUrl: 'https://api.example.test/api/v1',
      fetcher: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 'VALIDATION_FAILED', message: 'invalid bbox' } }), { status: 400 }),
      ),
    })

    const error = await api.listDevelopments({ bbox: { minLng: 200, minLat: 41, maxLng: 42, maxLat: 42 } }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(MarketplaceApiError)
    expect((error as MarketplaceApiError).status).toBe(400)
  })

  it('propagates a network failure (rejected fetcher) instead of swallowing it', async () => {
    const api = createMarketplaceApi({
      baseUrl: 'https://api.example.test/api/v1',
      fetcher: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    })

    await expect(api.listDevelopments()).rejects.toThrow('Failed to fetch')
  })
  it('calls POST /public/listings/:slug/reveal-contact with payload and returns phone + leadId', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ phone: '+995555123456', leadId: 'lead-12345' }),
        { status: 200 },
      ),
    )
    const api = createMarketplaceApi({ baseUrl: 'https://api.example.test/api/v1', fetcher })

    const result = await api.revealListingContact('batumi-flat-1', {
      requesterName: 'Иван',
      requesterPhone: '+995555987654',
      utm: { source: 'telegram' },
    })

    expect(result).toEqual({ phone: '+995555123456', leadId: 'lead-12345' })
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/public/listings/batumi-flat-1/reveal-contact',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          requesterName: 'Иван',
          requesterPhone: '+995555987654',
          utm: { source: 'telegram' },
        }),
      }),
    )
  })

  it('calls POST /public/developments/:slug/reveal-contact with payload', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ phone: '+995555000111', leadId: 'lead-dev-123' }),
        { status: 200 },
      ),
    )
    const api = createMarketplaceApi({ baseUrl: 'https://api.example.test/api/v1', fetcher })

    const result = await api.revealDevelopmentContact('zhk-batumi', {
      requesterPhone: '+995555987654',
    })

    expect(result).toEqual({ phone: '+995555000111', leadId: 'lead-dev-123' })
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/public/developments/zhk-batumi/reveal-contact',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ requesterPhone: '+995555987654' }),
      }),
    )
  })

  it('handles 429 rate limit correctly', async () => {
    const api = createMarketplaceApi({
      baseUrl: 'https://api.example.test/api/v1',
      fetcher: vi.fn().mockResolvedValue(new Response('', { status: 429 })),
    })

    await expect(api.revealListingContact('batumi-flat-1', { requesterPhone: '+995555123456' })).rejects.toEqual(
      new MarketplaceApiError('Слишком много запросов. Пожалуйста, повторите попытку позже.', 429),
    )
  })

})

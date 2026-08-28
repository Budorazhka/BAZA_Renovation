import { describe, expect, it, vi } from 'vitest'
import { MarketplaceApiError, createMarketplaceApi } from '../src/api/marketplace-api'

describe('Marketplace API client', () => {
  it('passes only supported public catalogue filters and returns the API payload', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ items: [{ slug: 'seaside', name: 'Seaside' }], nextCursor: 'next-page' }),
        { status: 200 },
      ),
    )
    const api = createMarketplaceApi({ baseUrl: 'https://api.example.test/api/v1', fetcher })

    await expect(api.listDevelopments({ city: 'Batumi', cursor: 'cursor-1', limit: 12 })).resolves.toEqual({
      items: [{ slug: 'seaside', name: 'Seaside' }],
      nextCursor: 'next-page',
    })
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/public/developments?city=Batumi&cursor=cursor-1&limit=12',
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

  // D-04A: невалидный фильтр не должен молча превращаться в пустой каталог
  // — 400 от backend-валидации остаётся видимой MarketplaceApiError, как
  // любая другая HTTP-ошибка, не глотается на уровне клиента.
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

  // Network failure (fetcher rejects, e.g. TypeError: Failed to fetch) — не
  // то же самое, что resolve с плохим статусом. parseResponse не должен
  // глушить этот путь молча.
  it('propagates a network failure (rejected fetcher) instead of swallowing it', async () => {
    const api = createMarketplaceApi({
      baseUrl: 'https://api.example.test/api/v1',
      fetcher: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    })

    await expect(api.listDevelopments()).rejects.toThrow('Failed to fetch')
  })
})

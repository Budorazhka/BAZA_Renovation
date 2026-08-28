import { describe, expect, it, vi } from 'vitest'
import { AdminApiError, createAdminApi } from '../src/api/admin-api'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('createAdminApi', () => {
  it('sends credentials:"include" on every request — session lives in an httpOnly cookie, not a token this client holds', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ isSuperAdmin: true, adminAccountId: 'a1', publicationReadScope: 'all' }))
    const api = createAdminApi({ baseUrl: 'https://api.example.test/api/v1', fetcher })

    await api.me()

    expect(fetcher).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/admin/me',
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('listPublications builds query params only for provided filters, omits empty ones', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ items: [], nextCursor: null }))
    const api = createAdminApi({ baseUrl: 'https://api.example.test/api/v1', fetcher })

    await api.listPublications({ sourceType: 'development', city: 'batumi', limit: 10 })

    const [url] = fetcher.mock.calls[0]!
    expect(url).toBe('https://api.example.test/api/v1/admin/publications?sourceType=development&city=batumi&limit=10')
  })

  it('listPublications omits query string entirely when no filters given', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ items: [], nextCursor: null }))
    const api = createAdminApi({ baseUrl: 'https://api.example.test/api/v1', fetcher })

    await api.listPublications()

    const [url] = fetcher.mock.calls[0]!
    expect(url).toBe('https://api.example.test/api/v1/admin/publications')
  })

  it('unpublish posts reason as JSON body to the correct publicationId path', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ id: 'pub1', sourceType: 'development', sourceId: 's1', status: 'unpublished', slug: null, unpublishReason: 'test reason' }))
    const api = createAdminApi({ baseUrl: 'https://api.example.test/api/v1', fetcher })

    await api.unpublish('pub1', 'test reason')

    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe('https://api.example.test/api/v1/admin/publications/pub1/unpublish')
    expect(init).toMatchObject({ method: 'POST' })
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ reason: 'test reason' })
  })

  it('non-2xx response is parsed into AdminApiError carrying the server error code, not swallowed as generic', async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({ error: { code: 'ADMIN_SCOPE_INSUFFICIENT', message: 'Недостаточно прав', requestId: 'req-1' } }, 403),
    )
    const api = createAdminApi({ baseUrl: 'https://api.example.test/api/v1', fetcher })

    await expect(api.unpublish('pub1', 'test reason')).rejects.toMatchObject({
      status: 403,
      code: 'ADMIN_SCOPE_INSUFFICIENT',
      message: 'Недостаточно прав',
    })
  })

  it('non-JSON error body still produces a usable AdminApiError, does not crash the caller', async () => {
    const fetcher = vi.fn(async () => new Response('<html>502 Bad Gateway</html>', { status: 502 }))
    const api = createAdminApi({ baseUrl: 'https://api.example.test/api/v1', fetcher })

    await expect(api.me()).rejects.toBeInstanceOf(AdminApiError)
  })

  it('grantPermission omits scopeValue when the caller does not pass one (global scope)', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ granted: true }))
    const api = createAdminApi({ baseUrl: 'https://api.example.test/api/v1', fetcher })

    await api.grantPermission('acc1', { resource: 'development', action: 'read', scope: 'global' })

    const [, init] = fetcher.mock.calls[0]!
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ resource: 'development', action: 'read', scope: 'global', scopeValue: undefined })
  })
})

/** @vitest-environment jsdom */

import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Тот же принцип, что no-mock-data.test.tsx для publications: доказывает,
 * что useAdminAuditEvents получает данные ИСКЛЮЧИТЕЛЬНО через реальный
 * adminApi/fetch (GET /admin/audit-events), нет скрытого mock/localStorage
 * fallback. strictFetcher бросает на любой URL вне настроенного baseUrl.
 */
const { strictFetcher } = vi.hoisted(() => ({
  strictFetcher: vi.fn(async (url: string | URL | Request) => {
    const href = typeof url === 'string' ? url : url.toString()
    if (!href.startsWith('https://api.example.test/api/v1/admin/audit-events')) {
      throw new Error(`Unexpected fetch outside the real admin API client: ${href}`)
    }
    return new Response(
      JSON.stringify({
        items: [
          {
            id: 'evt1',
            action: 'publication.unpublish',
            resource: 'development',
            resourceId: 'src1',
            actor: { type: 'admin_account', id: 'admin1' },
            createdAt: '2026-08-20T10:00:00.000Z',
            correlationId: 'corr-1',
            reason: 'Нарушение правил',
            summary: 'Публикация src1 снята с публикации',
            before: null,
            after: null,
          },
        ],
        nextCursor: null,
      }),
      { status: 200 },
    )
  }),
}))

vi.mock('../src/api/admin-api', async () => {
  const actual = await vi.importActual<typeof import('../src/api/admin-api')>('../src/api/admin-api')
  return { ...actual, adminApi: actual.createAdminApi({ baseUrl: 'https://api.example.test/api/v1', fetcher: strictFetcher }) }
})

afterEach(() => {
  strictFetcher.mockClear()
})

describe('no mock/localStorage data source in the admin audit trail flow', () => {
  it('useAdminAuditEvents данные приходят исключительно через реальный fetcher', async () => {
    const { useAdminAuditEvents } = await import('../src/hooks/useAdminAuditEvents')

    const { result } = renderHook(() => useAdminAuditEvents({}))

    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    expect(strictFetcher).toHaveBeenCalledTimes(1)
    const state = result.current.state
    if (state.status !== 'ready') throw new Error('expected ready')
    expect(state.items[0]!.action).toBe('publication.unpublish')
  })

  it('фильтры (resource/action/resourceId/from/to) сериализуются в query string реального запроса', async () => {
    const { useAdminAuditEvents } = await import('../src/hooks/useAdminAuditEvents')

    const { result } = renderHook(() =>
      useAdminAuditEvents({
        resource: 'development',
        action: 'publication.unpublish',
        resourceId: 'src1',
        from: '2026-08-01T00:00:00.000Z',
        to: '2026-08-31T00:00:00.000Z',
      }),
    )

    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    const [calledUrl] = strictFetcher.mock.calls[0] as [string]
    expect(calledUrl).toContain('resource=development')
    expect(calledUrl).toContain('action=publication.unpublish')
    expect(calledUrl).toContain('resourceId=src1')
    expect(calledUrl).toContain('from=2026-08-01')
    expect(calledUrl).toContain('to=2026-08-31')
  })

  it('loadMore добавляет cursor и накапливает items без потери первой страницы', async () => {
    strictFetcher.mockImplementationOnce(async () =>
      new Response(
        JSON.stringify({
          items: [{ id: 'evt1', action: 'a', resource: 'development', resourceId: 'r1', actor: { type: 'system', id: null }, createdAt: '2026-08-20T10:00:00.000Z', correlationId: 'c1', reason: null, summary: 's1', before: null, after: null }],
          nextCursor: 'evt1',
        }),
        { status: 200 },
      ),
    )
    strictFetcher.mockImplementationOnce(async (url: string | URL | Request) => {
      const href = typeof url === 'string' ? url : url.toString()
      expect(href).toContain('cursor=evt1')
      return new Response(
        JSON.stringify({
          items: [{ id: 'evt2', action: 'a', resource: 'development', resourceId: 'r2', actor: { type: 'system', id: null }, createdAt: '2026-08-19T10:00:00.000Z', correlationId: 'c2', reason: null, summary: 's2', before: null, after: null }],
          nextCursor: null,
        }),
        { status: 200 },
      )
    })

    const { useAdminAuditEvents } = await import('../src/hooks/useAdminAuditEvents')
    const { result } = renderHook(() => useAdminAuditEvents({}))

    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    result.current.loadMore()

    await waitFor(() => {
      const state = result.current.state
      if (state.status !== 'ready') throw new Error('expected ready')
      expect(state.items).toHaveLength(2)
    })
  })
})

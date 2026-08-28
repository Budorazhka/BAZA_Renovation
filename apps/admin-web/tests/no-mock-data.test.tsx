/** @vitest-environment jsdom */

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Тот же принцип, что apps/marketplace-web/tests/no-mock-data.test.tsx:
 * доказывает, что useAdminPublications/useUnpublishAction получают и
 * изменяют данные ИСКЛЮЧИТЕЛЬНО через реальный adminApi (fetch на
 * /admin/publications...), нет скрытого mock/localStorage/fallback-массива
 * пути. strictFetcher бросает на любой URL за пределами настроенного
 * baseUrl — если бы хук вернул/применил данные без единого вызова
 * fetcher'а, это осталось бы незамеченным без явной проверки здесь.
 */
const { strictFetcher } = vi.hoisted(() => ({
  strictFetcher: vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const href = typeof url === 'string' ? url : url.toString()
    if (!href.startsWith('https://api.example.test/api/v1/admin/publications')) {
      throw new Error(`Unexpected fetch outside the real admin API client: ${href}`)
    }
    if (href.endsWith('/unpublish')) {
      const body = init?.body ? JSON.parse(init.body as string) : {}
      return new Response(
        JSON.stringify({ id: 'pub1', sourceType: 'development', sourceId: 's1', status: 'unpublished', slug: 'slug-1', unpublishReason: body.reason }),
        { status: 200 },
      )
    }
    return new Response(
      JSON.stringify({
        items: [{ id: 'pub1', sourceType: 'development', sourceId: 's1', organizationId: null, status: 'published', slug: 'slug-1', publishedAt: null, unpublishedAt: null, unpublishReason: null, city: 'batumi' }],
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
  cleanup()
  strictFetcher.mockClear()
})

describe('no mock/localStorage/fake-auth data source in the admin publications flow', () => {
  it('useAdminPublications данные приходят исключительно через реальный fetcher, не bypass-путь', async () => {
    const { useAdminPublications } = await import('../src/hooks/useAdminPublications')

    const { result } = renderHook(() => useAdminPublications({}))

    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    expect(strictFetcher).toHaveBeenCalledTimes(1)
    const state = result.current.state
    if (state.status !== 'ready') throw new Error('expected ready')
    expect(state.items[0]!.city).toBe('batumi')
  })

  it('useUnpublishAction.submit реально вызывает POST /unpublish на сервере, не имитирует успех локально', async () => {
    const { useUnpublishAction } = await import('../src/hooks/useUnpublishAction')
    const onSuccess = vi.fn()
    const { result } = renderHook(() => useUnpublishAction(onSuccess))

    act(() => {
      result.current.open({
        id: 'pub1',
        sourceType: 'development',
        sourceId: 's1',
        organizationId: null,
        status: 'published',
        slug: 'slug-1',
        publishedAt: null,
        unpublishedAt: null,
        unpublishReason: null,
        city: 'batumi',
      })
    })
    act(() => {
      result.current.setReason('Нарушение правил размещения объявлений')
    })

    await act(async () => {
      await result.current.submit()
    })

    expect(strictFetcher).toHaveBeenCalledWith('https://api.example.test/api/v1/admin/publications/pub1/unpublish', expect.objectContaining({ method: 'POST' }))
    expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ status: 'unpublished' }))
  })

  it('submit без достаточной длины reason НЕ вызывает fetch вообще (клиентский гейт перед серверным)', async () => {
    const { useUnpublishAction } = await import('../src/hooks/useUnpublishAction')
    const { result } = renderHook(() => useUnpublishAction(vi.fn()))

    act(() => {
      result.current.open({
        id: 'pub1',
        sourceType: 'development',
        sourceId: 's1',
        organizationId: null,
        status: 'published',
        slug: 'slug-1',
        publishedAt: null,
        unpublishedAt: null,
        unpublishReason: null,
        city: 'batumi',
      })
    })
    act(() => {
      result.current.setReason('коротко')
    })

    await act(async () => {
      await result.current.submit()
    })

    expect(strictFetcher).not.toHaveBeenCalled()
    expect(result.current.canSubmit).toBe(false)
  })
})

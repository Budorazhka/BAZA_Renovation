/** @vitest-environment jsdom */

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * D-04A: изолированный unit-тест хука useCatalogue — тестируемые discriminated
 * union состояния (loading/empty/ready/error) без визуальной Figma-зависимости
 * (карта/каталог JSX остаются question/blocked, хук — чистый data-layer).
 */

const listDevelopmentsMock = vi.fn()

vi.mock('../src/api/marketplace-api', async () => {
  // importActual сохраняет реальный MarketplaceApiError (нужен тесту "400
  // validation failure" ниже) — мокается только сам marketplaceApi объект.
  const actual = await vi.importActual<typeof import('../src/api/marketplace-api')>('../src/api/marketplace-api')
  return {
    ...actual,
    marketplaceApi: { listDevelopments: (...args: unknown[]) => listDevelopmentsMock(...args) },
  }
})

describe('useCatalogue', () => {
  beforeEach(() => {
    listDevelopmentsMock.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('initial render — status loading', async () => {
    listDevelopmentsMock.mockReturnValue(new Promise(() => {}))
    const { useCatalogue } = await import('../src/hooks/useCatalogue')

    const { result } = renderHook(() => useCatalogue({}))

    expect(result.current.state.status).toBe('loading')
  })

  it('successful fetch, non-empty items — status ready', async () => {
    listDevelopmentsMock.mockResolvedValue({ items: [{ slug: 'a', name: 'A' }], nextCursor: 'cursor-1' })
    const { useCatalogue } = await import('../src/hooks/useCatalogue')

    const { result } = renderHook(() => useCatalogue({}))

    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    const state = result.current.state
    if (state.status !== 'ready') throw new Error('expected ready')
    expect(state.items).toEqual([{ slug: 'a', name: 'A' }])
    expect(state.nextCursor).toBe('cursor-1')
  })

  it('successful fetch, zero items — status empty', async () => {
    listDevelopmentsMock.mockResolvedValue({ items: [], nextCursor: null })
    const { useCatalogue } = await import('../src/hooks/useCatalogue')

    const { result } = renderHook(() => useCatalogue({}))

    await waitFor(() => expect(result.current.state.status).toBe('empty'))
  })

  it('failed fetch — status error, retry() triggers a second fetch', async () => {
    listDevelopmentsMock.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ items: [], nextCursor: null })
    const { useCatalogue } = await import('../src/hooks/useCatalogue')

    const { result } = renderHook(() => useCatalogue({}))

    await waitFor(() => expect(result.current.state.status).toBe('error'))
    expect(listDevelopmentsMock).toHaveBeenCalledTimes(1)

    const errorState = result.current.state
    if (errorState.status !== 'error') throw new Error('expected error')
    act(() => errorState.retry())

    await waitFor(() => expect(result.current.state.status).toBe('empty'))
    expect(listDevelopmentsMock).toHaveBeenCalledTimes(2)
  })

  // Регресс на "не игнорировать невалидные фильтры молча" — 400 не должен
  // тихо стать пустым каталогом, он идёт в тот же 'error' путь, что сеть/5xx.
  it('400 validation failure — status error, not silently empty', async () => {
    const { MarketplaceApiError } = await import('../src/api/marketplace-api')
    listDevelopmentsMock.mockRejectedValue(new MarketplaceApiError('Не удалось загрузить данные. Попробуйте ещё раз.', 400))
    const { useCatalogue } = await import('../src/hooks/useCatalogue')

    const { result } = renderHook(() => useCatalogue({ bbox: { minLng: 200, minLat: 41, maxLng: 42, maxLat: 42 } }))

    await waitFor(() => expect(result.current.state.status).toBe('error'))
  })

  it('network failure (fetcher-level reject) — status error', async () => {
    listDevelopmentsMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const { useCatalogue } = await import('../src/hooks/useCatalogue')

    const { result } = renderHook(() => useCatalogue({}))

    await waitFor(() => expect(result.current.state.status).toBe('error'))
  })

  it('loadMore() appends items and toggles loadingMore during the in-flight request', async () => {
    listDevelopmentsMock.mockResolvedValueOnce({ items: [{ slug: 'a', name: 'A' }], nextCursor: 'cursor-1' })
    const { useCatalogue } = await import('../src/hooks/useCatalogue')

    const { result } = renderHook(() => useCatalogue({}))
    await waitFor(() => expect(result.current.state.status).toBe('ready'))

    let resolveSecondPage: (value: { items: unknown[]; nextCursor: string | null }) => void = () => {}
    listDevelopmentsMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSecondPage = resolve
      }),
    )

    act(() => result.current.loadMore())

    await waitFor(() => {
      const state = result.current.state
      if (state.status !== 'ready') throw new Error('expected ready')
      expect(state.loadingMore).toBe(true)
    })

    await act(async () => {
      resolveSecondPage({ items: [{ slug: 'b', name: 'B' }], nextCursor: null })
    })

    await waitFor(() => {
      const state = result.current.state
      if (state.status !== 'ready') throw new Error('expected ready')
      expect(state.items).toEqual([{ slug: 'a', name: 'A' }, { slug: 'b', name: 'B' }])
      expect(state.loadingMore).toBe(false)
    })
    expect(listDevelopmentsMock).toHaveBeenCalledTimes(2)
  })

  it('aborts an in-flight loadMore request when the catalogue unmounts', async () => {
    listDevelopmentsMock.mockResolvedValueOnce({ items: [{ slug: 'a', name: 'A' }], nextCursor: 'cursor-1' })
    const { useCatalogue } = await import('../src/hooks/useCatalogue')

    const { result, unmount } = renderHook(() => useCatalogue({}))
    await waitFor(() => expect(result.current.state.status).toBe('ready'))

    let requestOptions: { signal?: AbortSignal } | undefined
    listDevelopmentsMock.mockImplementationOnce((_query: unknown, options: { signal?: AbortSignal }) => {
      requestOptions = options
      return new Promise(() => {})
    })

    act(() => result.current.loadMore())
    await waitFor(() => {
      const state = result.current.state
      if (state.status !== 'ready') throw new Error('expected ready')
      expect(state.loadingMore).toBe(true)
    })

    unmount()
    expect(requestOptions?.signal?.aborted).toBe(true)
  })

  it('changing city triggers a fresh fetch and discards stale items from the previous city', async () => {
    let resolveFirstCity: (value: { items: unknown[]; nextCursor: string | null }) => void = () => {}
    listDevelopmentsMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirstCity = resolve
      }),
    )
    const { useCatalogue } = await import('../src/hooks/useCatalogue')

    const { result, rerender } = renderHook(({ city }: { city: string }) => useCatalogue({ city }), {
      initialProps: { city: 'batumi' },
    })

    // Переключаем city ДО того, как первый (batumi) запрос успел резолвиться.
    listDevelopmentsMock.mockResolvedValueOnce({ items: [{ slug: 'tbilisi-1', name: 'T' }], nextCursor: null })
    rerender({ city: 'tbilisi' })

    await waitFor(() => expect(result.current.state.status).toBe('ready'))

    // Устаревший batumi-ответ резолвится ПОСЛЕ того, как city уже сменился —
    // не должен перезаписать уже актуальный tbilisi-результат.
    await act(async () => {
      resolveFirstCity({ items: [{ slug: 'batumi-1', name: 'B' }], nextCursor: null })
    })

    const state = result.current.state
    if (state.status !== 'ready') throw new Error('expected ready')
    expect(state.items).toEqual([{ slug: 'tbilisi-1', name: 'T' }])
  })
})

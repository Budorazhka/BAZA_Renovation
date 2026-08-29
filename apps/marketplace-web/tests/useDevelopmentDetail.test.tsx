/** @vitest-environment jsdom */

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * D-04A: изолированный unit-тест хука useDevelopmentDetail. 'not-found'
 * покрывает и "никогда не существовал", и publication_pending/build_failed
 * (backend отдаёт identical 404 для всех трёх — подтверждено D-03
 * integration-тестами) — намеренное схлопывание, не отдельный "not-ready".
 */

const getDevelopmentMock = vi.fn()

vi.mock('../src/api/marketplace-api', async () => {
  const actual = await vi.importActual<typeof import('../src/api/marketplace-api')>('../src/api/marketplace-api')
  return {
    ...actual,
    marketplaceApi: { getDevelopment: (...args: unknown[]) => getDevelopmentMock(...args) },
  }
})

describe('useDevelopmentDetail', () => {
  beforeEach(() => {
    getDevelopmentMock.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('initial render — status loading', async () => {
    getDevelopmentMock.mockReturnValue(new Promise(() => {}))
    const { useDevelopmentDetail } = await import('../src/hooks/useDevelopmentDetail')

    const { result } = renderHook(() => useDevelopmentDetail('seaside'))

    expect(result.current.status).toBe('loading')
  })

  it('successful fetch — status ready with item', async () => {
    getDevelopmentMock.mockResolvedValue({ slug: 'seaside', name: 'Seaside' })
    const { useDevelopmentDetail } = await import('../src/hooks/useDevelopmentDetail')

    const { result } = renderHook(() => useDevelopmentDetail('seaside'))

    await waitFor(() => expect(result.current.status).toBe('ready'))
    const state = result.current
    if (state.status !== 'ready') throw new Error('expected ready')
    expect(state.item).toEqual({ slug: 'seaside', name: 'Seaside' })
  })

  it('404 response — status not-found (covers both "never existed" and "not yet built")', async () => {
    const { MarketplaceApiError } = await import('../src/api/marketplace-api')
    getDevelopmentMock.mockRejectedValue(new MarketplaceApiError('Объект не найден или больше не опубликован.', 404))
    const { useDevelopmentDetail } = await import('../src/hooks/useDevelopmentDetail')

    const { result } = renderHook(() => useDevelopmentDetail('missing'))

    await waitFor(() => expect(result.current.status).toBe('not-found'))
  })

  it('generic error (500/503) — status error, retry() re-fetches', async () => {
    const { MarketplaceApiError } = await import('../src/api/marketplace-api')
    getDevelopmentMock
      .mockRejectedValueOnce(new MarketplaceApiError('Не удалось загрузить данные. Попробуйте ещё раз.', 503))
      .mockResolvedValueOnce({ slug: 'seaside', name: 'Seaside' })
    const { useDevelopmentDetail } = await import('../src/hooks/useDevelopmentDetail')

    const { result } = renderHook(() => useDevelopmentDetail('seaside'))

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(getDevelopmentMock).toHaveBeenCalledTimes(1)

    const errorState = result.current
    if (errorState.status !== 'error') throw new Error('expected error')
    act(() => errorState.retry())

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(getDevelopmentMock).toHaveBeenCalledTimes(2)
  })

  it('network failure (fetcher-level reject) — status error', async () => {
    getDevelopmentMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const { useDevelopmentDetail } = await import('../src/hooks/useDevelopmentDetail')

    const { result } = renderHook(() => useDevelopmentDetail('seaside'))

    await waitFor(() => expect(result.current.status).toBe('error'))
  })

  it('aborts the active request when the detail unmounts', async () => {
    let requestOptions: { signal?: AbortSignal } | undefined
    getDevelopmentMock.mockImplementationOnce((_slug: string, options: { signal?: AbortSignal }) => {
      requestOptions = options
      return new Promise(() => {})
    })
    const { useDevelopmentDetail } = await import('../src/hooks/useDevelopmentDetail')

    const { unmount } = renderHook(() => useDevelopmentDetail('seaside'))
    await waitFor(() => expect(getDevelopmentMock).toHaveBeenCalledTimes(1))

    unmount()
    expect(requestOptions?.signal?.aborted).toBe(true)
  })

  it('changing slug between renders does not leak the previous slug stale item into the new render', async () => {
    let resolveFirstSlug: (value: { slug: string; name: string }) => void = () => {}
    getDevelopmentMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirstSlug = resolve
      }),
    )
    const { useDevelopmentDetail } = await import('../src/hooks/useDevelopmentDetail')

    const { result, rerender } = renderHook(({ slug }: { slug: string }) => useDevelopmentDetail(slug), {
      initialProps: { slug: 'first' },
    })

    getDevelopmentMock.mockResolvedValueOnce({ slug: 'second', name: 'Second' })
    rerender({ slug: 'second' })

    await waitFor(() => expect(result.current.status).toBe('ready'))

    // Устаревший ответ для 'first' резолвится ПОСЛЕ смены slug — не должен
    // перезаписать уже актуальный 'second' item.
    await act(async () => {
      resolveFirstSlug({ slug: 'first', name: 'First' })
    })

    const state = result.current
    if (state.status !== 'ready') throw new Error('expected ready')
    expect(state.item.slug).toBe('second')
  })
})

/** @vitest-environment jsdom */

import { act, cleanup, renderHook } from '@testing-library/react'
import { StrictMode, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * D-03: изолированный unit-тест хука usePublicationStatusPolling — "опрашивать
 * пока не терминальный статус, потом остановиться" (не бессрочный auto-refresh).
 */

const getPublicationStatusMock = vi.fn()

vi.mock('@/services/developmentsApiV2', () => ({
  getCreateIdempotencyKey: (scope: string) => `key-${scope}`,
  resetCreateIdempotencyKey: () => {},
  developmentsApiV2: { getPublicationStatus: getPublicationStatusMock },
}))

describe('usePublicationStatusPolling', () => {
  beforeEach(async () => {
    getPublicationStatusMock.mockReset()
    // Module-level dedup-кэш (P1: StrictMode double-invoke защита) должен
    // быть чист перед каждым тестом — та же 'dev-1' переиспользуется почти
    // везде в этом файле.
    const { __resetPollingDedupCacheForTests } = await import('@/features/developments-v2/lib/usePublicationStatusPolling')
    __resetPollingDedupCacheForTests()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('enabled:false не вызывает getPublicationStatus вообще', async () => {
    const { usePublicationStatusPolling } = await import('@/features/developments-v2/lib/usePublicationStatusPolling')
    const onStatusChange = vi.fn()

    renderHook(() =>
      usePublicationStatusPolling({ developmentId: 'dev-1', enabled: false, onStatusChange }),
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(getPublicationStatusMock).not.toHaveBeenCalled()
  })

  it('enabled:true вызывает сразу (не ждёт первого интервала)', async () => {
    getPublicationStatusMock.mockResolvedValue({ publicationId: 'pub-1', status: 'publication_pending', version: 0 })
    const { usePublicationStatusPolling } = await import('@/features/developments-v2/lib/usePublicationStatusPolling')
    const onStatusChange = vi.fn()

    renderHook(() =>
      usePublicationStatusPolling({ developmentId: 'dev-1', enabled: true, onStatusChange }),
    )

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getPublicationStatusMock).toHaveBeenCalledTimes(1)
    expect(onStatusChange).toHaveBeenCalledWith({ publicationId: 'pub-1', status: 'publication_pending', version: 0 })
  })

  it('останавливается на терминальном статусе published — дальнейших тиков нет', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    getPublicationStatusMock.mockResolvedValue({ publicationId: 'pub-1', status: 'published', version: 1, slug: 'x' })
    const { usePublicationStatusPolling } = await import('@/features/developments-v2/lib/usePublicationStatusPolling')
    const onStatusChange = vi.fn()

    renderHook(() =>
      usePublicationStatusPolling({ developmentId: 'dev-1', enabled: true, intervalMs: 1000, onStatusChange }),
    )

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(getPublicationStatusMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    // Терминальный статус на первом же тике — второго тика быть не должно.
    expect(getPublicationStatusMock).toHaveBeenCalledTimes(1)
  })

  it('останавливается на терминальном статусе build_failed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    getPublicationStatusMock.mockResolvedValue({ publicationId: 'pub-1', status: 'build_failed', version: 1 })
    const { usePublicationStatusPolling } = await import('@/features/developments-v2/lib/usePublicationStatusPolling')
    const onStatusChange = vi.fn()

    renderHook(() =>
      usePublicationStatusPolling({ developmentId: 'dev-1', enabled: true, intervalMs: 1000, onStatusChange }),
    )

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    expect(getPublicationStatusMock).toHaveBeenCalledTimes(1)
  })

  it('останавливается на терминальном статусе unpublished', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    getPublicationStatusMock.mockResolvedValue({ publicationId: 'pub-1', status: 'unpublished', version: 2 })
    const { usePublicationStatusPolling } = await import('@/features/developments-v2/lib/usePublicationStatusPolling')
    const onStatusChange = vi.fn()

    renderHook(() =>
      usePublicationStatusPolling({ developmentId: 'dev-1', enabled: true, intervalMs: 1000, onStatusChange }),
    )

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    expect(getPublicationStatusMock).toHaveBeenCalledTimes(1)
  })

  it('продолжает опрашивать после отклонённого промиса (сетевая ошибка не останавливает polling)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    getPublicationStatusMock
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ publicationId: 'pub-1', status: 'publication_pending', version: 0 })
    const { usePublicationStatusPolling } = await import('@/features/developments-v2/lib/usePublicationStatusPolling')
    const onStatusChange = vi.fn()

    renderHook(() =>
      usePublicationStatusPolling({ developmentId: 'dev-1', enabled: true, intervalMs: 1000, onStatusChange }),
    )

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(getPublicationStatusMock).toHaveBeenCalledTimes(1)
    // Ошибка не должна была вызвать onStatusChange и не должна была бросить
    // необработанное исключение (renderHook не упал бы тестом сам по себе).
    expect(onStatusChange).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(getPublicationStatusMock).toHaveBeenCalledTimes(2)
    expect(onStatusChange).toHaveBeenCalledWith({ publicationId: 'pub-1', status: 'publication_pending', version: 0 })
  })

  it('cleanup при unmount отменяет запланированный tick — нет вызовов после unmount', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    getPublicationStatusMock.mockResolvedValue({ publicationId: 'pub-1', status: 'publication_pending', version: 0 })
    const { usePublicationStatusPolling } = await import('@/features/developments-v2/lib/usePublicationStatusPolling')
    const onStatusChange = vi.fn()

    const { unmount } = renderHook(() =>
      usePublicationStatusPolling({ developmentId: 'dev-1', enabled: true, intervalMs: 1000, onStatusChange }),
    )

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(getPublicationStatusMock).toHaveBeenCalledTimes(1)

    unmount()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000)
    })

    expect(getPublicationStatusMock).toHaveBeenCalledTimes(1)
  })

  it('developmentId:null не вызывает getPublicationStatus', async () => {
    const { usePublicationStatusPolling } = await import('@/features/developments-v2/lib/usePublicationStatusPolling')
    const onStatusChange = vi.fn()

    renderHook(() =>
      usePublicationStatusPolling({ developmentId: null, enabled: true, onStatusChange }),
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(getPublicationStatusMock).not.toHaveBeenCalled()
  })

  it('StrictMode: первый тик шлёт ровно один реальный запрос, не два от double-invoke', async () => {
    getPublicationStatusMock.mockResolvedValue({ publicationId: 'pub-1', status: 'publication_pending', version: 0 })
    const { usePublicationStatusPolling } = await import('@/features/developments-v2/lib/usePublicationStatusPolling')
    const onStatusChange = vi.fn()

    renderHook(
      () => usePublicationStatusPolling({ developmentId: 'dev-1', enabled: true, onStatusChange }),
      { wrapper: ({ children }) => createElement(StrictMode, null, children) },
    )

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    // StrictMode монтирует эффект дважды (mount→cleanup→mount) — module-level
    // dedup должен схлопнуть это в один реальный HTTP-запрос.
    expect(getPublicationStatusMock).toHaveBeenCalledTimes(1)
    expect(onStatusChange).toHaveBeenCalledWith({ publicationId: 'pub-1', status: 'publication_pending', version: 0 })
  })

  it('StrictMode: следующий self-rescheduled тик после первого — снова реальный запрос, дедуп не залипает навсегда', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    getPublicationStatusMock
      .mockResolvedValueOnce({ publicationId: 'pub-1', status: 'publication_pending', version: 0 })
      .mockResolvedValueOnce({ publicationId: 'pub-1', status: 'published', version: 1, slug: 'zhk-x' })
    const { usePublicationStatusPolling } = await import('@/features/developments-v2/lib/usePublicationStatusPolling')
    const onStatusChange = vi.fn()

    renderHook(
      () => usePublicationStatusPolling({ developmentId: 'dev-1', enabled: true, intervalMs: 1000, onStatusChange }),
      { wrapper: ({ children }) => createElement(StrictMode, null, children) },
    )

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(getPublicationStatusMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    // Второй тик — уже НЕ StrictMode-повтор, а обычный self-rescheduled tick.
    // Дедуп-запись первого тика уже снята после его резолва — второй тик
    // должен слать новый реальный запрос, не унаследовать пустой Map навсегда.
    expect(getPublicationStatusMock).toHaveBeenCalledTimes(2)
    expect(onStatusChange).toHaveBeenCalledWith({ publicationId: 'pub-1', status: 'published', version: 1, slug: 'zhk-x' })
  })
})

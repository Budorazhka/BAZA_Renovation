/** @vitest-environment jsdom */

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 04.09.2026: useFunnelsBackend переведён с легаси `apiService.getLeadsByStage`
 * (снимок текущих счётчиков) на реальный `GET /crm/reports/lead-funnel`
 * (crmReportApiV2.getLeadFunnel, воронка по истории lead_events).
 */

const getLeadFunnelMock = vi.fn()

vi.mock('@/services/crmReportApiV2', () => ({
  crmReportApiV2: { getLeadFunnel: getLeadFunnelMock },
}))

describe('useFunnelsBackend', () => {
  beforeEach(() => {
    getLeadFunnelMock.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('запрашивает воронку по каждому из 4 продуктов отдельно', async () => {
    getLeadFunnelMock.mockResolvedValue({ stages: [] })

    const { useFunnelsBackend } = await import('@/features/crm/pages/crm/hooks/useFunnelsBackend')
    renderHook(() => useFunnelsBackend())

    await waitFor(() => expect(getLeadFunnelMock).toHaveBeenCalledTimes(4))
    const calledProductTypes = getLeadFunnelMock.mock.calls.map((c) => c[0].productType).sort()
    expect(calledProductTypes).toEqual(['agent', 'network', 'owner', 'sales'])
  })

  it('строит funnels из ответа бэкенда и переводит loading в false', async () => {
    getLeadFunnelMock.mockImplementation(({ productType }: { productType: string }) => {
      if (productType === 'sales') return Promise.resolve({ stages: [{ stage: 'defective', leadCount: 3 }] })
      return Promise.resolve({ stages: [] })
    })

    const { useFunnelsBackend } = await import('@/features/crm/pages/crm/hooks/useFunnelsBackend')
    const { result } = renderHook(() => useFunnelsBackend())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeNull()
    const salesBoard = result.current.funnels.find((b) => b.id === 'sales')
    expect(salesBoard?.rejectionCount).toBe(3)
  })

  it('отказ одного продукта (Promise.allSettled) не роняет весь виджет — остальные продукты учитываются', async () => {
    getLeadFunnelMock.mockImplementation(({ productType }: { productType: string }) => {
      if (productType === 'network') return Promise.reject(new Error('503'))
      if (productType === 'sales') return Promise.resolve({ stages: [{ stage: 'defective', leadCount: 1 }] })
      return Promise.resolve({ stages: [] })
    })

    const { useFunnelsBackend } = await import('@/features/crm/pages/crm/hooks/useFunnelsBackend')
    const { result } = renderHook(() => useFunnelsBackend())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeNull()
    const salesBoard = result.current.funnels.find((b) => b.id === 'sales')
    expect(salesBoard?.rejectionCount).toBe(1)
  })

  it('refetch() повторно запрашивает все 4 продукта', async () => {
    getLeadFunnelMock.mockResolvedValue({ stages: [] })

    const { useFunnelsBackend } = await import('@/features/crm/pages/crm/hooks/useFunnelsBackend')
    const { result } = renderHook(() => useFunnelsBackend())

    await waitFor(() => expect(getLeadFunnelMock).toHaveBeenCalledTimes(4))

    await act(async () => {
      result.current.refetch()
      await Promise.resolve()
    })

    await waitFor(() => expect(getLeadFunnelMock).toHaveBeenCalledTimes(8))
  })
})

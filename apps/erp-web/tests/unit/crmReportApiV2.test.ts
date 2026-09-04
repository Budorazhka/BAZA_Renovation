import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getMock = vi.fn()
let axiosCreateConfig: Record<string, unknown> | undefined

vi.mock('axios', () => ({
  default: {
    create: (config: Record<string, unknown>) => {
      axiosCreateConfig = config
      return { get: getMock }
    },
  },
}))

describe('crmReportApiV2 service client', () => {
  beforeEach(() => {
    getMock.mockReset()
    vi.resetModules()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('создаёт axios-инстанс с withCredentials: true и Content-Type application/json', async () => {
    await import('@/services/crmReportApiV2')
    expect(axiosCreateConfig).toBeDefined()
    expect(axiosCreateConfig?.baseURL).toBe('http://localhost:3000')
    expect(axiosCreateConfig?.withCredentials).toBe(true)
    expect(axiosCreateConfig?.headers).toEqual({ 'Content-Type': 'application/json' })
  })

  it('getLeadFunnel() вызывает GET /api/v1/crm/reports/lead-funnel с параметрами', async () => {
    const mockData = { stages: [{ stage: 'new', leadCount: 3 }] }
    getMock.mockResolvedValueOnce({ data: mockData })

    const { crmReportApiV2 } = await import('@/services/crmReportApiV2')
    const result = await crmReportApiV2.getLeadFunnel({ productType: 'sales', from: '2026-01-01', to: '2026-02-01' })

    expect(getMock).toHaveBeenCalledWith('/api/v1/crm/reports/lead-funnel', {
      params: { productType: 'sales', from: '2026-01-01', to: '2026-02-01' },
    })
    expect(result).toEqual(mockData)
  })

  it('getLeadFunnel() без параметров всё равно передаёт params: undefined', async () => {
    getMock.mockResolvedValueOnce({ data: { stages: [] } })

    const { crmReportApiV2 } = await import('@/services/crmReportApiV2')
    await crmReportApiV2.getLeadFunnel()

    expect(getMock).toHaveBeenCalledWith('/api/v1/crm/reports/lead-funnel', { params: undefined })
  })

  it('getPositionsReport() вызывает GET /api/v1/crm/reports/positions с параметрами', async () => {
    const mockData = { positions: [] }
    getMock.mockResolvedValueOnce({ data: mockData })

    const { crmReportApiV2 } = await import('@/services/crmReportApiV2')
    const result = await crmReportApiV2.getPositionsReport({ from: '2026-01-01', to: '2026-02-01' })

    expect(getMock).toHaveBeenCalledWith('/api/v1/crm/reports/positions', {
      params: { from: '2026-01-01', to: '2026-02-01' },
    })
    expect(result).toEqual(mockData)
  })

  it('пробрасывает ошибки бэкенда/сети при сбое запроса', async () => {
    getMock.mockRejectedValueOnce(new Error('Network error'))

    const { crmReportApiV2 } = await import('@/services/crmReportApiV2')
    await expect(crmReportApiV2.getLeadFunnel()).rejects.toThrow('Network error')
  })
})

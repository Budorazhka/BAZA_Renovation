import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const postMock = vi.fn()
const getMock = vi.fn()
const patchMock = vi.fn()

vi.mock('axios', () => ({
  default: {
    create: () => ({ post: postMock, get: getMock, patch: patchMock }),
  },
}))

describe('developmentsApiV2 — batch and chessboard operations', () => {
  beforeEach(() => {
    postMock.mockReset()
    getMock.mockReset()
    patchMock.mockReset()
    vi.resetModules()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('generateChessboard отправляет POST /api/v1/buildings/:id/chessboard/generate с Idempotency-Key и телом', async () => {
    const mockUnits = [
      { _id: 'u-1', number: '101', floor: 1, area: 50, price: { amountMinorUnits: 5000000, currency: 'USD' }, status: 'available' },
    ]
    postMock.mockResolvedValue({ data: mockUnits })
    const { developmentsApiV2 } = await import('@/services/developmentsApiV2')

    const payload = {
      fromFloor: 1,
      toFloor: 3,
      unitsPerFloor: 4,
      defaultArea: 50,
      defaultPrice: { amountMinorUnits: 5000000, currency: 'USD' as const },
    }
    const result = await developmentsApiV2.generateChessboard('b-1', payload, 'idem-gen-1')

    expect(result).toEqual(mockUnits)
    expect(postMock).toHaveBeenCalledTimes(1)
    const [url, body, config] = postMock.mock.calls[0]!
    expect(url).toBe('/api/v1/buildings/b-1/chessboard/generate')
    expect(body).toEqual(payload)
    expect(config?.headers?.['Idempotency-Key']).toBe('idem-gen-1')
  })

  it('batchCreateUnits отправляет POST /api/v1/buildings/:id/units/batch с Idempotency-Key', async () => {
    const mockUnits = [
      { _id: 'u-1', number: '101', floor: 1, area: 50, price: { amountMinorUnits: 5000000, currency: 'USD' }, status: 'available' },
    ]
    postMock.mockResolvedValue({ data: mockUnits })
    const { developmentsApiV2 } = await import('@/services/developmentsApiV2')

    const payload = {
      units: [
        {
          floorNumber: 1,
          number: '101',
          kind: 'apartment' as const,
          area: 50,
          price: { amountMinorUnits: 5000000, currency: 'USD' as const },
        },
      ],
    }
    const result = await developmentsApiV2.batchCreateUnits('b-1', payload, 'idem-batch-1')

    expect(result).toEqual(mockUnits)
    expect(postMock).toHaveBeenCalledTimes(1)
    const [url, body, config] = postMock.mock.calls[0]!
    expect(url).toBe('/api/v1/buildings/b-1/units/batch')
    expect(body).toEqual(payload)
    expect(config?.headers?.['Idempotency-Key']).toBe('idem-batch-1')
  })

  it('batchUpdatePrices отправляет POST /api/v1/developments/:id/units/batch-price-update с Idempotency-Key', async () => {
    postMock.mockResolvedValue({ data: { updatedCount: 12 } })
    const { developmentsApiV2 } = await import('@/services/developmentsApiV2')

    const payload = {
      operationType: 'percentage' as const,
      value: 10,
      reason: 'Плановое повышение цен',
    }
    const result = await developmentsApiV2.batchUpdatePrices('dev-1', payload, 'idem-price-1')

    expect(result).toEqual({ updatedCount: 12 })
    expect(postMock).toHaveBeenCalledTimes(1)
    const [url, body, config] = postMock.mock.calls[0]!
    expect(url).toBe('/api/v1/developments/dev-1/units/batch-price-update')
    expect(body).toEqual(payload)
    expect(config?.headers?.['Idempotency-Key']).toBe('idem-price-1')
  })
})

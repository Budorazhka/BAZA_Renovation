import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getMock = vi.fn()
let lastCreateOptions: Record<string, unknown> | undefined

vi.mock('axios', () => ({
  default: {
    create: (options: Record<string, unknown>) => {
      lastCreateOptions = options
      return { get: getMock }
    },
  },
}))

describe('publicSelectionsApi', () => {
  beforeEach(() => {
    getMock.mockReset()
    lastCreateOptions = undefined
    vi.resetModules()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('создаёт axios-клиент без withCredentials (публичный, без cookie/сессии)', async () => {
    getMock.mockResolvedValue({ data: { title: 'x', status: 'sent', items: [], createdAt: '2026-09-04T00:00:00.000Z', viewCount: 0 } })
    const { publicSelectionsApi } = await import('@/services/publicSelectionsApi')
    await publicSelectionsApi.getByToken('token-value')

    expect(lastCreateOptions?.withCredentials).toBe(false)
  })

  it('запрашивает GET /api/v1/public/selections/:token и маппит whitelist-поля', async () => {
    getMock.mockResolvedValue({
      data: {
        title: 'Подборка для клиента',
        clientName: 'Анна',
        status: 'viewed',
        items: [{ unitId: 'unit-1', reaction: 'liked' }],
        createdAt: '2026-09-04T00:00:00.000Z',
        viewCount: 3,
      },
    })

    const { publicSelectionsApi } = await import('@/services/publicSelectionsApi')
    const result = await publicSelectionsApi.getByToken('token-value')

    expect(getMock).toHaveBeenCalledWith('/api/v1/public/selections/token-value')
    expect(result.title).toBe('Подборка для клиента')
    expect(result.viewCount).toBe(3)
    expect(result.items[0]).toMatchObject({ unitId: 'unit-1', reaction: 'liked' })
    expect(result).not.toHaveProperty('id')
    expect(result).not.toHaveProperty('publicToken')
  })
})

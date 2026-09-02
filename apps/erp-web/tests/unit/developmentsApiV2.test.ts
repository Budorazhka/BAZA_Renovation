import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * D-02 (26.08.2026): developmentsApiV2 обязан ходить на НОВЫЙ BAZA Platform
 * API (PLATFORM_API_BASE_URL), не на legacy CRM_API_BASE_URL/developmentApi.
 * Оба origin совпадают в dev (localhost:3000), поэтому единственный способ
 * доказать, какая именно переменная используется — проверить сам объект
 * конфига, переданный в axios.create (тот же паттерн, что
 * tests/unit/leadsApiV2.test.ts для соседнего V2-клиента).
 *
 * P1-фикс: main.api.ts вызывает app.setGlobalPrefix('api/v1', {exclude:
 * ['health','health/ready']}) — DevelopmentsController не в exclude, поэтому
 * реальные пути на живом backend начинаются с /api/v1/..., не с голого
 * /developments. Все ожидания URL ниже проверяют именно /api/v1/....
 */

const getMock = vi.fn()
const postMock = vi.fn()
const patchMock = vi.fn()
let axiosCreateConfig: Record<string, unknown> | undefined

vi.mock('axios', () => ({
  default: {
    create: (config: Record<string, unknown>) => {
      axiosCreateConfig = config
      return { get: getMock, post: postMock, patch: patchMock }
    },
  },
}))

describe('developmentsApiV2 service client', () => {
  beforeEach(() => {
    getMock.mockReset()
    postMock.mockReset()
    patchMock.mockReset()
    vi.resetModules()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('создаёт axios-инстанс именно с PLATFORM_API_BASE_URL, не CRM_API_BASE_URL', async () => {
    const { PLATFORM_API_BASE_URL, CRM_API_BASE_URL } = await import('@/config/backend')
    await import('@/services/developmentsApiV2')

    expect(axiosCreateConfig).toBeDefined()
    expect(axiosCreateConfig?.baseURL).toBe(PLATFORM_API_BASE_URL)
    // В dev оба origin совпадают физически — явная проверка, что это не
    // случайное совпадение значений, а осознанный выбор другой константы,
    // была бы возможна только при разных origin. Здесь фиксируем на будущее:
    // если когда-нибудь origin'ы разойдутся, этот тест должен продолжать
    // указывать на PLATFORM_API_BASE_URL.
    void CRM_API_BASE_URL
    expect(axiosCreateConfig?.withCredentials).toBe(true)
    expect(axiosCreateConfig?.headers).toEqual({ 'Content-Type': 'application/json' })
  })

  it('create() отправляет POST /api/v1/developments ровно с новым DTO (name/location/contact/…)', async () => {
    const created = {
      _id: 'dev-1',
      organizationId: 'org-1',
      name: 'ЖК Морской',
      status: 'draft',
      location: {
        country: 'ge',
        city: 'batumi',
        geo: { type: 'Point', coordinates: [41.6367, 41.6459] },
      },
      contact: { phone: '+995555000000' },
      version: 1,
      createdAt: '2026-08-26T10:00:00.000Z',
    }
    postMock.mockResolvedValueOnce({ data: created })

    const { developmentsApiV2 } = await import('@/services/developmentsApiV2')
    const payload = {
      name: 'ЖК Морской',
      location: {
        country: 'ge',
        city: 'batumi',
        geo: { type: 'Point' as const, coordinates: [41.6367, 41.6459] as [number, number] },
      },
      contact: { phone: '+995555000000' },
    }

    const result = await developmentsApiV2.create(payload, 'test-key')

    expect(postMock).toHaveBeenCalledTimes(1)
    expect(postMock).toHaveBeenCalledWith('/api/v1/developments', payload, {
      headers: { 'Idempotency-Key': expect.any(String) },
    })
    expect(result).toEqual(created)
  })

  it('list() вызывает GET /api/v1/developments и возвращает {items, nextCursor}', async () => {
    const mockData = { items: [], nextCursor: null }
    getMock.mockResolvedValueOnce({ data: mockData })

    const { developmentsApiV2 } = await import('@/services/developmentsApiV2')
    const result = await developmentsApiV2.list({ limit: 100 })

    expect(getMock).toHaveBeenCalledTimes(1)
    expect(getMock).toHaveBeenCalledWith('/api/v1/developments', { params: { limit: 100 } })
    expect(result).toEqual(mockData)
  })

  it('пробрасывает ошибку создания без побочных эффектов (сеть/бэкенд)', async () => {
    postMock.mockRejectedValueOnce(new Error('Network error'))

    const { developmentsApiV2 } = await import('@/services/developmentsApiV2')
    await expect(
      developmentsApiV2.create({
        name: 'X',
        location: { country: 'ge', city: 'batumi', geo: { type: 'Point', coordinates: [1, 2] } },
        contact: { phone: '+995555000000' },
      }),
    ).rejects.toThrow('Network error')
  })

  describe('D-02 COMPLETE: read hierarchy методы', () => {
    it('listBuildings() вызывает GET /api/v1/developments/:id/buildings', async () => {
      const buildings = [{ _id: 'b-1', developmentId: 'dev-1', organizationId: 'org-1', name: 'Корпус 1', floorsCount: 5, createdAt: '2026-08-27T00:00:00.000Z' }]
      getMock.mockResolvedValueOnce({ data: buildings })

      const { developmentsApiV2 } = await import('@/services/developmentsApiV2')
      const result = await developmentsApiV2.listBuildings('dev-1')

      expect(getMock).toHaveBeenCalledTimes(1)
      expect(getMock).toHaveBeenCalledWith('/api/v1/developments/dev-1/buildings')
      expect(result).toEqual(buildings)
    })

    it('listSections() вызывает GET /api/v1/buildings/:id/sections', async () => {
      const sections = [{ _id: 's-1', buildingId: 'b-1', organizationId: 'org-1', name: 'Секция А', createdAt: '2026-08-27T00:00:00.000Z' }]
      getMock.mockResolvedValueOnce({ data: sections })

      const { developmentsApiV2 } = await import('@/services/developmentsApiV2')
      const result = await developmentsApiV2.listSections('b-1')

      expect(getMock).toHaveBeenCalledTimes(1)
      expect(getMock).toHaveBeenCalledWith('/api/v1/buildings/b-1/sections')
      expect(result).toEqual(sections)
    })

    it('listFloors() вызывает GET /api/v1/buildings/:id/floors', async () => {
      const floors = [{ _id: 'f-1', buildingId: 'b-1', organizationId: 'org-1', floorNumber: 1, createdAt: '2026-08-27T00:00:00.000Z' }]
      getMock.mockResolvedValueOnce({ data: floors })

      const { developmentsApiV2 } = await import('@/services/developmentsApiV2')
      const result = await developmentsApiV2.listFloors('b-1')

      expect(getMock).toHaveBeenCalledTimes(1)
      expect(getMock).toHaveBeenCalledWith('/api/v1/buildings/b-1/floors')
      expect(result).toEqual(floors)
    })

    it('listFloorPlans() вызывает GET /api/v1/buildings/:id/floor-plans', async () => {
      const floorPlans = [{ _id: 'fp-1', buildingId: 'b-1', organizationId: 'org-1', name: 'Планировка 1', rooms: 2, area: 55, tags: [], createdAt: '2026-08-27T00:00:00.000Z' }]
      getMock.mockResolvedValueOnce({ data: floorPlans })

      const { developmentsApiV2 } = await import('@/services/developmentsApiV2')
      const result = await developmentsApiV2.listFloorPlans('b-1')

      expect(getMock).toHaveBeenCalledTimes(1)
      expect(getMock).toHaveBeenCalledWith('/api/v1/buildings/b-1/floor-plans')
      expect(result).toEqual(floorPlans)
    })

    it('listUnits() без filters вызывает GET /api/v1/buildings/:id/units с params:undefined', async () => {
      getMock.mockResolvedValueOnce({ data: [] })

      const { developmentsApiV2 } = await import('@/services/developmentsApiV2')
      await developmentsApiV2.listUnits('b-1')

      expect(getMock).toHaveBeenCalledTimes(1)
      expect(getMock).toHaveBeenCalledWith('/api/v1/buildings/b-1/units', { params: undefined })
    })

    it('listUnits() передаёт kind/status/limit как query-параметры', async () => {
      const units = [{
        _id: 'u-1', buildingId: 'b-1', floorId: 'f-1', organizationId: 'org-1', number: '101',
        kind: 'apartment', area: 45, price: { amountMinorUnits: 10000000, currency: 'USD' },
        status: 'available', priceHistory: [], version: 0, createdAt: '2026-08-27T00:00:00.000Z',
      }]
      getMock.mockResolvedValueOnce({ data: units })

      const { developmentsApiV2 } = await import('@/services/developmentsApiV2')
      const result = await developmentsApiV2.listUnits('b-1', { kind: 'apartment', status: 'available', limit: 50 })

      expect(getMock).toHaveBeenCalledTimes(1)
      expect(getMock).toHaveBeenCalledWith('/api/v1/buildings/b-1/units', {
        params: { kind: 'apartment', status: 'available', limit: 50 },
      })
      expect(result).toEqual(units)
    })

    it('getUnit() вызывает GET /api/v1/units/:id', async () => {
      const unit = {
        _id: 'u-1', buildingId: 'b-1', floorId: 'f-1', organizationId: 'org-1', number: '101',
        kind: 'apartment', area: 45, price: { amountMinorUnits: 10000000, currency: 'USD' },
        status: 'available', priceHistory: [], version: 0, createdAt: '2026-08-27T00:00:00.000Z',
      }
      getMock.mockResolvedValueOnce({ data: unit })

      const { developmentsApiV2 } = await import('@/services/developmentsApiV2')
      const result = await developmentsApiV2.getUnit('u-1')

      expect(getMock).toHaveBeenCalledTimes(1)
      expect(getMock).toHaveBeenCalledWith('/api/v1/units/u-1')
      expect(result).toEqual(unit)
    })

    it('все новые read-методы используют путь с /api/v1/', async () => {
      getMock.mockResolvedValue({ data: [] })

      const { developmentsApiV2 } = await import('@/services/developmentsApiV2')
      await developmentsApiV2.listBuildings('dev-1')
      await developmentsApiV2.listSections('b-1')
      await developmentsApiV2.listFloors('b-1')
      await developmentsApiV2.listFloorPlans('b-1')
      await developmentsApiV2.listUnits('b-1')

      for (const call of getMock.mock.calls) {
        expect(call[0]).toMatch(/^\/api\/v1\//)
      }
    })
  })
})

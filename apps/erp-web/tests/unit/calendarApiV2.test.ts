import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getMock = vi.fn()
const patchMock = vi.fn()
const postMock = vi.fn()
const deleteMock = vi.fn()
let axiosCreateConfig: Record<string, unknown> | undefined

vi.mock('axios', () => ({
  default: {
    create: (config: Record<string, unknown>) => {
      axiosCreateConfig = config
      return { get: getMock, patch: patchMock, post: postMock, delete: deleteMock }
    },
  },
}))

describe('calendarApiV2 service client', () => {
  beforeEach(() => {
    getMock.mockReset()
    patchMock.mockReset()
    postMock.mockReset()
    deleteMock.mockReset()
    vi.resetModules()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('создаёт axios-инстанс с withCredentials: true и Content-Type application/json', async () => {
    await import('@/services/calendarApiV2')
    expect(axiosCreateConfig).toBeDefined()
    expect(axiosCreateConfig?.baseURL).toBe('http://localhost:3000')
    expect(axiosCreateConfig?.withCredentials).toBe(true)
    expect(axiosCreateConfig?.headers).toEqual({ 'Content-Type': 'application/json' })
  })

  it('list() вызывает GET /api/v1/calendar/events с параметрами', async () => {
    const mockData = { items: [{ id: 'ev-1' }] }
    getMock.mockResolvedValueOnce({ data: mockData })

    const { calendarApiV2 } = await import('@/services/calendarApiV2')
    const result = await calendarApiV2.list({ startDate: '2026-09-01T00:00:00.000Z', endDate: '2026-09-30T00:00:00.000Z' })

    expect(getMock).toHaveBeenCalledWith('/api/v1/calendar/events', {
      params: { startDate: '2026-09-01T00:00:00.000Z', endDate: '2026-09-30T00:00:00.000Z' },
    })
    expect(result).toEqual(mockData)
  })

  it('getById() вызывает GET /api/v1/calendar/events/:id', async () => {
    const mockEvent = { id: 'ev-1', title: 'Встреча' }
    getMock.mockResolvedValueOnce({ data: mockEvent })

    const { calendarApiV2 } = await import('@/services/calendarApiV2')
    const result = await calendarApiV2.getById('ev-1')

    expect(getMock).toHaveBeenCalledWith('/api/v1/calendar/events/ev-1')
    expect(result).toEqual(mockEvent)
  })

  it('create() отправляет заголовок Idempotency-Key', async () => {
    const createdEvent = { id: 'ev-new', title: 'Новая встреча' }
    postMock.mockResolvedValueOnce({ data: createdEvent })

    const { calendarApiV2 } = await import('@/services/calendarApiV2')
    const payload = { title: 'Новая встреча', startTime: '2026-09-10T10:00:00.000Z', endTime: '2026-09-10T11:00:00.000Z' }
    const result = await calendarApiV2.create(payload, 'key-1')

    expect(postMock).toHaveBeenCalledWith('/api/v1/calendar/events', payload, {
      headers: { 'Idempotency-Key': 'key-1' },
    })
    expect(result).toEqual(createdEvent)
  })

  it('newIdempotencyKey() возвращает разные значения на разные вызовы', async () => {
    const { newIdempotencyKey } = await import('@/services/calendarApiV2')
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey())
  })

  it('update() вызывает PATCH /api/v1/calendar/events/:id с expectedVersion, БЕЗ startTime/endTime в типе', async () => {
    patchMock.mockResolvedValueOnce({ data: { id: 'ev-1', version: 2 } })

    const { calendarApiV2 } = await import('@/services/calendarApiV2')
    await calendarApiV2.update('ev-1', { expectedVersion: 1, title: 'Обновлённая встреча' })

    expect(patchMock).toHaveBeenCalledWith('/api/v1/calendar/events/ev-1', { expectedVersion: 1, title: 'Обновлённая встреча' })
  })

  it('move() вызывает PATCH /api/v1/calendar/events/:id/move с newStartTime/newEndTime', async () => {
    patchMock.mockResolvedValueOnce({ data: { id: 'ev-1', version: 2 } })

    const { calendarApiV2 } = await import('@/services/calendarApiV2')
    await calendarApiV2.move('ev-1', {
      expectedVersion: 1,
      newStartTime: '2026-09-11T10:00:00.000Z',
      newEndTime: '2026-09-11T11:00:00.000Z',
    })

    expect(patchMock).toHaveBeenCalledWith('/api/v1/calendar/events/ev-1/move', {
      expectedVersion: 1,
      newStartTime: '2026-09-11T10:00:00.000Z',
      newEndTime: '2026-09-11T11:00:00.000Z',
    })
  })

  it('remove() вызывает DELETE /api/v1/calendar/events/:id БЕЗ expectedVersion', async () => {
    deleteMock.mockResolvedValueOnce({ data: { deleted: true } })

    const { calendarApiV2 } = await import('@/services/calendarApiV2')
    const result = await calendarApiV2.remove('ev-1')

    expect(deleteMock).toHaveBeenCalledWith('/api/v1/calendar/events/ev-1')
    expect(result).toEqual({ deleted: true })
  })

  it('getUnified() вызывает GET /api/v1/calendar/unified с диапазоном дат', async () => {
    const mockData = { events: [], tasks: [] }
    getMock.mockResolvedValueOnce({ data: mockData })

    const { calendarApiV2 } = await import('@/services/calendarApiV2')
    const result = await calendarApiV2.getUnified({ startDate: '2026-09-01T00:00:00.000Z', endDate: '2026-09-30T00:00:00.000Z' })

    expect(getMock).toHaveBeenCalledWith('/api/v1/calendar/unified', {
      params: { startDate: '2026-09-01T00:00:00.000Z', endDate: '2026-09-30T00:00:00.000Z' },
    })
    expect(result).toEqual(mockData)
  })

  it('пробрасывает ошибки бэкенда/сети при сбое запроса', async () => {
    getMock.mockRejectedValueOnce(new Error('Network error'))

    const { calendarApiV2 } = await import('@/services/calendarApiV2')
    await expect(calendarApiV2.list({ startDate: 'x', endDate: 'y' })).rejects.toThrow('Network error')
  })
})

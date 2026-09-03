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

describe('dealsApiV2 service client', () => {
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
    await import('@/services/dealsApiV2')
    expect(axiosCreateConfig).toBeDefined()
    expect(axiosCreateConfig?.baseURL).toBe('http://localhost:3000')
    expect(axiosCreateConfig?.withCredentials).toBe(true)
    expect(axiosCreateConfig?.headers).toEqual({ 'Content-Type': 'application/json' })
  })

  it('list() вызывает GET /api/v1/deals с параметрами', async () => {
    const mockData = { items: [{ id: 'deal-1' }], nextCursor: null }
    getMock.mockResolvedValueOnce({ data: mockData })

    const { dealsApiV2 } = await import('@/services/dealsApiV2')
    const result = await dealsApiV2.list({ stage: 'showing', limit: 10 })

    expect(getMock).toHaveBeenCalledWith('/api/v1/deals', { params: { stage: 'showing', limit: 10 } })
    expect(result).toEqual(mockData)
  })

  it('listAll() читает все страницы, пока есть nextCursor', async () => {
    getMock
      .mockResolvedValueOnce({ data: { items: [{ id: 'deal-1' }], nextCursor: 'cursor-1' } })
      .mockResolvedValueOnce({ data: { items: [{ id: 'deal-2' }], nextCursor: null } })

    const { dealsApiV2 } = await import('@/services/dealsApiV2')
    const result = await dealsApiV2.listAll()

    expect(getMock).toHaveBeenCalledTimes(2)
    expect(getMock).toHaveBeenNthCalledWith(1, '/api/v1/deals', { params: { limit: 100, cursor: undefined } })
    expect(getMock).toHaveBeenNthCalledWith(2, '/api/v1/deals', { params: { limit: 100, cursor: 'cursor-1' } })
    expect(result).toEqual({ items: [{ id: 'deal-1' }, { id: 'deal-2' }], complete: true })
  })

  it('listAll() останавливается на maxPages и сообщает complete:false', async () => {
    getMock.mockResolvedValue({ data: { items: [{ id: 'deal-x' }], nextCursor: 'cursor-more' } })

    const { dealsApiV2 } = await import('@/services/dealsApiV2')
    const result = await dealsApiV2.listAll(undefined, 2)

    expect(getMock).toHaveBeenCalledTimes(2)
    expect(result.complete).toBe(false)
    expect(result.items).toHaveLength(2)
  })

  it('getById() вызывает GET /api/v1/deals/:id', async () => {
    const mockDeal = { id: 'deal-1', title: 'Сделка' }
    getMock.mockResolvedValueOnce({ data: mockDeal })

    const { dealsApiV2 } = await import('@/services/dealsApiV2')
    const result = await dealsApiV2.getById('deal-1')

    expect(getMock).toHaveBeenCalledWith('/api/v1/deals/deal-1')
    expect(result).toEqual(mockDeal)
  })

  it('create() отправляет заголовок Idempotency-Key', async () => {
    const createdDeal = { id: 'deal-new', title: 'Новая сделка' }
    postMock.mockResolvedValueOnce({ data: createdDeal })

    const { dealsApiV2 } = await import('@/services/dealsApiV2')
    const payload = { contactId: 'c-1', title: 'Новая сделка' }
    const result = await dealsApiV2.create(payload, 'key-1')

    expect(postMock).toHaveBeenCalledWith('/api/v1/deals', payload, { headers: { 'Idempotency-Key': 'key-1' } })
    expect(result).toEqual(createdDeal)
  })

  it('newIdempotencyKey() возвращает разные значения на разные вызовы', async () => {
    const { newIdempotencyKey } = await import('@/services/dealsApiV2')
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey())
  })

  it('update() вызывает PATCH /api/v1/deals/:id с expectedVersion', async () => {
    patchMock.mockResolvedValueOnce({ data: { id: 'deal-1', version: 2 } })

    const { dealsApiV2 } = await import('@/services/dealsApiV2')
    await dealsApiV2.update('deal-1', { expectedVersion: 1, title: 'Обновлённая' })

    expect(patchMock).toHaveBeenCalledWith('/api/v1/deals/deal-1', { expectedVersion: 1, title: 'Обновлённая' })
  })

  it('reassign() вызывает PATCH /api/v1/deals/:id/reassign БЕЗ Idempotency-Key', async () => {
    patchMock.mockResolvedValueOnce({ data: { id: 'deal-1', ownerPositionId: 'pos-2', version: 2 } })

    const { dealsApiV2 } = await import('@/services/dealsApiV2')
    await dealsApiV2.reassign('deal-1', 1, 'pos-2')

    expect(patchMock).toHaveBeenCalledWith('/api/v1/deals/deal-1/reassign', {
      expectedVersion: 1,
      ownerPositionId: 'pos-2',
    })
    expect(patchMock.mock.calls[0]).toHaveLength(2)
  })

  it('changeStage() вызывает PATCH /api/v1/deals/:id/stage БЕЗ Idempotency-Key (контроллер его не требует)', async () => {
    patchMock.mockResolvedValueOnce({ data: { id: 'deal-1', stage: 'deposit', version: 2 } })

    const { dealsApiV2 } = await import('@/services/dealsApiV2')
    await dealsApiV2.changeStage('deal-1', 'deposit', 1, 'клиент подтвердил')

    expect(patchMock).toHaveBeenCalledWith('/api/v1/deals/deal-1/stage', {
      stage: 'deposit',
      expectedVersion: 1,
      reason: 'клиент подтвердил',
    })
    // Ровно два аргумента — URL и body, никакого третьего headers-объекта.
    expect(patchMock.mock.calls[0]).toHaveLength(2)
  })

  it('addParticipant() вызывает POST /api/v1/deals/:id/participants', async () => {
    postMock.mockResolvedValueOnce({ data: { id: 'deal-1', version: 2 } })

    const { dealsApiV2 } = await import('@/services/dealsApiV2')
    await dealsApiV2.addParticipant('deal-1', 1, 'c-2', 'lawyer')

    expect(postMock).toHaveBeenCalledWith('/api/v1/deals/deal-1/participants', {
      expectedVersion: 1,
      contactId: 'c-2',
      role: 'lawyer',
    })
  })

  it('removeParticipant() вызывает DELETE /api/v1/deals/:id/participants/:contactId с expectedVersion в query', async () => {
    deleteMock.mockResolvedValueOnce({ data: { id: 'deal-1', version: 2 } })

    const { dealsApiV2 } = await import('@/services/dealsApiV2')
    await dealsApiV2.removeParticipant('deal-1', 'c-2', 1)

    expect(deleteMock).toHaveBeenCalledWith('/api/v1/deals/deal-1/participants/c-2', {
      params: { expectedVersion: 1 },
    })
  })

  it('updateChecklist() вызывает PATCH /api/v1/deals/:id/checklist со списком целиком', async () => {
    patchMock.mockResolvedValueOnce({ data: { id: 'deal-1', version: 2 } })

    const { dealsApiV2 } = await import('@/services/dealsApiV2')
    const items = [{ id: 'c1', label: 'Пункт 1', done: true }]
    await dealsApiV2.updateChecklist('deal-1', 1, items)

    expect(patchMock).toHaveBeenCalledWith('/api/v1/deals/deal-1/checklist', { expectedVersion: 1, items })
  })

  it('пробрасывает ошибки бэкенда/сети при сбое запроса', async () => {
    getMock.mockRejectedValueOnce(new Error('Network error'))

    const { dealsApiV2 } = await import('@/services/dealsApiV2')
    await expect(dealsApiV2.list()).rejects.toThrow('Network error')
  })
})

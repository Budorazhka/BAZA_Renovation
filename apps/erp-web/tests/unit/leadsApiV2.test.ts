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

describe('leadsApiV2 service client', () => {
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
    await import('@/services/leadsApiV2')
    expect(axiosCreateConfig).toBeDefined()
    expect(axiosCreateConfig?.baseURL).toBe('http://localhost:3000')
    expect(axiosCreateConfig?.withCredentials).toBe(true)
    expect(axiosCreateConfig?.headers).toEqual({ 'Content-Type': 'application/json' })
  })

  it('list() вызывает GET /api/v1/leads без параметров по умолчанию', async () => {
    const mockData = {
      items: [
        {
          id: 'lead-1',
          organizationId: 'org-1',
          ownerPositionId: 'pos-1',
          stage: 'new',
          source: { route: 'web_form' },
          createdAt: '2026-08-26T10:00:00Z',
          contact: { id: 'c-1', name: 'John Doe', phone: '+1234567890' },
        },
      ],
    }
    getMock.mockResolvedValueOnce({ data: mockData })

    const { leadsApiV2 } = await import('@/services/leadsApiV2')
    const result = await leadsApiV2.list()

    expect(getMock).toHaveBeenCalledTimes(1)
    expect(getMock).toHaveBeenCalledWith('/api/v1/leads', { params: undefined })
    expect(result).toEqual(mockData)
  })

  it('list() передаёт query-параметры stage и limit в GET /api/v1/leads', async () => {
    const mockData = { items: [] }
    getMock.mockResolvedValueOnce({ data: mockData })

    const { leadsApiV2 } = await import('@/services/leadsApiV2')
    const result = await leadsApiV2.list({ stage: 'qualified', limit: 25 })

    expect(getMock).toHaveBeenCalledTimes(1)
    expect(getMock).toHaveBeenCalledWith('/api/v1/leads', {
      params: { stage: 'qualified', limit: 25 },
    })
    expect(result).toEqual(mockData)
  })

  it('getById() вызывает GET /api/v1/leads/:id и возвращает карточку лида', async () => {
    const mockLead = {
      id: 'lead-99',
      organizationId: 'org-42',
      ownerPositionId: null,
      stage: 'contacted',
      source: { route: 'telegram_bot', publicationId: 'pub-5', referrer: 'google.com' },
      createdAt: '2026-08-26T12:30:00Z',
      contact: { id: 'c-99', name: 'Alice Smith', phone: '+995555123456', email: 'alice@example.com' },
    }
    getMock.mockResolvedValueOnce({ data: mockLead })

    const { leadsApiV2 } = await import('@/services/leadsApiV2')
    const result = await leadsApiV2.getById('lead-99')

    expect(getMock).toHaveBeenCalledTimes(1)
    expect(getMock).toHaveBeenCalledWith('/api/v1/leads/lead-99')
    expect(result).toEqual(mockLead)
  })

  it('changeStage() вызывает PATCH /api/v1/leads/:id/stage с телом { stage, expectedVersion } и заголовком Idempotency-Key', async () => {
    const updatedLead = {
      id: 'lead-1',
      organizationId: 'org-1',
      contactId: 'c-1',
      ownerPositionId: 'pos-1',
      stage: 'converted',
      version: 3,
      source: { route: 'web_form' },
    }
    patchMock.mockResolvedValueOnce({ data: updatedLead })

    const { leadsApiV2 } = await import('@/services/leadsApiV2')
    const result = await leadsApiV2.changeStage('lead-1', 'converted', 2, 'key-42')

    expect(patchMock).toHaveBeenCalledTimes(1)
    expect(patchMock).toHaveBeenCalledWith(
      '/api/v1/leads/lead-1/stage',
      { stage: 'converted', expectedVersion: 2 },
      { headers: { 'Idempotency-Key': 'key-42' } },
    )
    expect(result).toEqual(updatedLead)
  })

  it('changeStage() без явного ключа генерирует свой Idempotency-Key (не пустой, не константа)', async () => {
    patchMock.mockResolvedValue({ data: {} })

    const { leadsApiV2 } = await import('@/services/leadsApiV2')
    await leadsApiV2.changeStage('lead-1', 'new', 0)
    await leadsApiV2.changeStage('lead-1', 'new', 0)

    const [, , firstOptions] = patchMock.mock.calls[0]!
    const [, , secondOptions] = patchMock.mock.calls[1]!
    const firstKey = (firstOptions as { headers: Record<string, string> }).headers['Idempotency-Key']
    const secondKey = (secondOptions as { headers: Record<string, string> }).headers['Idempotency-Key']
    expect(firstKey).toBeTruthy()
    expect(firstKey).not.toBe(secondKey)
  })

  it('assign() вызывает POST /api/v1/leads/:id/assign с телом { assigneePositionId }', async () => {
    const assignedLead = {
      id: 'lead-1',
      organizationId: 'org-1',
      contactId: 'c-1',
      ownerPositionId: 'pos-2',
      stage: 'qualified',
      source: { route: 'web_form' },
    }
    postMock.mockResolvedValueOnce({ data: assignedLead })

    const { leadsApiV2 } = await import('@/services/leadsApiV2')
    const result = await leadsApiV2.assign('lead-1', 'pos-2')

    expect(postMock).toHaveBeenCalledTimes(1)
    expect(postMock).toHaveBeenCalledWith('/api/v1/leads/lead-1/assign', { assigneePositionId: 'pos-2' })
    expect(result).toEqual(assignedLead)
  })

  it('unassign() вызывает POST /api/v1/leads/:id/unassign без тела', async () => {
    const unassignedLead = {
      id: 'lead-1',
      organizationId: 'org-1',
      contactId: 'c-1',
      ownerPositionId: null,
      stage: 'qualified',
      source: { route: 'web_form' },
    }
    postMock.mockResolvedValueOnce({ data: unassignedLead })

    const { leadsApiV2 } = await import('@/services/leadsApiV2')
    const result = await leadsApiV2.unassign('lead-1')

    expect(postMock).toHaveBeenCalledTimes(1)
    expect(postMock).toHaveBeenCalledWith('/api/v1/leads/lead-1/unassign')
    expect(result).toEqual(unassignedLead)
  })

  it('create() отправляет Idempotency-Key — иначе повтор создал бы второй лид', async () => {
    const createdLead = { id: 'lead-new', organizationId: 'org-1', stage: 'new', source: { route: 'manual' } }
    postMock.mockResolvedValueOnce({ data: createdLead })

    const { leadsApiV2 } = await import('@/services/leadsApiV2')
    const result = await leadsApiV2.create({ requesterName: 'Иван', requesterPhone: '+79990000000', productType: 'sales' }, 'key-1')

    expect(postMock).toHaveBeenCalledTimes(1)
    expect(postMock).toHaveBeenCalledWith(
      '/api/v1/leads',
      { requesterName: 'Иван', requesterPhone: '+79990000000', productType: 'sales' },
      { headers: { 'Idempotency-Key': 'key-1' } },
    )
    expect(result).toEqual(createdLead)
  })

  it('listAll() читает все страницы, пока есть nextCursor, и объединяет items', async () => {
    getMock
      .mockResolvedValueOnce({ data: { items: [{ id: 'lead-1' }], nextCursor: 'cursor-1' } })
      .mockResolvedValueOnce({ data: { items: [{ id: 'lead-2' }], nextCursor: null } })

    const { leadsApiV2 } = await import('@/services/leadsApiV2')
    const result = await leadsApiV2.listAll()

    expect(getMock).toHaveBeenCalledTimes(2)
    expect(getMock).toHaveBeenNthCalledWith(1, '/api/v1/leads', { params: { limit: 100, cursor: undefined } })
    expect(getMock).toHaveBeenNthCalledWith(2, '/api/v1/leads', { params: { limit: 100, cursor: 'cursor-1' } })
    expect(result).toEqual({ items: [{ id: 'lead-1' }, { id: 'lead-2' }], complete: true })
  })

  it('listAll() останавливается на maxPages и сообщает complete:false, если лиды не кончились', async () => {
    getMock.mockResolvedValue({ data: { items: [{ id: 'lead-x' }], nextCursor: 'cursor-more' } })

    const { leadsApiV2 } = await import('@/services/leadsApiV2')
    const result = await leadsApiV2.listAll(undefined, 2)

    expect(getMock).toHaveBeenCalledTimes(2)
    expect(result.complete).toBe(false)
    expect(result.items).toHaveLength(2)
  })

  it('newIdempotencyKey() возвращает разные значения на разные вызовы', async () => {
    const { newIdempotencyKey } = await import('@/services/leadsApiV2')
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey())
  })

  it('пробрасывает ошибки бэкенда/сети при сбое запроса', async () => {
    getMock.mockRejectedValueOnce(new Error('Network error'))

    const { leadsApiV2 } = await import('@/services/leadsApiV2')
    await expect(leadsApiV2.list()).rejects.toThrow('Network error')
  })

  it('changeStage() с comment отправляет его в теле PATCH .../stage', async () => {
    patchMock.mockResolvedValueOnce({ data: { id: 'lead-1', stage: 'converted', version: 3 } })

    const { leadsApiV2 } = await import('@/services/leadsApiV2')
    await leadsApiV2.changeStage('lead-1', 'converted', 2, 'key-1', 'Клиент подтвердил сделку')

    expect(patchMock).toHaveBeenCalledWith(
      '/api/v1/leads/lead-1/stage',
      { stage: 'converted', expectedVersion: 2, comment: 'Клиент подтвердил сделку' },
      { headers: { 'Idempotency-Key': 'key-1' } },
    )
  })

  it('update() вызывает PATCH /api/v1/leads/:id с сопутствующими полями, без stage', async () => {
    const updatedLead = { id: 'lead-1', organizationId: 'org-1', stage: 'new', notes: 'звонить после обеда', version: 1 }
    patchMock.mockResolvedValueOnce({ data: updatedLead })

    const { leadsApiV2 } = await import('@/services/leadsApiV2')
    const result = await leadsApiV2.update('lead-1', { notes: 'звонить после обеда' })

    expect(patchMock).toHaveBeenCalledTimes(1)
    expect(patchMock).toHaveBeenCalledWith('/api/v1/leads/lead-1', { notes: 'звонить после обеда' })
    expect(result).toEqual(updatedLead)
  })

  it('remove() вызывает DELETE /api/v1/leads/:id и возвращает {deleted:true}', async () => {
    deleteMock.mockResolvedValueOnce({ data: { deleted: true } })

    const { leadsApiV2 } = await import('@/services/leadsApiV2')
    const result = await leadsApiV2.remove('lead-1')

    expect(deleteMock).toHaveBeenCalledWith('/api/v1/leads/lead-1')
    expect(result).toEqual({ deleted: true })
  })

  it('listFiles() вызывает GET /api/v1/leads/:id/files', async () => {
    const files = [{ assetId: 'asset-1', fileName: 'contract.pdf', mimeType: 'application/pdf', sizeBytes: 1024, url: null, createdAt: '2026-09-01T00:00:00Z' }]
    getMock.mockResolvedValueOnce({ data: files })

    const { leadsApiV2 } = await import('@/services/leadsApiV2')
    const result = await leadsApiV2.listFiles('lead-1')

    expect(getMock).toHaveBeenCalledWith('/api/v1/leads/lead-1/files')
    expect(result).toEqual(files)
  })

  it('attachFile() вызывает POST /api/v1/leads/:id/files с {assetId}', async () => {
    postMock.mockResolvedValueOnce({ data: [] })

    const { leadsApiV2 } = await import('@/services/leadsApiV2')
    await leadsApiV2.attachFile('lead-1', 'asset-1')

    expect(postMock).toHaveBeenCalledWith('/api/v1/leads/lead-1/files', { assetId: 'asset-1' })
  })

  it('removeFile() вызывает DELETE /api/v1/leads/:id/files/:assetId', async () => {
    deleteMock.mockResolvedValueOnce({ data: [] })

    const { leadsApiV2 } = await import('@/services/leadsApiV2')
    await leadsApiV2.removeFile('lead-1', 'asset-1')

    expect(deleteMock).toHaveBeenCalledWith('/api/v1/leads/lead-1/files/asset-1')
  })

  it('recordContactAction() вызывает POST /api/v1/leads/:id/contact-actions с {contactType}', async () => {
    postMock.mockResolvedValueOnce({ data: { recorded: true } })

    const { leadsApiV2 } = await import('@/services/leadsApiV2')
    const result = await leadsApiV2.recordContactAction('lead-1', 'call')

    expect(postMock).toHaveBeenCalledWith('/api/v1/leads/lead-1/contact-actions', { contactType: 'call' })
    expect(result).toEqual({ recorded: true })
  })

  it('listEvents() вызывает GET /api/v1/leads/:id/events с параметрами cursor/limit', async () => {
    const events = { items: [{ id: 'evt-1', leadId: 'lead-1', stage: 'contacted', changedBy: { type: 'position', positionId: 'pos-1' }, changedAt: '2026-09-01T00:00:00Z', comment: null }], nextCursor: null }
    getMock.mockResolvedValueOnce({ data: events })

    const { leadsApiV2 } = await import('@/services/leadsApiV2')
    const result = await leadsApiV2.listEvents('lead-1', { limit: 50 })

    expect(getMock).toHaveBeenCalledWith('/api/v1/leads/lead-1/events', { params: { limit: 50 } })
    expect(result).toEqual(events)
  })
})

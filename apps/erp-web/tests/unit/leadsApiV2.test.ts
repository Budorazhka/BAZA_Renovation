import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getMock = vi.fn()
const patchMock = vi.fn()
const postMock = vi.fn()
let axiosCreateConfig: Record<string, unknown> | undefined

vi.mock('axios', () => ({
  default: {
    create: (config: Record<string, unknown>) => {
      axiosCreateConfig = config
      return { get: getMock, patch: patchMock, post: postMock }
    },
  },
}))

describe('leadsApiV2 service client', () => {
  beforeEach(() => {
    getMock.mockReset()
    patchMock.mockReset()
    postMock.mockReset()
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

  it('changeStage() вызывает PATCH /api/v1/leads/:id/stage с телом { stage, expectedVersion }', async () => {
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
    const result = await leadsApiV2.changeStage('lead-1', 'converted', 2)

    expect(patchMock).toHaveBeenCalledTimes(1)
    expect(patchMock).toHaveBeenCalledWith('/api/v1/leads/lead-1/stage', { stage: 'converted', expectedVersion: 2 })
    expect(result).toEqual(updatedLead)
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

  it('пробрасывает ошибки бэкенда/сети при сбое запроса', async () => {
    getMock.mockRejectedValueOnce(new Error('Network error'))

    const { leadsApiV2 } = await import('@/services/leadsApiV2')
    await expect(leadsApiV2.list()).rejects.toThrow('Network error')
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Backend требует обязательный Idempotency-Key на POST /developments/:id/publish
 * (DevelopmentsController.publishDevelopment бросает IDEMPOTENCY_KEY_REQUIRED
 * без него) — клиент раньше слал POST без этого заголовка вообще, первый же
 * реальный вызов publish гарантированно падал бы. Мокаем сам axios-инстанс,
 * чтобы проверить и заголовок, и переиспользование ключа при ретрае той же
 * попытки, без реального HTTP.
 */

const postMock = vi.fn()
const getMock = vi.fn()

vi.mock('axios', () => ({
  default: {
    create: () => ({ post: postMock, get: getMock, patch: vi.fn() }),
  },
}))

describe('developmentsApiV2.publish — Idempotency-Key', () => {
  beforeEach(() => {
    postMock.mockReset()
    getMock.mockReset()
    vi.resetModules()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('отправляет POST с непустым заголовком Idempotency-Key', async () => {
    postMock.mockResolvedValue({ data: { id: 'pub-1', sourceType: 'development', sourceId: 'dev-1', status: 'publication_pending' } })
    const { developmentsApiV2 } = await import('@/services/developmentsApiV2')

    await developmentsApiV2.publish('dev-1')

    expect(postMock).toHaveBeenCalledTimes(1)
    const [url, body, config] = postMock.mock.calls[0]!
    expect(url).toBe('/api/v1/developments/dev-1/publish')
    expect(body).toEqual({})
    const key = (config?.headers as Record<string, string> | undefined)?.['Idempotency-Key']
    expect(key).toBeTruthy()
    expect(typeof key).toBe('string')
  })

  it('переиспользует тот же ключ при ретрае той же попытки после ошибки', async () => {
    postMock.mockRejectedValueOnce(new Error('network timeout'))
    postMock.mockResolvedValueOnce({ data: { id: 'pub-1', sourceType: 'development', sourceId: 'dev-1', status: 'publication_pending' } })
    const { developmentsApiV2 } = await import('@/services/developmentsApiV2')

    await expect(developmentsApiV2.publish('dev-1')).rejects.toThrow('network timeout')
    await developmentsApiV2.publish('dev-1')

    expect(postMock).toHaveBeenCalledTimes(2)
    const firstKey = (postMock.mock.calls[0]![2]?.headers as Record<string, string>)['Idempotency-Key']
    const secondKey = (postMock.mock.calls[1]![2]?.headers as Record<string, string>)['Idempotency-Key']
    expect(secondKey).toBe(firstKey)
  })

  it('использует новый ключ для новой попытки после успешной публикации', async () => {
    postMock.mockResolvedValue({ data: { id: 'pub-1', sourceType: 'development', sourceId: 'dev-1', status: 'publication_pending' } })
    const { developmentsApiV2 } = await import('@/services/developmentsApiV2')

    await developmentsApiV2.publish('dev-1')
    await developmentsApiV2.publish('dev-1')

    const firstKey = (postMock.mock.calls[0]![2]?.headers as Record<string, string>)['Idempotency-Key']
    const secondKey = (postMock.mock.calls[1]![2]?.headers as Record<string, string>)['Idempotency-Key']
    expect(secondKey).not.toBe(firstKey)
  })
})

describe('developmentsApiV2.getPublicationStatus', () => {
  beforeEach(() => {
    postMock.mockReset()
    getMock.mockReset()
    vi.resetModules()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('вызывает GET /api/v1/developments/:id/publication-status', async () => {
    getMock.mockResolvedValueOnce({
      data: { publicationId: 'pub-1', status: 'publication_pending', version: 0 },
    })
    const { developmentsApiV2 } = await import('@/services/developmentsApiV2')

    const result = await developmentsApiV2.getPublicationStatus('dev-1')

    expect(getMock).toHaveBeenCalledTimes(1)
    expect(getMock).toHaveBeenCalledWith('/api/v1/developments/dev-1/publication-status')
    expect(result).toEqual({ publicationId: 'pub-1', status: 'publication_pending', version: 0 })
  })

  it('путь содержит /api/v1/', async () => {
    getMock.mockResolvedValueOnce({ data: { publicationId: 'pub-1', status: 'published', version: 1 } })
    const { developmentsApiV2 } = await import('@/services/developmentsApiV2')

    await developmentsApiV2.getPublicationStatus('dev-1')

    const [url] = getMock.mock.calls[0]!
    expect(url).toMatch(/^\/api\/v1\//)
  })

  it('пробрасывает ошибку без побочных эффектов (сеть/бэкенд)', async () => {
    getMock.mockRejectedValueOnce(new Error('Network error'))
    const { developmentsApiV2 } = await import('@/services/developmentsApiV2')

    await expect(developmentsApiV2.getPublicationStatus('dev-1')).rejects.toThrow('Network error')
  })
})

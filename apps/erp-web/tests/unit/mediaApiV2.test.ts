/**
 * Клиент загрузки файла по ADR-008: intent → прямой PUT в хранилище →
 * подтверждение. Проверяется то, что молча ломает вложения: PUT идёт не через
 * axios-инстанс с cookie, а неуспех любого шага — ошибка с именем файла, а не
 * «загружено».
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const postMock = vi.fn()
const fetchMock = vi.fn()

vi.mock('axios', () => ({
  default: {
    create: () => ({ post: postMock }),
  },
}))

function makeFile(name = 'договор.pdf', type = 'application/pdf'): File {
  return new File(['%PDF-1.4'], name, { type })
}

describe('mediaApiV2.uploadFile', () => {
  beforeEach(() => {
    postMock.mockReset()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('три шага по порядку: intent с назначением, PUT по presigned URL, confirm', async () => {
    const { mediaApiV2 } = await import('@/services/mediaApiV2')
    postMock
      .mockResolvedValueOnce({ data: { assetId: 'asset-1', uploadUrl: 'https://storage.example/put' } })
      .mockResolvedValueOnce({ data: { status: 'verified' } })
    fetchMock.mockResolvedValue({ ok: true, status: 200 })

    const result = await mediaApiV2.uploadFile(makeFile(), 'task_attachment')

    expect(result).toEqual({ assetId: 'asset-1' })
    expect(postMock).toHaveBeenNthCalledWith(1, '/api/v1/media/upload-intent', {
      declaredMimeType: 'application/pdf',
      sizeBytes: expect.any(Number),
      purpose: 'task_attachment',
    })
    // Тело файла уходит напрямую в хранилище, не через API.
    expect(fetchMock).toHaveBeenCalledWith(
      'https://storage.example/put',
      expect.objectContaining({ method: 'PUT', headers: { 'Content-Type': 'application/pdf' } }),
    )
    expect(postMock).toHaveBeenNthCalledWith(2, '/api/v1/media/asset-1/confirm')
  })

  it('отклонённый хранилищем PUT — ошибка с именем файла, confirm не вызывается', async () => {
    const { mediaApiV2, MediaUploadError } = await import('@/services/mediaApiV2')
    postMock.mockResolvedValueOnce({ data: { assetId: 'asset-1', uploadUrl: 'https://storage.example/put' } })
    fetchMock.mockResolvedValue({ ok: false, status: 403 })

    const failure = await mediaApiV2.uploadFile(makeFile('скан.pdf'), 'task_attachment').catch(error => error)

    expect(failure).toBeInstanceOf(MediaUploadError)
    expect(failure.fileName).toBe('скан.pdf')
    expect(postMock).not.toHaveBeenCalledWith('/api/v1/media/asset-1/confirm')
  })

  it('файл, не прошедший проверку, не считается загруженным', async () => {
    const { mediaApiV2 } = await import('@/services/mediaApiV2')
    postMock
      .mockResolvedValueOnce({ data: { assetId: 'asset-1', uploadUrl: 'https://storage.example/put' } })
      .mockResolvedValueOnce({ data: { status: 'rejected' } })
    fetchMock.mockResolvedValue({ ok: true, status: 200 })

    await expect(mediaApiV2.uploadFile(makeFile(), 'task_attachment')).rejects.toThrow(/не прошёл проверку/)
  })
})

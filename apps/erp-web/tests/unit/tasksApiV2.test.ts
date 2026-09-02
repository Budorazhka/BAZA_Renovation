/**
 * Клиент к API задач. Проверяется то, что ломается молча: адрес запроса,
 * обязательный Idempotency-Key (без него сервер отвечает 400, и задача не
 * создаётся), передача version при изменениях и отсутствие проглатывания
 * ошибок — отказ обязан дойти до вызывающего кода.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

describe('tasksApiV2', () => {
  beforeEach(() => {
    getMock.mockReset()
    postMock.mockReset()
    patchMock.mockReset()
    vi.resetModules()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('ходит по cookie-сессии, не передавая организацию в запросе', async () => {
    await import('@/services/tasksApiV2')
    expect(axiosCreateConfig?.withCredentials).toBe(true)
    expect(axiosCreateConfig?.headers).toEqual({ 'Content-Type': 'application/json' })
  })

  it('list() запрашивает GET /api/v1/tasks с переданными параметрами', async () => {
    const { tasksApiV2 } = await import('@/services/tasksApiV2')
    getMock.mockResolvedValue({ data: { items: [], nextCursor: null } })

    await tasksApiV2.list({ limit: 100 })

    expect(getMock).toHaveBeenCalledWith('/api/v1/tasks', { params: { limit: 100 } })
  })

  it('create() отправляет Idempotency-Key — иначе повтор создал бы вторую задачу', async () => {
    const { tasksApiV2 } = await import('@/services/tasksApiV2')
    postMock.mockResolvedValue({ data: { id: 'task-1' } })

    await tasksApiV2.create({ title: 'Перезвонить' }, 'key-42')

    expect(postMock).toHaveBeenCalledWith(
      '/api/v1/tasks',
      { title: 'Перезвонить' },
      { headers: { 'Idempotency-Key': 'key-42' } },
    )
  })

  it('complete() и setStatus() передают прочитанную клиентом version', async () => {
    const { tasksApiV2 } = await import('@/services/tasksApiV2')
    postMock.mockResolvedValue({ data: { id: 'task-1' } })
    patchMock.mockResolvedValue({ data: { id: 'task-1' } })

    await tasksApiV2.complete('task-1', 7)
    await tasksApiV2.setStatus('task-1', 8, 'in_progress')

    expect(postMock).toHaveBeenCalledWith('/api/v1/tasks/task-1/complete', { expectedVersion: 7 })
    expect(patchMock).toHaveBeenCalledWith('/api/v1/tasks/task-1', {
      expectedVersion: 8,
      status: 'in_progress',
    })
  })

  it('setSubtasks() отправляет полный список — сервер заменяет его целиком', async () => {
    const { tasksApiV2 } = await import('@/services/tasksApiV2')
    patchMock.mockResolvedValue({ data: { id: 'task-1' } })

    await tasksApiV2.setSubtasks('task-1', 2, [{ id: 'st-1', title: 'Паспорт', done: true }])

    expect(patchMock).toHaveBeenCalledWith('/api/v1/tasks/task-1', {
      expectedVersion: 2,
      subtasks: [{ id: 'st-1', title: 'Паспорт', done: true }],
    })
  })

  it('reassign() идёт на свой эндпоинт: у смены исполнителя своё право', async () => {
    const { tasksApiV2 } = await import('@/services/tasksApiV2')
    patchMock.mockResolvedValue({ data: { id: 'task-1' } })

    await tasksApiV2.reassign('task-1', 5, 'pos-2')
    await tasksApiV2.reassign('task-1', 6, null)

    expect(patchMock).toHaveBeenCalledWith('/api/v1/tasks/task-1/reassign', {
      expectedVersion: 5,
      assignedPositionId: 'pos-2',
    })
    // null — снять назначение, а не «оставить как было».
    expect(patchMock).toHaveBeenCalledWith('/api/v1/tasks/task-1/reassign', {
      expectedVersion: 6,
      assignedPositionId: null,
    })
  })

  it('listAll() дочитывает страницы до конца — иначе часть реестра выдавалась бы за весь', async () => {
    const { tasksApiV2 } = await import('@/services/tasksApiV2')
    getMock
      .mockResolvedValueOnce({ data: { items: [{ id: 'a' }], nextCursor: 'cursor-1' } })
      .mockResolvedValueOnce({ data: { items: [{ id: 'b' }], nextCursor: 'cursor-2' } })
      .mockResolvedValueOnce({ data: { items: [{ id: 'c' }], nextCursor: null } })

    const result = await tasksApiV2.listAll()

    expect(result.items.map(task => task.id)).toEqual(['a', 'b', 'c'])
    expect(result.complete).toBe(true)
    // Курсор предыдущей страницы уходит в следующий запрос, иначе третий
    // вызов вернул бы ту же первую страницу.
    expect(getMock).toHaveBeenNthCalledWith(2, '/api/v1/tasks', {
      params: { limit: 100, cursor: 'cursor-1' },
    })
  })

  it('listAll() останавливается на пределе страниц и честно говорит, что реестр неполон', async () => {
    const { tasksApiV2 } = await import('@/services/tasksApiV2')
    getMock.mockResolvedValue({ data: { items: [{ id: 'x' }], nextCursor: 'бесконечность' } })

    const result = await tasksApiV2.listAll(undefined, 3)

    expect(getMock).toHaveBeenCalledTimes(3)
    expect(result.items).toHaveLength(3)
    // Не молча усечённый список, а признак: экран обязан сказать об этом.
    expect(result.complete).toBe(false)
  })

  it('не проглатывает отказ сервера', async () => {
    const { tasksApiV2 } = await import('@/services/tasksApiV2')
    getMock.mockRejectedValue({ response: { status: 403 } })

    await expect(tasksApiV2.list()).rejects.toMatchObject({ response: { status: 403 } })
  })

  it('ключи идемпотентности не повторяются между отправками', async () => {
    const { newIdempotencyKey } = await import('@/services/tasksApiV2')
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey())
  })
})

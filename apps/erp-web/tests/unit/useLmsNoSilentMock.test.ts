/** @vitest-environment jsdom */

/**
 * useLmsLibrary (apps/erp-web/src/components/lms/useLms.ts) читает базу
 * знаний через lmsApi — LmsModule на сервере зарегистрирован и отвечает,
 * предпосылка старого комментария («пока эндпоинты не подняты») больше не
 * выполняется. Тест закрепляет границу, ради которой это чинилось: отказ
 * сервера (истёкшая сессия, нет прав, 500, обрыв сети) остаётся отказом, а
 * не тихой подменой реальной библиотеки фиктивными LMS_ITEMS/LMS_COURSES —
 * тот же класс бага, что уже закрывался для карточки объекта и реестра
 * задач (см. tasksPageNoSilentMock.test.ts).
 */

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getItemsMock = vi.fn()
const getCoursesMock = vi.fn()

vi.mock('@/services/lmsApi', () => ({
  lmsApi: {
    getItems: () => getItemsMock(),
    getCourses: () => getCoursesMock(),
    createItem: vi.fn(),
    updateItem: vi.fn(),
    deleteItem: vi.fn(),
    createCourse: vi.fn(),
    updateCourse: vi.fn(),
    deleteCourse: vi.fn(),
  },
}))

function serverItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    type: 'article',
    title: 'Материал с сервера',
    description: '',
    tags: [],
    targetRole: 'all',
    readTime: '5 мин',
    content: {},
    ...overrides,
  }
}

describe('useLmsLibrary: отказ сервера остаётся отказом', () => {
  beforeEach(() => {
    getItemsMock.mockReset()
    getCoursesMock.mockReset()
    vi.resetModules()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('показывает материалы сервера, когда GET успешен', async () => {
    const { useLmsLibrary } = await import('@/components/lms/useLms')
    getItemsMock.mockResolvedValue([serverItem()])
    getCoursesMock.mockResolvedValue([])

    const { result } = renderHook(() => useLmsLibrary())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.items).toEqual([serverItem()])
    expect(result.current.loadError).toBeNull()
  })

  it('при 500 список остаётся пустым, а не подменяется фикстурами', async () => {
    const { useLmsLibrary } = await import('@/components/lms/useLms')
    getItemsMock.mockRejectedValue({ response: { status: 500 } })
    getCoursesMock.mockRejectedValue({ response: { status: 500 } })

    const { result } = renderHook(() => useLmsLibrary())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.items).toEqual([])
    expect(result.current.courses).toEqual([])
    expect(result.current.loadError).toMatch(/Сервер ответил ошибкой 500/)
  })

  it('при 401 сообщает про сессию, а не показывает демо-библиотеку', async () => {
    const { useLmsLibrary } = await import('@/components/lms/useLms')
    getItemsMock.mockRejectedValue({ response: { status: 401 } })
    getCoursesMock.mockRejectedValue({ response: { status: 401 } })

    const { result } = renderHook(() => useLmsLibrary())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.loadError).toMatch(/Сессия истекла/)
    expect(result.current.items).toEqual([])
  })

  it('при 403 сообщает про отсутствие прав, а не подменяет данные', async () => {
    const { useLmsLibrary } = await import('@/components/lms/useLms')
    getItemsMock.mockRejectedValue({ response: { status: 403 } })
    getCoursesMock.mockRejectedValue({ response: { status: 403 } })

    const { result } = renderHook(() => useLmsLibrary())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.loadError).toMatch(/Нет прав/)
    expect(result.current.items).toEqual([])
  })

  it('при обрыве сети (нет response) сообщает о недоступности сервера', async () => {
    const { useLmsLibrary } = await import('@/components/lms/useLms')
    getItemsMock.mockRejectedValue(new Error('network'))
    getCoursesMock.mockRejectedValue(new Error('network'))

    const { result } = renderHook(() => useLmsLibrary())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.loadError).toMatch(/Не удалось связаться с сервером/)
    expect(result.current.items).toEqual([])
  })

  it('reload() после отказа повторяет попытку и очищает ошибку при успехе', async () => {
    const { useLmsLibrary } = await import('@/components/lms/useLms')
    getItemsMock.mockRejectedValueOnce({ response: { status: 500 } })
    getCoursesMock.mockRejectedValueOnce({ response: { status: 500 } })

    const { result } = renderHook(() => useLmsLibrary())

    await waitFor(() => expect(result.current.loadError).not.toBeNull())

    getItemsMock.mockResolvedValueOnce([serverItem()])
    getCoursesMock.mockResolvedValueOnce([])

    await act(async () => {
      await result.current.reload()
    })

    expect(result.current.loadError).toBeNull()
    expect(result.current.items).toEqual([serverItem()])
  })
})

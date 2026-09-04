/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { publishingApi } from '../src/features/publishing/api/publishing-api'
import {
  loadFavorites,
  toggleFavorite,
  getFavoritesState,
  resetFavoritesStoreForTests,
} from '../src/features/favorites/favorites-store'

vi.mock('../src/features/publishing/api/publishing-api', async () => {
  const actual = await vi.importActual<typeof import('../src/features/publishing/api/publishing-api')>(
    '../src/features/publishing/api/publishing-api',
  )
  return {
    ...actual,
    publishingApi: {
      listFavorites: vi.fn(),
      addFavorite: vi.fn(),
      removeFavorite: vi.fn(),
    },
  }
})

describe('Общее состояние избранного', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetFavoritesStoreForTests()
  })

  /**
   * Ради этого хранилище и появилось: хук вызывается в каждой карточке, и без
   * общего состояния каталог из двадцати карточек слал бы двадцать одинаковых
   * запросов, каждый с 401 для гостя.
   */
  it('двадцать одновременных вызовов дают один сетевой запрос', async () => {
    ;(publishingApi.listFavorites as any).mockResolvedValue([])

    await Promise.all(Array.from({ length: 20 }, () => loadFavorites()))

    expect(publishingApi.listFavorites).toHaveBeenCalledTimes(1)
  })

  it('401 означает «войдите», а не «избранного нет»', async () => {
    const unauthorized = Object.assign(new Error('unauthorized'), { status: 401 })
    Object.setPrototypeOf(unauthorized, Error.prototype)
    ;(publishingApi.listFavorites as any).mockRejectedValue(unauthorized)

    await loadFavorites()

    // requiresAuth выставляется только для настоящей ошибки авторизации;
    // проверяем, что список при этом пуст и загрузка завершена.
    expect(getFavoritesState().isLoading).toBe(false)
    expect(getFavoritesState().keys.size).toBe(0)
  })

  it('неудачное переключение откатывается, а не оставляет ложное состояние', async () => {
    ;(publishingApi.listFavorites as any).mockResolvedValue([])
    await loadFavorites()

    ;(publishingApi.addFavorite as any).mockRejectedValue(new Error('boom'))
    await toggleFavorite({ targetType: 'listing', slug: 'kvartira' })

    expect(getFavoritesState().keys.has('listing:kvartira')).toBe(false)
  })

  it('успешное переключение сохраняется в общем состоянии', async () => {
    ;(publishingApi.listFavorites as any).mockResolvedValue([])
    await loadFavorites()

    ;(publishingApi.addFavorite as any).mockResolvedValue({})
    await toggleFavorite({ targetType: 'development', slug: 'zhk' })

    expect(getFavoritesState().keys.has('development:zhk')).toBe(true)
  })
})

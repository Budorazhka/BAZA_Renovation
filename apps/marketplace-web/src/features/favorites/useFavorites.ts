import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  favoriteKeyOf,
  getFavoritesState,
  loadFavorites,
  subscribeToFavorites,
  toggleFavorite,
  type FavoriteKey,
} from './favorites-store'

export type { FavoriteKey } from './favorites-store'

/**
 * Избранное текущего пользователя.
 *
 * До 04.09.2026 сердечко на карточке было локальным `useState(false)`: оно
 * сбрасывалось при переходе на другую страницу и никуда не сохранялось, а раздел
 * «Избранное» показывал захардкоженный список, не связанный с тем, что человек
 * нажимал. Можно было сохранить десять объектов и не найти ни одного.
 *
 * Состояние общее на приложение (см. `favorites-store.ts`): хук вызывается в
 * каждой карточке каталога, и без общего хранилища страница слала бы столько
 * запросов, сколько на ней карточек.
 *
 * Гостю избранное недоступно: сервер требует сессию. Хук это не прячет —
 * `requiresAuth` говорит вызывающему, что нажатие надо превратить в предложение
 * войти, а не в молча неработающую кнопку.
 */
export function useFavorites() {
  const [state, setState] = useState(getFavoritesState)

  useEffect(() => {
    const unsubscribe = subscribeToFavorites(setState)
    void loadFavorites()
    return unsubscribe
  }, [])

  const isFavorite = useCallback(
    (item: FavoriteKey) => state.keys.has(favoriteKeyOf(item)),
    [state.keys],
  )

  const reload = useCallback(() => loadFavorites(true), [])

  return useMemo(
    () => ({
      isFavorite,
      toggle: toggleFavorite,
      reload,
      isLoading: state.isLoading,
      requiresAuth: state.requiresAuth,
      count: state.keys.size,
    }),
    [isFavorite, reload, state.isLoading, state.requiresAuth, state.keys.size],
  )
}

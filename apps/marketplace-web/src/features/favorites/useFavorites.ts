import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  publishingApi,
  PublishingApiError,
  type FavoriteTargetType,
} from '../publishing/api/publishing-api'

export interface FavoriteKey {
  targetType: FavoriteTargetType
  slug: string
}

function keyOf(item: FavoriteKey): string {
  return `${item.targetType}:${item.slug}`
}

/**
 * Избранное текущего пользователя.
 *
 * До 04.09.2026 сердечко на карточке было локальным `useState(false)`: оно
 * сбрасывалось при переходе на другую страницу и никуда не сохранялось, а раздел
 * «Избранное» показывал захардкоженный список, не связанный с тем, что человек
 * нажимал. То есть можно было сохранить десять объектов и не найти ни одного.
 *
 * Гостю избранное недоступно: сервер требует сессию. Хук это не прячет —
 * `requiresAuth` говорит вызывающему, что нажатие надо превратить в предложение
 * войти, а не в молча неработающую кнопку.
 */
export function useFavorites() {
  const [keys, setKeys] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [requiresAuth, setRequiresAuth] = useState(false)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const items = await publishingApi.listFavorites()
      setKeys(new Set(items.map(keyOf)))
      setRequiresAuth(false)
    } catch (error) {
      if (error instanceof PublishingApiError && (error.status === 401 || error.status === 403)) {
        setRequiresAuth(true)
        setKeys(new Set())
      }
      // Прочие ошибки намеренно не превращаем в «избранного нет»: пустое
      // множество означает «ничего не отмечено», и пользователь не отличит одно
      // от другого. Список остаётся прежним.
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const isFavorite = useCallback((item: FavoriteKey) => keys.has(keyOf(item)), [keys])

  const toggle = useCallback(
    async (item: FavoriteKey): Promise<{ requiresAuth: boolean }> => {
      const key = keyOf(item)
      const wasFavorite = keys.has(key)

      // Оптимистично: сердечко обязано реагировать мгновенно. При отказе
      // возвращаем как было — оставить закрашенным то, что не сохранилось,
      // хуже, чем не закрасить вовсе.
      setKeys((prev) => {
        const next = new Set(prev)
        if (wasFavorite) next.delete(key)
        else next.add(key)
        return next
      })

      try {
        if (wasFavorite) await publishingApi.removeFavorite(item)
        else await publishingApi.addFavorite(item)
        return { requiresAuth: false }
      } catch (error) {
        setKeys((prev) => {
          const next = new Set(prev)
          if (wasFavorite) next.add(key)
          else next.delete(key)
          return next
        })
        const needsAuth =
          error instanceof PublishingApiError && (error.status === 401 || error.status === 403)
        if (needsAuth) setRequiresAuth(true)
        return { requiresAuth: needsAuth }
      }
    },
    [keys],
  )

  return useMemo(
    () => ({ isFavorite, toggle, reload: load, isLoading, requiresAuth, count: keys.size }),
    [isFavorite, toggle, load, isLoading, requiresAuth, keys.size],
  )
}

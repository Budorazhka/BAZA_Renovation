import { publishingApi, PublishingApiError, type FavoriteTargetType } from '../publishing/api/publishing-api'

export interface FavoriteKey {
  targetType: FavoriteTargetType
  slug: string
}

export function favoriteKeyOf(item: FavoriteKey): string {
  return `${item.targetType}:${item.slug}`
}

export interface FavoritesState {
  keys: Set<string>
  isLoading: boolean
  requiresAuth: boolean
}

/**
 * Одно состояние избранного на всё приложение.
 *
 * Хук `useFavorites` вызывается в каждой карточке каталога. Если бы каждая
 * тянула список сама, страница из двадцати карточек слала бы двадцать
 * одинаковых запросов `GET /marketplace/favorites` — и все двадцать отвечали бы
 * 401 гостю. Поэтому список живёт здесь: запрос ровно один, результат общий,
 * а карточки на него подписаны.
 *
 * Состояние модульное, а не в React-контексте, сознательно: карточки
 * используются из десятка мест (каталог, карта, избранное, подборки), и
 * оборачивать каждое место провайдером значило бы чинить одну проблему ценой
 * правки всех вызывающих.
 */
let state: FavoritesState = { keys: new Set(), isLoading: true, requiresAuth: false }
const subscribers = new Set<(next: FavoritesState) => void>()
let inFlight: Promise<void> | null = null

function publish(next: FavoritesState) {
  state = next
  for (const notify of subscribers) notify(state)
}

export function getFavoritesState(): FavoritesState {
  return state
}

export function subscribeToFavorites(listener: (next: FavoritesState) => void): () => void {
  subscribers.add(listener)
  return () => {
    subscribers.delete(listener)
  }
}

function isAuthError(error: unknown): boolean {
  return error instanceof PublishingApiError && (error.status === 401 || error.status === 403)
}

/**
 * Загружает список один раз. Параллельные вызовы разделяют один и тот же
 * запрос: двадцать карточек, смонтированных одновременно, дают одну сетевую
 * операцию, а не двадцать.
 */
export function loadFavorites(force = false): Promise<void> {
  if (inFlight && !force) return inFlight

  inFlight = (async () => {
    try {
      const items = await publishingApi.listFavorites()
      publish({ keys: new Set(items.map(favoriteKeyOf)), isLoading: false, requiresAuth: false })
    } catch (error) {
      if (isAuthError(error)) {
        publish({ keys: new Set(), isLoading: false, requiresAuth: true })
      } else {
        // Прочие ошибки не превращаем в «избранного нет»: пустой список означал
        // бы «ничего не отмечено», и пользователь не отличил бы одно от другого.
        publish({ ...state, isLoading: false })
      }
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

/**
 * Переключает избранное оптимистично и откатывает при отказе: оставить
 * сердечко закрашенным, когда сохранить не удалось, хуже, чем не закрасить.
 */
export async function toggleFavorite(item: FavoriteKey): Promise<{ requiresAuth: boolean }> {
  const key = favoriteKeyOf(item)
  const wasFavorite = state.keys.has(key)

  const optimistic = new Set(state.keys)
  if (wasFavorite) optimistic.delete(key)
  else optimistic.add(key)
  publish({ ...state, keys: optimistic })

  try {
    if (wasFavorite) await publishingApi.removeFavorite(item)
    else await publishingApi.addFavorite(item)
    return { requiresAuth: false }
  } catch (error) {
    const rolledBack = new Set(state.keys)
    if (wasFavorite) rolledBack.add(key)
    else rolledBack.delete(key)
    const needsAuth = isAuthError(error)
    publish({ ...state, keys: rolledBack, requiresAuth: needsAuth || state.requiresAuth })
    return { requiresAuth: needsAuth }
  }
}

/** Только для тестов: вернуть состояние в исходное между прогонами. */
export function resetFavoritesStoreForTests() {
  state = { keys: new Set(), isLoading: true, requiresAuth: false }
  inFlight = null
  subscribers.clear()
}

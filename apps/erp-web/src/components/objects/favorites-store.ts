import { useSyncExternalStore } from 'react'

/**
 * Общий стор «избранных» объектов: список и карточка объекта работают с одним
 * набором id. Хранится в localStorage, переживает перезагрузку. Модель —
 * как у useCoreStore (внешний стор + useSyncExternalStore).
 */

const STORAGE_KEY = 'bz26:object-favorites'

function read(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : null
    return new Set(Array.isArray(parsed) ? (parsed as string[]) : [])
  } catch {
    return new Set()
  }
}

let favorites = read()
const listeners = new Set<() => void>()

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...favorites]))
  } catch {
    // localStorage недоступен — работаем в памяти на эту сессию
  }
}

export function isFavorite(id: string): boolean {
  return favorites.has(id)
}

/** Переключает избранное и возвращает новое состояние для этого объекта. */
export function toggleFavorite(id: string): boolean {
  const next = new Set(favorites)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  favorites = next
  persist()
  listeners.forEach((listener) => listener())
  return favorites.has(id)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot() {
  return favorites
}

/** Подписка на набор избранного: компонент перерисуется при изменении. */
export function useFavorites(): Set<string> {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

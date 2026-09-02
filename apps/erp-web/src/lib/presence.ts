export type PresenceStatus = 'online' | 'away' | 'offline'

export type PresenceStatusOption = {
  id: PresenceStatus
  label: string
  description: string
  color: string
}

export const PRESENCE_STATUS_OPTIONS: readonly PresenceStatusOption[] = [
  { id: 'online', label: 'Онлайн', description: 'Готов к работе', color: '#49c879' },
  { id: 'away', label: 'Отошёл', description: 'Временно недоступен', color: '#e6c364' },
  { id: 'offline', label: 'Офлайн', description: 'Не показывать доступность', color: '#b4ccc3' },
]

export const DEFAULT_PRESENCE_STATUS: PresenceStatus = 'online'

const PRESENCE_STORAGE_PREFIX = 'agency.presence.status'

export function getPresenceStorageKey(userId?: string): string {
  return `${PRESENCE_STORAGE_PREFIX}.${userId || 'guest'}`
}

export function parsePresenceStatus(value: string | null, fallback: PresenceStatus = DEFAULT_PRESENCE_STATUS): PresenceStatus {
  return value === 'online' || value === 'away' || value === 'offline'
    ? value
    : fallback
}

type PresenceStorage = Pick<Storage, 'getItem' | 'setItem'>

export function readPresenceStatus(
  storage: PresenceStorage | undefined,
  userId?: string,
  fallback: PresenceStatus = DEFAULT_PRESENCE_STATUS,
): PresenceStatus {
  if (!storage) return fallback

  try {
    return parsePresenceStatus(storage.getItem(getPresenceStorageKey(userId)), fallback)
  } catch {
    return fallback
  }
}

export function writePresenceStatus(
  storage: PresenceStorage | undefined,
  userId: string | undefined,
  status: PresenceStatus,
): void {
  if (!storage) return

  try {
    storage.setItem(getPresenceStorageKey(userId), status)
  } catch {
    // Если хранилище недоступно, выбранный статус всё равно остаётся в памяти.
  }
}

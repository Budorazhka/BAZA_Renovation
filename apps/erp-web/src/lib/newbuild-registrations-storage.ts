import type { Booking } from '@/types/bookings'

const STORAGE_KEY = 'agency-newbuild-registration-requests-v1'

function isClientBooking(x: unknown): x is Booking {
  if (!x || typeof x !== 'object') return false
  const b = x as Booking
  return b.type === 'client' && typeof b.id === 'string' && typeof b.clientName === 'string'
}

/** Заявки на регистрацию у застройщика, созданные пользователем в этой сессии (демо, без бэкенда). */
export function loadSessionRegistrations(): Booking[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isClientBooking)
  } catch {
    return []
  }
}

export function prependSessionRegistration(row: Booking): void {
  if (typeof window === 'undefined') return
  const next = [row, ...loadSessionRegistrations()]
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}

export function countSessionRegistrations(): number {
  return loadSessionRegistrations().length
}

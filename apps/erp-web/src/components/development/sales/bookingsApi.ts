import { developmentApi, type Booking, type BookingStatus } from '@/services/developmentApi'

/** Client-side booking status used by the developer sales panel and chessboard. */
export type DevBookingStatus = 'in_progress' | 'booked' | 'rejected' | 'paid' | 'expired'

export interface DevBookingRow {
  id: string
  projectId: string
  unitLabel: string
  realtorName: string
  agency: string
  status: DevBookingStatus
  createdAt: string
  confirmUntilAt: string | null
  manager: string
  comment: string
  /** Имя клиента, для которого риэлтор бронирует. Опционально. */
  clientName?: string
  /** Телефон клиента. Опционально. */
  clientPhone?: string
}

/** API booking status (`pending`) → client status (`in_progress`); rest are identical. */
export function apiStatusToDev(status: BookingStatus): DevBookingStatus {
  return status === 'pending' ? 'in_progress' : status
}

/** Client status (`in_progress`) → API status (`pending`); rest are identical. */
export function devStatusToApi(status: DevBookingStatus): BookingStatus {
  return status === 'in_progress' ? 'pending' : status
}

/** Map an API booking DTO to the row shape the developer panel/chessboard expect. */
export function mapBookingToRow(b: Booking): DevBookingRow {
  return {
    id: b.id,
    projectId: b.complexId,
    unitLabel: b.unitNumber ?? '',
    realtorName: b.realtorName ?? '',
    agency: b.agency ?? '',
    status: apiStatusToDev(b.status),
    createdAt: b.startsAt ?? b.createdAt,
    confirmUntilAt: b.expiresAt ?? null,
    manager: b.manager && b.manager.trim() ? b.manager : '—',
    comment: b.comment ?? '',
  }
}

/**
 * Fetch all bookings for a ЖК as developer-panel rows.
 * Returns `null` when the request fails so callers can keep their local fallback.
 */
export async function fetchProjectBookingRows(complexId: string): Promise<DevBookingRow[] | null> {
  try {
    const resp = await developmentApi.getBookings({ complexId, page: 1, limit: 200 })
    if (!resp.success) return null
    return resp.data.items.map(mapBookingToRow)
  } catch {
    return null
  }
}

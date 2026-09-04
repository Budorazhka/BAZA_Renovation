import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, CalendarClock, Loader2, RefreshCw } from 'lucide-react'
import { bookingsApiV2, type BookingStatusV2, type BookingV2 } from '@/services/bookingsApiV2'
import { developmentsApiV2 } from '@/services/developmentsApiV2'
import { useRolePermissions } from '@/hooks/useRolePermissions'
import { extractErrorMessage } from '../lib/errorMessage'

interface BookingsPanelV2Props {
  developmentId: string
}

const STATUS_LABEL: Record<BookingStatusV2, string> = {
  pending: 'В процессе',
  booked: 'Бронь',
  rejected: 'Отказ',
  expired: 'Истекла',
  paid: 'Оплачена',
}

const STATUS_STYLE: Record<BookingStatusV2, string> = {
  pending: 'border-amber-800/50 bg-amber-900/40 text-amber-300',
  booked: 'border-[rgba(242,192,64,0.5)] bg-[rgba(242,192,64,0.15)] text-[#f7da6a]',
  rejected: 'border-red-800/40 bg-red-900/30 text-[#ffb4ab]',
  expired: 'border-red-700/50 bg-red-900/30 text-[#ff5449]',
  paid: 'border-purple-800/50 bg-purple-900/40 text-purple-300',
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/**
 * BOOK-002: реальная панель бронирований — заменяет легаси
 * components/development/sales/BookingsPanel.tsx (mock-данные + localStorage
 * fallback) в SalesBookingsPage.tsx. unitLabels резолвится через
 * developmentsApiV2.listBuildings/listUnits (тот же источник, что
 * DevelopmentManagementV2Page) — Booking сам по себе хранит только unitId
 * (BookingV2.unitId), номер юнита/название корпуса нужно подтягивать
 * отдельно. confirm/cancel — единственные мутации, реально существующие на
 * бэкенде (booking.confirm/booking.cancel); extend и произвольное
 * редактирование комментария/ответственного, которые были в легаси-панели,
 * не имеют аналога в реальной Booking-модели (нет полей comment/manager-имя)
 * — не реализуются здесь, а не молча подделываются.
 */
export function BookingsPanelV2({ developmentId }: BookingsPanelV2Props) {
  const { role } = useRolePermissions()
  // Тот же круг ролей, что default-role-grants.ts: booking.confirm есть у
  // всех, кроме administrator/marketer; booking.cancel — только у
  // owner/director/rop/developer (manager его не имеет вообще).
  const canConfirm = role !== 'administrator' && role !== 'marketer'
  const canCancel = canConfirm && role !== 'manager'

  const [bookings, setBookings] = useState<BookingV2[]>([])
  const [unitLabels, setUnitLabels] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadTrigger, setReloadTrigger] = useState(0)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pendingActionId, setPendingActionId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setActionError(null)
    void (async () => {
      try {
        const [{ items }, buildings] = await Promise.all([
          bookingsApiV2.list({ developmentId, limit: 100 }),
          developmentsApiV2.listBuildings(developmentId),
        ])
        if (cancelled) return

        const unitsPerBuilding = await Promise.all(
          buildings.map((building) =>
            developmentsApiV2.listUnits(building._id, { limit: 500 }).then((units) => ({ building, units })),
          ),
        )
        if (cancelled) return

        const labels = new Map<string, string>()
        for (const { building, units } of unitsPerBuilding) {
          for (const unit of units) {
            labels.set(unit._id, `${building.name} · №${unit.number}`)
          }
        }

        setUnitLabels(labels)
        setBookings(items)
        setLoading(false)
      } catch (err) {
        if (cancelled) return
        setError(extractErrorMessage(err, 'Не удалось загрузить брони').message)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [developmentId, reloadTrigger])

  const sortedBookings = useMemo(
    () => [...bookings].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [bookings],
  )

  const handleConfirm = useCallback(async (bookingId: string) => {
    setPendingActionId(bookingId)
    setActionError(null)
    try {
      const updated = await bookingsApiV2.confirm(bookingId)
      setBookings((prev) => prev.map((b) => (b.id === updated.id ? updated : b)))
    } catch (err) {
      setActionError(extractErrorMessage(err, 'Не удалось подтвердить бронь').message)
    } finally {
      setPendingActionId(null)
    }
  }, [])

  const handleCancel = useCallback(async (bookingId: string) => {
    setPendingActionId(bookingId)
    setActionError(null)
    try {
      const updated = await bookingsApiV2.cancel(bookingId)
      setBookings((prev) => prev.map((b) => (b.id === updated.id ? updated : b)))
    } catch (err) {
      setActionError(extractErrorMessage(err, 'Не удалось отменить бронь').message)
    } finally {
      setPendingActionId(null)
    }
  }, [])

  return (
    <section className="rounded-md bg-[var(--green-card)] p-5 shadow-[inset_0_0_0_1px_rgba(201,168,76,0.18)]">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[24px] font-medium tracking-[-0.02em] text-[color:var(--app-text)]">Брони</h2>
      </div>

      {actionError && (
        <div
          data-testid="bookings-action-error"
          className="mb-4 flex items-center justify-between gap-3 rounded-sm bg-[rgba(255,180,171,0.1)] px-3 py-2 text-[16px] text-[#ffb4ab]"
        >
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} className="shrink-0 underline hover:no-underline">
            Скрыть
          </button>
        </div>
      )}

      {loading ? (
        <div data-testid="bookings-loading" className="flex min-h-[160px] flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="relative size-8">
            <span className="absolute inset-0 rounded-full border-2 border-[color:color-mix(in_srgb,var(--gold)_20%,transparent)]" />
            <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[var(--gold)]" />
          </div>
          <p className="text-[16px] font-normal text-[color:var(--app-text-muted)]">Загрузка броней…</p>
        </div>
      ) : error ? (
        <div data-testid="bookings-error" className="flex min-h-[160px] flex-col items-center justify-center gap-3 p-6 text-center">
          <AlertCircle className="size-6 text-[#ffb4ab]" />
          <p className="max-w-md text-[16px] font-normal text-[color:var(--app-text-muted)]">{error}</p>
          <button
            type="button"
            onClick={() => setReloadTrigger((v) => v + 1)}
            className="flex items-center gap-2 rounded-sm border border-[color:var(--gold)] bg-[color-mix(in_srgb,var(--gold)_20%,transparent)] px-4 py-2 text-[16px] font-medium text-[color:var(--app-text)] hover:bg-[color-mix(in_srgb,var(--gold)_30%,transparent)]"
          >
            <RefreshCw className="size-4" />
            Повторить
          </button>
        </div>
      ) : sortedBookings.length === 0 ? (
        <div className="flex min-h-[160px] flex-col items-center justify-center gap-2 p-6 text-center">
          <CalendarClock className="size-8 text-[color:var(--app-text-muted)]" />
          <p className="text-[16px] font-normal text-[color:var(--app-text-muted)]">Броней пока нет</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table data-testid="bookings-list" className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="text-[14px] font-normal uppercase tracking-wide text-[color:var(--app-text-muted)]">
                <th className="px-3 py-2 font-normal">Юнит</th>
                <th className="px-3 py-2 font-normal">Срок</th>
                <th className="px-3 py-2 font-normal">Статус</th>
                <th className="px-3 py-2 font-normal w-[220px]">Действия</th>
              </tr>
            </thead>
            <tbody>
              {sortedBookings.map((booking) => {
                const busy = pendingActionId === booking.id
                return (
                  <tr
                    key={booking.id}
                    data-testid={`booking-row-${booking.id}`}
                    className="border-b border-[rgba(242,207,141,0.07)] last:border-0"
                  >
                    <td className="px-3 py-3 text-[16px] text-[color:var(--app-text)]">
                      {unitLabels.get(booking.unitId) ?? booking.unitId}
                    </td>
                    <td className="px-3 py-3 text-[14px] text-[color:var(--app-text-muted)] whitespace-nowrap">
                      {formatDateTime(booking.dateRange.startsAt)} — {formatDateTime(booking.dateRange.expiresAt)}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center rounded-md border px-2.5 py-1 text-[14px] font-normal ${STATUS_STYLE[booking.status]}`}>
                        {STATUS_LABEL[booking.status]}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        {canConfirm && booking.status === 'pending' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleConfirm(booking.id)}
                            className="flex items-center gap-1.5 rounded-sm bg-[var(--gold)] px-3 py-1.5 text-[14px] font-medium text-[color:var(--gold-btn-text)] hover:bg-[var(--gold-light)] disabled:opacity-50"
                          >
                            {busy && <Loader2 className="size-3.5 animate-spin" />}
                            Подтвердить
                          </button>
                        )}
                        {canCancel && (booking.status === 'pending' || booking.status === 'booked') && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleCancel(booking.id)}
                            className="flex items-center gap-1.5 rounded-sm border border-[rgba(255,100,100,0.3)] bg-[rgba(200,50,50,0.12)] px-3 py-1.5 text-[14px] font-normal text-[#ffb4ab] hover:bg-[rgba(200,50,50,0.22)] disabled:opacity-50"
                          >
                            {busy && <Loader2 className="size-3.5 animate-spin" />}
                            Отменить
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

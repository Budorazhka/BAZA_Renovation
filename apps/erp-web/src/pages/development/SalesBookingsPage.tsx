import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, Building2, RefreshCw } from 'lucide-react'
import { developmentsApiV2, type DevelopmentV2 } from '@/services/developmentsApiV2'
import { BookingsPanelV2, extractErrorMessage } from '@/features/developments-v2'

/**
 * BOOK-002: своя локальная память выбранного ЖК, НЕ
 * components/development/sales/salesManagementStorage.ts::SALES_PROJECT_ID_KEY —
 * тот ключ хранит id из legacy useCoreStore.projects (IProject) и общий с
 * SalesScreenLayout/SalesPromotionPage (соседние вкладки того же
 * legacy-раздела, вне скоупа этой миграции). developmentsApiV2 работает с
 * другим id-пространством (реальный Development._id) — переиспользование
 * того же ключа тихо ломало бы "запомненный проект" на соседних вкладках.
 */
const SALES_DEVELOPMENT_ID_KEY = 'developer.sales.selectedDevelopmentIdV2'

/**
 * BOOK-002: реальный, живой бэкенд — заменяет легаси BookingsPanel.tsx
 * (mock-данные + localStorage fallback поверх useCoreStore/IProject).
 * Список ЖК читает напрямую из developmentsApiV2.list() (тот же паттерн,
 * что ProjectsPage.tsx), брони — через BookingsPanelV2 (features/
 * developments-v2), которая сама резолвит developmentId → buildings → units
 * → bookings через реальный GET /bookings.
 */
export function SalesBookingsPage() {
  const [developments, setDevelopments] = useState<DevelopmentV2[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadTrigger, setReloadTrigger] = useState(0)
  const [developmentId, setDevelopmentId] = useState<string>(
    () => localStorage.getItem(SALES_DEVELOPMENT_ID_KEY) ?? '',
  )
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const loadDevelopments = useCallback(() => {
    setLoading(true)
    setError(null)
    developmentsApiV2
      .list({ limit: 100 })
      .then(({ items }) => {
        if (!isMountedRef.current) return
        setDevelopments(items)
        setDevelopmentId((prev) => (prev && items.some((item) => item._id === prev) ? prev : items[0]?._id ?? ''))
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (!isMountedRef.current) return
        setDevelopments([])
        setError(extractErrorMessage(err, 'Не удалось загрузить список ЖК').message)
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    loadDevelopments()
  }, [loadDevelopments, reloadTrigger])

  useEffect(() => {
    if (developmentId) localStorage.setItem(SALES_DEVELOPMENT_ID_KEY, developmentId)
  }, [developmentId])

  if (loading) {
    return (
      <div
        data-testid="sales-bookings-loading"
        className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-md bg-[var(--green-card)] p-12 text-center shadow-[inset_0_0_0_1px_rgba(201,168,76,0.18)]"
      >
        <div className="relative size-10">
          <span className="absolute inset-0 rounded-full border-2 border-[color:color-mix(in_srgb,var(--gold)_20%,transparent)]" />
          <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[var(--gold)]" />
        </div>
        <p className="text-[19px] font-normal text-[color:var(--app-text-muted)]">Загрузка ЖК…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div
        data-testid="sales-bookings-error"
        className="flex min-h-[280px] flex-col items-center justify-center gap-4 rounded-md bg-[var(--green-card)] p-12 text-center shadow-[inset_0_0_0_1px_rgba(201,168,76,0.18)]"
      >
        <AlertCircle className="size-10 text-[#ffb4ab]" />
        <p className="max-w-md text-[19px] font-normal text-[color:var(--app-text-muted)]">{error}</p>
        <button
          type="button"
          onClick={() => setReloadTrigger((v) => v + 1)}
          className="flex items-center gap-2 rounded-sm border border-[color:var(--gold)] bg-[color-mix(in_srgb,var(--gold)_20%,transparent)] px-5 py-2.5 text-[16px] font-medium text-[color:var(--app-text)] hover:bg-[color-mix(in_srgb,var(--gold)_30%,transparent)]"
        >
          <RefreshCw className="size-4" />
          Повторить
        </button>
      </div>
    )
  }

  if (!developmentId) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl bg-[var(--installments-empty-bg)] text-[16px] text-[color:var(--installments-text-muted)] shadow-sm">
        Нет доступных ЖК
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 h-full p-1">
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[color:var(--workspace-row-border)] bg-[var(--workspace-row-bg)] p-4 shadow-sm shrink-0">
        <div className="flex items-center gap-2 text-[color:var(--workspace-text-muted)]">
          <Building2 size={18} className="text-[color:var(--gold)]" />
          <span className="text-[16px] font-normal">Выбор ЖК</span>
        </div>
        <select
          value={developmentId}
          onChange={(e) => setDevelopmentId(e.target.value)}
          className="h-10 w-[400px] rounded-[6px] border border-[color:var(--installments-select-border)] bg-[var(--installments-select-bg)] px-3 text-[16px] text-[color:var(--installments-text)] outline-none transition-colors focus:border-[color:var(--cb-ctrl-border-hover)]"
        >
          {developments.map((item) => (
            <option key={item._id} value={item._id}>
              {item.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 min-h-0">
        <BookingsPanelV2 developmentId={developmentId} />
      </div>
    </div>
  )
}

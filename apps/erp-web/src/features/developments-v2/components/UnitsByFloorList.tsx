import { useMemo } from 'react'
import { AlertCircle, RefreshCw, Home } from 'lucide-react'
import type { FloorV2, UnitKindV2, UnitStatusV2, UnitV2 } from '@/services/developmentsApiV2'
import { UNIT_KIND_LABEL, UNIT_KIND_OPTIONS, UNIT_STATUS_LABEL, UNIT_STATUS_OPTIONS } from '../constants'
import { UnitCard } from './UnitCard'

interface UnitsByFloorListProps {
  units: UnitV2[]
  floors: FloorV2[]
  loading: boolean
  error: string | null
  onRetry: () => void
  kindFilter: UnitKindV2 | ''
  statusFilter: UnitStatusV2 | ''
  onKindFilterChange: (kind: UnitKindV2 | '') => void
  onStatusFilterChange: (status: UnitStatusV2 | '') => void
  onUnitUpdated: (updated: UnitV2) => void
}

/**
 * D-02 COMPLETE: units сгруппированы по floorId (client-side группировка —
 * список уже пришёл отфильтрованным с сервера по kind/status query-
 * параметрам, group-by здесь не требует доп. запросов). Пустой floor (0
 * units после server-side фильтра) показывает per-floor empty state, не
 * скрывает floor целиком — иначе пользователь не поймёт, что этаж
 * существует, но пуст.
 */
export function UnitsByFloorList({
  units,
  floors,
  loading,
  error,
  onRetry,
  kindFilter,
  statusFilter,
  onKindFilterChange,
  onStatusFilterChange,
  onUnitUpdated,
}: UnitsByFloorListProps) {
  const unitsByFloor = useMemo(() => {
    const map = new Map<string, UnitV2[]>()
    for (const unit of units) {
      const list = map.get(unit.floorId) ?? []
      list.push(unit)
      map.set(unit.floorId, list)
    }
    return map
  }, [units])

  const sortedFloors = useMemo(() => [...floors].sort((a, b) => a.floorNumber - b.floorNumber), [floors])

  return (
    <section className="rounded-md bg-[var(--green-card)] p-5 shadow-[inset_0_0_0_1px_rgba(201,168,76,0.18)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[24px] font-medium tracking-[-0.02em] text-[color:var(--app-text)]">Юниты по этажам</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={kindFilter}
            onChange={(e) => onKindFilterChange(e.target.value as UnitKindV2 | '')}
            className="h-9 rounded-sm border-none bg-[rgba(3,29,22,0.5)] px-2 text-[16px] text-[color:var(--app-text)] outline-none"
          >
            <option value="">Все типы</option>
            {UNIT_KIND_OPTIONS.map((k) => (
              <option key={k} value={k}>{UNIT_KIND_LABEL[k]}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value as UnitStatusV2 | '')}
            className="h-9 rounded-sm border-none bg-[rgba(3,29,22,0.5)] px-2 text-[16px] text-[color:var(--app-text)] outline-none"
          >
            <option value="">Все статусы</option>
            {UNIT_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{UNIT_STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div data-testid="units-loading" className="flex min-h-[160px] flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="relative size-8">
            <span className="absolute inset-0 rounded-full border-2 border-[color:color-mix(in_srgb,var(--gold)_20%,transparent)]" />
            <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[var(--gold)]" />
          </div>
          <p className="text-[16px] font-normal text-[color:var(--app-text-muted)]">Загрузка юнитов…</p>
        </div>
      ) : error ? (
        <div data-testid="units-error" className="flex min-h-[160px] flex-col items-center justify-center gap-3 p-6 text-center">
          <AlertCircle className="size-6 text-[#ffb4ab]" />
          <p className="max-w-md text-[16px] font-normal text-[color:var(--app-text-muted)]">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-2 rounded-sm border border-[color:var(--gold)] bg-[color-mix(in_srgb,var(--gold)_20%,transparent)] px-4 py-2 text-[16px] font-medium text-[color:var(--app-text)] hover:bg-[color-mix(in_srgb,var(--gold)_30%,transparent)]"
          >
            <RefreshCw className="size-4" />
            Повторить
          </button>
        </div>
      ) : units.length === 0 ? (
        <div className="flex min-h-[160px] flex-col items-center justify-center gap-2 p-6 text-center">
          <Home className="size-8 text-[color:var(--app-text-muted)]" />
          <p className="text-[16px] font-normal text-[color:var(--app-text-muted)]">Юнитов пока нет</p>
        </div>
      ) : (
        <div data-testid="units-list" className="flex flex-col gap-4">
          {sortedFloors.map((floor) => {
            const floorUnits = unitsByFloor.get(floor._id) ?? []
            return (
              <div key={floor._id} className="flex flex-col gap-2">
                <h3 className="text-[16px] font-medium uppercase tracking-[0.08em] text-[color:var(--gold)]">Этаж {floor.floorNumber}</h3>
                {floorUnits.length === 0 ? (
                  <p data-testid={`units-floor-empty-${floor._id}`} className="text-[16px] font-normal text-[color:var(--app-text-muted)]">
                    Нет юнитов на этом этаже
                  </p>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {floorUnits.map((unit) => (
                      <UnitCard key={unit._id} unit={unit} onUpdated={onUnitUpdated} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

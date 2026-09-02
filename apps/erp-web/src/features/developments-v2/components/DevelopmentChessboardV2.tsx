import { useMemo, useState } from 'react'
import { AlertCircle, ArrowDownUp, RefreshCw, Grid3X3 } from 'lucide-react'
import type { FloorV2, UnitKindV2, UnitStatusV2, UnitV2 } from '@/services/developmentsApiV2'
import { UNIT_KIND_LABEL, UNIT_KIND_OPTIONS, UNIT_STATUS_LABEL, UNIT_STATUS_OPTIONS } from '../constants'

interface DevelopmentChessboardV2Props {
  buildingId: string
  floors: FloorV2[]
  units: UnitV2[]
  loading: boolean
  error: string | null
  onRetry: () => void
  onUnitClick?: (unit: UnitV2) => void
}

/**
 * D-02 COMPLETE: V2-шахматка — только UnitV2/FloorV2/BuildingV2, никаких
 * IProject/IUnit/useCoreStore. Не фетчит сама — получает уже загруженные
 * floors/units от родителя (тот же источник, что UnitsByFloorList, чтобы
 * не дублировать loading/error state и не рассинхронизироваться после
 * обновления цены/статуса). Фильтры kind/status здесь — НЕЗАВИСИМОЕ
 * client-side состояние, отдельное от server-side фильтров списка юнитов —
 * список и шахматка разные представления одних данных.
 */
export function DevelopmentChessboardV2({ buildingId, floors, units, loading, error, onRetry, onUnitClick }: DevelopmentChessboardV2Props) {
  const [floorOrder, setFloorOrder] = useState<'asc' | 'desc'>('desc')
  const [kindFilter, setKindFilter] = useState<UnitKindV2 | ''>('')
  const [statusFilter, setStatusFilter] = useState<UnitStatusV2 | ''>('')

  const unitsByFloor = useMemo(() => {
    const filtered = units.filter(
      (u) => (!kindFilter || u.kind === kindFilter) && (!statusFilter || u.status === statusFilter),
    )
    const map = new Map<string, UnitV2[]>()
    for (const unit of filtered) {
      const list = map.get(unit.floorId) ?? []
      list.push(unit)
      map.set(unit.floorId, list)
    }
    return map
  }, [units, kindFilter, statusFilter])

  const sortedFloors = useMemo(() => {
    const sorted = [...floors].sort((a, b) => a.floorNumber - b.floorNumber)
    return floorOrder === 'desc' ? sorted.reverse() : sorted
  }, [floors, floorOrder])

  if (loading) {
    return (
      <section data-testid="chessboard-v2" className="rounded-md bg-[var(--green-card)] p-5 shadow-[inset_0_0_0_1px_rgba(201,168,76,0.18)]">
        <div data-testid="chessboard-loading" className="flex min-h-[160px] flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="relative size-8">
            <span className="absolute inset-0 rounded-full border-2 border-[color:color-mix(in_srgb,var(--gold)_20%,transparent)]" />
            <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[var(--gold)]" />
          </div>
          <p className="text-[16px] font-normal text-[color:var(--app-text-muted)]">Загрузка шахматки…</p>
        </div>
      </section>
    )
  }

  if (error) {
    return (
      <section data-testid="chessboard-v2" className="rounded-md bg-[var(--green-card)] p-5 shadow-[inset_0_0_0_1px_rgba(201,168,76,0.18)]">
        <div data-testid="chessboard-error" className="flex min-h-[160px] flex-col items-center justify-center gap-3 p-6 text-center">
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
      </section>
    )
  }

  if (floors.length === 0) {
    return (
      <section data-testid="chessboard-v2" className="rounded-md bg-[var(--green-card)] p-5 shadow-[inset_0_0_0_1px_rgba(201,168,76,0.18)]">
        <div data-testid="chessboard-empty" className="flex min-h-[160px] flex-col items-center justify-center gap-2 p-6 text-center">
          <Grid3X3 className="size-8 text-[color:var(--app-text-muted)]" />
          <p className="text-[16px] font-normal text-[color:var(--app-text-muted)]">Нет этажей в этом корпусе</p>
        </div>
      </section>
    )
  }

  return (
    <section data-testid="chessboard-v2" className="rounded-md bg-[var(--green-card)] p-5 shadow-[inset_0_0_0_1px_rgba(201,168,76,0.18)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[24px] font-medium tracking-[-0.02em] text-[color:var(--app-text)]">Шахматка</h2>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFloorOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
            className="flex h-9 items-center gap-1.5 rounded-sm border border-[color:var(--green-border)] bg-transparent px-3 text-[16px] font-normal text-[color:var(--app-text-muted)] hover:bg-[color-mix(in_srgb,var(--gold)_10%,transparent)] hover:text-[color:var(--app-text)]"
          >
            <ArrowDownUp className="size-4" />
            {floorOrder === 'desc' ? 'Сверху вниз' : 'Снизу вверх'}
          </button>
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as UnitKindV2 | '')}
            className="h-9 rounded-sm border-none bg-[rgba(3,29,22,0.5)] px-2 text-[16px] text-[color:var(--app-text)] outline-none"
          >
            <option value="">Все типы</option>
            {UNIT_KIND_OPTIONS.map((k) => (
              <option key={k} value={k}>{UNIT_KIND_LABEL[k]}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as UnitStatusV2 | '')}
            className="h-9 rounded-sm border-none bg-[rgba(3,29,22,0.5)] px-2 text-[16px] text-[color:var(--app-text)] outline-none"
          >
            <option value="">Все статусы</option>
            {UNIT_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{UNIT_STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>
      </div>

      <div data-testid={`chessboard-building-${buildingId}`} className="flex flex-col gap-2">
        {sortedFloors.map((floor) => {
          const floorUnits = unitsByFloor.get(floor._id) ?? []
          return (
            <div key={floor._id} className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-[16px] font-normal text-[color:var(--app-text-muted)]">
                Этаж {floor.floorNumber}
              </span>
              {floorUnits.length === 0 ? (
                <span data-testid={`chessboard-floor-empty-${floor._id}`} className="text-[16px] font-normal text-[color:var(--app-text-muted)]">
                  Нет юнитов
                </span>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {floorUnits.map((unit) => (
                    <ChessboardCell key={unit._id} unit={unit} onClick={() => onUnitClick?.(unit)} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

const UNIT_STATUS_CELL_STYLE: Record<UnitStatusV2, string> = {
  available: 'bg-[color-mix(in_srgb,var(--gold)_18%,transparent)] text-[color:var(--app-text)]',
  reserved: 'bg-[rgba(255,193,7,0.16)] text-[color:var(--app-text)]',
  sold: 'bg-[rgba(255,180,171,0.16)] text-[color:var(--app-text-muted)]',
  hidden: 'bg-[rgba(255,255,255,0.06)] text-[color:var(--app-text-muted)]',
}

function ChessboardCell({ unit, onClick }: { unit: UnitV2; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`chessboard-cell-${unit._id}`}
      data-unit-status={unit.status}
      data-unit-kind={unit.kind}
      className={`flex h-11 min-w-[52px] flex-col items-center justify-center rounded-sm px-2 text-[16px] font-normal transition-colors hover:opacity-90 ${UNIT_STATUS_CELL_STYLE[unit.status]}`}
      title={`№${unit.number} · ${UNIT_KIND_LABEL[unit.kind]} · ${UNIT_STATUS_LABEL[unit.status]}`}
    >
      {unit.number}
    </button>
  )
}

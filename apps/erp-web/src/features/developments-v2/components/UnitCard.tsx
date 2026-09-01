import type { UnitV2 } from '@/services/developmentsApiV2'
import { UNIT_KIND_LABEL, UNIT_STATUS_DOT, UNIT_STATUS_LABEL } from '../constants'
import { UnitStatusControl } from './UnitStatusControl'
import { UnitPriceControl } from './UnitPriceControl'

interface UnitCardProps {
  unit: UnitV2
  onUpdated: (updated: UnitV2) => void
}

/** D-02 COMPLETE: карточка Unit — read-only поля + inline status/price контролы. */
export function UnitCard({ unit, onUpdated }: UnitCardProps) {
  return (
    <div className="flex flex-col gap-3 rounded-sm bg-[rgba(3,29,22,0.5)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[19px] font-medium text-[color:var(--app-text)]">№ {unit.number}</span>
          <span className="text-[16px] font-normal text-[color:var(--app-text-muted)]">{UNIT_KIND_LABEL[unit.kind]}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`size-3 rounded-full ${UNIT_STATUS_DOT[unit.status]}`} />
          <span className="text-[16px] font-normal text-[color:var(--app-text)]">{UNIT_STATUS_LABEL[unit.status]}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-[16px] font-normal text-[color:var(--app-text-muted)]">
        <span>Площадь: <span className="text-[color:var(--app-text)]">{unit.area} м²</span></span>
        {unit.rooms !== undefined && <span>Комнат: <span className="text-[color:var(--app-text)]">{unit.rooms}</span></span>}
        <span>Цена: <span className="text-[color:var(--app-text)]">{unit.price.amountMinorUnits} {unit.price.currency} (мин. ед.)</span></span>
      </div>

      <div className="flex flex-col gap-2 border-t border-[rgba(30,74,42,0.3)] pt-3">
        <UnitStatusControl unit={unit} onUpdated={onUpdated} />
        <UnitPriceControl unit={unit} onUpdated={onUpdated} />
      </div>
    </div>
  )
}

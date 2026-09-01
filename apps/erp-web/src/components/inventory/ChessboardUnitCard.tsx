import { CB_SLOT_BOX } from '@/components/inventory/chessboard-dimensions'
import type { IUnit } from '@/types/core'
import { compactRoomsLabel, formatArea, getCurrencySymbol, hasActivePromotion } from '@/lib/chessboard'
import { optionLabel } from '@/lib/project-options'
import { useI18n } from '@/i18n'

interface Props {
  unit: IUnit
  isSelected?: boolean
  isHighlighted?: boolean
  isPaid?: boolean
  isInProgress?: boolean
}

export function ChessboardUnitCard({ unit, isSelected = false, isHighlighted = false, isPaid = false, isInProgress = false }: Props) {
  const { t } = useI18n()
  const inProgress = unit.status === 'booked' && isInProgress
  const showPromotion = hasActivePromotion(unit)
  const rooms = compactRoomsLabel(unit.rooms)
  const roomsLabel = rooms === 'studio' ? t('inventory.chessboard.studioShort', 'Студ.') : optionLabel(t, 'rooms', rooms)
  const area = formatArea(unit.area)
  const hasArea = area !== '—'
  const ariaRooms = roomsLabel || 'лот'
  const ariaArea = hasArea ? area : null

  return (
    <div
      data-unit-id={unit._id}
      data-status={unit.status}
      data-inprogress={inProgress ? 'true' : undefined}
      aria-label={[ariaRooms, ariaArea].filter(Boolean).join(', ')}
      className={`cb-unit @container/card group relative flex min-h-0 cursor-pointer flex-col items-center justify-center gap-0 rounded-md px-2 py-1 text-center transition-all select-none ${CB_SLOT_BOX} ${
        isSelected ? 'ring-2 ring-[#f2c040] ring-offset-1 ring-offset-[#091a10] brightness-[1.15]' : isHighlighted ? 'ring-1 ring-[#c9a84c]/70 ring-offset-1 ring-offset-[#091a10] brightness-110' : ''
      }`}
    >
      {isPaid && (
        <span className="absolute right-0.5 top-0.5 text-[length:clamp(8px,3.5cqi,11px)] leading-none text-[#e6c364]">
          {getCurrencySymbol(unit.currency)}
        </span>
      )}
      {showPromotion ? (
        <span
          title={unit.promotion?.label}
          className={`absolute ${isPaid ? 'right-3' : 'right-0.5'} top-0.5 size-1.5 rounded-full bg-[#e2c97e]`}
        />
      ) : null}
      {roomsLabel && (
        <span className="cb-unit-num w-full truncate leading-tight text-[length:clamp(16px,6.5cqi,18px)] font-normal">
          {roomsLabel}
        </span>
      )}
      {hasArea && (
        <span className="cb-unit-sub w-full truncate leading-tight text-[length:clamp(16px,5.5cqi,16px)] font-normal">
          {area}
        </span>
      )}
      {!roomsLabel && !hasArea ? (
        <span className="cb-unit-sub text-[length:clamp(16px,6.5cqi,18px)] font-normal">—</span>
      ) : null}
    </div>
  )
}

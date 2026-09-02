import { Plus } from 'lucide-react'

import { CB_SLOT_BOX } from '@/components/inventory/chessboard-dimensions'
import { useI18n } from "@/i18n";

interface Props {
  floor: number
  position: number
  editable?: boolean
  onCreate?: () => void
}

export function ChessboardEmptyCell({ floor, position, editable = false, onCreate }: Props) {
    const { t } = useI18n();
  if (!editable) {
    return (
      <div
        data-empty-cell="true"
        data-floor={floor}
        data-position={position}
        className={`@container/card ${CB_SLOT_BOX} rounded-[5px] border border-dashed border-[rgba(242,207,141,0.08)] bg-[rgba(0,0,0,0.12)]`}
        title={t('inventory.chessboardEmptyCell.пустой_слот')}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={onCreate}
      data-skip-drag="true"
      data-empty-cell="true"
      data-floor={floor}
      data-position={position}
      className={`@container/card group flex ${CB_SLOT_BOX} flex-col items-center justify-center rounded-[5px] border border-dashed border-[rgba(242,207,141,0.18)] bg-[rgba(0,0,0,0.25)] text-[rgba(242,207,141,0.35)] transition-colors hover:border-[rgba(242,207,141,0.45)] hover:bg-[rgba(242,207,141,0.05)] hover:text-[rgba(242,207,141,0.7)]`}
      title={onCreate ? 'Добавить лот на эту позицию' : 'Пустой слот'}
    >
      <Plus className="size-[clamp(14px,6.5cqi,18px)] opacity-70 group-hover:opacity-100" />
      <span className="mt-0.5 max-w-[95%] text-center font-normal leading-snug tracking-wide text-[length:clamp(11px,5.5cqi,15px)]">
        {floor}·{position}
      </span>
    </button>
  )
}

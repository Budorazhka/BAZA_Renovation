import { useEffect } from 'react'
import { X } from 'lucide-react'

import { FloorPlanEditor } from './FloorPlanEditor'
import { useI18n } from "@/i18n";

interface Props {
  buildingId: string
  floor: number
  title: string
  highlightUnitId?: string
  defaultDrawingUnitId?: string
  onClose: () => void
}

export function FloorPlanModal({
  buildingId,
  floor,
  title,
  highlightUnitId,
  defaultDrawingUnitId,
  onClose,
}: Props) {
    const { t } = useI18n();
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#0c1d16]">
      <header className="flex shrink-0 items-center justify-between border-b border-[rgba(242,207,141,0.15)] px-6 py-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-normal text-[#fcecc8]">{title}</h2>
          <span className="text-xs text-[rgba(242,207,141,0.45)]">{t('inventory.floorPlanModal.этаж')}{floor}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-[rgba(242,207,141,0.5)] transition-colors hover:bg-[rgba(242,207,141,0.1)] hover:text-[#fcecc8]"
          aria-label={t('inventory.floorPlanModal.закрыть')}
        >
          <X size={18} />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden p-5">
        <FloorPlanEditor
          initialBuildingId={buildingId}
          initialFloor={floor}
          fullscreen
          highlightUnitId={highlightUnitId}
          defaultDrawingUnitId={defaultDrawingUnitId}
        />
      </div>
    </div>
  )
}

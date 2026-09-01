import { ZoomIn, ZoomOut } from 'lucide-react'
import { useI18n } from "@/i18n";

interface Props {
  zoom: number
  min?: number
  max?: number
  step?: number
  onAdjust: (delta: number) => void
  onReset: () => void
  className?: string
  /** Неактивно (остаётся ширина блока для выравнивания тулбара в других режимах). */
  disabled?: boolean
}

export function ZoomControls({
  zoom,
  min = 0.5,
  max = 2,
  step = 0.1,
  onAdjust,
  onReset,
  className,
  disabled = false,
}: Props) {
    const { t } = useI18n();
  return (
    <div
      title={disabled ? 'Масштаб доступен в режиме шахматки' : undefined}
      className={`inline-flex h-9 shrink-0 items-center overflow-hidden rounded-lg border border-[rgba(242,207,141,0.2)] bg-[rgba(0,0,0,0.28)] ${disabled ? 'pointer-events-none opacity-45' : ''} ${className ?? ''}`}
    >
      <button
        type="button"
        onClick={() => onAdjust(-step)}
        disabled={disabled || zoom <= min}
        title={t('inventory.zoomControls.уменьшить')}
        className="inline-flex h-full w-8 items-center justify-center text-[rgba(242,207,141,0.75)] transition-colors hover:bg-[rgba(242,207,141,0.08)] hover:text-[#fcecc8] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ZoomOut className="size-3.5 shrink-0" strokeWidth={2} />
      </button>
      <button
        type="button"
        onClick={onReset}
        disabled={disabled}
        title={t('inventory.zoomControls.сбросить_масштаб')}
        className="inline-flex h-full min-w-[3.5rem] items-center justify-center px-2 text-[16px] font-normal tabular-nums text-[rgba(242,207,141,0.88)] transition-colors hover:bg-[rgba(242,207,141,0.08)] hover:text-[#fcecc8]"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        onClick={() => onAdjust(step)}
        disabled={disabled || zoom >= max}
        title={t('inventory.zoomControls.увеличить')}
        className="inline-flex h-full w-8 items-center justify-center text-[rgba(242,207,141,0.75)] transition-colors hover:bg-[rgba(242,207,141,0.08)] hover:text-[#fcecc8] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ZoomIn className="size-3.5 shrink-0" strokeWidth={2} />
      </button>
    </div>
  )
}

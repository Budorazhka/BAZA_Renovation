import type { LeadStageV2 } from '@/types/leadsV2'
import { STAGE_CONFIG } from '../constants'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

interface StageBadgeProps {
  stage: LeadStageV2
  className?: string
}

export function StageBadge({ stage, className }: StageBadgeProps) {
  const { t } = useI18n()
  const cfg = STAGE_CONFIG[stage] || STAGE_CONFIG.new
  const label = t(`leadsInbox.stages.${stage}`) || stage

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-0.5 text-[16px] font-normal transition-colors',
        cfg.bgClass,
        cfg.textClass,
        cfg.borderClass,
        className,
      )}
    >
      <span className={cn('size-2 rounded-full', cfg.dotClass)} />
      {label}
    </span>
  )
}

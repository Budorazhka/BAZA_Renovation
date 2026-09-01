import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Star } from 'lucide-react'
import { DeskShell, DeskHeader, DESK_HEADER_LINK_CLASS, REPORT_LINKS } from '../desk-shared'
import { LEAD_STAGE_COLUMN } from '@/data/leads-mock'
import type { Lead } from '@/types/leads'
import type { WidgetSlot } from '@/config/widgets-config'
import { useI18n } from "@/i18n";

function hotScore(l: Lead): number {
  let s = l.commissionUsd ?? 0
  if (LEAD_STAGE_COLUMN[l.stageId] === 'success') s *= 1.5
  if (l.stageId === 'deposit' || l.stageId === 'deal') s *= 1.8
  if (l.stageId === 'showing') s *= 1.4
  if (l.stageId === 'kp_sent' || l.stageId === 'need_identified') s *= 1.2
  return s
}

export function WidgetOpportunities({ leads, slot }: { leads: Lead[]; slot: WidgetSlot }) {
    const { t } = useI18n();
  const hot = useMemo(
    () =>
      [...leads]
        .filter((l) => LEAD_STAGE_COLUMN[l.stageId] !== 'rejection')
        .sort((a, b) => hotScore(b) - hotScore(a))
        .slice(0, slot === 'big' ? 14 : slot === 'med' ? 8 : 5),
    [leads, slot],
  )

  return (
    <DeskShell accent="#f59e0b" className="flex flex-col">
      <DeskHeader
        icon={<Star className="size-5" strokeWidth={2} />}
        title={t('dashboard.widgets.widgetOpportunities.возможности')}
        accentColor="#f59e0b"
        right={<Link to={REPORT_LINKS.leads} className={DESK_HEADER_LINK_CLASS}>{t('dashboard.widgets.widgetOpportunities.отч_т')}</Link>}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
        {hot.length === 0 ? (
          <p className="py-4 text-center text-[13px] text-[color:var(--workspace-text-muted)]">{t('dashboard.widgets.widgetOpportunities.нет_горячих_возможно')}</p>
        ) : (
          <ul className="space-y-1">
            {hot.map((l, i) => {
              const score = hotScore(l)
              const heat = score > 3000 ? '#f87171' : score > 1500 ? '#fbbf24' : '#a3e635'
              return (
                <li
                  key={l.id}
                  className="flex items-center gap-2 rounded-lg border border-[color:var(--workspace-row-border)] bg-[var(--workspace-row-bg)] px-2.5 py-1.5"
                >
                  <span
                    className="flex size-5 shrink-0 items-center justify-center rounded-full text-[9px] font-normal"
                    style={{ background: `${heat}22`, color: heat }}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] text-[color:var(--workspace-text)]">{l.name ?? l.id}</p>
                    <p className="text-[10px] text-[color:var(--workspace-text-muted)]">{l.stageId}</p>
                  </div>
                  {l.commissionUsd != null && (
                    <span className="shrink-0 text-[11px] tabular-nums" style={{ color: heat }}>
                      ≈${(l.commissionUsd / 1000).toFixed(1)}k
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </DeskShell>
  )
}

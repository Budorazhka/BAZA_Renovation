import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { TrendingUp } from 'lucide-react'
import { DeskShell, DeskHeader, DESK_HEADER_LINK_CLASS, REPORT_LINKS } from '../desk-shared'
import { LEAD_STAGE_COLUMN } from '@/data/leads-mock'
import type { Lead } from '@/types/leads'
import type { WidgetSlot } from '@/config/widgets-config'
import { useI18n } from "@/i18n";

function prospectScore(l: Lead): number {
  let s = l.commissionUsd ?? 0
  if (LEAD_STAGE_COLUMN[l.stageId] === 'success') s += 5000
  if (l.stageId === 'showing' || l.stageId === 'deposit') s += 3000
  if (l.stageId === 'kp_sent') s += 1500
  if (l.stageId === 'need_identified' || l.stageId === 'need_adjusted') s += 800
  if (l.hasTask) s += 500
  return s
}

export function WidgetProspectLeads({ leads, slot }: { leads: Lead[]; slot: WidgetSlot }) {
    const { t } = useI18n();
  const top = useMemo(
    () =>
      [...leads]
        .filter((l) => LEAD_STAGE_COLUMN[l.stageId] !== 'rejection')
        .sort((a, b) => prospectScore(b) - prospectScore(a))
        .slice(0, slot === 'big' ? 14 : slot === 'med' ? 8 : 5),
    [leads, slot],
  )

  return (
    <DeskShell accent="#34d399" className="flex flex-col">
      <DeskHeader
        icon={<TrendingUp className="size-5" strokeWidth={2} />}
        title={t('dashboard.widgets.widgetProspectLeads.перспективные_лиды')}
        accentColor="#34d399"
        right={<Link to={REPORT_LINKS.leads} className={DESK_HEADER_LINK_CLASS}>{t('dashboard.widgets.widgetProspectLeads.отч_т')}</Link>}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
        {top.length === 0 ? (
          <p className="py-4 text-center text-[13px] text-[color:var(--workspace-text-muted)]">{t('dashboard.widgets.widgetProspectLeads.нет_перспективных_ли')}</p>
        ) : (
          <ul className="space-y-1">
            {top.map((l) => {
              const score = prospectScore(l)
              const tier = score > 7000 ? '#4ade80' : score > 3000 ? '#fbbf24' : '#60a5fa'
              return (
                <li key={l.id} className="flex items-center gap-2 rounded-lg border border-[color:var(--workspace-row-border)] bg-[var(--workspace-row-bg)] px-2.5 py-1.5">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: tier }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] text-[color:var(--workspace-text)]">{l.name ?? l.id}</p>
                    <p className="text-[10px] text-[color:var(--workspace-text-muted)]">{l.stageId} · {l.source}</p>
                  </div>
                  {l.commissionUsd != null && (
                    <span className="shrink-0 text-[11px] tabular-nums" style={{ color: tier }}>
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

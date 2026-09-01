import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { DeskShell, DeskHeader, DESK_HEADER_LINK_CLASS, REPORT_LINKS } from '../desk-shared'
import type { Deal } from '@/types/deals'
import type { WidgetSlot } from '@/config/widgets-config'
import { STAGE_LABELS, SUCCESS_DEAL_STAGE_SET } from '@/types/deals'
import { cn } from '@/lib/utils'
import { useI18n } from "@/i18n";

const STALE_DAYS_THRESHOLD = 3

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

function isStalledDeal(deal: Deal): boolean {
  if (SUCCESS_DEAL_STAGE_SET.has(deal.stage)) return false
  return daysSince(deal.updatedAt) >= STALE_DAYS_THRESHOLD
}

export function WidgetProblemDeals({ deals, slot }: { deals: Deal[]; slot: WidgetSlot }) {
  const { t } = useI18n();
  const allStalled = useMemo(() => {
    return deals
      .filter(isStalledDeal)
      .sort((a, b) => daysSince(b.updatedAt) - daysSince(a.updatedAt))
  }, [deals])

  const stalled = useMemo(
    () => allStalled.slice(0, slot === 'big' ? 14 : slot === 'med' ? 6 : 4),
    [allStalled, slot],
  )
  const totalStalled = allStalled.length

  return (
    <DeskShell
      accent="#f87171"
      className={cn('flex flex-col', stalled.length > 0 && 'ring-1 ring-red-500/25')}
    >
      <DeskHeader
        icon={<AlertTriangle className="size-5" strokeWidth={2} />}
        title={t('dashboard.widgets.widgetProblemDeals.сделки_без_движения')}
        accentColor="#f87171"
        right={
          <div className="flex items-center gap-2">
            {slot === 'small' ? null : (
              <span className="rounded-full border border-[#f8717155] bg-[#f8717112] px-2 py-1 text-[11px] leading-none text-[#fecaca]">
                {t('dashboard.widgets.widgetProblemDeals.всего')}{totalStalled}
              </span>
            )}
            <Link to={REPORT_LINKS.deals} className={DESK_HEADER_LINK_CLASS}>
              {t('dashboard.widgets.widgetProblemDeals.отч_т')}
            </Link>
          </div>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
        {slot === 'small' && totalStalled > 0 ? (
          <p className="mb-1.5 rounded-md border border-[#f8717155] bg-[#f8717112] px-2 py-1 text-[11px] leading-none text-[#fecaca]">
            {t('dashboard.widgets.widgetProblemDeals.всего')}{totalStalled}
          </p>
        ) : null}
        {stalled.length === 0 ? (
          <p className="py-4 text-center text-[13px] text-emerald-400 sm:text-[14px]">
            {t('dashboard.widgets.widgetProblemDeals.все_сделки_двигаются')}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {stalled.map((deal) => {
              const days = daysSince(deal.updatedAt)
              return (
                <li
                  key={deal.id}
                  className="flex items-center gap-2 rounded-lg border border-red-500/35 bg-red-500/[0.08] px-2.5 py-1.5"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/dashboard/deals/${deal.id}`}
                      className="block truncate text-[12px] text-[color:var(--theme-accent-link-dim)] hover:text-[color:var(--workspace-text)] hover:underline sm:text-[13px]"
                    >
                      {deal.clientName}
                    </Link>
                    <p className="truncate text-[11px] text-[color:var(--workspace-text-muted)] sm:text-[12px]">
                      {STAGE_LABELS[deal.stage]}
                    </p>
                  </div>
                  <span className="shrink-0 rounded px-2 py-1 text-right text-[10px] font-normal uppercase leading-tight text-[#fecaca] sm:text-[11px]" style={{ border: '1px solid #f8717155' }}>
                    {t('dashboard.widgets.widgetProblemDeals.дней_без_движения').replace('{{days}}', String(days))}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </DeskShell>
  )
}

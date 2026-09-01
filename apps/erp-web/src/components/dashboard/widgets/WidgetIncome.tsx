import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { BadgeDollarSign } from 'lucide-react'
import {
  DESK_HEADER_LINK_CLASS,
  DeskHeader,
  DeskHero,
  DeskKpi,
  DeskMiniStats,
  DeskShell,
  REPORT_LINKS,
} from '../desk-shared'
import type { Deal } from '@/types/deals'
import type { WidgetSlot } from '@/config/widgets-config'
import { cn } from '@/lib/utils'
import { useI18n } from "@/i18n";

const INCOME_MOCK = {
  earnedCommission: 816000,
  expectedCommission: 1460000,
  bonuses: 45000,
  forecastMonthEnd: 2100000,
  target: 3000000,
}

export function WidgetIncome({ deals, slot }: { deals: Deal[]; slot: WidgetSlot }) {
    const { t } = useI18n();
  const closedDeals = useMemo(() => deals.filter((deal) => deal.stage === 'deal'), [deals])
  const activeDeals = useMemo(() => deals.filter((deal) => deal.stage !== 'deal'), [deals])
  const earned = closedDeals.reduce((sum, deal) => sum + deal.commission, 0) || INCOME_MOCK.earnedCommission
  const expected = activeDeals.reduce((sum, deal) => sum + deal.commission, 0) || INCOME_MOCK.expectedCommission
  const target = INCOME_MOCK.target
  const pctEarned = Math.round((earned / target) * 100)
  const pctExpected = Math.round(((earned + expected) / target) * 100)
  const projected = earned + expected + INCOME_MOCK.bonuses
  const projectedPct = Math.min(100, Math.round((projected / target) * 100))
  const gapToTarget = Math.max(0, target - projected)
  const revenueRisk = pctEarned < 70

  if (slot === 'small') {
    return (
      <DeskShell accent="#4ade80" className={cn('flex flex-col', revenueRisk && 'ring-1 ring-amber-500/30')}>
        <DeskHeader
          icon={<BadgeDollarSign className="size-4" strokeWidth={2} />}
          title={t('dashboard.widgets.widgetIncome.доход')}
          accentColor="#4ade80"
          layout="compact"
          right={<Link to={REPORT_LINKS.finance} className={DESK_HEADER_LINK_CLASS}>{t('dashboard.widgets.widgetIncome.отч_т')}</Link>}
        />
        <DeskHero
          label={t('dashboard.widgets.widgetIncome.заработано')}
          value={`$${(earned / 1000).toFixed(0)}k`}
          sub={`/ $${(target / 1000).toFixed(0)}k цель`}
          color="#4ade80"
          pct={pctEarned}
        />
        <DeskMiniStats
          items={[
            { label: 'Ожид.', value: `$${(expected / 1000).toFixed(0)}k`, color: '#fbbf24' },
            { label: 'Прогноз', value: `$${(projected / 1000).toFixed(0)}k`, color: '#60a5fa' },
            { label: 'Разрыв', value: `$${(gapToTarget / 1000).toFixed(0)}k`, color: gapToTarget > 0 ? '#fb7185' : '#4ade80' },
          ]}
        />
      </DeskShell>
    )
  }

  if (slot === 'med') {
    return (
      <DeskShell accent="#4ade80" className={cn('flex flex-col', revenueRisk && 'ring-1 ring-amber-500/30')}>
        <DeskHeader
          icon={<BadgeDollarSign className="size-5" strokeWidth={2} />}
          title={t('dashboard.widgets.widgetIncome.доход_и_финрезультат')}
          accentColor="#4ade80"
          right={<Link to={REPORT_LINKS.finance} className={DESK_HEADER_LINK_CLASS}>{t('dashboard.widgets.widgetIncome.отч_т')}</Link>}
        />
        <div className="min-h-0 flex-1 overflow-hidden px-3 py-2.5">
          <div className="grid h-full min-h-0 grid-cols-[1.1fr_1fr] gap-2">
            <div className="flex min-h-0 flex-col justify-between rounded-lg border border-[#4ade8033] bg-[#4ade800f] px-3 py-2.5">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-[color:var(--workspace-text-dim)]">{t('dashboard.widgets.widgetIncome.закрытая_комиссия')}</p>
                <p className="mt-1 text-[30px] font-light leading-none text-[#4ade80]">${(earned / 1000).toFixed(0)}k</p>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-[11px] text-[color:var(--workspace-text-muted)]">
                  <span>{t('dashboard.widgets.widgetIncome.факт')}</span>
                  <span>{pctEarned}{t('dashboard.widgets.widgetIncome.цели')}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-[rgba(255,255,255,0.07)]">
                  <div className="h-full rounded-full bg-[#4ade80]" style={{ width: `${Math.min(100, pctEarned)}%` }} />
                </div>
              </div>
            </div>
            <div className="grid min-h-0 grid-rows-3 gap-1.5">
              <DeskKpi label={t('dashboard.widgets.widgetIncome.ожидается')} value={`$${(expected / 1000).toFixed(0)}k`} color="#fbbf24" />
              <DeskKpi label={t('dashboard.widgets.widgetIncome.прогноз')} value={`$${(projected / 1000).toFixed(0)}k`} color="#60a5fa" />
              <DeskKpi label={t('dashboard.widgets.widgetIncome.разрыв')} value={`$${(gapToTarget / 1000).toFixed(0)}k`} color={gapToTarget > 0 ? '#fb7185' : '#4ade80'} />
            </div>
          </div>
        </div>
      </DeskShell>
    )
  }

  return (
    <DeskShell accent="#4ade80" className={cn('flex flex-col', revenueRisk && 'ring-1 ring-amber-500/30')}>
      <DeskHeader
        icon={<BadgeDollarSign className="size-5" strokeWidth={2} />}
        title={t('dashboard.widgets.widgetIncome.доход_и_финрезультат')}
        accentColor="#4ade80"
        right={<Link to={REPORT_LINKS.finance} className={DESK_HEADER_LINK_CLASS}>{t('dashboard.widgets.widgetIncome.отч_т')}</Link>}
      />
      <div className="min-h-0 flex-1 overflow-hidden p-3">
        <div className="grid h-full min-h-0 grid-rows-[auto_auto_1fr] gap-2">
          <div className="grid grid-cols-[1.18fr_0.82fr] gap-2">
            <div className="rounded-xl border border-[#4ade8038] bg-[#4ade800f] px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[12px] uppercase tracking-wide text-[color:var(--workspace-text-dim)]">{t('dashboard.widgets.widgetIncome.закрытая_комиссия')}</p>
                  <p className="mt-1.5 text-[38px] font-light leading-none text-[#4ade80]">${(earned / 1000).toFixed(0)}k</p>
                  <p className="mt-1 text-[12px] text-[color:var(--workspace-text-muted)]">
                    {t('dashboard.widgets.widgetIncome.цель_месяца')}{(target / 1000).toFixed(0)}k
                  </p>
                </div>
                <span className="rounded-full border border-[#4ade8055] bg-[#4ade8014] px-2.5 py-1 text-[13px] text-[#bbf7d0]">
                  {pctEarned}%
                </span>
              </div>
            </div>
            <div className="grid gap-2">
              <DeskKpi label={t('dashboard.widgets.widgetIncome.ожидается')} value={`$${(expected / 1000).toFixed(0)}k`} color="#fbbf24" />
              <DeskKpi label={t('dashboard.widgets.widgetIncome.бонусы')} value={`$${(INCOME_MOCK.bonuses / 1000).toFixed(1)}k`} color="#a78bfa" />
            </div>
          </div>

          <div className="rounded-lg border border-[color:var(--workspace-row-border)] bg-[var(--workspace-row-bg)] px-3 py-2.5">
            <div className="mb-1.5 flex items-center justify-between text-[12px] text-[color:var(--workspace-text-muted)]">
              <span>{t('dashboard.widgets.widgetIncome.факт')}</span>
              <span>{t('dashboard.widgets.widgetIncome.факт_ожидания_бонусы')}{projectedPct}%</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-[rgba(255,255,255,0.07)]">
              <div className="h-full rounded-full bg-[#4ade80]" style={{ width: `${Math.min(100, pctEarned)}%` }} />
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[rgba(255,255,255,0.05)]">
              <div className="h-full rounded-full bg-[#fbbf24]/75" style={{ width: `${Math.min(100, pctExpected)}%` }} />
            </div>
          </div>

          <div className="grid min-h-0 grid-cols-2 gap-2">
            <div className="min-h-0 rounded-lg border border-[color:var(--workspace-row-border)] bg-[var(--workspace-row-bg)] px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-wide text-[color:var(--workspace-text-dim)]">{t('dashboard.widgets.widgetIncome.финансовый_контроль')}</p>
              <div className="mt-2 space-y-2">
                {[
                  { label: 'Прогноз к концу месяца', value: `$${(projected / 1000).toFixed(0)}k`, color: '#60a5fa' },
                  { label: 'Разрыв до цели', value: `$${(gapToTarget / 1000).toFixed(0)}k`, color: gapToTarget > 0 ? '#fb7185' : '#4ade80' },
                  { label: 'Активных сделок', value: String(activeDeals.length), color: '#fbbf24' },
                ].map((row) => (
                  <div key={row.label} className="flex items-end justify-between gap-2">
                    <span className="text-[12px] text-[color:var(--workspace-text-muted)]">{row.label}</span>
                    <span className="text-[17px] leading-none" style={{ color: row.color }}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="min-h-0 overflow-hidden rounded-lg border border-[color:var(--workspace-row-border)] bg-[var(--workspace-row-bg)] px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-wide text-[color:var(--workspace-text-dim)]">{t('dashboard.widgets.widgetIncome.ближайшие_денежные_т')}</p>
              <ul className="mt-2 space-y-1.5">
                {[...activeDeals, ...closedDeals].slice(0, 4).map((deal) => (
                  <li key={deal.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[12px] text-[color:var(--workspace-text)]">{deal.clientName}</span>
                    <span className="shrink-0 text-[13px] tabular-nums text-[#4ade80]">${(deal.commission / 1000).toFixed(0)}k</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </DeskShell>
  )
}

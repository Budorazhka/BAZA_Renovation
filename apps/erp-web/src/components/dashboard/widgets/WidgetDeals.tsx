import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Handshake } from 'lucide-react'
import { DeskShell, DeskHeader, DeskTab, DeskKpi, MiniBar, DESK_HEADER_LINK_CLASS, REPORT_LINKS } from '../desk-shared'
import type { Deal } from '@/types/deals'
import type { WidgetSlot } from '@/config/widgets-config'
import { cn } from '@/lib/utils'
import { useI18n } from "@/i18n";

const STAGE_LABELS: Record<string, string> = {
  showing: 'Показ',
  deposit: 'Задаток',
  deal:    'Договор',
}

const STAGE_COLORS: Record<string, string> = {
  showing: '#60a5fa',
  deposit: '#fbbf24',
  deal:    '#4ade80',
}

type DealTab = 'active' | 'risk' | 'all'

export function WidgetDeals({ deals, slot }: { deals: Deal[]; slot: WidgetSlot }) {
    const { t } = useI18n();
  const [tab, setTab] = useState<DealTab>('active')

  const active = useMemo(() => deals.filter((d) => d.stage === 'showing' || d.stage === 'deposit'), [deals])
  const risky  = useMemo(() => deals.filter((d) => d.checklist.some((c) => c.required && !c.done)), [deals])

  const activeCommission = useMemo(() => active.reduce((s, d) => s + d.commission, 0), [active])

  const displayed = tab === 'active' ? active : tab === 'risk' ? risky : deals

  if (slot === 'small') {
    return (
      <DeskShell accent="#fbbf24" className="flex flex-col">
        <DeskHeader
          icon={<Handshake className="size-4" strokeWidth={2} />}
          title={t('dashboard.widgets.widgetDeals.сделки')}
          accentColor="#fbbf24"
          layout="compact"
          right={<Link to={REPORT_LINKS.deals} className={DESK_HEADER_LINK_CLASS}>{t('dashboard.widgets.widgetDeals.отч_т')}</Link>}
        />
        <div className="flex min-h-0 flex-1 flex-col justify-between gap-2 px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-[color:var(--workspace-text-dim)]">{t('dashboard.widgets.widgetDeals.активных')}</p>
              <p className="mt-1 text-[34px] font-light leading-none text-[#fbbf24]">{active.length}</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wide text-[color:var(--workspace-text-dim)]">{t('dashboard.widgets.widgetDeals.комиссия')}</p>
              <p className="mt-1 text-[20px] leading-none text-[#4ade80]">${(activeCommission / 1000).toFixed(0)}k</p>
              <p className="mt-1 text-[11px] text-[#fb7185]">{risky.length} {t('dashboard.widgets.widgetDeals.в_риске')}</p>
            </div>
          </div>
          <div className="space-y-1.5">
            {(['showing', 'deposit', 'deal'] as const).map((stage) => {
              const count = deals.filter((deal) => deal.stage === stage).length
              const pct = deals.length > 0 ? (count / deals.length) * 100 : 0
              return (
                <div key={stage} className="grid grid-cols-[4.5rem_1fr_1.5rem] items-center gap-2">
                  <span className="truncate text-[11px] text-[color:var(--workspace-text-muted)]">{STAGE_LABELS[stage]}</span>
                  <MiniBar pct={pct} color={STAGE_COLORS[stage]} />
                  <span className="text-right text-[12px] tabular-nums text-[color:var(--workspace-text)]">{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      </DeskShell>
    )
  }

  if (slot === 'med') {
    return (
      <DeskShell accent="#fbbf24" className="flex flex-col">
        <DeskHeader
          icon={<Handshake className="size-4" strokeWidth={2} />}
          title={t('dashboard.widgets.widgetDeals.сделки')}
          accentColor="#fbbf24"
          layout="compact"
          right={<Link to={REPORT_LINKS.deals} className={DESK_HEADER_LINK_CLASS}>{t('dashboard.widgets.widgetDeals.отч_т')}</Link>}
        />
        <div className="grid shrink-0 grid-cols-2 gap-1.5 p-2.5 pb-1.5">
          <DeskKpi label={t('dashboard.widgets.widgetDeals.активных')} value={String(active.length)} color="#fbbf24" pct={deals.length > 0 ? (active.length / deals.length) * 100 : 0} />
          <DeskKpi label={t('dashboard.widgets.widgetDeals.комиссия_ожид')} value={`$${(activeCommission / 1000).toFixed(0)}k`} color="#4ade80" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-1.5">
          {active.length === 0 ? (
            <p className="py-3 text-center text-[13px] text-[color:var(--workspace-text-muted)]">{t('dashboard.widgets.widgetDeals.нет_активных_сделок')}</p>
          ) : (
            <ul className="space-y-1">
              {active.slice(0, 5).map((d) => {
                const color = STAGE_COLORS[d.stage] ?? '#94a3b8'
                const hasRisk = d.checklist.some((c) => c.required && !c.done)
                return (
                  <li key={d.id} className={cn(
                    'flex items-center gap-2 rounded-lg border px-2.5 py-1.5',
                    hasRisk ? 'border-red-500/25 bg-red-500/[0.05]' : 'border-[color:var(--workspace-row-border)] bg-[var(--workspace-row-bg)]',
                  )}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] text-[color:var(--workspace-text)]">{d.clientName}</p>
                      <p className="truncate text-[10px] text-[color:var(--workspace-text-muted)]">{d.propertyAddress}</p>
                    </div>
                    <span className="shrink-0 rounded px-1.5 py-px text-[10px] uppercase" style={{ color, border: `1px solid ${color}55` }}>
                      {STAGE_LABELS[d.stage] ?? d.stage}
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

  return (
    <DeskShell accent="#fbbf24" className="flex flex-col">
      <DeskHeader
        icon={<Handshake className="size-5" strokeWidth={2} />}
        title={t('dashboard.widgets.widgetDeals.сделки')}
        accentColor="#fbbf24"
        right={<Link to={REPORT_LINKS.deals} className={DESK_HEADER_LINK_CLASS}>{t('dashboard.widgets.widgetDeals.отч_т')}</Link>}
      />
      <div className="flex shrink-0 gap-1 border-b border-[color:var(--workspace-row-border)] px-2.5 py-1.5">
        <DeskTab variant="main" active={tab === 'active'} onClick={() => setTab('active')}>{t('dashboard.widgets.widgetDeals.активные')}</DeskTab>
        <DeskTab variant="main" active={tab === 'risk'} onClick={() => setTab('risk')}>{t('dashboard.widgets.widgetDeals.в_риске')}</DeskTab>
        <DeskTab variant="main" active={tab === 'all'} onClick={() => setTab('all')}>{t('dashboard.widgets.widgetDeals.все')}</DeskTab>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
        <div className="mb-2 grid grid-cols-2 gap-1.5">
          <DeskKpi label={t('dashboard.widgets.widgetDeals.активных')} value={String(active.length)} color="#fbbf24" pct={deals.length > 0 ? (active.length / deals.length) * 100 : 0} />
          <DeskKpi label={t('dashboard.widgets.widgetDeals.комиссия_ожид')} value={`$${(activeCommission / 1000).toFixed(0)}k`} color="#4ade80" />
        </div>
        {displayed.length === 0 ? (
          <p className="py-4 text-center text-[13px] text-[color:var(--workspace-text-muted)]">{t('dashboard.widgets.widgetDeals.нет_сделок_в_этой_ка')}</p>
        ) : (
          <ul className="space-y-1">
            {displayed.map((d) => {
              const color = STAGE_COLORS[d.stage] ?? '#94a3b8'
              const hasRisk = d.checklist.some((c) => c.required && !c.done)
              return (
                <li key={d.id} className={cn(
                  'flex items-center gap-2 rounded-lg border px-2.5 py-1.5',
                  hasRisk ? 'border-red-500/25 bg-red-500/[0.05]' : 'border-[color:var(--workspace-row-border)] bg-[var(--workspace-row-bg)]',
                )}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] text-[color:var(--workspace-text)]">{d.clientName}</p>
                    <p className="truncate text-[10px] text-[color:var(--workspace-text-muted)]">{d.propertyAddress}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <span className="rounded px-1.5 py-px text-[10px] uppercase" style={{ color, border: `1px solid ${color}55` }}>
                      {STAGE_LABELS[d.stage] ?? d.stage}
                    </span>
                    <span className="text-[10px] tabular-nums text-[color:var(--workspace-text-muted)]">
                      ${(d.commission / 1000).toFixed(0)}k
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </DeskShell>
  )
}

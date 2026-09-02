import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3 } from 'lucide-react'
import { DeskShell, DeskHeader, DeskTab, DeskKpi, MiniBar, DESK_HEADER_LINK_CLASS, REPORT_LINKS } from '../desk-shared'
import type { Lead } from '@/types/leads'
import type { WidgetSlot } from '@/config/widgets-config'
import { useI18n } from "@/i18n";

const SOURCE_LABELS: Record<string, string> = {
  primary:      'Первичка',
  secondary:    'Вторичка',
  rent:         'Аренда',
  ad_campaigns: 'Реклама',
}

const MOCK_MARKETING = {
  totalBudget: 48000,
  spent: 31500,
  cpl: { primary: 210, secondary: 185, rent: 95, ad_campaigns: 145 },
  romi: 3.4,
  cac: 1850,
}

type MktTab = 'channels' | 'cpl' | 'romi'

export function WidgetMarketing({ leads, slot }: { leads: Lead[]; slot: WidgetSlot }) {
    const { t } = useI18n();
  const [tab, setTab] = useState<MktTab>('channels')

  const bySource: Record<string, number> = {}
  for (const l of leads) bySource[l.source] = (bySource[l.source] ?? 0) + 1
  const total = leads.length || 1
  const maxSource = Math.max(1, ...Object.values(bySource))

  const sources = Object.entries(SOURCE_LABELS).map(([id, label]) => ({
    id, label, count: bySource[id] ?? 0,
    cpl: MOCK_MARKETING.cpl[id as keyof typeof MOCK_MARKETING.cpl] ?? 0,
    pct: Math.round(((bySource[id] ?? 0) / maxSource) * 100),
    share: Math.round(((bySource[id] ?? 0) / total) * 100),
  }))

  if (slot === 'small') {
    const avgCpl = Math.round(Object.values(MOCK_MARKETING.cpl).reduce((a, b) => a + b, 0) / 4)
    return (
      <DeskShell accent="#c084fc" className="flex flex-col">
        <DeskHeader
          icon={<BarChart3 className="size-4" strokeWidth={2} />}
          title={t('dashboard.widgets.widgetMarketing.маркетинг')}
          accentColor="#c084fc"
          layout="compact"
          right={<Link to={REPORT_LINKS.marketing} className={DESK_HEADER_LINK_CLASS}>{t('dashboard.widgets.widgetMarketing.отч_т')}</Link>}
        />
        <div className="flex min-h-0 flex-1 flex-col justify-between gap-2 px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-[color:var(--workspace-text-dim)]">ROMI</p>
              <p className="mt-1 text-[34px] font-light leading-none text-[#4ade80]">×{MOCK_MARKETING.romi}</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wide text-[color:var(--workspace-text-dim)]">{t('dashboard.widgets.widgetMarketing.бюджет')}</p>
              <p className="mt-1 text-[20px] leading-none text-[#c084fc]">${(MOCK_MARKETING.spent / 1000).toFixed(0)}k</p>
              <p className="mt-1 text-[11px] text-[color:var(--workspace-text-muted)]">CPL ${avgCpl}</p>
            </div>
          </div>
          <div className="space-y-1.5">
            {sources.slice(0, 3).map((source) => (
              <div key={source.id} className="grid grid-cols-[4.6rem_1fr_2rem] items-center gap-2">
                <span className="truncate text-[11px] text-[color:var(--workspace-text-muted)]">{source.label}</span>
                <MiniBar pct={source.pct} color="#c084fc" />
                <span className="text-right text-[12px] tabular-nums text-[color:var(--workspace-text)]">{source.count}</span>
              </div>
            ))}
          </div>
        </div>
      </DeskShell>
    )
  }

  return (
    <DeskShell accent="#c084fc" className="flex flex-col">
      <DeskHeader
        icon={<BarChart3 className="size-5" strokeWidth={2} />}
        title={t('dashboard.widgets.widgetMarketing.маркетинг')}
        accentColor="#c084fc"
        right={<Link to={REPORT_LINKS.marketing} className={DESK_HEADER_LINK_CLASS}>{t('dashboard.widgets.widgetMarketing.отч_т')}</Link>}
      />
      <div className="flex shrink-0 gap-1 border-b border-[color:var(--workspace-row-border)] px-2.5 py-1.5">
        <DeskTab variant="main" active={tab === 'channels'} onClick={() => setTab('channels')}>{t('dashboard.widgets.widgetMarketing.каналы')}</DeskTab>
        <DeskTab variant="main" active={tab === 'cpl'} onClick={() => setTab('cpl')}>CPL</DeskTab>
        <DeskTab variant="main" active={tab === 'romi'} onClick={() => setTab('romi')}>{t('dashboard.widgets.widgetMarketing.эффект')}</DeskTab>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2 space-y-1.5">
        {tab === 'channels' && (
          <>
            <div className="grid grid-cols-2 gap-1.5 mb-2">
              <DeskKpi label={t('dashboard.widgets.widgetMarketing.всего_лидов')} value={String(leads.length)} color="#c084fc" />
              <DeskKpi label={t('dashboard.widgets.widgetMarketing.бюджет')} value={`$${(MOCK_MARKETING.spent / 1000).toFixed(0)}k`} sub={`/ $${(MOCK_MARKETING.totalBudget / 1000).toFixed(0)}k`} pct={Math.round((MOCK_MARKETING.spent / MOCK_MARKETING.totalBudget) * 100)} color="#fb923c" />
            </div>
            <ul className="space-y-1">
              {sources.map((s) => (
                <li key={s.id} className="grid grid-cols-[1fr_auto] items-center gap-2">
                  <div>
                    <div className="flex justify-between text-[12px]">
                      <span className="text-[color:var(--workspace-text)]">{s.label}</span>
                      <span className="text-[color:var(--workspace-text-muted)]">{s.share}%</span>
                    </div>
                    <MiniBar pct={s.pct} color="#c084fc" />
                  </div>
                  <span className="shrink-0 text-[12px] tabular-nums text-[color:var(--workspace-text-muted)]">{s.count}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {tab === 'cpl' && (
          <ul className="space-y-1.5">
            {sources.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-[color:var(--workspace-row-border)] bg-[var(--workspace-row-bg)] px-2.5 py-2">
                <div>
                  <p className="text-[13px] text-[color:var(--workspace-text)]">{s.label}</p>
                  <p className="text-[10px] text-[color:var(--workspace-text-muted)]">{s.count} {t('dashboard.widgets.widgetMarketing.лидов')}</p>
                </div>
                <div className="text-right">
                  <p className="text-[13px] text-[#fbbf24]">${s.cpl}</p>
                  <p className="text-[10px] text-[color:var(--workspace-text-dim)]">{t('dashboard.widgets.widgetMarketing.за_лид')}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        {tab === 'romi' && (
          <div className="space-y-2">
            <div className="rounded-md border border-[color:var(--workspace-row-border)] bg-[var(--workspace-row-bg)] px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wide text-[color:var(--workspace-text-dim)]">ROMI</p>
              <p className="text-[24px] leading-none text-[#4ade80]">×{MOCK_MARKETING.romi}</p>
              <p className="mt-0.5 text-[11px] text-[color:var(--workspace-text-muted)]">{t('dashboard.widgets.widgetMarketing.вложили')}{(MOCK_MARKETING.spent / 1000).toFixed(0)}{t('dashboard.widgets.widgetMarketing.k_вернули')}{MOCK_MARKETING.romi}</p>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <DeskKpi label="CAC" value={`$${MOCK_MARKETING.cac}`} color="#60a5fa" />
              <DeskKpi label={t('dashboard.widgets.widgetMarketing.ср_cpl')} value={`$${Math.round(Object.values(MOCK_MARKETING.cpl).reduce((a, b) => a + b, 0) / 4)}`} color="#fbbf24" />
            </div>
          </div>
        )}
      </div>
    </DeskShell>
  )
}

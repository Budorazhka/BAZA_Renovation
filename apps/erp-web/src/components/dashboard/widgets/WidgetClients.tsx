import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users } from 'lucide-react'
import { DeskShell, DeskHeader, DeskTab, DeskHero, DeskMiniStats, DESK_HEADER_LINK_CLASS, REPORT_LINKS } from '../desk-shared'
import { LEAD_STATUS_LABELS, LEAD_STATUS_COLORS } from '@/types/leads'
import type { Lead } from '@/types/leads'
import type { WidgetSlot } from '@/config/widgets-config'
import { useI18n } from "@/i18n";

type ClientTab = 'all' | 'active' | 'in_progress' | 'no_contact' | 'with_deals' | 'lost' | 'best'

const TABS: { id: ClientTab; label: string }[] = [
  { id: 'all',        label: 'Все' },
  { id: 'active',     label: 'Активные' },
  { id: 'in_progress',label: 'В работе' },
  { id: 'no_contact', label: 'Без контакта' },
  { id: 'with_deals', label: 'Со сделками' },
  { id: 'lost',       label: 'Потерянные' },
  { id: 'best',       label: 'Лучшие' },
]

function filterLeads(tab: ClientTab, list: Lead[]): Lead[] {
  switch (tab) {
    case 'active':      return list.filter((l) => l.status !== 'lost' && l.status !== 'postponed')
    case 'in_progress': return list.filter((l) => l.status === 'in_progress')
    case 'no_contact':  return list.filter((l) => l.status === 'no_answer')
    case 'with_deals':  return list.filter((l) => (l.commissionUsd ?? 0) > 0)
    case 'lost':        return list.filter((l) => l.status === 'lost')
    case 'best':        return [...list].sort((a, b) => (b.commissionUsd ?? 0) - (a.commissionUsd ?? 0)).slice(0, 12)
    default:            return list
  }
}

export function WidgetClients({ leads, slot }: { leads: Lead[]; slot: WidgetSlot }) {
    const { t } = useI18n();
  const [tab, setTab] = useState<ClientTab>('all')
  const rows = useMemo(() => filterLeads(tab, leads).slice(0, 16), [tab, leads])
  const isSmall = slot === 'small'

  if (isSmall) {
    const active = leads.filter((l) => l.status !== 'lost' && l.status !== 'postponed').length
    return (
      <DeskShell accent="#8b5cf6" className="flex flex-col">
        <DeskHeader
          icon={<Users className="size-4" strokeWidth={2} />}
          title={t('dashboard.widgets.widgetClients.клиенты')}
          accentColor="#8b5cf6"
          layout="compact"
          right={<Link to={REPORT_LINKS.leads} className={DESK_HEADER_LINK_CLASS}>{t('dashboard.widgets.widgetClients.отч_т')}</Link>}
        />
        <DeskHero
          label={t('dashboard.widgets.widgetClients.активных_клиентов')}
          value={String(active)}
          color="#8b5cf6"
          pct={leads.length > 0 ? (active / leads.length) * 100 : 0}
        />
        <DeskMiniStats
          items={[
            { label: 'Всего', value: String(leads.length), color: '#94a3b8' },
            { label: 'Без контакта', value: String(leads.filter((l) => l.status === 'no_answer').length), color: '#fb923c' },
            { label: 'Потерянных', value: String(leads.filter((l) => l.status === 'lost').length), color: '#f87171' },
          ]}
        />
      </DeskShell>
    )
  }

  return (
    <DeskShell accent="#8b5cf6" className="flex flex-col">
      <DeskHeader
        icon={<Users className="size-5" strokeWidth={2} />}
        title={t('dashboard.widgets.widgetClients.клиенты')}
        accentColor="#8b5cf6"
        right={<Link to={REPORT_LINKS.leads} className={DESK_HEADER_LINK_CLASS}>{t('dashboard.widgets.widgetClients.отч_т')}</Link>}
      />
      <div className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-[color:var(--workspace-row-border)] px-2 py-1.5">
        {TABS.map((t) => (
          <DeskTab key={t.id} variant="main" active={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </DeskTab>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
        {rows.length === 0 ? (
          <p className="py-4 text-center text-[13px] text-[color:var(--workspace-text-muted)]">{t('dashboard.widgets.widgetClients.пусто_в_этой_выборке')}</p>
        ) : (
          <ul className="space-y-1">
            {rows.map((l) => {
              const st = l.status
              const color = st ? LEAD_STATUS_COLORS[st] : 'var(--workspace-text-muted)'
              const label = st ? LEAD_STATUS_LABELS[st] : l.stageId
              return (
                <li key={l.id} className="flex items-center justify-between gap-2 rounded-lg border border-[color:var(--workspace-row-border)] bg-[var(--workspace-row-bg)] px-2.5 py-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] text-[color:var(--workspace-text)]">{l.name ?? l.id}</p>
                    <p className="text-[10px] text-[color:var(--workspace-text-muted)]">
                      {l.commissionUsd != null ? `≈$${(l.commissionUsd / 1000).toFixed(0)}k · ` : ''}
                      {l.updatedAt?.slice(0, 10) ?? '—'}
                    </p>
                  </div>
                  <span className="shrink-0 rounded px-1.5 py-px text-[10px] uppercase" style={{ color, border: `1px solid ${color}55` }}>
                    {label}
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

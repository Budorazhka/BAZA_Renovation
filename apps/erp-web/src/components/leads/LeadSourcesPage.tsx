import { useMemo, useState } from 'react'
import { AlertTriangle, BarChart3, Filter, Radio, TrendingUp } from 'lucide-react'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { useI18n } from "@/i18n";

type ChannelType = 'paid' | 'organic' | 'partner'

const TYPE_LABEL: Record<ChannelType, string> = {
  paid: 'Платный',
  organic: 'Органика',
  partner: 'Партнёрский',
}

const SOURCES: Array<{
  id: string
  source: string
  type: ChannelType
  leads: number
  cpl: number
  convPct: number
  spendUsd: number
}> = [
  { id: 's1', source: 'Контекстная реклама', type: 'paid', leads: 124, cpl: 42, convPct: 11, spendUsd: 5208 },
  { id: 's2', source: 'Реферальный канал', type: 'partner', leads: 66, cpl: 18, convPct: 18, spendUsd: 1188 },
  { id: 's3', source: 'Соцсети', type: 'organic', leads: 93, cpl: 27, convPct: 9, spendUsd: 2511 },
  { id: 's4', source: 'Агрегаторы', type: 'paid', leads: 88, cpl: 55, convPct: 7, spendUsd: 4840 },
  { id: 's5', source: 'SEO / сайт', type: 'organic', leads: 41, cpl: 12, convPct: 14, spendUsd: 492 },
  { id: 's6', source: 'Выставки и офлайн', type: 'partner', leads: 28, cpl: 62, convPct: 21, spendUsd: 1736 },
]

const WEEKLY: Array<{ week: string; leads: number; spend: number }> = [
  { week: 'Неделя 14', leads: 52, spend: 2100 },
  { week: 'Неделя 13', leads: 48, spend: 1980 },
  { week: 'Неделя 12', leads: 61, spend: 2340 },
  { week: 'Неделя 11', leads: 44, spend: 1890 },
  { week: 'Неделя 10', leads: 55, spend: 2200 },
  { week: 'Неделя 9', leads: 39, spend: 1650 },
  { week: 'Неделя 8', leads: 42, spend: 1720 },
  { week: 'Неделя 7', leads: 38, spend: 1580 },
]

const money = new Intl.NumberFormat('ru-RU')

export default function LeadSourcesPage() {
    const { t } = useI18n();
  const [typeFilter, setTypeFilter] = useState<'all' | ChannelType>('all')
  const [period, setPeriod] = useState<'4w' | '8w'>('8w')
  const [highCpl, setHighCpl] = useState(false)

  const filtered = useMemo(() => {
    let rows = [...SOURCES]
    if (typeFilter !== 'all') rows = rows.filter((s) => s.type === typeFilter)
    if (highCpl) rows = rows.filter((s) => s.cpl >= 40)
    return rows
  }, [highCpl, typeFilter])

  const filteredWeeks = useMemo(() => (period === '4w' ? WEEKLY.slice(0, 4) : WEEKLY), [period])

  const kpi = useMemo(() => {
    const leads = filtered.reduce((s, r) => s + r.leads, 0)
    const spend = filtered.reduce((s, r) => s + r.spendUsd, 0)
    const avgCpl = leads > 0 ? Math.round(spend / leads) : 0
    const avgConv =
      leads > 0 ? Math.round(filtered.reduce((a, r) => a + r.convPct * r.leads, 0) / leads) : 0
    return { leads, spend, avgCpl, avgConv, channels: filtered.length }
  }, [filtered])

  const expensive = useMemo(() => [...SOURCES].sort((a, b) => b.cpl - a.cpl).slice(0, 3), [])
  const maxLeads = Math.max(1, ...filteredWeeks.map((w) => w.leads))

  return (
    <DashboardShell>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto w-full max-w-6xl space-y-4">
          <div>
            <h1 className="text-xl font-normal text-[color:var(--theme-accent-heading)]">{t('leads.leadSourcesPage.источники_лидов')}</h1>
            <p className="mt-1 text-sm text-[color:var(--app-text-muted)]">
              {t('leads.leadSourcesPage.каналы_привлечения_о')}</p>
          </div>

          <section className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3">
            <div className="mb-3 flex items-center gap-2">
              <Filter className="size-4 text-[color:var(--gold)]" />
              <h2 className="text-sm font-normal text-[color:var(--theme-accent-heading)]">{t('leads.leadSourcesPage.фильтры')}</h2>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as 'all' | ChannelType)}
                className="rounded-md border border-[var(--workspace-row-border)] bg-[var(--workspace-row-bg)] px-2 py-2 text-sm text-[color:var(--workspace-text)]"
              >
                <option value="all">{t('leads.leadSourcesPage.тип_все_каналы')}</option>
                <option value="paid">{t('leads.leadSourcesPage.платный')}</option>
                <option value="organic">{t('leads.leadSourcesPage.органика')}</option>
                <option value="partner">{t('leads.leadSourcesPage.партн_рский')}</option>
              </select>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as '4w' | '8w')}
                className="rounded-md border border-[var(--workspace-row-border)] bg-[var(--workspace-row-bg)] px-2 py-2 text-sm text-[color:var(--workspace-text)]"
              >
                <option value="4w">{t('leads.leadSourcesPage.динамика_4_недели')}</option>
                <option value="8w">{t('leads.leadSourcesPage.динамика_8_недель')}</option>
              </select>
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-[var(--workspace-row-border)] bg-[var(--workspace-row-bg)] px-2 py-2 text-sm text-[color:var(--workspace-text)]">
                <input type="checkbox" checked={highCpl} onChange={(e) => setHighCpl(e.target.checked)} className="rounded border-[var(--workspace-row-border)]" />
                {t('leads.leadSourcesPage.cpl_выше_40')}</label>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <div className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3">
              <p className="text-[10px] uppercase text-[color:var(--app-text-subtle)]">{t('leads.leadSourcesPage.лидов_фильтр')}</p>
              <p className="text-xl font-normal text-blue-300">{kpi.leads}</p>
            </div>
            <div className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3">
              <p className="text-[10px] uppercase text-[color:var(--app-text-subtle)]">{t('leads.leadSourcesPage.расход')}</p>
              <p className="text-xl font-normal text-amber-300">{money.format(kpi.spend)}</p>
            </div>
            <div className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3">
              <p className="text-[10px] uppercase text-[color:var(--app-text-subtle)]">{t('leads.leadSourcesPage.ср_cpl')}</p>
              <p className="text-xl font-normal text-[color:var(--workspace-text)]">${kpi.avgCpl}</p>
            </div>
            <div className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3">
              <p className="text-[10px] uppercase text-[color:var(--app-text-subtle)]">{t('leads.leadSourcesPage.ср_конверсия')}</p>
              <p className="text-xl font-normal text-emerald-300">{kpi.avgConv}%</p>
            </div>
            <div className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3">
              <p className="text-[10px] uppercase text-[color:var(--app-text-subtle)]">{t('leads.leadSourcesPage.каналов')}</p>
              <p className="text-xl font-normal text-[color:var(--workspace-text)]">{kpi.channels}</p>
            </div>
          </section>

          <section className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3">
            <div className="mb-3 flex items-center gap-2">
              <Radio className="size-4 text-[color:var(--gold)]" />
              <h2 className="text-sm font-normal text-[color:var(--theme-accent-heading)]">{t('leads.leadSourcesPage.каналы')}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--workspace-row-border)] text-left text-[11px] uppercase tracking-wide text-[color:var(--app-text-subtle)]">
                    <th className="px-2 py-2">{t('leads.leadSourcesPage.канал')}</th>
                    <th className="px-2 py-2">{t('leads.leadSourcesPage.тип')}</th>
                    <th className="px-2 py-2">{t('leads.leadSourcesPage.лиды')}</th>
                    <th className="px-2 py-2">{t('leads.leadSourcesPage.расход')}</th>
                    <th className="px-2 py-2">CPL</th>
                    <th className="px-2 py-2">{t('leads.leadSourcesPage.конверсия')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered
                    .slice()
                    .sort((a, b) => b.leads - a.leads)
                    .map((row) => (
                      <tr key={row.id} className="border-b border-[color:var(--workspace-row-border)]">
                        <td className="px-2 py-2 font-medium text-[color:var(--workspace-text)]">{row.source}</td>
                        <td className="px-2 py-2 text-[color:var(--workspace-text-muted)]">{TYPE_LABEL[row.type]}</td>
                        <td className="px-2 py-2 text-blue-300">{row.leads}</td>
                        <td className="px-2 py-2 text-[color:var(--workspace-text)]">{money.format(row.spendUsd)}</td>
                        <td className={row.cpl >= 45 ? 'px-2 py-2 text-amber-300' : 'px-2 py-2 text-[color:var(--workspace-text)]'}>${row.cpl}</td>
                        <td className="px-2 py-2 text-emerald-300">{row.convPct}%</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3">
            <div className="mb-3 flex items-center gap-2">
              <BarChart3 className="size-4 text-[color:var(--gold)]" />
              <h2 className="text-sm font-normal text-[color:var(--theme-accent-heading)]">{t('leads.leadSourcesPage.динамика_агрегат')}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--workspace-row-border)] text-left text-[11px] uppercase tracking-wide text-[color:var(--app-text-subtle)]">
                    <th className="px-2 py-2">{t('leads.leadSourcesPage.неделя')}</th>
                    <th className="px-2 py-2">{t('leads.leadSourcesPage.лиды')}</th>
                    <th className="px-2 py-2">{t('leads.leadSourcesPage.расход')}</th>
                    <th className="px-2 py-2 min-w-[160px]">{t('leads.leadSourcesPage.лиды')}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...filteredWeeks].reverse().map((w) => (
                    <tr key={w.week} className="border-b border-[color:var(--workspace-row-border)]">
                      <td className="px-2 py-2 text-[color:var(--workspace-text)]">{w.week}</td>
                      <td className="px-2 py-2 text-blue-300">{w.leads}</td>
                      <td className="px-2 py-2 text-[color:var(--workspace-text)]">{money.format(w.spend)}</td>
                      <td className="px-2 py-2">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-[color:var(--workspace-row-border)]">
                          <div
                            className="h-full rounded-full bg-[color:var(--gold)]"
                            style={{ width: `${Math.round((w.leads / maxLeads) * 100)}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3">
              <div className="mb-2 flex items-center gap-2">
                <AlertTriangle className="size-4 text-amber-400" />
                <h2 className="text-sm font-normal text-[color:var(--theme-accent-heading)]">{t('leads.leadSourcesPage.дорогой_cpl')}</h2>
              </div>
              <ul className="space-y-2">
                {expensive.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between rounded-md border border-[color:var(--workspace-row-border)] bg-[var(--workspace-row-bg)] px-3 py-2 text-sm"
                  >
                    <span className="text-[color:var(--workspace-text)]">{s.source}</span>
                    <span className="text-amber-300">${s.cpl}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3">
              <div className="mb-2 flex items-center gap-2">
                <TrendingUp className="size-4 text-[color:var(--gold)]" />
                <h2 className="text-sm font-normal text-[color:var(--theme-accent-heading)]">{t('leads.leadSourcesPage.топ_по_конверсии')}</h2>
              </div>
              <ul className="space-y-2">
                {[...SOURCES]
                  .sort((a, b) => b.convPct - a.convPct)
                  .slice(0, 4)
                  .map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between rounded-md border border-[color:var(--workspace-row-border)] bg-[var(--workspace-row-bg)] px-3 py-2 text-sm"
                    >
                      <span className="text-[color:var(--workspace-text)]">{s.source}</span>
                      <span className="text-emerald-300">{s.convPct}%</span>
                    </li>
                  ))}
              </ul>
            </div>
          </section>
        </div>
      </div>
    </DashboardShell>
  )
}

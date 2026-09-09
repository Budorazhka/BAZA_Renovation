import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, BarChart3, Filter, Users } from 'lucide-react'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { useLeads } from '@/context/LeadsContext'
import { leadsApiV2 } from '@/services/leadsApiV2'
import type { LeadProductTypeV2, LeadStageDefinitionsV2Response } from '@/types/leadsV2'
import type { Lead, LeadSource } from '@/types/leads'
import { useI18n } from "@/i18n";

const SOURCE_LABELS: Record<LeadSource, string> = {
  primary: 'Первичка',
  secondary: 'Вторичка',
  rent: 'Аренда',
  ad_campaigns: 'Реклама',
}

const FILTER_SELECT_CLASS =
  "rounded-md border border-[var(--hub-card-border)] bg-[color-mix(in_srgb,var(--rail-bg)_82%,transparent)] px-2 py-2 text-sm text-[color:var(--workspace-text)] [color-scheme:dark]"

function getIsoWeekKey(iso: string) {
  const d = new Date(iso)
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

/** Каталог стадий сведён из всех 4 продуктов (см. useEffect ниже) — стадия сети/собственника/агента резолвится тем же способом, что и sales, а не только 22 sales-стадии, как было раньше на data/leads-mock.ts. */
function leadStatusForFilter(lead: Lead, stageColumnById: Record<string, LeadStageColumn>): string {
  if (lead.status) return lead.status
  if (lead.stageId === 'new') return 'new'
  if (stageColumnById[lead.stageId] === 'rejection') return 'lost'
  if (stageColumnById[lead.stageId] === 'success') return 'qualified'
  return 'in_progress'
}

type LeadStageColumn = 'rejection' | 'in_progress' | 'success'

import { ExportButton } from '@/components/common/ExportButton'

export default function LeadsGeneralReportPage() {
    const { t } = useI18n();

  const { state } = useLeads()
  const [period, setPeriod] = useState<'7d' | '30d' | 'all'>('30d')
  const [employee, setEmployee] = useState<string>('all')
  const [team, setTeam] = useState<string>('all')
  const [status, setStatus] = useState<string>('all')
  const [source, setSource] = useState<'all' | LeadSource>('all')

  /**
   * GET /leads/stage-definitions — каталог стадий по ВСЕМ 4 продуктам
   * (04.09.2026, замена data/leads-mock.ts::LEAD_STAGES/LEAD_STAGE_COLUMN,
   * которые покрывали только продукт `sales`): лид с productType network/
   * owner/agent раньше показывал сырой machine-id вместо русского имени и
   * не попадал ни в один статус-фильтр (LEAD_STAGE_COLUMN не знал его id).
   */
  const [stageNameById, setStageNameById] = useState<Record<string, string>>({})
  const [stageColumnById, setStageColumnById] = useState<Record<string, LeadStageColumn>>({})

  useEffect(() => {
    let cancelled = false
    leadsApiV2
      .getStageDefinitions()
      .then((defs: LeadStageDefinitionsV2Response) => {
        if (cancelled) return
        const names: Record<string, string> = {}
        const columns: Record<string, LeadStageColumn> = {}
        for (const productType of Object.keys(defs) as LeadProductTypeV2[]) {
          for (const stage of defs[productType]) {
            names[stage.id] = stage.name
            columns[stage.id] = stage.column
          }
        }
        setStageNameById(names)
        setStageColumnById(columns)
      })
      .catch(() => {
        // Отчёт остаётся читаемым и без каталога — просто покажет сырые
        // machine-id вместо русских имён, тот же деградационный путь, что
        // был до этого прохода при отсутствующей стадии в мок-каталоге.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const now = useMemo(() => Date.now(), [])
  const periodLeads = useMemo(() => {
    if (period === 'all') return state.leadPool
    const days = period === '7d' ? 7 : 30
    const threshold = now - days * 24 * 60 * 60 * 1000
    return state.leadPool.filter((l) => new Date(l.createdAt).getTime() >= threshold)
  }, [now, period, state.leadPool])

  const managerById = useMemo(
    () => Object.fromEntries(state.leadManagers.map((m) => [m.id, m])),
    [state.leadManagers],
  )

  const teamLabelByLead = (lead: Lead) => {
    if (!lead.managerId) return 'Без команды'
    const manager = managerById[lead.managerId]
    if (!manager?.sourceTypes.length) return 'Смешанная'
    return SOURCE_LABELS[manager.sourceTypes[0]]
  }

  const filtered = useMemo(() => {
    return periodLeads.filter((lead) => {
      if (employee !== 'all') {
        if (employee === 'unassigned' && lead.managerId !== null) return false
        if (employee !== 'unassigned' && lead.managerId !== employee) return false
      }
      if (team !== 'all' && teamLabelByLead(lead) !== team) return false
      if (status !== 'all' && leadStatusForFilter(lead, stageColumnById) !== status) return false
      if (source !== 'all' && lead.source !== source) return false
      return true
    })
  }, [employee, periodLeads, source, status, stageColumnById, team])

  const kpi = useMemo(() => {
    const total = filtered.length
    const newLeads = filtered.filter((l) => l.stageId === 'new').length
    const unassigned = filtered.filter((l) => l.managerId == null).length
    const slaBreaches = filtered.filter((l) => l.taskOverdue).length
    const success = filtered.filter((l) => stageColumnById[l.stageId] === 'success').length
    const conversion = total > 0 ? Math.round((success / total) * 100) : 0
    return { total, newLeads, unassigned, slaBreaches, conversion }
  }, [filtered, stageColumnById])

  const problematicLeads = useMemo(
    () => filtered.filter((l) => l.taskOverdue || l.managerId == null || stageColumnById[l.stageId] === 'rejection').slice(0, 8),
    [filtered, stageColumnById],
  )

  const dynamics = useMemo(() => {
    const map = new Map<string, number>()
    for (const lead of filtered) {
      const key = getIsoWeekKey(lead.createdAt)
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([week, count]) => ({ week, count }))
  }, [filtered])

  const maxDyn = Math.max(1, ...dynamics.map((d) => d.count))
  const teamOptions = useMemo(() => {
    return Array.from(new Set(state.leadPool.map((lead) => teamLabelByLead(lead))))
  }, [state.leadPool])

  return (
    <DashboardShell>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="w-full space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-normal text-[color:var(--theme-accent-heading)]">{t('leads.leadsGeneralReportPage.общий_отч_т_по_лидам')}</h1>
              <p className="mt-1 text-sm text-[color:var(--app-text-muted)]">{t('leads.leadsGeneralReportPage.состояние_потока_лид')}</p>
            </div>
            <ExportButton entity="leads" label="Экспорт лидов в Excel" />
          </div>

          <section className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3">
            <div className="mb-3 flex items-center gap-2">
              <Filter className="size-4 text-[color:var(--gold)]" />
              <h2 className="text-sm font-normal text-[color:var(--theme-accent-heading)]">{t('leads.leadsGeneralReportPage.фильтры')}</h2>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
              <select value={period} onChange={(e) => setPeriod(e.target.value as '7d' | '30d' | 'all')} className={FILTER_SELECT_CLASS}>
                <option value="7d">{t('leads.leadsGeneralReportPage.период_7_дней')}</option>
                <option value="30d">{t('leads.leadsGeneralReportPage.период_30_дней')}</option>
                <option value="all">{t('leads.leadsGeneralReportPage.период_весь')}</option>
              </select>
              <select value={employee} onChange={(e) => setEmployee(e.target.value)} className={FILTER_SELECT_CLASS}>
                <option value="all">{t('leads.leadsGeneralReportPage.сотрудник_все')}</option>
                <option value="unassigned">{t('leads.leadsGeneralReportPage.без_назначения')}</option>
                {state.leadManagers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <select value={team} onChange={(e) => setTeam(e.target.value)} className={FILTER_SELECT_CLASS}>
                <option value="all">{t('leads.leadsGeneralReportPage.команда_все')}</option>
                {teamOptions.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={FILTER_SELECT_CLASS}>
                <option value="all">{t('leads.leadsGeneralReportPage.статус_все')}</option>
                <option value="new">{t('leads.leadsGeneralReportPage.новый')}</option>
                <option value="in_progress">{t('leads.leadsGeneralReportPage.в_работе')}</option>
                <option value="qualified">{t('leads.leadsGeneralReportPage.квалифицирован')}</option>
                <option value="lost">{t('leads.leadsGeneralReportPage.потерян_отказ')}</option>
              </select>
              <select value={source} onChange={(e) => setSource(e.target.value as 'all' | LeadSource)} className={FILTER_SELECT_CLASS}>
                <option value="all">{t('leads.leadsGeneralReportPage.источник_все')}</option>
                <option value="primary">{t('leads.leadsGeneralReportPage.первичка')}</option>
                <option value="secondary">{t('leads.leadsGeneralReportPage.вторичка')}</option>
                <option value="rent">{t('leads.leadsGeneralReportPage.аренда')}</option>
                <option value="ad_campaigns">{t('leads.leadsGeneralReportPage.реклама')}</option>
              </select>
            </div>
          </section>
          <section className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <div className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3"><p className="text-[10px] uppercase text-[color:var(--app-text-subtle)]">{t('leads.leadsGeneralReportPage.лидов')}</p><p className="text-xl font-normal text-[color:var(--theme-accent-heading)]">{kpi.total}</p></div>
            <div className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3"><p className="text-[10px] uppercase text-[color:var(--app-text-subtle)]">{t('leads.leadsGeneralReportPage.новые')}</p><p className="text-xl font-normal text-blue-300">{kpi.newLeads}</p></div>
            <div className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3"><p className="text-[10px] uppercase text-[color:var(--app-text-subtle)]">{t('leads.leadsGeneralReportPage.без_назначения')}</p><p className="text-xl font-normal text-amber-300">{kpi.unassigned}</p></div>
            <div className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3"><p className="text-[10px] uppercase text-[color:var(--app-text-subtle)]">{t('leads.leadsGeneralReportPage.sla_нарушения')}</p><p className="text-xl font-normal text-red-300">{kpi.slaBreaches}</p></div>
            <div className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3"><p className="text-[10px] uppercase text-[color:var(--app-text-subtle)]">{t('leads.leadsGeneralReportPage.конверсия')}</p><p className="text-xl font-normal text-emerald-300">{kpi.conversion}%</p></div>
          </section>
          <section className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3">
            <div className="mb-3 flex items-center gap-2">
              <BarChart3 className="size-4 text-[color:var(--gold)]" />
              <h2 className="text-sm font-normal text-[color:var(--theme-accent-heading)]">{t('leads.leadsGeneralReportPage.таблица_лидов')}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--workspace-row-border)] text-left text-[11px] uppercase tracking-wide text-[color:var(--app-text-subtle)]">
                    <th className="px-2 py-2">{t('leads.leadsGeneralReportPage.лид')}</th>
                    <th className="px-2 py-2">{t('leads.leadsGeneralReportPage.источник')}</th>
                    <th className="px-2 py-2">{t('leads.leadsGeneralReportPage.этап')}</th>
                    <th className="px-2 py-2">{t('leads.leadsGeneralReportPage.ответственный')}</th>
                    <th className="px-2 py-2">SLA</th>
                    <th className="px-2 py-2">{t('leads.leadsGeneralReportPage.дата')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 40).map((lead) => (
                    <tr key={lead.id} className="border-b border-[color:var(--workspace-row-border)]">
                      <td className="px-2 py-2 text-[color:var(--workspace-text)]">{lead.name ?? lead.id}</td>
                      <td className="px-2 py-2 text-[color:var(--workspace-text-muted)]">{SOURCE_LABELS[lead.source]}</td>
                      <td className="px-2 py-2 text-[color:var(--workspace-text-muted)]">{stageNameById[lead.stageId] ?? lead.stageId}</td>
                      <td className="px-2 py-2 text-[color:var(--workspace-text-muted)]">
                        {lead.managerId ? (managerById[lead.managerId]?.name ?? lead.managerId) : 'Не назначен'}
                      </td>
                      <td className={lead.taskOverdue ? 'px-2 py-2 text-red-300' : 'px-2 py-2 text-emerald-300'}>
                        {lead.taskOverdue ? 'Нарушен' : 'OK'}
                      </td>
                      <td className="px-2 py-2 text-[color:var(--workspace-text-muted)]">{new Date(lead.createdAt).toLocaleDateString('ru-RU')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3">
              <div className="mb-2 flex items-center gap-2">
                <AlertTriangle className="size-4 text-amber-300" />
                <h2 className="text-sm font-normal text-[color:var(--theme-accent-heading)]">{t('leads.leadsGeneralReportPage.проблемные_лиды')}</h2>
              </div>
              <div className="space-y-2">
                {problematicLeads.map((lead) => (
                  <div key={lead.id} className="rounded-md border border-[color:var(--workspace-row-border)] bg-[var(--workspace-row-bg)] px-3 py-2">
                    <p className="text-sm font-normal text-[color:var(--workspace-text)]">{lead.name ?? lead.id}</p>
                    <p className="mt-1 text-xs text-[color:var(--workspace-text-muted)]">
                      {lead.managerId == null ? 'Без назначения' : lead.taskOverdue ? 'Нарушен SLA' : 'Риск потери'}
                    </p>
                  </div>
                ))}
                {problematicLeads.length === 0 && <p className="text-sm text-[color:var(--workspace-text-muted)]">{t('leads.leadsGeneralReportPage.проблемных_лидов_нет')}</p>}
              </div>
            </div>
            <div className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3">
              <div className="mb-2 flex items-center gap-2">
                <Users className="size-4 text-[color:var(--gold)]" />
                <h2 className="text-sm font-normal text-[color:var(--theme-accent-heading)]">{t('leads.leadsGeneralReportPage.динамика_потока')}</h2>
              </div>
              <div className="space-y-2">
                {dynamics.map((row) => (
                  <div key={row.week}>
                    <div className="mb-1 flex items-center justify-between text-xs text-[color:var(--workspace-text-muted)]">
                      <span>{row.week}</span>
                      <span>{row.count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-[rgba(255,255,255,0.07)]">
                      <div className="h-full rounded-full bg-[var(--gold)]" style={{ width: `${Math.round((row.count / maxDyn) * 100)}%` }} />
                    </div>
                  </div>
                ))}
                {dynamics.length === 0 && <p className="text-sm text-[color:var(--workspace-text-muted)]">{t('leads.leadsGeneralReportPage.недостаточно_данных')}</p>}
              </div>
            </div>
          </section>
        </div>
      </div>
    </DashboardShell>
  )
}

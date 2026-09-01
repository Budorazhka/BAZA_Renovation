import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileText,
  Filter,
  ListChecks,
  UserPlus,
  UserRound,
} from 'lucide-react'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { BOOKINGS_MOCK } from '@/data/bookings-mock'
import type { Booking, BookingStatus } from '@/types/bookings'
import { useLeads } from '@/context/LeadsContext'
import { useAuth } from '@/context/AuthContext'
import {
  countSessionRegistrations,
  loadSessionRegistrations,
  prependSessionRegistration,
} from '@/lib/newbuild-registrations-storage'
import { useI18n } from "@/i18n";

const FORM_SELECT_CLASS =
  'rounded-md border border-[var(--hub-card-border)] bg-[color-mix(in_srgb,var(--rail-bg)_82%,transparent)] px-2 py-2 text-sm text-[color:var(--workspace-text)] [color-scheme:dark]'
const FORM_INPUT_CLASS =
  'rounded-md border border-[var(--workspace-row-border)] bg-[color-mix(in_srgb,var(--rail-bg)_82%,transparent)] px-2 py-2 text-sm text-[color:var(--workspace-text)]'

const DEVELOPERS = ['Группа ПИК', 'MR Group', 'Эталон', 'Самолёт', 'Другое'] as const

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function hoursFromNow(h: number): string {
  const d = new Date(Date.now() + h * 60 * 60 * 1000)
  return d.toISOString()
}

function statusLabel(status: Booking['status']) {
  if (status === 'active') return 'Активна'
  if (status === 'pending') return 'Новая'
  if (status === 'completed') return 'Завершена'
  if (status === 'expired') return 'Просрочена'
  return 'Отклонена'
}

const SEED_CLIENT_BOOKINGS = BOOKINGS_MOCK.filter((b) => b.type === 'client')

export default function RegistrationsPage() {
    const { t } = useI18n();
  const { state: leadsState } = useLeads()
  const { currentUser } = useAuth()
  const [sessionRows, setSessionRows] = useState<Booking[]>(() => loadSessionRegistrations())

  const registrations = useMemo(
    () => [...sessionRows, ...SEED_CLIENT_BOOKINGS],
    [sessionRows],
  )

  const [selectedId, setSelectedId] = useState<string>(() => {
    const s = loadSessionRegistrations()
    return s[0]?.id ?? SEED_CLIENT_BOOKINGS[0]?.id ?? ''
  })
  const [status, setStatus] = useState<'all' | BookingStatus>('all')
  const [agent, setAgent] = useState<string>('all')
  const [riskOnly, setRiskOnly] = useState(false)

  const [clientName, setClientName] = useState('')
  const [developerChoice, setDeveloperChoice] = useState<string>(DEVELOPERS[0])
  const [developerOther, setDeveloperOther] = useState('')
  const [projectLine, setProjectLine] = useState('')
  const [lotLine, setLotLine] = useState('')
  const [leadId, setLeadId] = useState<string>('none')
  const [agentName, setAgentName] = useState(() => currentUser?.name ?? 'Менеджер')
  const [notes, setNotes] = useState('')

  const leadOptions = useMemo(() => [...leadsState.leadPool].slice(0, 150), [leadsState.leadPool])

  const agentOptions = useMemo(() => Array.from(new Set(registrations.map((r) => r.agentName))).sort(), [registrations])

  const filtered = useMemo(() => {
    let rows = [...registrations]
    if (status !== 'all') rows = rows.filter((r) => r.status === status)
    if (agent !== 'all') rows = rows.filter((r) => r.agentName === agent)
    if (riskOnly) rows = rows.filter((r) => r.status === 'expired' || r.status === 'rejected' || r.status === 'pending')
    return rows
  }, [agent, registrations, riskOnly, status])

  const selected = useMemo(
    () => filtered.find((r) => r.id === selectedId) ?? filtered[0] ?? registrations.find((r) => r.id === selectedId),
    [filtered, registrations, selectedId],
  )

  useEffect(() => {
    if (selectedId && registrations.some((r) => r.id === selectedId)) return
    const next = registrations[0]?.id ?? ''
    if (next) setSelectedId(next)
  }, [registrations, selectedId])

  const kpi = useMemo(() => {
    const total = filtered.length
    const active = filtered.filter((r) => r.status === 'active').length
    const pending = filtered.filter((r) => r.status === 'pending').length
    const risk = filtered.filter((r) => r.status === 'expired' || r.status === 'rejected').length
    const completed = filtered.filter((r) => r.status === 'completed').length
    return { total, active, pending, risk, completed }
  }, [filtered])

  const needsAttention = useMemo(
    () => registrations.filter((r) => r.status === 'expired' || r.status === 'pending' || r.status === 'rejected'),
    [registrations],
  )

  function submitRegistration() {
    const name = clientName.trim()
    const project = projectLine.trim()
    if (!name || !project) return

    const developer =
      developerChoice === 'Другое' ? developerOther.trim() || 'Застройщик не указан' : developerChoice

    const address = lotLine.trim() ? `${project}, ${lotLine.trim()}` : project
    const linkedLead = leadId !== 'none' ? leadsState.leadPool.find((l) => l.id === leadId) : null

    const row: Booking = {
      id: `reg-${Date.now()}`,
      type: 'client',
      status: 'pending',
      clientId: `cl-reg-${Date.now()}`,
      clientName: name,
      propertyAddress: address,
      propertyType: 'Регистрация у застройщика',
      developerName: developer,
      sourceLeadId: linkedLead?.id,
      agentId: currentUser?.id ?? 'lm-1',
      agentName: agentName.trim() || 'Не назначен',
      bookedAt: new Date().toISOString(),
      durationHours: 72,
      expiresAt: hoursFromNow(72),
      notes:
        notes.trim() ||
        `Заявка на регистрацию клиента в системе застройщика. ${linkedLead ? `Лид: ${linkedLead.name ?? linkedLead.id}.` : 'Лид не привязан.'}`,
    }

    prependSessionRegistration(row)
    setSessionRows(loadSessionRegistrations())
    setSelectedId(row.id)
    setClientName('')
    setProjectLine('')
    setLotLine('')
    setLeadId('none')
    setNotes('')
    setDeveloperChoice(DEVELOPERS[0])
    setDeveloperOther('')
  }

  const sessionCount = countSessionRegistrations()

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <DashboardShell scrollMain={false}>
        <div className="flex min-h-0 w-full flex-1 flex-col gap-3 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <div className="shrink-0">
            <h1 className="text-xl font-normal text-[color:var(--theme-accent-heading)]">
              {t('newbuild.registrationsPage.фиксация_клиента_у_з')}</h1>
            <p className="mt-1 text-sm text-[color:var(--app-text-muted)]">
              {t('newbuild.registrationsPage.здесь_вы_заводите_за')}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
              <Link
                to="/dashboard/new-buildings/report-partners"
                className="inline-flex items-center gap-1 rounded-md border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] px-2.5 py-1 text-[color:var(--workspace-text)] hover:border-[var(--hub-card-border-hover)]"
              >
                {t('newbuild.registrationsPage.отч_т_по_первичному')}<ArrowRight className="size-3" />
              </Link>
              <Link
                to="/dashboard/bookings"
                className="inline-flex items-center gap-1 rounded-md border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] px-2.5 py-1 text-[color:var(--workspace-text)] hover:border-[var(--hub-card-border-hover)]"
              >
                {t('newbuild.registrationsPage.брони_по_шахматке')}<ArrowRight className="size-3" />
              </Link>
            </div>
          </div>

          <section className="shrink-0 rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <UserPlus className="size-4 text-[color:var(--gold)]" />
                <h2 className="text-sm font-normal text-[color:var(--theme-accent-heading)]">{t('newbuild.registrationsPage.новая_регистрация')}</h2>
              </div>
              <p className="text-[11px] text-[color:var(--app-text-muted)]">
                {t('newbuild.registrationsPage.в_этой_сессии_создан')}<span className="text-[color:var(--workspace-text)]">{sessionCount}</span>
              </p>
            </div>
            <ol className="mb-3 list-decimal space-y-1 pl-4 text-[11px] text-[color:var(--workspace-text-muted)]">
              <li>{t('newbuild.registrationsPage.заполните_клиента_за')}</li>
              <li>{t('newbuild.registrationsPage.при_необходимости_пр')}</li>
              <li>{t('newbuild.registrationsPage.нажмите_отправить_за')}</li>
            </ol>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
              <input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder={t('newbuild.registrationsPage.фио_клиента')}
                className={FORM_INPUT_CLASS}
              />
              <select
                value={developerChoice}
                onChange={(e) => setDeveloperChoice(e.target.value)}
                className={FORM_SELECT_CLASS}
              >
                {DEVELOPERS.map((d) => (
                  <option key={d} value={d}>
                    {t('newbuild.registrationsPage.застройщик')}{d}
                  </option>
                ))}
              </select>
              {developerChoice === 'Другое' && (
                <input
                  value={developerOther}
                  onChange={(e) => setDeveloperOther(e.target.value)}
                  placeholder={t('newbuild.registrationsPage.название_застройщика')}
                  className={FORM_INPUT_CLASS}
                />
              )}
              <input
                value={projectLine}
                onChange={(e) => setProjectLine(e.target.value)}
                placeholder={t('newbuild.registrationsPage.проект_жк_например_ж')}
                className={FORM_INPUT_CLASS}
              />
              <input
                value={lotLine}
                onChange={(e) => setLotLine(e.target.value)}
                placeholder={t('newbuild.registrationsPage.лот_квартира_необяза')}
                className={FORM_INPUT_CLASS}
              />
              <select value={leadId} onChange={(e) => setLeadId(e.target.value)} className={FORM_SELECT_CLASS}>
                <option value="none">{t('newbuild.registrationsPage.связать_с_лидом_не_в')}</option>
                {leadOptions.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {(lead.name ?? lead.id)} · {lead.id}
                  </option>
                ))}
              </select>
              <input
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder={t('newbuild.registrationsPage.ответственный_менедж')}
                className={FORM_INPUT_CLASS}
              />
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('newbuild.registrationsPage.комментарий_к_заявке')}
                className={`md:col-span-2 lg:col-span-3 ${FORM_INPUT_CLASS}`}
              />
              <button
                type="button"
                onClick={submitRegistration}
                disabled={!clientName.trim() || !projectLine.trim()}
                className="rounded-md border border-[var(--hub-card-border)] bg-[color:var(--gold)]/15 px-3 py-2 text-sm font-normal text-[color:var(--workspace-text)] hover:bg-[color:var(--gold)]/25 disabled:opacity-40"
              >
                {t('newbuild.registrationsPage.отправить_заявку_на')}</button>
            </div>
          </section>

          <section className="shrink-0 rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3">
            <div className="mb-3 flex items-center gap-2">
              <Filter className="size-4 text-[color:var(--gold)]" />
              <h2 className="text-sm font-normal text-[color:var(--theme-accent-heading)]">{t('newbuild.registrationsPage.фильтры_реестра')}</h2>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'all' | BookingStatus)}
                className={FORM_SELECT_CLASS}
              >
                <option value="all">{t('newbuild.registrationsPage.статус_все')}</option>
                <option value="pending">{t('newbuild.registrationsPage.новая')}</option>
                <option value="active">{t('newbuild.registrationsPage.активна')}</option>
                <option value="completed">{t('newbuild.registrationsPage.завершена')}</option>
                <option value="expired">{t('newbuild.registrationsPage.просрочена')}</option>
                <option value="rejected">{t('newbuild.registrationsPage.отклонена')}</option>
              </select>
              <select value={agent} onChange={(e) => setAgent(e.target.value)} className={FORM_SELECT_CLASS}>
                <option value="all">{t('newbuild.registrationsPage.ответственный_все')}</option>
                {agentOptions.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-[var(--hub-card-border)] bg-[color-mix(in_srgb,var(--rail-bg)_82%,transparent)] px-2 py-2 text-sm text-[color:var(--workspace-text)] [color-scheme:dark]">
                <input
                  type="checkbox"
                  checked={riskOnly}
                  onChange={(e) => setRiskOnly(e.target.checked)}
                  className="size-4 appearance-none rounded border border-[var(--hub-card-border)] bg-[color-mix(in_srgb,var(--rail-bg)_82%,transparent)] checked:border-[var(--gold)] checked:bg-[var(--gold)]"
                />
                {t('newbuild.registrationsPage.только_риск_ожидание')}</label>
            </div>
          </section>

          <section className="grid shrink-0 grid-cols-2 gap-2 md:grid-cols-5">
            <div className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3">
              <p className="text-[10px] uppercase tracking-wide text-[color:var(--app-text-subtle)]">{t('newbuild.registrationsPage.в_выборке')}</p>
              <p className="text-xl font-normal text-[color:var(--theme-accent-heading)]">{kpi.total}</p>
            </div>
            <div className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3">
              <p className="text-[10px] uppercase tracking-wide text-[color:var(--app-text-subtle)]">{t('newbuild.registrationsPage.активные')}</p>
              <p className="text-xl font-normal text-emerald-400">{kpi.active}</p>
            </div>
            <div className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3">
              <p className="text-[10px] uppercase tracking-wide text-[color:var(--app-text-subtle)]">{t('newbuild.registrationsPage.новые')}</p>
              <p className="text-xl font-normal text-blue-400">{kpi.pending}</p>
            </div>
            <div className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3">
              <p className="text-[10px] uppercase tracking-wide text-[color:var(--app-text-subtle)]">{t('newbuild.registrationsPage.завершены')}</p>
              <p className="text-xl font-normal text-[color:var(--workspace-text)]">{kpi.completed}</p>
            </div>
            <div className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3">
              <p className="text-[10px] uppercase tracking-wide text-[color:var(--app-text-subtle)]">{t('newbuild.registrationsPage.риск')}</p>
              <p className="text-xl font-normal text-red-400">{kpi.risk}</p>
            </div>
          </section>

          <div className="grid min-h-[min(400px,55vh)] flex-1 grid-cols-1 gap-3 lg:min-h-0 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,1fr)]">
            <section className="flex min-h-0 flex-col rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3">
              <div className="mb-2 flex shrink-0 items-center gap-2">
                <FileText className="size-4 text-[color:var(--gold)]" />
                <h2 className="text-sm font-normal text-[color:var(--theme-accent-heading)]">{t('newbuild.registrationsPage.реестр_регистраций')}</h2>
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full min-w-[560px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[color:var(--workspace-row-border)] text-left text-[11px] uppercase tracking-wide text-[color:var(--app-text-subtle)]">
                      <th className="px-2 py-2">{t('newbuild.registrationsPage.клиент')}</th>
                      <th className="px-2 py-2">{t('newbuild.registrationsPage.объект')}</th>
                      <th className="px-2 py-2">{t('newbuild.registrationsPage.статус')}</th>
                      <th className="px-2 py-2">{t('newbuild.registrationsPage.агент')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((item) => {
                      const isSel = item.id === selected?.id
                      return (
                        <tr
                          key={item.id}
                          className={
                            isSel
                              ? 'cursor-pointer border-b border-[color:var(--workspace-row-border)] bg-[color:var(--gold)]/10'
                              : 'cursor-pointer border-b border-[color:var(--workspace-row-border)] hover:bg-[var(--workspace-row-bg)]'
                          }
                          onClick={() => setSelectedId(item.id)}
                        >
                          <td className="px-2 py-2 font-medium text-[color:var(--workspace-text)]">{item.clientName}</td>
                          <td className="max-w-[200px] truncate px-2 py-2 text-[color:var(--workspace-text-muted)]" title={item.propertyAddress}>
                            {item.propertyAddress}
                          </td>
                          <td className="px-2 py-2 text-xs text-[color:var(--workspace-text)]">{statusLabel(item.status)}</td>
                          <td className="px-2 py-2 text-[color:var(--workspace-text-muted)]">{item.agentName}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {filtered.length === 0 && <p className="mt-2 shrink-0 text-sm text-[color:var(--app-text-muted)]">{t('newbuild.registrationsPage.нет_записей_по_фильт')}</p>}
            </section>

            <section className="flex min-h-[min(280px,40vh)] flex-col overflow-hidden rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3 lg:min-h-0">
              <div className="mb-2 flex shrink-0 items-center gap-2">
                <UserRound className="size-4 text-[color:var(--gold)]" />
                <h2 className="text-sm font-normal text-[color:var(--theme-accent-heading)]">{t('newbuild.registrationsPage.карточка_регистрации')}</h2>
              </div>
              {selected ? (
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-0.5">
                  <div className="rounded-md border border-[color:var(--workspace-row-border)] bg-[var(--workspace-row-bg)] p-3">
                    <p className="text-sm font-normal text-[color:var(--workspace-text)]">{selected.clientName}</p>
                    <p className="mt-1 text-xs text-[color:var(--workspace-text-muted)]">{selected.propertyAddress}</p>
                    {selected.propertyType && (
                      <p className="mt-1 text-xs text-[color:var(--app-text-subtle)]">{selected.propertyType}</p>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                    <div className="rounded-md border border-[color:var(--workspace-row-border)] bg-[var(--workspace-row-bg)] p-2">
                      <p className="text-[color:var(--app-text-subtle)]">{t('newbuild.registrationsPage.статус')}</p>
                      <p className="mt-1 font-normal text-[color:var(--workspace-text)]">{statusLabel(selected.status)}</p>
                    </div>
                    <div className="rounded-md border border-[color:var(--workspace-row-border)] bg-[var(--workspace-row-bg)] p-2">
                      <p className="text-[color:var(--app-text-subtle)]">{t('newbuild.registrationsPage.застройщик')}</p>
                      <p className="mt-1 font-normal text-[color:var(--workspace-text)]">{selected.developerName ?? '—'}</p>
                    </div>
                    <div className="rounded-md border border-[color:var(--workspace-row-border)] bg-[var(--workspace-row-bg)] p-2">
                      <p className="text-[color:var(--app-text-subtle)]">{t('newbuild.registrationsPage.источник_лида')}</p>
                      <p className="mt-1 font-normal text-[color:var(--workspace-text)]">{selected.sourceLeadId ?? 'Не указан'}</p>
                    </div>
                    <div className="rounded-md border border-[color:var(--workspace-row-border)] bg-[var(--workspace-row-bg)] p-2">
                      <p className="text-[color:var(--app-text-subtle)]">{t('newbuild.registrationsPage.ответственный')}</p>
                      <p className="mt-1 font-normal text-[color:var(--workspace-text)]">{selected.agentName}</p>
                    </div>
                  </div>
                  <div className="space-y-2 text-xs text-[color:var(--workspace-text-muted)]">
                    <p className="flex items-center gap-1">
                      <Clock3 className="size-3.5" /> {t('newbuild.registrationsPage.создана')}{formatDate(selected.bookedAt)}
                    </p>
                    <p className="flex items-center gap-1">
                      <CheckCircle2 className="size-3.5" /> {t('newbuild.registrationsPage.действует_до')}{formatDate(selected.expiresAt)} ({selected.durationHours} {t('newbuild.registrationsPage.ч')}</p>
                    {selected.dealId && <p className="text-[color:var(--workspace-text)]">{t('newbuild.registrationsPage.сделка')}{selected.dealId}</p>}
                  </div>
                  {selected.notes && (
                    <div className="rounded-md border border-[color:var(--workspace-row-border)] bg-[var(--workspace-row-bg)] p-2 text-xs text-[color:var(--workspace-text-muted)]">
                      {selected.notes}
                    </div>
                  )}
                  <div className="rounded-md border border-[color:var(--workspace-row-border)] bg-[var(--workspace-row-bg)] p-3">
                    <div className="mb-2 flex items-center gap-2 text-[11px] font-normal uppercase tracking-wide text-[color:var(--app-text-subtle)]">
                      <ListChecks className="size-3.5" />
                      {t('newbuild.registrationsPage.этапы')}</div>
                    <ul className="space-y-1.5 text-xs text-[color:var(--workspace-text)]">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="size-3.5 shrink-0 text-emerald-400" />
                        {t('newbuild.registrationsPage.заявка_в_системе_зас')}</li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="size-3.5 shrink-0 text-emerald-400" />
                        {t('newbuild.registrationsPage.проверка_уникальност')}</li>
                      <li className="flex items-center gap-2">
                        {selected.status === 'active' || selected.status === 'completed' ? (
                          <CheckCircle2 className="size-3.5 shrink-0 text-emerald-400" />
                        ) : (
                          <Clock3 className="size-3.5 shrink-0 text-amber-400" />
                        )}
                        {t('newbuild.registrationsPage.подбор_лота_бронь_по')}</li>
                      <li className="flex items-center gap-2">
                        {selected.status === 'completed' ? (
                          <CheckCircle2 className="size-3.5 shrink-0 text-emerald-400" />
                        ) : (
                          <Clock3 className="size-3.5 shrink-0 text-[color:var(--workspace-text-muted)]" />
                        )}
                        {t('newbuild.registrationsPage.закрытие_сделки')}</li>
                    </ul>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-[color:var(--workspace-text-muted)]">{t('newbuild.registrationsPage.нет_данных_о_регистр')}</p>
              )}
            </section>
          </div>

          <section className="max-h-[min(200px,28vh)] shrink-0 overflow-hidden rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3">
            <div className="mb-2 flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-400" />
              <h2 className="text-sm font-normal text-[color:var(--theme-accent-heading)]">{t('newbuild.registrationsPage.требуют_внимания')}</h2>
            </div>
            <p className="mb-2 text-xs text-[color:var(--app-text-muted)]">{t('newbuild.registrationsPage.по_всем_регистрациям')}</p>
            <ul className="max-h-[min(120px,18vh)] space-y-2 overflow-y-auto pr-1">
              {needsAttention.map((r) => (
                <li
                  key={r.id}
                  className="cursor-pointer rounded-md border border-[color:var(--workspace-row-border)] bg-[var(--workspace-row-bg)] px-3 py-2 text-sm text-[color:var(--workspace-text)]"
                  onClick={() => setSelectedId(r.id)}
                >
                  {r.clientName} · {r.propertyAddress} · {statusLabel(r.status)}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </DashboardShell>
    </div>
  )
}

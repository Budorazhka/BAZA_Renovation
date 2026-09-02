import { useEffect, useMemo, useState } from 'react'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { HOME_PROGRESS_MOCK, HOME_STREAK_MOCK } from '@/data/home-workspace-mock'
import { useAuth } from '@/context/AuthContext'
import { currentPeriod, type ManagerPlan, usePlans } from '@/context/PlansContext'
import { MOCK_EMPLOYEES } from '@/data/personnel-mock'
import { useI18n } from "@/i18n";

const DAY_STATUS_LABEL = { done: 'Выполнено', on_track: 'В плане', at_risk: 'В зоне риска' } as const
const DAY_STATUS_COLOR = { done: '#4ade80', on_track: '#60a5fa', at_risk: '#ef4444' } as const

const WEEKLY_HISTORY = [
  { day: 'Пн', dayPct: 88, kpis: { leads: 7, calls: 14, meetings: 3, tasks: 5 } },
  { day: 'Вт', dayPct: 72, kpis: { leads: 6, calls: 11, meetings: 2, tasks: 4 } },
  { day: 'Ср', dayPct: 95, kpis: { leads: 9, calls: 16, meetings: 4, tasks: 7 } },
  { day: 'Чт', dayPct: 81, kpis: { leads: 7, calls: 13, meetings: 3, tasks: 5 } },
  { day: 'Пт', dayPct: 62, kpis: { leads: 5, calls: 12, meetings: 2, tasks: 4 } },
]

function Bar({ pct, color, h = 'h-2' }: { pct: number; color: string; h?: string }) {
  return (
    <div className={`${h} w-full overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]`}>
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
    </div>
  )
}

type PlanDraft = Omit<ManagerPlan, 'employeeId' | 'period'>

function defaultSelfPlan(employeeId: string, plan?: ManagerPlan): ManagerPlan {
  return plan ?? {
    employeeId,
    period: currentPeriod(),
    revenueTarget: 6_000_000,
    leadsTarget: 8,
    dealsTarget: 2,
    callsTarget: 15,
    meetingsTarget: 3,
    showingsTarget: 2,
  }
}

function toDraft(plan: ManagerPlan): PlanDraft {
  return {
    revenueTarget: plan.revenueTarget,
    leadsTarget: plan.leadsTarget,
    dealsTarget: plan.dealsTarget,
    callsTarget: plan.callsTarget,
    meetingsTarget: plan.meetingsTarget,
    showingsTarget: plan.showingsTarget,
  }
}

function formatUsdShort(value: number) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`
  return `$${Math.round(value / 1000)}K`
}

export function MyReportPage() {
    const { t } = useI18n();
  const p = HOME_PROGRESS_MOCK
  const streak = HOME_STREAK_MOCK
  const { currentUser } = useAuth()
  const { dispatch, getPlan } = usePlans()
  const name = currentUser?.name ?? 'Сотрудник'
  const selfEmployee = useMemo(
    () => MOCK_EMPLOYEES.find((employee) => employee.name === currentUser?.name),
    [currentUser?.name],
  )
  const selfEmployeeId = selfEmployee?.id ?? currentUser?.id ?? 'self'
  const period = currentPeriod()
  const savedSelfPlan = getPlan(selfEmployeeId, period)
  const effectiveSelfPlan = useMemo(
    () => defaultSelfPlan(selfEmployeeId, savedSelfPlan),
    [savedSelfPlan, selfEmployeeId],
  )
  const [planOpen, setPlanOpen] = useState(false)
  const [planSaved, setPlanSaved] = useState(false)
  const [planDraft, setPlanDraft] = useState<PlanDraft>(() => toDraft(effectiveSelfPlan))

  useEffect(() => {
    setPlanDraft(toDraft(effectiveSelfPlan))
  }, [effectiveSelfPlan])

  function updatePlanDraft(field: keyof PlanDraft, value: number) {
    setPlanDraft((prev) => ({ ...prev, [field]: Math.max(0, Number.isFinite(value) ? value : 0) }))
    setPlanSaved(false)
  }

  function saveSelfPlan() {
    dispatch({
      type: 'SET_PLAN',
      plan: {
        employeeId: selfEmployeeId,
        period,
        ...planDraft,
      },
    })
    setPlanSaved(true)
    setPlanOpen(false)
    window.setTimeout(() => setPlanSaved(false), 1800)
  }

  return (
    <DashboardShell>
      <div style={{ padding: '16px 28px 48px', width: '100%', maxWidth: 'none', fontFamily: "'Montserrat', sans-serif" }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 400, color: 'var(--theme-accent-heading)', marginBottom: 4 }}>
              {t('dashboard.myReportPage.мой_отч_т')}</h1>
            <p style={{ fontSize: 14, color: 'var(--app-text-muted)' }}>
              {name} {t('dashboard.myReportPage.сводка_за_текущую_н')}</p>
          </div>
          <button
            type="button"
            onClick={() => setPlanOpen((open) => !open)}
            style={{
              border: '1px solid var(--hub-card-border)',
              background: planOpen ? 'color-mix(in_srgb,var(--gold)_18%,transparent)' : 'var(--workspace-row-bg)',
              color: 'var(--app-text)',
              borderRadius: 8,
              padding: '10px 14px',
              fontSize: 13,
              fontWeight: 400,
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            {planSaved ? 'План сохранён' : 'Поставить себе планы'}
          </button>
        </div>

        {planOpen && (
          <div style={{ background: 'var(--hub-card-bg)', border: '1px solid var(--hub-card-border)', borderRadius: 10, padding: '18px 20px', marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 14 }}>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 400, color: 'var(--app-text)', marginBottom: 4 }}>{t('dashboard.myReportPage.личный_план_на_месяц')}</h2>
                <p style={{ fontSize: 12, color: 'var(--app-text-muted)' }}>
                  {t('dashboard.myReportPage.период')}{period}{t('dashboard.myReportPage.эти_значения_попаду')}</p>
              </div>
              <button
                type="button"
                onClick={saveSelfPlan}
                style={{
                  border: '1px solid color-mix(in_srgb,var(--gold)_45%,transparent)',
                  background: 'var(--gold)',
                  color: 'var(--gold-btn-text)',
                  borderRadius: 8,
                  padding: '9px 13px',
                  fontSize: 13,
                  fontWeight: 400,
                  cursor: 'pointer',
                }}
              >
                {t('dashboard.myReportPage.сохранить_план')}</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 10 }}>
              {([
                { key: 'revenueTarget', label: 'Выручка, $', step: 100000 },
                { key: 'leadsTarget', label: 'Лиды', step: 1 },
                { key: 'dealsTarget', label: 'Сделки', step: 1 },
                { key: 'callsTarget', label: 'Звонки', step: 1 },
                { key: 'meetingsTarget', label: 'Встречи', step: 1 },
                { key: 'showingsTarget', label: 'Показы', step: 1 },
              ] as { key: keyof PlanDraft; label: string; step: number }[]).map((field) => (
                <label key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--app-text-muted)' }}>
                    {field.label}
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={field.step}
                    value={planDraft[field.key]}
                    onChange={(event) => updatePlanDraft(field.key, Number(event.target.value))}
                    style={{
                      width: '100%',
                      border: '1px solid var(--workspace-row-border)',
                      background: 'var(--workspace-row-bg)',
                      color: 'var(--app-text)',
                      borderRadius: 8,
                      padding: '9px 10px',
                      fontSize: 13,
                      outline: 'none',
                    }}
                  />
                </label>
              ))}
            </div>
          </div>
        )}

        <div style={{ background: 'color-mix(in_srgb,var(--gold)_7%,transparent)', border: '1px solid color-mix(in_srgb,var(--gold)_24%,transparent)', borderRadius: 10, padding: '12px 16px', marginBottom: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr repeat(5, 1fr)', gap: 10, alignItems: 'center' }}>
            <div>
              <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--theme-accent-link-dim)', marginBottom: 4 }}>{t('dashboard.myReportPage.мой_план')}</p>
              <p style={{ fontSize: 20, color: 'var(--app-text)', lineHeight: 1 }}>{formatUsdShort(effectiveSelfPlan.revenueTarget)}</p>
            </div>
            {[
              ['Лиды', effectiveSelfPlan.leadsTarget],
              ['Сделки', effectiveSelfPlan.dealsTarget],
              ['Звонки', effectiveSelfPlan.callsTarget],
              ['Встречи', effectiveSelfPlan.meetingsTarget],
              ['Показы', effectiveSelfPlan.showingsTarget],
            ].map(([label, value]) => (
              <div key={label}>
                <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--app-text-muted)', marginBottom: 4 }}>{label}</p>
                <p style={{ fontSize: 18, color: 'var(--app-text)', lineHeight: 1 }}>{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Summary cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'План дня', value: `${p.dayPlanPercent}%`, sub: DAY_STATUS_LABEL[p.dayPlanStatus], color: DAY_STATUS_COLOR[p.dayPlanStatus], pct: p.dayPlanPercent, barColor: 'var(--gold)' },
            { label: 'План недели', value: `${p.weekPlanPercent}%`, sub: '', color: '', pct: p.weekPlanPercent, barColor: '#60a5fa' },
            { label: 'Выручка', value: p.revenue.currentLabel, sub: `/ ${p.revenue.planLabel}`, color: '', pct: p.revenue.percent, barColor: 'var(--gold)' },
            { label: 'Воронка', value: `${p.funnelProgress.percent}%`, sub: p.funnelProgress.subtitle, color: '', pct: p.funnelProgress.percent, barColor: '#34d399' },
          ].map((c) => (
            <div
              key={c.label}
              style={{
                background: 'var(--hub-card-bg)',
                border: '1px solid var(--hub-card-border)',
                borderRadius: 10,
                padding: '14px 16px',
              }}
            >
              <p style={{ fontSize: 11, fontWeight: 400, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--app-text-muted)', marginBottom: 6 }}>{c.label}</p>
              <p style={{ fontSize: 24, fontWeight: 400, color: 'var(--app-text)', lineHeight: 1 }}>
                {c.value}
                {c.sub && <span style={{ fontSize: 12, fontWeight: 500, color: c.color || 'var(--app-text-muted)', marginLeft: 6 }}>{c.sub}</span>}
              </p>
              <div style={{ marginTop: 8 }}>
                <Bar pct={c.pct} color={c.barColor} />
              </div>
            </div>
          ))}
        </div>

        {/* ── Activity KPIs ── */}
        <div style={{ background: 'var(--hub-card-bg)', border: '1px solid var(--hub-card-border)', borderRadius: 10, padding: '18px 20px', marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 400, color: 'var(--app-text)', marginBottom: 14 }}>{t('dashboard.myReportPage.нормативы_активности')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px 20px' }}>
            {p.activityKpis.map((k) => {
              const pct = k.plan > 0 ? Math.round((k.current / k.plan) * 100) : 0
              return (
                <div key={k.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--app-text)', marginBottom: 4 }}>
                    <span>{k.label}</span>
                    <span style={{ fontWeight: 400, fontVariantNumeric: 'tabular-nums' }}>{k.current}/{k.plan}</span>
                  </div>
                  <Bar pct={pct} color={pct >= 100 ? '#4ade80' : 'var(--gold)'} h="h-2.5" />
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Weekly history ── */}
        <div style={{ background: 'var(--hub-card-bg)', border: '1px solid var(--hub-card-border)', borderRadius: 10, padding: '18px 20px', marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 400, color: 'var(--app-text)', marginBottom: 14 }}>{t('dashboard.myReportPage.история_по_дням_неде')}</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--hub-card-border)' }}>
                <th style={{ textAlign: 'left', padding: '6px 0', fontWeight: 400, color: 'var(--app-text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t('dashboard.myReportPage.день')}</th>
                <th style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 400, color: 'var(--app-text-muted)', fontSize: 11, textTransform: 'uppercase' }}>{t('dashboard.myReportPage.плана')}</th>
                <th style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 400, color: 'var(--app-text-muted)', fontSize: 11, textTransform: 'uppercase' }}>{t('dashboard.myReportPage.лиды')}</th>
                <th style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 400, color: 'var(--app-text-muted)', fontSize: 11, textTransform: 'uppercase' }}>{t('dashboard.myReportPage.звонки')}</th>
                <th style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 400, color: 'var(--app-text-muted)', fontSize: 11, textTransform: 'uppercase' }}>{t('dashboard.myReportPage.встречи')}</th>
                <th style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 400, color: 'var(--app-text-muted)', fontSize: 11, textTransform: 'uppercase' }}>{t('dashboard.myReportPage.задачи')}</th>
              </tr>
            </thead>
            <tbody>
              {WEEKLY_HISTORY.map((d) => (
                <tr key={d.day} style={{ borderBottom: '1px solid var(--hub-card-border)' }}>
                  <td style={{ padding: '8px 0', fontWeight: 400, color: 'var(--app-text)' }}>{d.day}</td>
                  <td style={{ textAlign: 'center', padding: '8px' }}>
                    <span style={{ fontWeight: 400, color: d.dayPct >= 80 ? '#4ade80' : d.dayPct >= 60 ? 'var(--gold)' : '#ef4444' }}>{d.dayPct}%</span>
                  </td>
                  <td style={{ textAlign: 'center', padding: '8px', color: 'var(--app-text)' }}>{d.kpis.leads}</td>
                  <td style={{ textAlign: 'center', padding: '8px', color: 'var(--app-text)' }}>{d.kpis.calls}</td>
                  <td style={{ textAlign: 'center', padding: '8px', color: 'var(--app-text)' }}>{d.kpis.meetings}</td>
                  <td style={{ textAlign: 'center', padding: '8px', color: 'var(--app-text)' }}>{d.kpis.tasks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Streak ── */}
        <div style={{ background: 'var(--hub-card-bg)', border: '1px solid var(--hub-card-border)', borderRadius: 10, padding: '18px 20px' }}>
          <h2 style={{ fontSize: 15, fontWeight: 400, color: 'var(--app-text)', marginBottom: 10 }}>{t('dashboard.myReportPage.серия_активности')}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div>
              <span style={{ fontSize: 36, fontWeight: 400, color: '#fb923c' }}>{streak.currentStreak}</span>
              <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--app-text-muted)', marginLeft: 6 }}>{t('dashboard.myReportPage.дн_подряд')}</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--app-text-muted)' }}>
              {t('dashboard.myReportPage.рекорд')}<span style={{ fontWeight: 400, color: 'var(--app-text)' }}>{streak.bestStreak}</span> {t('dashboard.myReportPage.дн')}</div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
              {streak.slots.map((s, i) => (
                <div
                  key={i}
                  style={{
                    width: 28, height: 28, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 400,
                    background: s.active ? '#f59e0b' : 'rgba(255,255,255,0.06)',
                    color: s.active ? '#422006' : 'var(--app-text-muted)',
                    border: s.isToday ? '2px dashed #fb923c' : '1px solid transparent',
                  }}
                >
                  {s.weekday.slice(0, 2)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  )
}

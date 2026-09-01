import { useState, useCallback, useMemo } from 'react'
import { ClipboardList, Save, ChevronDown, ChevronUp } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { MOCK_EMPLOYEES, ROLE_LABELS, type Employee } from '@/data/personnel-mock'
import { cn } from '@/lib/utils'
import { useI18n } from "@/i18n";

/* ── типы ── */

export type PlanPeriod = 'day' | 'week' | 'month'

export interface EmployeePlan {
  employeeId: string
  period: PlanPeriod
  calls: number
  meetings: number
  showings: number
  leads: number
  deals: number
  revenueK: number // тысячи $
}

const PERIOD_LABELS: Record<PlanPeriod, string> = {
  day:   'День',
  week:  'Неделя',
  month: 'Месяц',
}

const KPI_FIELDS: { key: keyof Omit<EmployeePlan, 'employeeId' | 'period'>; label: string; unit?: string }[] = [
  { key: 'calls',     label: 'Звонки' },
  { key: 'meetings',  label: 'Встречи' },
  { key: 'showings',  label: 'Показы' },
  { key: 'leads',     label: 'Лиды обработать' },
  { key: 'deals',     label: 'Сделки' },
  { key: 'revenueK',  label: 'Выручка', unit: '$K' },
]

const STORAGE_KEY = 'agency-set-plans-v1'

function loadPlans(): Record<string, EmployeePlan> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Record<string, EmployeePlan>
  } catch { /* ignore */ }
  return {}
}

function savePlans(plans: Record<string, EmployeePlan>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(plans))
}

function planKey(employeeId: string, period: PlanPeriod) {
  return `${employeeId}__${period}`
}

function defaultPlan(employeeId: string, period: PlanPeriod): EmployeePlan {
  const mult = period === 'month' ? 1 : period === 'week' ? 0.25 : 0.05
  return {
    employeeId,
    period,
    calls:     Math.round(60 * mult),
    meetings:  Math.round(16 * mult),
    showings:  Math.round(10 * mult),
    leads:     Math.round(30 * mult),
    deals:     Math.round(5  * mult),
    revenueK:  Math.round(300 * mult),
  }
}

/* ── строка сотрудника ── */

function EmployeeRow({
  employee,
  plan,
  onChange,
}: {
  employee: Employee
  plan: EmployeePlan
  onChange: (field: keyof Omit<EmployeePlan, 'employeeId' | 'period'>, value: number) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="overflow-hidden rounded-lg border border-[color:var(--workspace-row-border)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 bg-[var(--workspace-row-bg)] px-3 py-2.5 text-left transition-colors hover:bg-[rgba(255,255,255,0.04)]"
      >
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--gold)_20%,transparent)] text-[12px] font-normal text-[color:var(--gold)]">
          {employee.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-normal text-[color:var(--workspace-text)]">{employee.name}</p>
          <p className="text-[11px] text-[color:var(--workspace-text-muted)]">{employee.position}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden rounded px-1.5 py-0.5 text-[10px] uppercase sm:block"
            style={{ background: 'rgba(201,168,76,0.12)', color: 'var(--gold)' }}>
            {ROLE_LABELS[employee.role]}
          </span>
          {open
            ? <ChevronUp className="size-4 text-[color:var(--workspace-text-muted)]" />
            : <ChevronDown className="size-4 text-[color:var(--workspace-text-muted)]" />}
        </div>
      </button>

      {open && (
        <div className="grid grid-cols-2 gap-2 border-t border-[color:var(--workspace-row-border)] bg-[var(--workspace-card-bg)] px-3 py-3 sm:grid-cols-3">
          {KPI_FIELDS.map(({ key, label, unit }) => (
            <label key={key} className="flex flex-col gap-1">
              <span className="text-[11px] text-[color:var(--workspace-text-dim)]">
                {label}{unit ? ` (${unit})` : ''}
              </span>
              <input
                type="number"
                min={0}
                value={plan[key]}
                onChange={(e) => onChange(key, Math.max(0, Number(e.target.value)))}
                className="w-full rounded-md border border-[color:var(--workspace-row-border)] bg-[var(--workspace-row-bg)] px-2 py-1.5 text-[13px] text-[color:var(--workspace-text)] outline-none focus:border-[color:color-mix(in_srgb,var(--gold)_45%,transparent)]"
              />
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── главный компонент ── */

interface SetPlansModalProps {
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function SetPlansModal({ open, onOpenChange }: SetPlansModalProps) {
    const { t } = useI18n();
  const [period, setPeriod] = useState<PlanPeriod>('month')
  const [saved, setSaved] = useState(false)
  const [plans, setPlans] = useState<Record<string, EmployeePlan>>(loadPlans)

  const employees = useMemo(
    () => MOCK_EMPLOYEES.filter((e) => e.role !== 'owner'),
    [],
  )

  const getPlan = useCallback(
    (empId: string): EmployeePlan =>
      plans[planKey(empId, period)] ?? defaultPlan(empId, period),
    [plans, period],
  )

  const updateField = useCallback(
    (empId: string, field: keyof Omit<EmployeePlan, 'employeeId' | 'period'>, value: number) => {
      const key = planKey(empId, period)
      setPlans((prev) => ({
        ...prev,
        [key]: { ...(prev[key] ?? defaultPlan(empId, period)), [field]: value },
      }))
      setSaved(false)
    },
    [period],
  )

  const handleSave = useCallback(() => {
    savePlans(plans)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2000)
  }, [plans])

  const grouped = useMemo(() => {
    const byRole: Record<string, Employee[]> = {}
    for (const e of employees) {
      if (!byRole[e.role]) byRole[e.role] = []
      byRole[e.role].push(e)
    }
    return Object.entries(byRole) as [string, Employee[]][]
  }, [employees])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="flex max-h-[min(92vh,760px)] w-full max-w-2xl flex-col gap-0 overflow-hidden rounded-xl border border-[color:var(--workspace-row-border)] bg-[var(--workspace-card-bg)] p-0 shadow-[0_24px_64px_rgba(0,0,0,0.55)]"
      >
        {/* Шапка */}
        <div className="flex shrink-0 items-center gap-3 border-b border-[color:var(--workspace-row-border)] px-5 py-4 pr-14">
          <div className="flex size-9 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--gold)_18%,transparent)]">
            <ClipboardList className="size-5 text-[color:var(--gold)]" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <DialogHeader>
              <DialogTitle className="text-[15px] font-normal text-[color:var(--workspace-widget-title)]">
                {t('dashboard.setPlansModal.поставить_планы_сотр')}</DialogTitle>
            </DialogHeader>
            <p className="mt-0.5 text-[12px] text-[color:var(--workspace-text-muted)]">
              {t('dashboard.setPlansModal.количественные_kpi_з')}</p>
          </div>
        </div>

        {/* Период */}
        <div className="flex shrink-0 items-center gap-2 border-b border-[color:var(--workspace-row-border)] px-5 py-3">
          <span className="text-[12px] uppercase tracking-wide text-[color:var(--workspace-text-dim)]">{t('dashboard.setPlansModal.период')}</span>
          <div className="flex gap-1 rounded-lg border border-[color:var(--workspace-row-border)] bg-[var(--workspace-row-bg)] p-0.5">
            {(Object.entries(PERIOD_LABELS) as [PlanPeriod, string][]).map(([p, label]) => (
              <button
                key={p}
                type="button"
                onClick={() => { setPeriod(p); setSaved(false) }}
                className={cn(
                  'rounded-md px-3 py-1 text-[12px] font-normal transition-colors',
                  period === p
                    ? 'bg-[color-mix(in_srgb,var(--gold)_24%,transparent)] text-[color:var(--workspace-text)]'
                    : 'text-[color:var(--workspace-text-muted)] hover:bg-[rgba(255,255,255,0.05)]',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Список сотрудников */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-4">
            {grouped.map(([role, emps]) => (
              <div key={role}>
                <p className="mb-2 text-[11px] font-normal uppercase tracking-wide text-[color:var(--workspace-text-dim)]">
                  {ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role}
                </p>
                <div className="space-y-1.5">
                  {emps.map((e) => (
                    <EmployeeRow
                      key={e.id}
                      employee={e}
                      plan={getPlan(e.id)}
                      onChange={(field, value) => updateField(e.id, field, value)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Футер */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[color:var(--workspace-row-border)] px-5 py-3">
          <p className="text-[11px] text-[color:var(--workspace-text-muted)]">
            {t('dashboard.setPlansModal.планы_видны_сотрудни')}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {t('dashboard.setPlansModal.закрыть')}</Button>
            <Button
              size="sm"
              onClick={handleSave}
              className={cn(
                'gap-1.5 transition-colors',
                saved
                  ? 'bg-emerald-600 hover:bg-emerald-600'
                  : 'bg-[var(--gold)] text-[color:var(--gold-btn-text)] hover:brightness-105',
              )}
            >
              <Save className="size-3.5" strokeWidth={2} />
              {saved ? 'Сохранено!' : 'Сохранить'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

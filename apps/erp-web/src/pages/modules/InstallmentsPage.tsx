import { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Power, Trash2, Wallet } from 'lucide-react'

import { InstallmentPlanForm } from '@/components/inventory/InstallmentPlanForm'
import { useCoreStore } from '@/store/useCoreStore'
import { useInstallmentStore } from '@/store/useInstallmentStore'
import { cn } from '@/lib/utils'
import type { IInstallmentPlan } from '@/types/installment'
import { useI18n } from "@/i18n";

export default function InstallmentsPage() {
    const { t } = useI18n();
  const projects = useCoreStore((s) => s.projects)
  const allUnits = useCoreStore((s) => s.allUnits)
  const activeProjectId = useCoreStore((s) => s.activeProjectId)

  const plans = useInstallmentStore((s) => s.plans)
  const togglePlanActive = useInstallmentStore((s) => s.toggleActive)
  const removePlan = useInstallmentStore((s) => s.remove)
  const fetchForProject = useInstallmentStore((s) => s.fetchForProject)

  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    activeProjectId ?? projects[0]?._id ?? '',
  )
  const [editingPlan, setEditingPlan] = useState<IInstallmentPlan | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    if (selectedProjectId) {
      void fetchForProject(selectedProjectId)
    }
  }, [selectedProjectId, fetchForProject])

  const selectedProject = useMemo(
    () => projects.find((p) => p._id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  )

  const projectPlans = useMemo(
    () => plans.filter((p) => p.projectId === selectedProjectId).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [plans, selectedProjectId],
  )

  const unitsById = useMemo(() => new Map(allUnits.map((u) => [u._id, u])), [allUnits])

  if (isCreating || editingPlan) {
    return (
      <section className="w-full min-w-0 max-w-full p-6">
        <div className="rounded-md border border-[color:var(--installments-border-active)] bg-[var(--installments-bg)] p-6">
          <InstallmentPlanForm
            plan={editingPlan}
            projectId={selectedProjectId}
            lockedApplyTo="project"
            onClose={() => { setIsCreating(false); setEditingPlan(null) }}
          />
        </div>
      </section>
    )
  }

  return (
    <section className="w-full min-w-0 max-w-full p-6">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-[36px] font-normal tracking-[-0.02em] text-[color:var(--installments-text)]">{t('modules.installmentsPage.рассрочки')}</h1>

        {projects.length > 0 && (
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="h-11 rounded-md border border-[color:var(--installments-select-border)] bg-[var(--installments-select-bg)] px-3 text-[18px] text-[color:var(--installments-text)] outline-none"
          >
            {projects.map((p) => (
              <option key={p._id} value={p._id}>{p.name}</option>
            ))}
          </select>
        )}

        <button
          type="button"
          onClick={() => setIsCreating(true)}
          disabled={!selectedProjectId}
          className="ml-auto inline-flex h-10 items-center gap-2 rounded-md bg-[#e6c364] px-4 text-[16px] font-normal text-[#072821] transition-colors hover:bg-[#e2c97e] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus size={16} />
          {t('modules.installmentsPage.создать_вариант_расс')}</button>
      </header>

      <p className="mb-4 max-w-2xl text-[16px] text-[color:var(--installments-text-muted)]">
        {t('modules.installmentsPage.здесь_общие_условия')}{selectedProject ? `для проекта «${selectedProject.name}»` : ''}{t('modules.installmentsPage.индивидуальная_расс')}</p>

      {projectPlans.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-[color:var(--installments-select-border)] bg-[var(--installments-empty-bg)] p-10 text-center">
          <Wallet size={32} className="text-[color:var(--installments-label)]" strokeWidth={1.4} />
          <p className="text-[17px] text-[color:var(--installments-text-muted)]">
            {t('modules.installmentsPage.для_проекта_пока_не')}</p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {projectPlans.map((plan) => {
            const linkedUnit = plan.applyTo === 'unit' && plan.unitId ? unitsById.get(plan.unitId) : null
            return (
              <div
                key={plan.id}
                className={cn(
                  'flex flex-col gap-2 rounded-md border bg-[var(--installments-bg)] p-4',
                  plan.isActive
                    ? 'border-[color:var(--installments-border-active)]'
                    : 'border-[color:var(--installments-border-inactive)] opacity-60',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col">
                    <h4 className="text-[18px] font-normal text-[color:var(--installments-text)]">{plan.title}</h4>
                    <span className="text-[13px] uppercase tracking-[0.08em] text-[color:var(--installments-label)]">
                      {plan.applyTo === 'unit'
                        ? `Лот ${linkedUnit?.number ?? '—'}`
                        : 'Весь проект'}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => togglePlanActive(plan.id)} title={plan.isActive ? 'Отключить' : 'Включить'} className="inline-flex size-8 items-center justify-center rounded-md text-[color:var(--installments-btn-text)] transition-colors hover:bg-[var(--installments-btn-hover-bg)] hover:text-[color:var(--installments-text)]"><Power size={14} /></button>
                    <button type="button" onClick={() => setEditingPlan(plan)} title={t('modules.installmentsPage.изменить')} className="inline-flex size-8 items-center justify-center rounded-md text-[color:var(--installments-btn-text)] transition-colors hover:bg-[var(--installments-btn-hover-bg)] hover:text-[color:var(--installments-text)]"><Pencil size={14} /></button>
                    <button type="button" onClick={() => { if (window.confirm(`Удалить «${plan.title}»?`)) removePlan(plan.id) }} title={t('modules.installmentsPage.удалить')} className="inline-flex size-8 items-center justify-center rounded-md text-[color:var(--installments-btn-text)] transition-colors hover:bg-rose-500/15 hover:text-rose-400"><Trash2 size={14} /></button>
                  </div>
                </div>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[15px]">
                  <Row label={t('modules.installmentsPage.первоначальный_взнос')} value={`${plan.downPaymentValue}${plan.downPaymentType === 'percent' ? '%' : ' $'}`} />
                  <Row label={t('modules.installmentsPage.срок')} value={plan.termType === 'fixed_end_date' ? `до ${plan.endDate ?? '—'}` : `${plan.termMonths ?? '—'} мес.`} />
                  <Row label={t('modules.installmentsPage.платежи')} value={plan.paymentFrequency === 'quarterly' ? 'ежеквартально' : 'ежемесячно'} />
                  <Row label={t('modules.installmentsPage.скидка')} value={plan.discountPercent ? `${plan.discountPercent}%` : '—'} />
                </dl>

                {plan.description && (
                  <p className="text-[15px] text-[color:var(--installments-text-muted)]">{plan.description}</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-[13px] uppercase tracking-[0.08em] text-[color:var(--installments-label)]">{label}</dt>
      <dd className="text-right text-[15px] text-[color:var(--installments-text)]">{value}</dd>
    </>
  )
}

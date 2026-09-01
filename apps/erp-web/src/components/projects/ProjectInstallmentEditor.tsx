import { useMemo, useState } from 'react'
import { Pencil, Plus, Power, Trash2, Wallet } from 'lucide-react'

import { InstallmentPlanForm } from '@/components/inventory/InstallmentPlanForm'
import { useInstallmentStore } from '@/store/useInstallmentStore'
import { cn } from '@/lib/utils'
import type { IInstallmentPlan, NewInstallmentPlan } from '@/types/installment'
import { useI18n } from "@/i18n";

const MOCK_PLANS: Omit<NewInstallmentPlan, 'projectId'>[] = [
  {
    title: 'Ежемесячная · ПВ 30%',
    isActive: true,
    applyTo: 'project',
    downPaymentType: 'percent',
    downPaymentValue: 30,
    termType: 'months_from_current_date',
    termMonths: 24,
    paymentFrequency: 'monthly',
    useDiscount: false,
    sortOrder: 0,
  },
  {
    title: 'Квартальная · ПВ 20%',
    isActive: true,
    applyTo: 'project',
    downPaymentType: 'percent',
    downPaymentValue: 20,
    termType: 'months_from_current_date',
    termMonths: 36,
    paymentFrequency: 'quarterly',
    useDiscount: true,
    discountPercent: 5,
    sortOrder: 1,
  },
  {
    title: 'Без взноса · 48 мес.',
    isActive: true,
    applyTo: 'project',
    downPaymentType: 'percent',
    downPaymentValue: 0,
    termType: 'months_from_current_date',
    termMonths: 48,
    paymentFrequency: 'monthly',
    useDiscount: false,
    sortOrder: 2,
  },
]

interface Props {
  projectId: string | null
}

export function ProjectInstallmentEditor({ projectId }: Props) {
    const { t } = useI18n();
  const allPlans = useInstallmentStore((s) => s.plans)
  const togglePlanActive = useInstallmentStore((s) => s.toggleActive)
  const removePlan = useInstallmentStore((s) => s.remove)
  const createPlan = useInstallmentStore((s) => s.create)

  const [editingPlan, setEditingPlan] = useState<IInstallmentPlan | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const plans = useMemo(
    () =>
      projectId
        ? allPlans
            .filter((p) => p.projectId === projectId && p.applyTo === 'project')
            .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        : [],
    [allPlans, projectId],
  )

  if (!projectId) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-dashed border-[rgba(201,168,76,0.18)] bg-[#0f231e] px-4 py-3 text-[16px] text-[rgba(255,255,255,0.72)]">
        <Wallet size={18} className="text-[rgba(201,168,76,0.72)]" />
        {t('projects.projectInstallmentEditor.сохраните_жк_чтобы_н')}</div>
    )
  }

  if (isCreating || editingPlan) {
    return (
      <div className="rounded-md border border-[rgba(201,168,76,0.18)] bg-[#0f231e] p-4">
        <InstallmentPlanForm
          plan={editingPlan}
          projectId={projectId}
          lockedApplyTo="project"
          onClose={() => { setIsCreating(false); setEditingPlan(null) }}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {plans.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-[8px] border border-dashed border-[rgba(201,168,76,0.15)] bg-[rgba(0,0,0,0.2)] px-4 py-6">
          <span className="text-[15px] text-[rgba(255,255,255,0.45)]">{t('projects.projectInstallmentEditor.варианты_рассрочки_н')}</span>
          <button
            type="button"
            onClick={() => { MOCK_PLANS.forEach((p) => createPlan({ ...p, projectId: projectId! })) }}
            className="inline-flex items-center gap-1.5 text-[15px] text-[rgba(242,207,141,0.72)] transition-colors hover:text-[#fcecc8]"
          >
            <Plus size={13} />
            {t('projects.projectInstallmentEditor.заполнить_примерами')}</button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[8px] border border-[rgba(242,207,141,0.15)] bg-[rgba(0,0,0,0.2)]">
          <table className="w-full min-w-[520px] border-collapse text-left">
            <thead>
              <tr className="bg-[rgba(255,255,255,0.02)] text-[13px] font-normal uppercase tracking-wide text-[rgba(242,207,141,0.45)]">
                <th className="px-4 py-3 font-normal">{t('projects.projectInstallmentEditor.название')}</th>
                <th className="px-4 py-3 font-normal">{t('projects.projectInstallmentEditor.пв')}</th>
                <th className="px-4 py-3 font-normal">{t('projects.projectInstallmentEditor.срок')}</th>
                <th className="px-4 py-3 font-normal">{t('projects.projectInstallmentEditor.шаг')}</th>
                <th className="px-4 py-3 font-normal">{t('projects.projectInstallmentEditor.скидка')}</th>
                <th className="px-4 py-3 font-normal" />
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <tr
                  key={plan.id}
                  className={cn(
                    'border-b border-[rgba(242,207,141,0.07)] last:border-0 transition-colors hover:bg-[rgba(255,255,255,0.015)]',
                    !plan.isActive && 'opacity-50',
                  )}
                >
                  <td className="px-4 py-3 text-[15px] text-[#fcecc8]">{plan.title || '—'}</td>
                  <td className="px-4 py-3 text-[15px] text-[rgba(242,207,141,0.85)] whitespace-nowrap">
                    {plan.downPaymentValue}{plan.downPaymentType === 'percent' ? '%' : ' $'}
                  </td>
                  <td className="px-4 py-3 text-[15px] text-[rgba(242,207,141,0.85)] whitespace-nowrap">
                    {plan.termType === 'fixed_end_date'
                      ? `до ${plan.endDate ?? '—'}`
                      : `${plan.termMonths ?? '—'} мес.`}
                  </td>
                  <td className="px-4 py-3 text-[15px] text-[rgba(242,207,141,0.85)]">
                    {plan.paymentFrequency === 'quarterly' ? 'квартал' : 'месяц'}
                  </td>
                  <td className="px-4 py-3 text-[15px] text-[rgba(242,207,141,0.85)]">
                    {plan.discountPercent ? `${plan.discountPercent}%` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-0.5">
                      <button type="button" onClick={() => togglePlanActive(plan.id)} title={plan.isActive ? 'Отключить' : 'Включить'}
                        className="inline-flex size-7 items-center justify-center rounded-md text-[rgba(242,207,141,0.55)] transition-colors hover:bg-[rgba(242,207,141,0.08)] hover:text-[#fcecc8]">
                        <Power size={13} />
                      </button>
                      <button type="button" onClick={() => setEditingPlan(plan)} title={t('projects.projectInstallmentEditor.изменить')}
                        className="inline-flex size-7 items-center justify-center rounded-md text-[rgba(242,207,141,0.55)] transition-colors hover:bg-[rgba(242,207,141,0.08)] hover:text-[#fcecc8]">
                        <Pencil size={13} />
                      </button>
                      <button type="button" onClick={() => { if (window.confirm(`Удалить «${plan.title}»?`)) removePlan(plan.id) }} title={t('projects.projectInstallmentEditor.удалить')}
                        className="inline-flex size-7 items-center justify-center rounded-md text-[rgba(242,207,141,0.55)] transition-colors hover:bg-[rgba(255,180,171,0.12)] hover:text-[#ffb4ab]">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsCreating(true)}
        className="inline-flex items-center gap-1.5 self-start text-[16px] text-[rgba(242,207,141,0.72)] transition-colors hover:text-[#fcecc8]"
      >
        <Plus size={13} />
        {t('projects.projectInstallmentEditor.добавить_вариант_рас')}</button>
    </div>
  )
}

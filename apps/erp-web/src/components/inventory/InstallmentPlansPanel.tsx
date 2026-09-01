import { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Power, Trash2, Wallet } from 'lucide-react'

import { formatUsd } from '@/lib/chessboard'
import {
  calculateInstallment,
  formatEndDate,
  formatPaymentFrequency,
  legacyTermToPlan,
  selectPlansForUnit,
} from '@/lib/installment'
import { cn } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'
import { useCoreStore } from '@/store/useCoreStore'
import { useInstallmentStore } from '@/store/useInstallmentStore'
import type { IUnit } from '@/types/core'
import type { IInstallmentPlan } from '@/types/installment'

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { InstallmentPlanForm } from './InstallmentPlanForm'
import { useI18n } from "@/i18n";

interface Props {
  unit: IUnit
  projectId?: string
  isEditMode: boolean
  /** Не показывать пустое состояние (например, когда блок рассрочки уже заполнен секцией «Управление продажами»). */
  hideWhenEmpty?: boolean
}

export function InstallmentPlansPanel({ unit, projectId, isEditMode, hideWhenEmpty }: Props) {
    const { t } = useI18n();
  const { currentUser } = useAuth()
  const isDeveloper = currentUser?.role === 'developer'
  const allPlans = useInstallmentStore((s) => s.plans)
  const removePlan = useInstallmentStore((s) => s.remove)
  const togglePlanActive = useInstallmentStore((s) => s.toggleActive)
  const projects = useCoreStore((s) => s.projects)

  const [editingPlan, setEditingPlan] = useState<IInstallmentPlan | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)

  const storePlans = useMemo(
    () => selectPlansForUnit(allPlans, unit, projectId),
    [allPlans, unit, projectId],
  )

  const legacyPlans = useMemo<IInstallmentPlan[]>(() => {
    if (storePlans.length > 0 || !projectId) return []
    const project = projects.find((p) => p._id === projectId)
    const terms = project?.installmentTerms ?? []
    return terms.map((t, i) => legacyTermToPlan(t, projectId, i))
  }, [storePlans, projectId, projects])

  const visiblePlans = storePlans.length > 0 ? storePlans : legacyPlans

  const plansListKey = useMemo(() => visiblePlans.map((p) => p.id).join('|'), [visiblePlans])

  useEffect(() => {
    setSelectedPlanId(null)
  }, [plansListKey])

  const selectedPlan = useMemo(() => {
    if (visiblePlans.length === 0) return null
    const found = selectedPlanId ? visiblePlans.find((p) => p.id === selectedPlanId) : null
    return found ?? visiblePlans[0]
  }, [visiblePlans, selectedPlanId])

  const unitOwnPlans = useMemo(
    () => allPlans.filter((p) => p.applyTo === 'unit' && p.unitId === unit._id),
    [allPlans, unit._id],
  )

  const showingProjectFallback = storePlans.length > 0 && unitOwnPlans.length === 0
  const primaryCalculation = useMemo(() => {
    if (!selectedPlan) return null
    const calc = calculateInstallment(unit, selectedPlan)
    return calc ? { plan: selectedPlan, calc } : null
  }, [unit, selectedPlan])

  if (isCreating || editingPlan) {
    return (
      <InstallmentPlanForm
        plan={editingPlan}
        unit={unit}
        projectId={projectId}
        onClose={() => { setIsCreating(false); setEditingPlan(null) }}
      />
    )
  }

  if (unit.status === 'sold') {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-[rgba(201,168,76,0.18)] bg-[#0f231e] p-10 text-center">
        <Wallet size={28} className="text-[rgba(201,168,76,0.35)]" strokeWidth={1.4} />
        <p className="text-[16px] text-[rgba(255,255,255,0.72)]">
          {t('inventory.installmentPlansPanel.юнит_продан_рассрочк')}</p>
      </div>
    )
  }

  if (visiblePlans.length === 0) {
    if (hideWhenEmpty) return null
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-[rgba(201,168,76,0.18)] bg-[#0f231e] p-10 text-center">
        <Wallet size={28} className="text-[rgba(201,168,76,0.35)]" strokeWidth={1.4} />
        <p className="text-[16px] text-[rgba(255,255,255,0.72)]">
          {t('inventory.installmentPlansPanel.для_данного_юнита_ра')}</p>
        {isEditMode && (
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="mt-2 inline-flex items-center gap-2 rounded-md border border-[rgba(201,168,76,0.35)] bg-[rgba(201,168,76,0.08)] px-4 py-2 text-[16px] font-normal text-[#fcecc8] transition-colors hover:bg-[rgba(201,168,76,0.16)]"
          >
            <Plus size={16} />
            {t('inventory.installmentPlansPanel.добавить_вариант_рас')}</button>
        )}
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      {primaryCalculation && (
        <div className="flex min-w-0 flex-col gap-2 rounded-md border border-[rgba(201,168,76,0.16)] bg-[#0c2018] p-3 shadow-[inset_0_0_0_1px_rgba(201,168,76,0.05)]">
          <p className="text-[16px] font-medium uppercase tracking-[0.08em] text-[rgba(242,207,141,0.72)]">
            {t('inventory.installmentPlansPanel.сводка_по_выбранному')}</p>
          <SummaryMetric label={t('inventory.installmentPlansPanel.стоимость')} value={formatUsd(primaryCalculation.calc.priceFinal)} />
          <SummaryMetric label={t('inventory.installmentPlansPanel.первый_взнос')} value={formatUsd(primaryCalculation.calc.downPayment)} />
          <SummaryMetric label={t('inventory.installmentPlansPanel.остаток')} value={formatUsd(primaryCalculation.calc.remaining)} />
          <SummaryMetric label={t('inventory.installmentPlansPanel.срок')} value={`${primaryCalculation.calc.termMonths} мес.`} />
          <SummaryMetric label={t('inventory.installmentPlansPanel.плат_ж')} value={formatUsd(primaryCalculation.calc.paymentAmount)} accent />
        </div>
      )}

      {showingProjectFallback && (
        <div className="rounded-md border border-[rgba(201,168,76,0.14)] bg-[#142d20] px-3 py-2 text-[16px] text-[rgba(255,255,255,0.72)]">
          {t('inventory.installmentPlansPanel.показаны_общие_услов')}</div>
      )}

      {isEditMode && unit.status === 'booked' && (
        <div className="rounded-md border border-amber-500/35 bg-amber-500/10 px-4 py-2 text-[16px] text-amber-100">
          {t('inventory.installmentPlansPanel.юнит_забронирован_ус')}</div>
      )}

      {selectedPlan && visiblePlans.length > 1 && (
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[16px] font-medium uppercase tracking-[0.08em] text-[rgba(242,207,141,0.72)]">
            {t('inventory.installmentPlansPanel.вариант_рассрочки')}</span>
          <Select value={selectedPlan.id} onValueChange={(id) => setSelectedPlanId(id)}>
            <SelectTrigger
              className={cn(
                'h-11 w-full min-w-0 max-w-full justify-between rounded-md border border-[rgba(242,207,141,0.22)] bg-[rgba(0,0,0,0.35)] px-3 text-left text-[16px] font-normal text-[#fcecc8] shadow-none',
                'hover:bg-[rgba(201,168,76,0.08)] focus-visible:border-[rgba(230,195,100,0.45)] focus-visible:ring-[rgba(230,195,100,0.25)]',
                '[&_svg]:text-[rgba(242,207,141,0.72)]',
              )}
            >
              <SelectValue placeholder={t('inventory.installmentPlansPanel.выберите_вариант')} />
            </SelectTrigger>
            <SelectContent
              position="popper"
              className="z-[80] max-h-[min(60vh,22rem)] border border-[rgba(201,168,76,0.18)] bg-[#112d1c] text-[#fcecc8] shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
            >
              <SelectGroup>
                <SelectLabel className="px-2 py-2 text-[16px] font-medium uppercase tracking-[0.08em] text-[rgba(242,207,141,0.72)]">
                  {t('inventory.installmentPlansPanel.базовый')}</SelectLabel>
                <SelectItem
                  value={visiblePlans[0]!.id}
                  className="cursor-pointer rounded-sm py-2.5 pr-8 pl-2 text-[16px] font-normal text-[#fcecc8] focus:bg-[rgba(201,168,76,0.12)] focus:text-[#fcecc8]"
                >
                  {visiblePlans[0]!.title}
                </SelectItem>
              </SelectGroup>
              {visiblePlans.length > 1 ? (
                <SelectGroup>
                  <SelectLabel className="px-2 py-2 text-[16px] font-medium uppercase tracking-[0.08em] text-[rgba(242,207,141,0.72)]">
                    {t('inventory.installmentPlansPanel.дополнительные')}</SelectLabel>
                  {visiblePlans.slice(1).map((plan) => (
                    <SelectItem
                      key={plan.id}
                      value={plan.id}
                      className="cursor-pointer rounded-sm py-2.5 pr-8 pl-2 text-[16px] font-normal text-[#fcecc8] focus:bg-[rgba(201,168,76,0.12)] focus:text-[#fcecc8]"
                    >
                      {plan.title}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ) : null}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex min-w-0 flex-col gap-2.5">
        {selectedPlan ? (
          <PlanCard
            key={selectedPlan.id}
            plan={selectedPlan}
            unit={unit}
            isEditMode={isEditMode && !selectedPlan.id.startsWith('legacy:')}
            isLegacy={selectedPlan.id.startsWith('legacy:')}
            isDeveloper={isDeveloper}
            onEdit={() => setEditingPlan(selectedPlan)}
            onRemove={() => {
              if (window.confirm(`Удалить вариант «${selectedPlan.title}»?`)) removePlan(selectedPlan.id)
            }}
            onToggleActive={() => togglePlanActive(selectedPlan.id)}
          />
        ) : null}
      </div>

      {isEditMode && (
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-[rgba(201,168,76,0.35)] bg-transparent px-4 py-3 text-[16px] font-normal text-[rgba(242,207,141,0.85)] transition-colors hover:bg-[rgba(201,168,76,0.06)] hover:text-[#fcecc8]"
        >
          <Plus size={16} />
          {t('inventory.installmentPlansPanel.добавить_вариант_рас')}</button>
      )}
    </div>
  )
}

interface PlanCardProps {
  plan: IInstallmentPlan
  unit: IUnit
  isEditMode: boolean
  isLegacy?: boolean
  isDeveloper?: boolean
  onEdit: () => void
  onRemove: () => void
  onToggleActive: () => void
}

function PlanCard({ plan, unit, isEditMode, isLegacy, isDeveloper, onEdit, onRemove, onToggleActive }: PlanCardProps) {
    const { t } = useI18n();
  const calc = useMemo(() => calculateInstallment(unit, plan), [unit, plan])

  return (
    <div className={cn(
      'flex min-w-0 flex-col gap-2.5 rounded-md border bg-[#0c2018] p-3 shadow-[inset_0_0_0_1px_rgba(201,168,76,0.05)]',
      plan.isActive
        ? 'border-[rgba(201,168,76,0.22)]'
        : 'border-[rgba(201,168,76,0.1)] opacity-75',
    )}>
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <h4 className="break-words text-[20px] font-normal tracking-tight text-[#fcecc8]">{plan.title}</h4>
          <span className="text-[16px] font-medium uppercase tracking-[0.08em] text-[rgba(255,255,255,0.72)]">
            {isLegacy
              ? 'Старая схема проекта'
              : plan.applyTo === 'unit'
                ? 'Индивидуально для лота'
                : 'Условия проекта'}
          </span>
        </div>

        {isEditMode && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onToggleActive}
              title={plan.isActive ? 'Отключить' : 'Включить'}
              className="inline-flex size-8 items-center justify-center rounded-md text-[rgba(242,207,141,0.55)] transition-colors hover:bg-[rgba(242,207,141,0.08)] hover:text-[#fcecc8]"
            >
              <Power size={14} />
            </button>
            <button
              type="button"
              onClick={onEdit}
              title={t('inventory.installmentPlansPanel.изменить')}
              className="inline-flex size-8 items-center justify-center rounded-md text-[rgba(242,207,141,0.55)] transition-colors hover:bg-[rgba(242,207,141,0.08)] hover:text-[#fcecc8]"
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              onClick={onRemove}
              title={t('inventory.installmentPlansPanel.удалить')}
              className="inline-flex size-8 items-center justify-center rounded-md text-[rgba(242,207,141,0.55)] transition-colors hover:bg-rose-500/15 hover:text-rose-200"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      {calc ? (
        <>
          <div className="flex min-w-0 flex-col gap-2">
            {calc.hasDiscount && (
              <div className="flex min-w-0 flex-col gap-1 rounded-md bg-[#142d20] px-4 py-3 shadow-[inset_0_0_0_1px_rgba(201,168,76,0.12)] sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                <span className="text-[16px] font-medium uppercase tracking-[0.08em] text-[rgba(242,207,141,0.72)]">
                  {t('inventory.installmentPlansPanel.цена_со_скидкой')}{calc.discountPercent != null ? ` ${calc.discountPercent}%` : ''}
                </span>
                <span className="flex flex-wrap items-baseline gap-2 text-[18px] tabular-nums text-[#fcecc8]">
                  <span className="text-[16px] text-[rgba(255,255,255,0.72)] line-through">{formatUsd(calc.priceBase)}</span>
                  {formatUsd(calc.priceFinal)}
                </span>
              </div>
            )}

            <p className="text-[16px] font-medium uppercase tracking-[0.08em] text-[rgba(242,207,141,0.72)]">
              {t('inventory.installmentPlansPanel.этапы_расч_та')}</p>

            <PlanRow label={t('inventory.installmentPlansPanel.первоначальный_взнос')} value={formatUsd(calc.downPayment)} hint={
              plan.downPaymentType === 'percent' ? `${plan.downPaymentValue}%` : undefined
            } />
            <PlanRow label={t('inventory.installmentPlansPanel.остаток')} value={formatUsd(calc.remaining)} />
            <PlanRow label={t('inventory.installmentPlansPanel.срок')} value={`${calc.termMonths} мес.`} hint={`до ${formatEndDate(calc.endDate)}`} />
            <PlanRow label={t('inventory.installmentPlansPanel.периодичность')} value={formatPaymentFrequency(calc.paymentFrequency)} hint={`${calc.paymentsCount} платежей`} />

            <div className="mt-1 flex min-w-0 flex-col gap-2 rounded-md border border-[rgba(201,168,76,0.22)] bg-[#142d20] p-4 shadow-[inset_0_0_0_1px_rgba(201,168,76,0.14)]">
              <span className="text-[16px] font-medium uppercase tracking-[0.08em] text-[rgba(255,255,255,0.72)]">
                {t('inventory.installmentPlansPanel.один_плат_ж')}</span>
              <div className="break-words text-[24px] font-normal tabular-nums tracking-tight text-[#fcecc8]">
                {formatUsd(calc.paymentAmount)}
              </div>
              <div className="min-w-0 break-words text-[16px] text-[#d0e8df]">
                {calc.paymentsCount} {t('inventory.installmentPlansPanel.платежей')}{formatPaymentFrequency(calc.paymentFrequency)}
              </div>
            </div>
          </div>

          {plan.description && (
            <p className="break-words rounded-md bg-[#142d20] px-3 py-1.5 text-[16px] text-[rgba(255,255,255,0.72)]">{plan.description}</p>
          )}

          {!isDeveloper && (
            <button
              type="button"
              disabled
              className="mt-1 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[rgba(201,168,76,0.18)] px-4 text-[16px] font-normal text-[rgba(255,255,255,0.72)] opacity-60"
              title={t('inventory.installmentPlansPanel.скоро')}
            >
              {t('inventory.installmentPlansPanel.оставить_заявку')}</button>
          )}
        </>
      ) : (
        <p className="text-[16px] text-[rgba(255,255,255,0.72)]">
          {t('inventory.installmentPlansPanel.расч_т_рассрочки_дос')}</p>
      )}
    </div>
  )
}

function PlanRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-col justify-center gap-1 rounded-md bg-[#132a20] px-4 py-3 shadow-[inset_0_0_0_1px_rgba(201,168,76,0.06)]">
      <span className="text-[16px] font-medium uppercase tracking-[0.08em] text-[rgba(242,207,141,0.72)]">{label}</span>
      <span className="break-words text-[18px] font-normal tabular-nums text-[#fcecc8]">{value}</span>
      {hint ? <span className="break-words text-[16px] font-normal text-[#d0e8df]">{hint}</span> : null}
    </div>
  )
}

function SummaryMetric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex min-w-0 flex-row items-baseline justify-between gap-4 rounded-md bg-[#132a20] px-4 py-3 shadow-[inset_0_0_0_1px_rgba(201,168,76,0.06)]">
      <div className="min-w-0 flex-1 break-words text-[16px] font-medium uppercase tracking-[0.08em] text-[rgba(242,207,141,0.72)]">
        {label}
      </div>
      <div
        className={cn(
          'min-w-0 shrink-0 break-words text-right text-[18px] font-normal tabular-nums',
          accent ? 'text-[#fcecc8]' : 'text-[rgba(255,255,255,0.86)]',
        )}
      >
        {value}
      </div>
    </div>
  )
}

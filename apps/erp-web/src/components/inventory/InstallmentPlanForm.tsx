import { useState, type ChangeEvent, type FormEvent } from 'react'
import { ArrowLeft } from 'lucide-react'

import { useInstallmentStore } from '@/store/useInstallmentStore'
import { useCoreStore } from '@/store/useCoreStore'
import { cn } from '@/lib/utils'
import type { IUnit } from '@/types/core'
import type {
  IInstallmentPlan,
  InstallmentApplyTo,
  InstallmentDownPaymentType,
  InstallmentPaymentFrequency,
  InstallmentTermType,
  NewInstallmentPlan,
} from '@/types/installment'
import { useI18n } from "@/i18n";

interface Props {
  plan: IInstallmentPlan | null
  /** Если форма открыта из карточки лота — контекст лота. */
  unit?: IUnit
  /** Контекст проекта — обязателен для сохранения. */
  projectId?: string
  onClose: () => void
  /** Принудительный режим выбора привязки (например, при создании плана проекта). */
  lockedApplyTo?: InstallmentApplyTo
}

interface FormState {
  title: string
  isActive: boolean
  applyTo: InstallmentApplyTo
  downPaymentType: InstallmentDownPaymentType
  downPaymentValue: string
  termType: InstallmentTermType
  termMonths: string
  endDate: string
  paymentFrequency: InstallmentPaymentFrequency
  useDiscount: boolean
  discountFromDownPayment: boolean
  discountPercent: string
  description: string
}

function makeForm(plan: IInstallmentPlan | null, defaultApplyTo: InstallmentApplyTo): FormState {
  if (!plan) {
    return {
      title: '',
      isActive: true,
      applyTo: defaultApplyTo,
      downPaymentType: 'percent',
      downPaymentValue: '30',
      termType: 'months_from_current_date',
      termMonths: '24',
      endDate: '',
      paymentFrequency: 'monthly',
      useDiscount: false,
      discountFromDownPayment: false,
      discountPercent: '',
      description: '',
    }
  }
  return {
    title: plan.title,
    isActive: plan.isActive,
    applyTo: plan.applyTo,
    downPaymentType: plan.downPaymentType,
    downPaymentValue: String(plan.downPaymentValue),
    termType: plan.termType,
    termMonths: plan.termMonths != null ? String(plan.termMonths) : '',
    endDate: plan.endDate ?? '',
    paymentFrequency: plan.paymentFrequency,
    useDiscount: (plan.discountPercent ?? 0) > 0,
    discountFromDownPayment: plan.discountFromDownPayment ?? false,
    discountPercent: plan.discountPercent != null ? String(plan.discountPercent) : '',
    description: plan.description ?? '',
  }
}

export function InstallmentPlanForm({ plan, unit, projectId, onClose, lockedApplyTo }: Props) {
    const { t } = useI18n();
  const create = useInstallmentStore((s) => s.create)
  const update = useInstallmentStore((s) => s.update)
  const projects = useCoreStore((s) => s.projects)

  const defaultApplyTo: InstallmentApplyTo = lockedApplyTo ?? (unit ? 'unit' : 'project')
  const [form, setForm] = useState<FormState>(() => makeForm(plan, defaultApplyTo))
  const [error, setError] = useState<string | null>(null)

  const project = projectId ? projects.find((p) => p._id === projectId) : null

  function field<K extends keyof FormState>(key: K) {
    return (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const target = e.target
      const value =
        target instanceof HTMLInputElement && target.type === 'checkbox' ? target.checked : target.value
      setForm((prev) => ({ ...prev, [key]: value as FormState[K] }))
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!projectId) { setError('Не определён проект для сохранения рассрочки.'); return }
    if (!form.title.trim()) { setError('Укажите название варианта.'); return }

    const downValue = Number(form.downPaymentValue)
    if (!Number.isFinite(downValue) || downValue < 0) { setError('Первоначальный взнос — неотрицательное число.'); return }
    if (form.downPaymentType === 'percent' && downValue > 100) { setError('Первоначальный взнос в процентах не больше 100.'); return }

    const hasDiscountPercent = form.discountPercent.trim() !== ''
    const discountPercent = hasDiscountPercent ? Number(form.discountPercent) : undefined
    if (discountPercent != null && (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100)) {
      setError('Размер скидки — число от 0 до 100%.')
      return
    }

    let termMonths: number | undefined
    let endDate: string | undefined
    if (form.termType === 'months_from_current_date') {
      const m = Number(form.termMonths)
      if (!Number.isInteger(m) || m < 1) { setError('Срок в месяцах — целое число от 1.'); return }
      termMonths = m
    } else {
      if (!form.endDate) { setError('Укажите дату окончания рассрочки.'); return }
      endDate = form.endDate
    }

    const data: NewInstallmentPlan = {
      title: form.title.trim(),
      isActive: form.isActive,
      applyTo: form.applyTo,
      projectId,
      unitId: form.applyTo === 'unit' ? unit?._id : undefined,
      downPaymentType: form.downPaymentType,
      downPaymentValue: downValue,
      termType: form.termType,
      termMonths,
      endDate,
      paymentFrequency: form.paymentFrequency,
      useDiscount: discountPercent != null && discountPercent > 0,
      discountFromDownPayment: discountPercent != null && discountPercent > 0,
      discountPercent: discountPercent != null && discountPercent > 0 ? discountPercent : undefined,
      description: form.description.trim() || undefined,
    }

    if (plan) update(plan.id, data)
    else create(data)

    onClose()
  }

  const showApplyToToggle = !lockedApplyTo && unit != null

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex size-9 items-center justify-center rounded-md text-[rgba(242,207,141,0.55)] transition-colors hover:bg-[rgba(242,207,141,0.08)] hover:text-[#fcecc8]"
          aria-label={t('inventory.installmentPlanForm.назад')}
        >
          <ArrowLeft size={18} />
        </button>
        <h3 className="text-[20px] font-normal text-[#fcecc8]">
          {plan ? 'Изменить вариант рассрочки' : 'Новый вариант рассрочки'}
        </h3>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('inventory.installmentPlanForm.название_варианта')} required>
          <input
            type="text"
            value={form.title}
            onChange={field('title')}
            placeholder={t('inventory.installmentPlanForm.база')}
            className={inputCls}
          />
        </Field>

        <Field label={t('inventory.installmentPlanForm.активность')}>
          <label className="flex h-10 items-center gap-2 text-[16px] text-[rgba(255,255,255,0.85)]">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={field('isActive')}
              className="accent-[#c9a84c]"
            />
            <span>{form.isActive ? 'Включена' : 'Выключена'}</span>
          </label>
        </Field>

        {showApplyToToggle && (
          <Field label={t('inventory.installmentPlanForm.применение')}>
            <select value={form.applyTo} onChange={field('applyTo')} className={inputCls}>
              <option value="unit">{t('inventory.installmentPlanForm.этот_лот')}{unit ? `№${unit.number}` : ''}</option>
              <option value="project">{t('inventory.installmentPlanForm.весь_проект')}{project?.name ? `«${project.name}»` : ''}</option>
            </select>
          </Field>
        )}

        <Field label={t('inventory.installmentPlanForm.первоначальный_взнос')} required>
          <div className="grid grid-cols-[1fr_6rem] items-stretch gap-1">
            <input
              type="number"
              min="0"
              value={form.downPaymentValue}
              onChange={field('downPaymentValue')}
              className={inputCls}
            />
            <select value={form.downPaymentType} onChange={field('downPaymentType')} className={cn(inputCls, 'w-24')}>
              <option value="percent">%</option>
              <option value="amount">$</option>
            </select>
          </div>
        </Field>

        <Field label={t('inventory.installmentPlanForm.скидка')}>
          <div className="relative">
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={form.discountPercent}
              onChange={field('discountPercent')}
              placeholder="0"
              className={cn(inputCls, 'pr-7')}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-[rgba(242,207,141,0.45)]">%</span>
          </div>
        </Field>

        <Field label={t('inventory.installmentPlanForm.тип_срока')} required>
          <select value={form.termType} onChange={field('termType')} className={inputCls}>
            <option value="months_from_current_date">{t('inventory.installmentPlanForm.от_текущей_даты')}</option>
            <option value="fixed_end_date">{t('inventory.installmentPlanForm.до_конкретной_даты')}</option>
          </select>
        </Field>

        {form.termType === 'months_from_current_date' ? (
          <Field label={t('inventory.installmentPlanForm.срок_месяцев')} required>
            <input
              type="number"
              min="1"
              value={form.termMonths}
              onChange={field('termMonths')}
              className={inputCls}
            />
          </Field>
        ) : (
          <Field label={t('inventory.installmentPlanForm.дата_окончания')} required>
            <input
              type="date"
              value={form.endDate}
              onChange={field('endDate')}
              className={inputCls}
            />
          </Field>
        )}

        <Field label={t('inventory.installmentPlanForm.периодичность_платеж')} required>
          <select value={form.paymentFrequency} onChange={field('paymentFrequency')} className={inputCls}>
            <option value="monthly">{t('inventory.installmentPlanForm.раз_в_месяц')}</option>
            <option value="quarterly">{t('inventory.installmentPlanForm.раз_в_квартал')}</option>
          </select>
        </Field>

        <Field label={t('inventory.installmentPlanForm.комментарий')} className="sm:col-span-2">
          <textarea
            value={form.description}
            onChange={field('description')}
            rows={3}
            placeholder={t('inventory.installmentPlanForm.условия_от_девелопер')}
            className={cn(inputCls, 'h-auto py-2')}
          />
        </Field>
      </div>

      {error && (
        <div className="rounded-md border border-rose-400/35 bg-rose-500/10 px-3 py-2 text-[15px] text-rose-100">{error}</div>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-10 items-center justify-center rounded-md border border-[rgba(201,168,76,0.2)] bg-transparent px-4 text-[16px] font-normal text-[rgba(255,255,255,0.85)] transition-colors hover:bg-[rgba(255,255,255,0.06)]"
        >
          {t('inventory.installmentPlanForm.отмена')}</button>
        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center rounded-md bg-[#e6c364] px-5 text-[16px] font-normal text-[#072821] transition-colors hover:bg-[#e2c97e]"
        >
          {plan ? 'Сохранить' : 'Создать'}
        </button>
      </div>
    </form>
  )
}

const inputCls =
  'h-10 w-full rounded-md border border-[rgba(201,168,76,0.2)] bg-[rgba(0,0,0,0.3)] px-3 text-[16px] font-normal text-[#fcecc8] outline-none transition-colors focus:border-[rgba(201,168,76,0.45)]'

function Field({
  label,
  children,
  required,
  className,
}: {
  label: string
  children: React.ReactNode
  required?: boolean
  className?: string
}) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-[13px] uppercase tracking-[0.08em] text-[rgba(242,207,141,0.5)]">
        {label}
        {required && <span className="ml-1 text-[#e6c364]">*</span>}
      </span>
      {children}
    </label>
  )
}

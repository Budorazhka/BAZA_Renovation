import type { InstallmentTerm, IUnit } from '@/types/core'
import type {
  IInstallmentPlan,
  InstallmentCalculation,
} from '@/types/installment'
import { computeUnitTotalPrice } from '@/lib/chessboard'

export function legacyTermToPlan(term: InstallmentTerm, projectId: string, idx: number): IInstallmentPlan {
  const now = new Date().toISOString()
  return {
    id: `legacy:${projectId}:${idx}`,
    title: term.type?.trim() || `Рассрочка ${term.durationMonths} мес.`,
    isActive: true,
    applyTo: 'project',
    projectId,
    downPaymentType: 'percent',
    downPaymentValue: term.downPaymentPercent,
    termType: 'months_from_current_date',
    termMonths: term.durationMonths,
    paymentFrequency: 'monthly',
    useDiscount: true,
    discountFromDownPayment: false,
    sortOrder: idx,
    createdAt: now,
    updatedAt: now,
  }
}

function computeTermMonths(plan: IInstallmentPlan, now: Date = new Date()): number {
  if (plan.termType === 'fixed_end_date' && plan.endDate) {
    const end = new Date(plan.endDate)
    const months =
      (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth())
    return Math.max(1, months)
  }
  return Math.max(1, plan.termMonths ?? 0)
}

function computeEndDate(plan: IInstallmentPlan, termMonths: number, now: Date = new Date()): Date {
  if (plan.termType === 'fixed_end_date' && plan.endDate) return new Date(plan.endDate)
  const d = new Date(now)
  d.setMonth(d.getMonth() + termMonths)
  return d
}

function applyDiscount(price: number, unit: IUnit | null | undefined, plan: IInstallmentPlan): { final: number; hasDiscount: boolean; discountPercent?: number } {
  if (plan.discountFromDownPayment && typeof plan.discountPercent === 'number' && plan.discountPercent > 0) {
    const discountPercent = Math.min(100, plan.discountPercent)
    return {
      final: price * (1 - discountPercent / 100),
      hasDiscount: true,
      discountPercent,
    }
  }

  if (!plan.useDiscount || !unit?.promotion || unit.promotion.isActive === false) {
    return { final: price, hasDiscount: false }
  }
  const promo = unit.promotion
  if (typeof promo.discountPercent === 'number' && promo.discountPercent > 0) {
    return { final: price * (1 - promo.discountPercent / 100), hasDiscount: true, discountPercent: promo.discountPercent }
  }
  return { final: price, hasDiscount: false }
}

export function calculateInstallment(
  unit: IUnit | null | undefined,
  plan: IInstallmentPlan,
  now: Date = new Date(),
): InstallmentCalculation | null {
  const priceBase = unit ? computeUnitTotalPrice(unit) ?? 0 : 0
  if (!priceBase) return null

  const { final: priceFinal, hasDiscount, discountPercent } = applyDiscount(priceBase, unit, plan)

  const downPayment =
    plan.downPaymentType === 'percent'
      ? priceFinal * (plan.downPaymentValue / 100)
      : Math.min(priceFinal, plan.downPaymentValue)

  const remaining = Math.max(0, priceFinal - downPayment)
  const termMonths = computeTermMonths(plan, now)
  const monthsPerPayment = plan.paymentFrequency === 'quarterly' ? 3 : 1
  const paymentsCount = Math.max(1, Math.ceil(termMonths / monthsPerPayment))
  const paymentAmount = remaining / paymentsCount
  const endDate = computeEndDate(plan, termMonths, now)

  return {
    priceBase,
    priceFinal,
    hasDiscount,
    discountPercent,
    downPayment,
    remaining,
    paymentsCount,
    paymentAmount,
    paymentFrequency: plan.paymentFrequency,
    termMonths,
    endDate,
  }
}

export function selectPlansForUnit(
  plans: IInstallmentPlan[],
  unit: IUnit,
  projectId: string | undefined,
): IInstallmentPlan[] {
  const active = plans.filter((p) => p.isActive)
  const unitPlans = active.filter((p) => p.applyTo === 'unit' && p.unitId === unit._id)
  if (unitPlans.length > 0) return [...unitPlans].sort(sortPlans)
  if (!projectId) return []
  return active
    .filter((p) => p.applyTo === 'project' && p.projectId === projectId)
    .sort(sortPlans)
}

function sortPlans(a: IInstallmentPlan, b: IInstallmentPlan): number {
  const aOrder = a.sortOrder ?? 0
  const bOrder = b.sortOrder ?? 0
  if (aOrder !== bOrder) return aOrder - bOrder
  return a.title.localeCompare(b.title, 'ru')
}

const RU_MONTHS = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
]

export function formatEndDate(date: Date): string {
  return `${RU_MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

export function formatPaymentFrequency(freq: 'monthly' | 'quarterly'): string {
  return freq === 'quarterly' ? 'раз в квартал' : 'раз в месяц'
}

// import { installmentsKey } from '@/components/development/sales/salesManagementStorage'
import {
  parseSalesInstallmentsFromStorage,
  type InstallmentRowModel,
} from '@/components/development/sales/salesInstallmentsShared'
import { computeUnitTotalPrice } from '@/lib/chessboard'
import { selectPlansForUnit } from '@/lib/installment'
import type { InstallmentOptionDto, PublicUnitInstallmentDto } from '@/services/developmentApi'
import { t, type SelectionLanguage } from '@/lib/selection-display'
import type { IUnit, InstallmentTerm } from '@/types/core'
import type { IInstallmentPlan } from '@/types/installment'

const INSTALLMENTS_STORAGE_PREFIX = 'developer.sales.installments.'

export interface ResolveProjectInstallmentOptions {
  projectId?: string
  projectPlans?: IInstallmentPlan[] | null
  projectTerms?: InstallmentTerm[] | null
  unitId?: string
  listPrice?: number
}

function resolvePlanTermMonths(plan: IInstallmentPlan): number {
  if (plan.termType === 'fixed_end_date' && plan.endDate) {
    const end = new Date(plan.endDate)
    const now = new Date()
    const months =
      (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth())
    return Math.max(1, months)
  }
  return Math.max(1, plan.termMonths ?? 0)
}

function resolvePlanDownPaymentPercent(plan: IInstallmentPlan, listPrice?: number): number {
  if (plan.downPaymentType === 'percent') {
    return Math.min(100, Math.max(0, plan.downPaymentValue))
  }
  if (listPrice != null && listPrice > 0) {
    return Math.min(100, Math.max(0, (plan.downPaymentValue / listPrice) * 100))
  }
  return 0
}

/** Один вариант рассрочки из API (`installmentPlans`) → строка для модалки/графика. */
export function installmentPlanToRow(
  plan: IInstallmentPlan,
  listPrice?: number,
): InstallmentRowModel {
  const discount =
    plan.useDiscount && plan.discountPercent != null && plan.discountPercent > 0
      ? plan.discountPercent
      : null

  return {
    id: plan.id,
    label: plan.title.trim() || `Вариант ${plan.termMonths ?? '—'} мес.`,
    downPaymentPercent: resolvePlanDownPaymentPercent(plan, listPrice),
    termMonths: resolvePlanTermMonths(plan),
    discountPercent: discount,
    paymentStep: plan.paymentFrequency === 'quarterly' ? 'quarterly' : 'monthly',
    validUntil: plan.termType === 'fixed_end_date' && plan.endDate ? plan.endDate.slice(0, 10) : null,
    scope: plan.applyTo === 'unit' ? 'units' : 'all',
    unitIds: plan.unitId ? [plan.unitId] : [],
  }
}

/** Все варианты из `installmentPlans` → строки модалки (с учётом лота). */
export function installmentPlansToRows(
  plans: IInstallmentPlan[],
  options?: Pick<ResolveProjectInstallmentOptions, 'unitId' | 'projectId' | 'listPrice'>,
): InstallmentRowModel[] {
  if (plans.length === 0) return []

  const applicable =
    options?.unitId && options?.projectId
      ? selectPlansForUnit(plans, { _id: options.unitId } as IUnit, options.projectId)
      : plans.filter((p) => p.isActive !== false && p.applyTo === 'project')

  return applicable.map((plan) => installmentPlanToRow(plan, options?.listPrice))
}

function installmentPlansToDto(
  plans: IInstallmentPlan[],
  options?: Pick<ResolveProjectInstallmentOptions, 'unitId' | 'projectId' | 'listPrice'>,
): PublicUnitInstallmentDto | null {
  const rows = installmentPlansToRows(plans, options)
  if (rows.length === 0) return null

  const toOption = (row: InstallmentRowModel): InstallmentOptionDto => ({
    id: row.id,
    label: row.label,
    downPaymentPercent: row.downPaymentPercent,
    termMonths: row.termMonths,
    discountPercent: row.discountPercent,
    paymentStep: row.paymentStep,
    validUntil: row.validUntil,
    scope: row.scope === 'units' ? 'units' : 'all',
    unitIds: row.unitIds,
  })

  return {
    base: toOption(rows[0]),
    optional: rows.slice(1).map(toOption),
  }
}

// localStorage-фолбэк отключён: в нём у части пользователей лежат мок-данные
// (Базовая 30%/12 мес, 24/36 месяцев), посеянные старыми сборками, и обычный
// пользователь видел их вместо реальной рассрочки застройщика.
// function loadInstallmentRowsFromStorage(projectId: string): InstallmentRowModel[] {
//   let raw: string | null = null
//   try {
//     raw = localStorage.getItem(installmentsKey(projectId))
//   } catch {
//     /* ignore */
//   }
//   const parsed = parseSalesInstallmentsFromStorage(raw)
//   if (!parsed?.base) return []
//   return [parsed.base, ...parsed.optional].map((row) => ({
//     ...row,
//     scope: 'all' as const,
//     unitIds: [],
//   }))
// }

/** Рассрочки ЖК: `installmentPlans` → legacy `installmentTerms`, иначе блок скрывается. */
export function resolveProjectInstallmentRows(
  options: ResolveProjectInstallmentOptions,
): InstallmentRowModel[] {
  const { projectId, projectPlans, projectTerms, unitId, listPrice } = options

  if (projectPlans?.length) {
    const fromPlans = installmentPlansToRows(projectPlans, { unitId, projectId, listPrice })
    if (fromPlans.length > 0) return fromPlans
  }

  const fromTerms = installmentTermsToRows(projectTerms)
  if (fromTerms.length > 0) return fromTerms

  // if (projectId) {
  //   return loadInstallmentRowsFromStorage(projectId)
  // }

  return []
}

/** Рассрочки ЖК из визарда новостроек (legacy) как строки модалки. */
export function installmentTermsToRows(terms?: InstallmentTerm[] | null): InstallmentRowModel[] {
  const dto = installmentTermsToDto(terms ?? [])
  if (!dto?.base) return []
  return collectInstallmentOptions(dto).map((opt) => ({
    ...installmentDtoToRow(opt),
    scope: 'all' as const,
    unitIds: [],
  }))
}

/** Строки рассрочки для модалки лота. */
export function loadUnitModalInstallmentRows(
  options: ResolveProjectInstallmentOptions,
): InstallmentRowModel[] {
  return resolveProjectInstallmentRows(options)
}

/** Стоимость лота для графика рассрочки — как в модалке. */
export function resolveUnitModalListPrice(
  unit: Pick<IUnit, 'price' | 'pricePerSqm' | 'area'>,
): number {
  return computeUnitTotalPrice(unit as IUnit) ?? 100_000
}

export function installmentDtoToRow(opt: InstallmentOptionDto): InstallmentRowModel {
  return {
    id: opt.id,
    label: opt.label,
    downPaymentPercent: opt.downPaymentPercent,
    termMonths: opt.termMonths,
    discountPercent: opt.discountPercent ?? null,
    paymentStep: opt.paymentStep === 'quarterly' ? 'quarterly' : 'monthly',
    validUntil: opt.validUntil ?? null,
    scope: 'all',
    unitIds: opt.unitIds ?? [],
  }
}

export function collectInstallmentOptions(
  installment?: PublicUnitInstallmentDto | null,
): InstallmentOptionDto[] {
  if (!installment?.base) return []
  return [installment.base, ...(installment.optional ?? [])]
}

export function parseInstallmentFromStorage(projectId: string): PublicUnitInstallmentDto | null {
  try {
    const raw = localStorage.getItem(`${INSTALLMENTS_STORAGE_PREFIX}${projectId}`)
    const parsed = parseSalesInstallmentsFromStorage(raw)
    if (!parsed?.base) return null
    return { base: parsed.base, optional: parsed.optional }
  } catch {
    return null
  }
}

/** Рассрочка для публичной визитки: `installmentPlans` → API dto → legacy terms, иначе скрывается. */
export function resolvePublicInstallment(
  installment?: PublicUnitInstallmentDto | null,
  options?: ResolveProjectInstallmentOptions,
): PublicUnitInstallmentDto | null {
  const fromPlans = installmentPlansToDto(options?.projectPlans ?? [], options)
  if (fromPlans?.base) return fromPlans

  if (installment?.base) return installment

  const fromTerms = installmentTermsToDto(options?.projectTerms ?? [])
  if (fromTerms?.base) return fromTerms

  // localStorage-фолбэк отключён — там могут лежать мок-данные старых сборок
  // (см. loadInstallmentRowsFromStorage выше).
  // if (options?.projectId) {
  //   const stored = parseInstallmentFromStorage(options.projectId)
  //   if (stored?.base) return stored
  // }

  return null
}

export function installmentTermsToDto(terms: InstallmentTerm[]): PublicUnitInstallmentDto | null {
  if (terms.length === 0) return null
  const toOption = (term: InstallmentTerm, index: number): InstallmentOptionDto => ({
    id: `term-${index}`,
    label: term.type,
    downPaymentPercent: term.downPaymentPercent,
    termMonths: term.durationMonths,
    discountPercent: null,
    paymentStep: 'monthly',
    validUntil: null,
    scope: 'all',
    unitIds: [],
  })
  return {
    base: toOption(terms[0], 0),
    optional: terms.slice(1).map((term, index) => toOption(term, index + 1)),
  }
}

export function paymentStepLabel(language: SelectionLanguage, step?: string | null): string | null {
  if (!step) return null
  const key = step.toLowerCase()
  if (key === 'monthly' || key.includes('ежемесяч')) return t(language, 'paymentMonthly')
  if (key === 'quarterly' || key.includes('квартал')) return t(language, 'paymentQuarterly')
  return step
}

export function formatInstallmentSummary(language: SelectionLanguage, opt: InstallmentOptionDto): string {
  const parts = [`${t(language, 'firstPayment')} ${opt.downPaymentPercent}%`]
  if (opt.termMonths > 0) parts.push(`${opt.termMonths} ${t(language, 'monthsShort')}`)
  const step = paymentStepLabel(language, opt.paymentStep)
  if (step) parts.push(step)
  return parts.join(' · ')
}

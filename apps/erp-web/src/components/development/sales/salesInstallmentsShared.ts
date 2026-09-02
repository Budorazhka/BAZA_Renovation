import { computeUnitTotalPrice, formatUsd } from '@/lib/chessboard'
import type { IUnit } from '@/types/core'

export type InstallmentPaymentStep = 'monthly' | 'quarterly'

export interface InstallmentRowModel {
  id: string
  label: string
  downPaymentPercent: number
  termMonths: number
  discountPercent: number | null
  paymentStep: InstallmentPaymentStep
  validUntil: string | null
  scope: 'all' | 'units'
  unitIds: string[]
}

export const DEFAULT_SALES_INSTALLMENT_BASE: InstallmentRowModel = {
  id: 'base',
  label: '',
  downPaymentPercent: 30,
  termMonths: 24,
  discountPercent: null,
  paymentStep: 'monthly',
  validUntil: null,
  scope: 'all',
  unitIds: [],
}

// Мок-данные рассрочки отключены: пользователи должны видеть только реальные
// планы из API (`installmentPlans` / `installmentTerms`). Старые сборки сеяли
// этот мок в localStorage (`developer.sales.installments.*`), из-за чего обычные
// пользователи видели демо-график вместо реального.
// /** Мок-данные — 5 вариантов рассрочки для демо */
// export const MOCK_SALES_INSTALLMENTS: { base: InstallmentRowModel; optional: InstallmentRowModel[] } = {
//   base: {
//     id: 'base',
//     label: 'Базовая',
//     downPaymentPercent: 30,
//     termMonths: 12,
//     discountPercent: null,
//     paymentStep: 'monthly',
//     validUntil: null,
//     scope: 'all',
//     unitIds: [],
//   },
//   optional: [
//     {
//       id: 'opt-1',
//       label: '24 месяца',
//       downPaymentPercent: 20,
//       termMonths: 24,
//       discountPercent: 5,
//       paymentStep: 'monthly',
//       validUntil: null,
//       scope: 'all',
//       unitIds: [],
//     },
//     {
//       id: 'opt-2',
//       label: '36 месяцев',
//       downPaymentPercent: 15,
//       termMonths: 36,
//       discountPercent: null,
//       paymentStep: 'monthly',
//       validUntil: null,
//       scope: 'all',
//       unitIds: [],
//     },
//     {
//       id: 'opt-3',
//       label: 'Квартальная',
//       downPaymentPercent: 50,
//       termMonths: 24,
//       discountPercent: 7,
//       paymentStep: 'quarterly',
//       validUntil: null,
//       scope: 'all',
//       unitIds: [],
//     },
//     {
//       id: 'opt-4',
//       label: 'Без взноса',
//       downPaymentPercent: 0,
//       termMonths: 48,
//       discountPercent: null,
//       paymentStep: 'monthly',
//       validUntil: null,
//       scope: 'all',
//       unitIds: [],
//     },
//   ],
// }

export function clampSalesInstallment(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export function normalizeSalesInstallmentRow(raw: unknown, _isBase: boolean, fallbackId: string): InstallmentRowModel {
  const r = raw as Partial<InstallmentRowModel>
  return {
    id: typeof r.id === 'string' ? r.id : fallbackId,
    label: typeof r.label === 'string' ? r.label.slice(0, 80) : '',
    downPaymentPercent: clampSalesInstallment(Number(r.downPaymentPercent) || 0, 0, 100),
    termMonths: clampSalesInstallment(Number(r.termMonths) || 1, 1, 120),
    discountPercent:
      r.discountPercent == null || Number.isNaN(Number(r.discountPercent))
        ? null
        : clampSalesInstallment(Number(r.discountPercent), 0, 50),
    paymentStep: r.paymentStep === 'quarterly' ? 'quarterly' : 'monthly',
    validUntil: typeof r.validUntil === 'string' && r.validUntil.trim() ? r.validUntil.trim().slice(0, 10) : null,
    scope: r.scope === 'units' ? 'units' : 'all',
    unitIds: Array.isArray(r.unitIds) ? r.unitIds.filter((x): x is string => typeof x === 'string') : [],
  }
}

export function parseSalesInstallmentsFromStorage(raw: string | null): {
  base: InstallmentRowModel
  optional: InstallmentRowModel[]
} | null {
  if (!raw) return null
  try {
    const j = JSON.parse(raw) as { base?: unknown; optional?: unknown[] }
    if (!j.base) return null
    return {
      base: normalizeSalesInstallmentRow(j.base, true, 'base'),
      optional: Array.isArray(j.optional)
        ? j.optional
            .filter((row) => row && typeof row === 'object')
            .slice(0, 5)
            .map((row, i) => normalizeSalesInstallmentRow(row, false, `opt-${i}`))
        : [],
    }
  } catch {
    return null
  }
}

export function ruCountNoun(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} ${one}`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} ${few}`
  return `${n} ${many}`
}

export function buildSalesInstallmentScheduleRows(
  row: InstallmentRowModel,
  listPrice: number,
): { label: string; amount: number }[] {
  const disc = row.discountPercent != null ? clampSalesInstallment(row.discountPercent, 0, 50) : 0
  const afterDiscount = listPrice * (1 - disc / 100)
  const down = (afterDiscount * clampSalesInstallment(row.downPaymentPercent, 0, 100)) / 100
  const rest = Math.max(0, afterDiscount - down)
  const term = clampSalesInstallment(row.termMonths, 1, 120)
  const n = row.paymentStep === 'monthly' ? term : Math.max(1, Math.ceil(term / 3))
  const stepAmount = rest / n
  const rows: { label: string; amount: number }[] = [{ label: 'Первый взнос', amount: down }]
  for (let i = 1; i <= n; i += 1) {
    const label =
      row.paymentStep === 'monthly'
        ? ruCountNoun(i, 'месяц', 'месяца', 'месяцев')
        : ruCountNoun(i, 'квартал', 'квартала', 'кварталов')
    rows.push({ label, amount: stepAmount })
  }
  return rows
}

export interface SchedulePayment {
  date: Date
  amount: number
  isDown: boolean
}

/** Генерирует платежи с реальными датами, начиная от сегодня. */
export function buildSchedulePayments(
  row: InstallmentRowModel,
  listPrice: number,
): SchedulePayment[] {
  const disc = row.discountPercent != null ? clampSalesInstallment(row.discountPercent, 0, 50) : 0
  const afterDiscount = listPrice * (1 - disc / 100)
  const down = (afterDiscount * clampSalesInstallment(row.downPaymentPercent, 0, 100)) / 100
  const rest = Math.max(0, afterDiscount - down)
  const term = clampSalesInstallment(row.termMonths, 1, 120)
  const n = row.paymentStep === 'monthly' ? term : Math.max(1, Math.ceil(term / 3))
  const stepAmount = n > 0 ? rest / n : 0

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const payments: SchedulePayment[] = [{ date: new Date(today), amount: down, isDown: true }]

  for (let i = 1; i <= n; i++) {
    const d = new Date(today)
    if (row.paymentStep === 'monthly') {
      d.setMonth(d.getMonth() + i)
    } else {
      d.setMonth(d.getMonth() + i * 3)
    }
    payments.push({ date: d, amount: stepAmount, isDown: false })
  }
  return payments
}

export function formatSalesInstallmentRuDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`
}

export function medianListPriceFromUnits(units: IUnit[]): number | null {
  const prices = units.map((u) => computeUnitTotalPrice(u)).filter((p): p is number => typeof p === 'number')
  if (!prices.length) return null
  prices.sort((a, b) => a - b)
  return prices[Math.floor(prices.length / 2)]!
}

/** Ориентир цены лота для графика на карточке помещения (не медиана по складу). */
export function listPriceAtUnitForInstallment(unitId: string, units: IUnit[]): number | null {
  const u = units.find((x) => x._id === unitId)
  if (!u) return null
  const p = computeUnitTotalPrice(u)
  return typeof p === 'number' && !Number.isNaN(p) ? p : null
}

/**
 * Устаревший агрегированный ориентир для компактных превью.
 * Для фактического применения рассрочки используйте цену конкретного лота.
 */
export function listPriceForSalesInstallmentRow(row: InstallmentRowModel, units: IUnit[]): number | null {
  const listPriceAll = medianListPriceFromUnits(units)
  if (row.scope !== 'units') return listPriceAll
  if (!row.unitIds.length) return null
  const sel = units.filter((u) => row.unitIds.includes(u._id))
  const prices = sel.map((u) => computeUnitTotalPrice(u)).filter((p): p is number => typeof p === 'number')
  if (!prices.length) return null
  prices.sort((a, b) => a - b)
  return prices[Math.floor(prices.length / 2)]!
}

export function salesInstallmentRowAppliesToUnit(row: InstallmentRowModel, unitId: string): boolean {
  if (row.scope === 'all') return true
  return row.unitIds.includes(unitId)
}

export function optionalRowAppliesToUnit(row: InstallmentRowModel, unitId: string): boolean {
  return salesInstallmentRowAppliesToUnit(row, unitId)
}

export function pricedUnitsForSalesInstallmentRow(
  row: InstallmentRowModel,
  units: IUnit[],
): { unit: IUnit; price: number }[] {
  const scopedUnits = row.scope === 'units' ? units.filter((unit) => row.unitIds.includes(unit._id)) : units
  return scopedUnits
    .map((unit) => {
      const price = computeUnitTotalPrice(unit)
      return typeof price === 'number' && !Number.isNaN(price) ? { unit, price } : null
    })
    .filter((item): item is { unit: IUnit; price: number } => item != null)
}

export function priceRangeForSalesInstallmentRow(row: InstallmentRowModel, units: IUnit[]): string | null {
  const prices = pricedUnitsForSalesInstallmentRow(row, units).map((item) => item.price)
  if (!prices.length) return null
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  return min === max ? formatUsd(min) : `${formatUsd(min)}–${formatUsd(max)}`
}

export type SalesInstallmentPreviewBlock = {
  key: string
  title: string
  subtitle: string
  rows: { label: string; amount: number }[]
}

export function buildSalesInstallmentPreviewBlocksForUnit(
  parsed: { base: InstallmentRowModel; optional: InstallmentRowModel[] },
  unitId: string,
  units: IUnit[],
): SalesInstallmentPreviewBlock[] {
  const { base, optional } = parsed
  const list: SalesInstallmentPreviewBlock[] = []

  const baseRef = listPriceAtUnitForInstallment(unitId, units)
  if (salesInstallmentRowAppliesToUnit(base, unitId) && baseRef != null) {
    const baseSubtitle = base.validUntil
      ? `до ${formatSalesInstallmentRuDate(base.validUntil)}`
      : 'без даты окончания'
    list.push({
      key: 'base',
      title: 'Базовая программа',
      subtitle: `Расчёт от цены этого лота: ${formatUsd(baseRef)} · ${baseSubtitle}`,
      rows: buildSalesInstallmentScheduleRows(base, baseRef),
    })
  }

  optional.forEach((row, idx) => {
    if (!salesInstallmentRowAppliesToUnit(row, unitId)) return
    const scopePart = row.scope === 'units' ? `${row.unitIds.length} лот(ов)` : 'весь проект'
    const datePart = row.validUntil ? ` · до ${formatSalesInstallmentRuDate(row.validUntil)}` : ''
    const ref = listPriceAtUnitForInstallment(unitId, units)
    if (ref == null) return
    list.push({
      key: row.id,
      title: row.label.trim() || `Вариант ${idx + 1}`,
      subtitle: `Расчёт от цены этого лота: ${formatUsd(ref)} · ${scopePart}${datePart}`,
      rows: buildSalesInstallmentScheduleRows(row, ref),
    })
  })

  return list
}

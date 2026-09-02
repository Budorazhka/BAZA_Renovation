import type { BuildingFloorType, IBuilding, IUnit, UnitPromotion } from '@/types/core'
import { formatCurrency, formatCurrencyPerSqm, getCurrencySymbol } from './format-currency'
import { normalizeRooms } from './project-options'
import { resolveUnitPrice } from './unit-finish-pricing'

export { getCurrencySymbol }

export function formatPrice(value: number | undefined, currency?: string): string {
  return formatCurrency(value, currency)
}

export function formatPricePerSqm(value: number | undefined, currency?: string): string {
  return formatCurrencyPerSqm(value, currency)
}

export function formatUsd(value: number | undefined, currency: string = 'USD'): string {
  return formatCurrency(value, currency)
}

export function formatUsdPerSqm(value: number | undefined, currency: string = 'USD'): string {
  return formatCurrencyPerSqm(value, currency)
}

export interface ChessboardSummary {
  total: number
  free: number
  booked: number
  sold: number
  withdrawn: number
  bookedRevenue: number
}

export function computeUnitTotalPrice(unit: IUnit): number | undefined {
  return resolveUnitPrice(unit)
}

export function hasActivePromotion(unit: IUnit): boolean {
  return Boolean(unit.promotion && unit.promotion.isActive !== false)
}

export function hasDiscount(unit: IUnit): boolean {
  return (
    typeof unit.basePricePerSqm === 'number' &&
    typeof unit.pricePerSqm === 'number' &&
    unit.basePricePerSqm > unit.pricePerSqm
  )
}

export interface EffectiveInstallmentTerm {
  baseMonths?: number
  effectiveMonths?: number
  isDynamic: boolean
  isExpired: boolean
}

function parsePromotionDate(value: string | undefined): Date | null {
  if (!value) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number)
    return new Date(year, month - 1, day, 12, 0, 0, 0)
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function diffMonthsCeil(from: Date, to: Date): number {
  if (to.getTime() <= from.getTime()) return 0
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  const anchor = new Date(from)
  anchor.setMonth(anchor.getMonth() + months)
  if (anchor.getTime() < to.getTime()) months += 1
  return months
}

export function resolvePromotionInstallmentTerm(
  promo: Pick<UnitPromotion, 'installmentMonths' | 'expiresAt'>,
  now = new Date(),
): EffectiveInstallmentTerm {
  const baseMonths =
    typeof promo.installmentMonths === 'number' && promo.installmentMonths > 0
      ? Math.round(promo.installmentMonths)
      : undefined
  if (!baseMonths) return { baseMonths: undefined, effectiveMonths: undefined, isDynamic: false, isExpired: false }

  const expiresAt = parsePromotionDate(promo.expiresAt)
  if (!expiresAt) return { baseMonths, effectiveMonths: baseMonths, isDynamic: false, isExpired: false }

  const remainingMonths = Math.max(0, Math.min(baseMonths, diffMonthsCeil(now, expiresAt)))
  return {
    baseMonths,
    effectiveMonths: remainingMonths,
    isDynamic: true,
    isExpired: remainingMonths === 0,
  }
}

export function buildChessboardSummary(units: IUnit[]): ChessboardSummary {
  let free = 0
  let booked = 0
  let sold = 0
  let withdrawn = 0
  let bookedRevenue = 0

  for (const unit of units) {
    if (unit.status === 'free') free += 1
    else if (unit.status === 'booked') {
      booked += 1
      bookedRevenue += computeUnitTotalPrice(unit) ?? 0
    } else if (unit.status === 'sold') sold += 1
    else if (unit.status === 'withdrawn') withdrawn += 1
  }

  return { total: units.length, free, booked, sold, withdrawn, bookedRevenue }
}

/**
 * Убирает шум плавающей точки в площади (51.099999999999994 → 51.1).
 * Площадь хранится с точностью до 0.01 м² — этого достаточно для любых лотов,
 * а артефакты вида .0999999 при этом исчезают.
 */
export function roundArea(value: number): number
export function roundArea(value: number | null | undefined): number | undefined
export function roundArea(value: number | null | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.round(value * 100) / 100
}

export function formatArea(value: number | undefined): string {
  if (typeof value !== 'number') return '—'
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value)} м²`
}

/**
 * Компактная подпись комнатности для шахматки/таблиц.
 * Принимает каноническое значение ('studio', '1+1', …) или legacy-строку;
 * возвращает каноническое значение — перевод выполняет вызывающая сторона
 * через optionLabel(t, 'rooms', …), здесь только сжатие legacy-форматов.
 */
export function compactRoomsLabel(value: string | undefined): string {
  const raw = value?.trim()
  if (!raw) return ''
  return normalizeRooms(raw) || raw
}

function pad(value: number, length = 2): string {
  return value.toString().padStart(length, '0')
}

/**
 * Извлекает префикс из названия корпуса.
 * "Block A" → "A", "Корпус 3" → "3", "Секция Б" → "Б".
 * Берёт последний символ после пробела или дефиса; иначе — первый символ названия.
 */
export function buildingNamePrefix(name: string | undefined): string {
  if (!name) return 'X'
  const match = /[\s-]([A-ZА-ЯЁA-Za-zа-яёА-ЯЁ0-9])$/i.exec(name)
  if (match) return match[1].toUpperCase()
  return (name[0] ?? 'X').toUpperCase()
}

/** Номер вида `<prefix>-<floor><position>`, например `A-0312`. */
export function buildUnitNumber(prefix: string, floor: number, position: number): string {
  return `${prefix}-${pad(floor)}${pad(position)}`
}

/**
 * Найти тип этажа, к которому относится физический этаж `floor`.
 * Возвращает null, если этаж не входит ни в один из типов.
 */
export function findBuildingFloorType(
  building: IBuilding | null | undefined,
  floor: number,
): BuildingFloorType | null {
  if (!building?.floorTypes?.length) return null
  return (
    building.floorTypes.find(
      (t) => floor >= t.rangeFrom && floor <= t.rangeTo,
    ) ?? null
  )
}

/** Список физических этажей, входящих в тип. */
export function listFloorsInType(type: BuildingFloorType): number[] {
  const out: number[] = []
  for (let f = type.rangeFrom; f <= type.rangeTo; f += 1) out.push(f)
  return out
}

/** Кол-во этажей в типе. */
export function floorTypeSize(type: BuildingFloorType): number {
  return Math.max(0, type.rangeTo - type.rangeFrom + 1)
}

/** Следующий уникальный номер на этаже — с учётом уже занятых номеров в ЖК. */
export function nextAutoNumber(prefix: string, floor: number, existing: Iterable<string>): string {
  const seen = new Set(existing)
  for (let index = 1; index < 1000; index += 1) {
    const candidate = buildUnitNumber(prefix, floor, index)
    if (!seen.has(candidate)) return candidate
  }
  return `${prefix}-${pad(floor)}${Date.now().toString().slice(-3)}`
}

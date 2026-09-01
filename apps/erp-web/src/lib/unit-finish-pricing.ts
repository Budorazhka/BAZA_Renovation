import type { FinishType, IUnit, UnitFinishPrices } from '@/types/core'

import { normalizeOptionValue } from '@/lib/project-options'

export const UNIT_FINISH_TYPES: readonly FinishType[] = [
  'black_frame',
  'white_frame',
  'green_frame',
  'renovation',
  'turnkey',
]

const STORAGE_KEY = 'bz26.unit-finish-prices.v1'

function isFinishType(value: string): value is FinishType {
  return UNIT_FINISH_TYPES.includes(value as FinishType)
}

/** Кондиции ЖК могут прийти из API в legacy-русском виде — нормализуем и отбрасываем мусор. */
function normalizeConfiguredFinishTypes(projectFinishTypes: readonly string[] | undefined): FinishType[] {
  return (projectFinishTypes ?? [])
    .map((finishType) => normalizeOptionValue('finishTypes', finishType))
    .filter(isFinishType)
}

export function normalizeFinishPrices(value: unknown): UnitFinishPrices | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined

  const normalized: UnitFinishPrices = {}
  for (const [rawKey, rawPrice] of Object.entries(value)) {
    // Ключи могли быть сохранены по-русски (legacy) — приводим к каноническим слагам.
    const key = normalizeOptionValue('finishTypes', rawKey)
    if (!isFinishType(key)) continue
    const price =
      typeof rawPrice === 'number'
        ? rawPrice
        : typeof rawPrice === 'string' && rawPrice.trim()
          ? Number(rawPrice.replace(/\s+/g, '').replace(',', '.'))
          : Number.NaN
    if (Number.isFinite(price) && price > 0) normalized[key] = price
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined
}

export function getFinishPriceOptions(prices: UnitFinishPrices | undefined): Array<{
  finishType: FinishType
  pricePerSqm: number
}> {
  const normalized = normalizeFinishPrices(prices)
  if (!normalized) return []

  return UNIT_FINISH_TYPES.flatMap((finishType) => {
    const pricePerSqm = normalized[finishType]
    return typeof pricePerSqm === 'number' ? [{ finishType, pricePerSqm }] : []
  })
}

export function resolveFinishTypesForEditing(
  projectFinishTypes: FinishType[] | undefined,
  prices?: UnitFinishPrices,
): FinishType[] {
  // Кондиции берём строго из ЖК (что менеджер выбрал в «Вариантах отделки»).
  // Дополнительно показываем те, у которых уже проставлена цена на лоте,
  // чтобы не скрыть существующие данные. Никакого фолбэка на «все виды отделки» —
  // если в ЖК указан только один каркас, перечислять остальные не нужно.
  const explicit = getFinishPriceOptions(prices).map((option) => option.finishType)
  const configured = normalizeConfiguredFinishTypes(projectFinishTypes)
  const combined = new Set<FinishType>([...configured, ...explicit])
  return UNIT_FINISH_TYPES.filter((finishType) => combined.has(finishType))
}

export function getPrimaryFinishPrice(prices: UnitFinishPrices | undefined): number | undefined {
  return getFinishPriceOptions(prices)[0]?.pricePerSqm
}

/** Виды «голого» каркаса. В ЖК указывается ровно один из них как базовая кондиция. */
const FRAME_FINISH_TYPES: readonly FinishType[] = ['black_frame', 'white_frame', 'green_frame']

export interface FinishDisplayOption {
  finishType: FinishType
  /** Цена за м². undefined → «по запросу». */
  pricePerSqm?: number
  /** Базовый каркас ЖК — идёт по базовой цене лота. */
  isBase: boolean
}

/**
 * Единый источник кондиций «Ремонт» для карточки лота и оффера.
 * Список кондиций берётся из ЖК (`projectFinishTypes`), цены — с лота.
 * Базовый каркас ЖК показывается по базовой цене лота; остальные кондиции
 * без проставленной цены — «по запросу» (`pricePerSqm: undefined`).
 * Если в ЖК отделка не задана вовсе — fallback на black_frame по базовой цене.
 */
export function resolveFinishDisplayOptions(
  projectFinishTypes: FinishType[] | undefined,
  unit: Pick<IUnit, 'price' | 'pricePerSqm' | 'area' | 'finishPrices'>,
): FinishDisplayOption[] {
  const prices = normalizeFinishPrices(unit.finishPrices)
  const configured = normalizeConfiguredFinishTypes(projectFinishTypes)
  const explicit = prices ? (Object.keys(prices) as FinishType[]).filter(isFinishType) : []
  const combined = new Set<FinishType>([...configured, ...explicit])
  const ordered = UNIT_FINISH_TYPES.filter((finishType) => combined.has(finishType))
  const baseFrame: FinishType = ordered.find((finishType) => FRAME_FINISH_TYPES.includes(finishType)) ?? 'black_frame'
  const list = ordered.length > 0 ? ordered : [baseFrame]
  const basePrice = resolveUnitPricePerSqm(unit)

  return list.map((finishType) => {
    const explicitPrice = prices?.[finishType]
    if (typeof explicitPrice === 'number') {
      return { finishType, pricePerSqm: explicitPrice, isBase: finishType === baseFrame }
    }
    if (finishType === baseFrame) {
      return { finishType, pricePerSqm: basePrice, isBase: true }
    }
    return { finishType, isBase: false }
  })
}

export function resolveUnitPricePerSqm(unit: Pick<IUnit, 'price' | 'pricePerSqm' | 'area' | 'finishPrices'>, finishType?: FinishType): number | undefined {
  if (finishType) {
    const finishPrice = normalizeFinishPrices(unit.finishPrices)?.[finishType]
    if (typeof finishPrice === 'number') return finishPrice
  }
  if (typeof unit.pricePerSqm === 'number' && unit.pricePerSqm > 0) return unit.pricePerSqm
  if (typeof unit.price === 'number' && unit.price > 0 && typeof unit.area === 'number' && unit.area > 0) {
    return Math.round(unit.price / unit.area)
  }
  return getPrimaryFinishPrice(unit.finishPrices)
}

export function resolveUnitPrice(
  unit: Pick<IUnit, 'price' | 'pricePerSqm' | 'area' | 'finishPrices'>,
  finishType?: FinishType,
): number | undefined {
  const pricePerSqm = resolveUnitPricePerSqm(unit, finishType)
  if (typeof pricePerSqm === 'number' && typeof unit.area === 'number' && unit.area > 0) {
    return Math.round(pricePerSqm * unit.area)
  }
  return unit.price
}

function readStorage(): Record<string, UnitFinishPrices> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, unknown>
    const result: Record<string, UnitFinishPrices> = {}
    for (const [unitId, value] of Object.entries(parsed)) {
      const prices = normalizeFinishPrices(value)
      if (prices) result[unitId] = prices
    }
    return result
  } catch {
    return {}
  }
}

export function readPersistedUnitFinishPrices(unitId: string): UnitFinishPrices | undefined {
  return readStorage()[unitId]
}

export function persistUnitFinishPrices(unitId: string, prices: UnitFinishPrices | undefined): void {
  if (!unitId || typeof localStorage === 'undefined') return
  const storage = readStorage()
  const normalized = normalizeFinishPrices(prices)
  if (normalized) storage[unitId] = normalized
  else delete storage[unitId]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(storage))
}

export function hydrateUnitFinishPrices<T extends Pick<IUnit, '_id' | 'finishPrices'>>(unit: T): T {
  const prices = normalizeFinishPrices(unit.finishPrices) ?? readPersistedUnitFinishPrices(unit._id)
  return prices ? { ...unit, finishPrices: prices } : unit
}

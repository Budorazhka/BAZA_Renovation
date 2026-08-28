import type { ListingDealType } from './schemas/listing.schema';
import type { PropertyType } from './schemas/property-asset.schema';

export type ActualityState = 'up_to_date' | 'needs_attention' | 'needs_update';

/**
 * ACT-001 (owner decision — open-decisions.md разд.2, `[code verified]`
 * `bz26-client-erp-main/src/components/management/my-properties/utils.ts`
 * `getConditionState()`, подтверждено 25.08.2026: "сохранить разные пороги
 * по категориям, взять точные числа из кода как утверждённые бизнес-правила").
 * Три бакета, не пять (legacy-код `PropertyCategory` содержал
 * `primary|secondary|rent|commercial|other`, но только 3 РАЗЛИЧНЫХ набора
 * порогов — primary/commercial/other все схлопывались в один и тот же
 * дефолтный бакет через ternary else-branch).
 */
const THRESHOLDS = {
  rent: { warningDays: 14, overdueDays: 21 },
  secondary: { warningDays: 28, overdueDays: 60 },
  other: { warningDays: 10, overdueDays: 15 },
} as const;

export type ActualityCategory = keyof typeof THRESHOLDS;

/**
 * Категория выводится из dealType/propertyType — technical decision, не
 * owner decision (сам порядок полей `[owner decision]` фиксирует только
 * ЧИСЛА порогов, не как именно Listing/PropertyAsset поля превращаются в
 * legacy-категорию). Маппинг подтверждён прямым чтением legacy-кода:
 * rent_long/rent_short → 'rent' независимо от propertyType (аренда есть
 * аренда любого типа объекта); sale → 'secondary' для apartment/house/land
 * (типичная вторичка), 'other' для commercial (legacy PropertyCategory
 * 'commercial' попадал в тот же default-бакет, что и 'primary'/'other').
 */
export function resolveActualityCategory(dealType: ListingDealType, propertyType: PropertyType): ActualityCategory {
  if (dealType === 'rent_long' || dealType === 'rent_short') {
    return 'rent';
  }
  if (propertyType === 'commercial') {
    return 'other';
  }
  return 'secondary';
}

export function getActualityThresholds(category: ActualityCategory): { warningDays: number; overdueDays: number } {
  return THRESHOLDS[category];
}

/**
 * Тот же расчёт, что legacy `getConditionState()` — diffDays от
 * `lastConfirmedAt` (или `createdAt`, если владелец ещё ни разу не
 * подтверждал актуальность — PROP-001 `lastConfirmedAt` поле существовало
 * на схеме, но не заполнялось ни одним сервисным методом до этой задачи).
 */
export function computeActualityState(params: {
  dealType: ListingDealType;
  propertyType: PropertyType;
  lastConfirmedAt: Date;
  now: Date;
}): ActualityState {
  const category = resolveActualityCategory(params.dealType, params.propertyType);
  const { warningDays, overdueDays } = getActualityThresholds(category);
  const diffDays = Math.floor((params.now.getTime() - params.lastConfirmedAt.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays >= overdueDays) return 'needs_update';
  if (diffDays >= warningDays) return 'needs_attention';
  return 'up_to_date';
}

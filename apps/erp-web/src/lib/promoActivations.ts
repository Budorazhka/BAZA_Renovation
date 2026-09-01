// Длительности и ценообразование услуг продвижения.
// Активации хранятся на бэкенде (см. developmentApi.getPromotions / activatePromotion
// и docs/promotion-paid-services-api-integration.md). Здесь — только чистые хелперы,
// которые используются и страницей «Продвижение», и панелью «Рассылки».

export const PROMO_MIN_LOCK_MS = 24 * 60 * 60 * 1000

export const PROMO_DURATIONS = [
  { id: '24h', label: '24 ч',  hours: 24,  days: 1 },
  { id: '48h', label: '48 ч',  hours: 48,  days: 2 },
  { id: '7d',  label: '7 дн',  hours: 168, days: 7 },
  { id: '30d', label: '30 дн', hours: 720, days: 30 },
] as const

export type PromoDurationId = (typeof PROMO_DURATIONS)[number]['id']

export function promoDurationMs(id: PromoDurationId): number {
  return (PROMO_DURATIONS.find((d) => d.id === id)?.hours ?? 24) * 60 * 60 * 1000
}

export function promoDurationLabel(id: PromoDurationId): string {
  return PROMO_DURATIONS.find((d) => d.id === id)?.label ?? id
}

export function promoDurationFactor(id: PromoDurationId): number {
  return PROMO_DURATIONS.find((d) => d.id === id)?.days ?? 1
}

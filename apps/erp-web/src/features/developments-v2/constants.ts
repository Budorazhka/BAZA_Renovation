import type { MoneyCurrency, UnitKindV2, UnitStatusV2 } from '@/services/developmentsApiV2'

export const UNIT_KIND_OPTIONS: readonly UnitKindV2[] = [
  'apartment',
  'commercial',
  'office',
  'parking',
  'storage',
  'other',
]

export const UNIT_KIND_LABEL: Record<UnitKindV2, string> = {
  apartment: 'Квартира',
  commercial: 'Коммерция',
  office: 'Офис',
  parking: 'Паркинг',
  storage: 'Кладовая',
  other: 'Другое',
}

export const UNIT_STATUS_OPTIONS: readonly UnitStatusV2[] = ['available', 'reserved', 'sold', 'hidden']

export const UNIT_STATUS_LABEL: Record<UnitStatusV2, string> = {
  available: 'Свободен',
  reserved: 'Забронирован',
  sold: 'Продан',
  hidden: 'Скрыт',
}

/** Круглый 12px статус-индикатор (DESIGN.md §7 «Индикаторы статуса»), не pill-badge. */
export const UNIT_STATUS_DOT: Record<UnitStatusV2, string> = {
  available: 'bg-[var(--gold)]',
  reserved: 'bg-[rgba(255,193,7,0.85)]',
  sold: 'bg-[color:var(--app-text-muted)]',
  hidden: 'bg-[rgba(255,255,255,0.3)]',
}

export const MONEY_CURRENCY_OPTIONS: readonly MoneyCurrency[] = ['USD', 'GEL', 'RUB']

export const MONEY_CURRENCY_LABEL: Record<MoneyCurrency, string> = {
  USD: 'USD',
  GEL: 'GEL',
  RUB: 'RUB',
}

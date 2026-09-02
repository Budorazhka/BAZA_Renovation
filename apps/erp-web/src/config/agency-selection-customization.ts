import type { ToggleGroup } from '@/components/selections/SelectionCustomizationPanel'
import type { SelectionCurrency, SelectionLanguage } from '@/lib/selection-display'

/** Поля карточки объекта в агентской подборке (письмо/PDF). Только реальные данные. */
export type AgencySelectionBlockKey =
  | 'photo'
  | 'description'
  | 'developer'
  | 'address'
  | 'specs'
  | 'price'
  | 'pricePerM2'
  | 'agentContacts'

export interface AgencySelectionCustomization {
  language: SelectionLanguage
  currency: SelectionCurrency
  blocks: Record<AgencySelectionBlockKey, boolean>
}

export const DEFAULT_AGENCY_CUSTOMIZATION: AgencySelectionCustomization = {
  language: 'en',
  currency: 'USD',
  blocks: {
    photo: true,
    description: true,
    developer: true,
    address: true,
    specs: true,
    price: true,
    pricePerM2: false,
    agentContacts: true,
  },
}

export const AGENCY_CUSTOMIZATION_GROUPS: ToggleGroup<AgencySelectionBlockKey>[] = [
  {
    title: 'Объект',
    items: [
      { key: 'photo', label: 'Фото' },
      { key: 'address', label: 'Адрес' },
      { key: 'developer', label: 'Застройщик' },
      { key: 'specs', label: 'Характеристики' },
      { key: 'description', label: 'Описание' },
      { key: 'price', label: 'Цена' },
      { key: 'pricePerM2', label: 'Цена за м²' },
    ],
  },
  {
    title: 'Контакты',
    items: [{ key: 'agentContacts', label: 'Контакты агента' }],
  },
]

export function resolveAgencyCustomization(
  c?: Partial<AgencySelectionCustomization> | null,
): AgencySelectionCustomization {
  return {
    language: c?.language ?? DEFAULT_AGENCY_CUSTOMIZATION.language,
    currency: c?.currency ?? DEFAULT_AGENCY_CUSTOMIZATION.currency,
    blocks: { ...DEFAULT_AGENCY_CUSTOMIZATION.blocks, ...(c?.blocks ?? {}) },
  }
}

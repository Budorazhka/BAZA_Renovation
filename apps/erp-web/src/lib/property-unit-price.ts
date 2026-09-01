import type { Property } from '@/components/management/my-properties/types'

const RENT_DAYS_IN_MONTH = 30

type UnitPriceProperty = Pick<Property, 'category' | 'price' | 'pricePerM2' | 'details'>

export function resolvePropertyUnitPrice(property: UnitPriceProperty): number {
  if (property.category === 'rent') {
    return property.price > 0 ? Math.round(property.price / RENT_DAYS_IN_MONTH) : 0
  }
  return property.pricePerM2
}

export function formatPropertyUnitPrice(
  property: UnitPriceProperty,
  formatter: Intl.NumberFormat,
  hiddenLabel = 'Прайс скрыт',
): string {
  if (property.details?.priceOnRequest) return hiddenLabel
  const value = resolvePropertyUnitPrice(property)
  const suffix = property.category === 'rent' ? '$/день' : '$/м²'
  return `${formatter.format(value)} ${suffix}`
}

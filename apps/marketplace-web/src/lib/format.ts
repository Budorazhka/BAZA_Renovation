import type { PublicDevelopmentCard, PublicListingCard } from '../types/marketplace'

export function developmentTitle(item: PublicDevelopmentCard): string {
  return item.name?.trim() || 'Жилой комплекс'
}

export function developmentAddress(item: PublicDevelopmentCard): string {
  return [item.location?.city, item.location?.address].filter(Boolean).join(', ') || 'Адрес уточняется'
}

export function completionLabel(value?: string): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return `Сдача ${new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(date)}`
}

export function listingDealTypeLabel(dealType?: string): string {
  switch (dealType) {
    case 'sale':
      return 'Продажа'
    case 'rent_long':
      return 'Долгосрочная аренда'
    case 'rent_short':
      return 'Посуточная аренда'
    default:
      return 'Недвижимость'
  }
}

export function listingPropertyTypeLabel(propertyType?: string, commercialSubtype?: string): string {
  switch (propertyType) {
    case 'apartment':
      return 'Квартира'
    case 'house':
      return 'Дом / Коттедж'
    case 'land':
      return 'Земельный участок'
    case 'commercial':
      if (commercialSubtype === 'office') return 'Офис'
      if (commercialSubtype === 'warehouse') return 'Склад'
      if (commercialSubtype === 'retail') return 'Торговое помещение'
      return 'Коммерческая недвижимость'
    default:
      return 'Объект'
  }
}

export function listingTitle(item: PublicListingCard): string {
  const typeLabel = listingPropertyTypeLabel(item.propertyType, item.commercialSubtype)
  const area = item.characteristics?.area
  const rooms = item.characteristics?.rooms

  if (item.propertyType === 'apartment' && rooms) {
    return `${rooms}-комн. квартира${area ? `, ${area} м²` : ''}`
  }
  return `${typeLabel}${area ? `, ${area} м²` : ''}`
}

export function listingAddress(item: PublicListingCard): string {
  return [item.location?.city, item.location?.address].filter(Boolean).join(', ') || 'Адрес уточняется'
}

export function listingPrice(item: PublicListingCard): string {
  if (!item.price || item.price.amountMinorUnits == null) return 'Цена по запросу'
  const amount = item.price.amountMinorUnits / 100
  const currency = item.price.currency === 'USD' ? '$' : item.price.currency === 'GEL' ? '₾' : '₽'
  const formatted = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(amount)
  
  if (item.dealType === 'rent_long') {
    return `${currency}${formatted} / мес.`
  }
  if (item.dealType === 'rent_short') {
    return `${currency}${formatted} / сут.`
  }
  return `${currency}${formatted}`
}

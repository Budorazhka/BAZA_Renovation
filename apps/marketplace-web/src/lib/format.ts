import type { PublicDevelopmentCard, PublicListingCard } from '../types/marketplace'
import type { Translate } from '../i18n'

/*
 * Форматирование карточек и деталей объекта. Функции принимают `t`
 * необязательным последним параметром: без него — русский текст по
 * умолчанию (так исторически вызывались эти функции и так их вызывают
 * тесты), с ним — перевод под текущий язык интерфейса.
 */

export function developmentTitle(item: PublicDevelopmentCard, t?: Translate): string {
  return item.name?.trim() || (t ? t('format.development') : 'Жилой комплекс')
}

export function developmentAddress(item: PublicDevelopmentCard, t?: Translate): string {
  return (
    [item.location?.city, item.location?.address].filter(Boolean).join(', ') ||
    (t ? t('format.addressUnknown') : 'Адрес уточняется')
  )
}

export function completionLabel(value?: string, t?: Translate): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const locale = t ? (t('format.locale') as string) : 'ru-RU'
  const formatted = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date)
  return t ? t('format.completion', { date: formatted }) : `Сдача ${formatted}`
}

export function listingDealTypeLabel(dealType?: string, t?: Translate): string {
  switch (dealType) {
    case 'sale':
      return t ? t('format.dealSale') : 'Продажа'
    case 'rent_long':
      return t ? t('format.dealRentLong') : 'Долгосрочная аренда'
    case 'rent_short':
      return t ? t('format.dealRentShort') : 'Посуточная аренда'
    default:
      return t ? t('format.dealDefault') : 'Недвижимость'
  }
}

export function listingPropertyTypeLabel(propertyType?: string, commercialSubtype?: string, t?: Translate): string {
  switch (propertyType) {
    case 'apartment':
      return t ? t('format.typeApartment') : 'Квартира'
    case 'house':
      return t ? t('format.typeHouse') : 'Дом / Коттедж'
    case 'land':
      return t ? t('format.typeLand') : 'Земельный участок'
    case 'commercial':
      if (commercialSubtype === 'office') return t ? t('format.typeOffice') : 'Офис'
      if (commercialSubtype === 'warehouse') return t ? t('format.typeWarehouse') : 'Склад'
      if (commercialSubtype === 'retail') return t ? t('format.typeRetail') : 'Торговое помещение'
      if (commercialSubtype === 'business') return t ? t('format.typeBusiness') : 'Готовый бизнес'
      if (commercialSubtype === 'free_purpose') return t ? t('format.typeFreePurpose') : 'Свободное назначение'
      return t ? t('format.typeCommercial') : 'Коммерческая недвижимость'
    default:
      return t ? t('format.typeDefault') : 'Объект недвижимости'
  }
}

export function listingTitle(item: PublicListingCard, t?: Translate): string {
  const typeLabel = listingPropertyTypeLabel(item.propertyType, item.commercialSubtype, t)
  const area = item.characteristics?.area
  const rooms = item.characteristics?.rooms

  if (item.propertyType === 'apartment' && rooms) {
    return t
      ? t('format.roomsApartment', { rooms, areaSuffix: area ? t('format.areaSuffix', { area }) : '' })
      : `${rooms}-комн. квартира${area ? `, ${area} м²` : ''}`
  }
  return t
    ? `${typeLabel}${area ? t('format.areaSuffix', { area }) : ''}`
    : `${typeLabel}${area ? `, ${area} м²` : ''}`
}

export function listingAddress(item: PublicListingCard, t?: Translate): string {
  return (
    [item.location?.city, item.location?.address].filter(Boolean).join(', ') ||
    (t ? t('format.addressUnknown') : 'Адрес уточняется')
  )
}

function currencySign(currency?: string): string {
  return currency === 'USD' ? '$' : currency === 'GEL' ? '₾' : '₽'
}

export function listingPrice(item: PublicListingCard, t?: Translate): string {
  if (!item.price || item.price.amountMinorUnits == null) {
    return t ? t('format.priceOnRequest') : 'Цена по запросу'
  }
  const amount = item.price.amountMinorUnits / 100
  const currency = currencySign(item.price.currency)
  const locale = t ? (t('format.locale') as string) : 'ru-RU'
  const formatted = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(amount)

  if (item.dealType === 'rent_long') {
    return t ? t('format.priceRentLong', { currency, amount: formatted }) : `${currency}${formatted} / мес.`
  }
  if (item.dealType === 'rent_short') {
    return t ? t('format.priceRentShort', { currency, amount: formatted }) : `${currency}${formatted} / сут.`
  }
  return `${currency}${formatted}`
}

export function formatMoneyAmount(price?: { amountMinorUnits?: number; currency?: string }, t?: Translate): string | null {
  if (!price || price.amountMinorUnits == null) return null
  const amount = price.amountMinorUnits / 100
  const currency = currencySign(price.currency)
  const locale = t ? (t('format.locale') as string) : 'ru-RU'
  const formatted = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(amount)
  return `${currency} ${formatted}`
}

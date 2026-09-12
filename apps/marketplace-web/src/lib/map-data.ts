import type { PublicDevelopmentCard, PublicListingCard } from '../types/marketplace'
import type { Translate } from '../i18n'
import {
  developmentAddress,
  developmentTitle,
  completionLabel,
  listingAddress,
  listingDealTypeLabel,
  listingPrice,
  listingTitle,
} from './format'

export type MarketplaceMapItem = PublicDevelopmentCard | PublicListingCard

export interface MarketplaceMapPoint {
  item: MarketplaceMapItem
  index: number
  coordinates: [number, number]
}

export function isDevelopmentCard(item: MarketplaceMapItem): item is PublicDevelopmentCard {
  return 'name' in item && typeof item.name === 'string'
}

export function isListingCard(item: MarketplaceMapItem): item is PublicListingCard {
  return 'dealType' in item
}

export function getMapItemTitle(item: MarketplaceMapItem, t?: Translate): string {
  if (isDevelopmentCard(item)) {
    return developmentTitle(item, t)
  }
  return listingTitle(item, t)
}

export function getMapItemAddress(item: MarketplaceMapItem, t?: Translate): string {
  if (isDevelopmentCard(item)) {
    return developmentAddress(item, t)
  }
  return listingAddress(item, t)
}

export function getMapItemPriceOrDate(item: MarketplaceMapItem, t?: Translate): string | null {
  if (isDevelopmentCard(item)) {
    return completionLabel(item.completionDate, t)
  }
  return listingPrice(item, t)
}

/**
 * `t` необязателен: тестам и вызовам вне React-дерева достаточно русского
 * запасного варианта, компонент карты передаёт настоящий перевод.
 */
export function getMapItemBadge(item: MarketplaceMapItem, t?: Translate): string {
  if (isDevelopmentCard(item)) {
    return item.classType
      ? t
        ? t('map.badgeDevWithClass', { class: item.classType })
        : `ЖК · ${item.classType}`
      : t
        ? t('map.badgeDev')
        : 'Жилой комплекс'
  }
  if (item.dealType === 'sale') {
    return t ? t('map.badgeSale') : '✦ Продажа'
  }
  const deal = listingDealTypeLabel(item.dealType, t)
  return t ? t('map.badgeDeal', { deal }) : `✦ ${deal}`
}

export function getMapItemCoverUrl(item: MarketplaceMapItem): string | undefined {
  if (isListingCard(item) && item.media && item.media.length > 0) {
    const cover = item.media.find((m) => m.role === 'cover') || item.media[0]
    return cover?.url
  }
  return undefined
}

export function getMapItemLink(item: MarketplaceMapItem): string | undefined {
  if (!item.slug) return undefined
  if (isDevelopmentCard(item)) {
    return `/developments/${encodeURIComponent(item.slug)}`
  }
  return `/listings/${encodeURIComponent(item.slug)}`
}

export function mapItemLabel(item: MarketplaceMapItem, index: number, t?: Translate): string {
  const title = getMapItemTitle(item, t)
  const priceOrDate = getMapItemPriceOrDate(item, t)
  const address = getMapItemAddress(item, t)
  if (priceOrDate) {
    return t ? t('map.itemLabelWithPrice', { title, priceOrDate, address }) : `${title} — ${priceOrDate}, ${address}`
  }
  const safeTitle = title || (t ? t('map.itemFallbackTitle', { index: index + 1 }) : `Объект ${index + 1}`)
  return t ? t('map.itemLabel', { title: safeTitle, address }) : `${safeTitle}, ${address}`
}

export function getMarketplaceMapPoints(items: MarketplaceMapItem[]): MarketplaceMapPoint[] {
  if (!Array.isArray(items)) return []
  return items.flatMap((item, index) => {
    if (!item) return []
    const coordinates = item.location?.geo?.coordinates
    if (!coordinates || !Array.isArray(coordinates) || coordinates.length !== 2) return []
    const [longitude, latitude] = coordinates
    if (
      typeof longitude !== 'number' ||
      typeof latitude !== 'number' ||
      !Number.isFinite(longitude) ||
      !Number.isFinite(latitude) ||
      Number.isNaN(longitude) ||
      Number.isNaN(latitude) ||
      longitude < -180 ||
      longitude > 180 ||
      latitude < -90 ||
      latitude > 90
    ) {
      return []
    }
    return [{ item, index, coordinates: [longitude, latitude] as [number, number] }]
  })
}

import type { PublicDevelopmentCard, PublicListingCard } from '../types/marketplace'
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

export function getMapItemTitle(item: MarketplaceMapItem): string {
  if (isDevelopmentCard(item)) {
    return developmentTitle(item)
  }
  return listingTitle(item)
}

export function getMapItemAddress(item: MarketplaceMapItem): string {
  if (isDevelopmentCard(item)) {
    return developmentAddress(item)
  }
  return listingAddress(item)
}

export function getMapItemPriceOrDate(item: MarketplaceMapItem): string | null {
  if (isDevelopmentCard(item)) {
    return completionLabel(item.completionDate)
  }
  return listingPrice(item)
}

export function getMapItemBadge(item: MarketplaceMapItem): string {
  if (isDevelopmentCard(item)) {
    return item.classType ? `ЖК · ${item.classType}` : 'Жилой комплекс'
  }
  return item.dealType === 'sale' ? '✦ Продажа' : `✦ ${listingDealTypeLabel(item.dealType)}`
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

export function mapItemLabel(item: MarketplaceMapItem, index: number): string {
  const title = getMapItemTitle(item)
  const priceOrDate = getMapItemPriceOrDate(item)
  const address = getMapItemAddress(item)
  if (priceOrDate) {
    return `${title} — ${priceOrDate}, ${address}`
  }
  return `${title || `Объект ${index + 1}`}, ${address}`
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

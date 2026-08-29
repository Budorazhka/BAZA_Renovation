import type { PublicDevelopmentCard, PublicListingCard } from '../types/marketplace'

export type MarketplaceMapItem = PublicDevelopmentCard | PublicListingCard

export interface MarketplaceMapPoint {
  item: MarketplaceMapItem
  index: number
  coordinates: [number, number]
}

export function getMarketplaceMapPoints(items: MarketplaceMapItem[]): MarketplaceMapPoint[] {
  return items.flatMap((item, index) => {
    const coordinates = item.location?.geo?.coordinates
    if (!coordinates || coordinates.length !== 2) return []
    const [longitude, latitude] = coordinates
    if (
      !Number.isFinite(longitude) ||
      !Number.isFinite(latitude) ||
      longitude < -180 ||
      longitude > 180 ||
      latitude < -90 ||
      latitude > 90
    ) return []
    return [{ item, index, coordinates }]
  })
}

import { describe, expect, it } from 'vitest'
import {
  getMarketplaceMapPoints,
  getMapItemTitle,
  getMapItemAddress,
  getMapItemPriceOrDate,
  getMapItemBadge,
  getMapItemLink,
  getMapItemCoverUrl,
  mapItemLabel,
  isDevelopmentCard,
  isListingCard,
} from '../src/lib/map-data'

describe('getMarketplaceMapPoints', () => {
  it('keeps only real GeoJSON coordinates and preserves source order', () => {
    const items = [
      { slug: 'without-geo', name: 'Без координат' },
      { slug: 'dev-1', name: 'ЖК 1', location: { geo: { type: 'Point' as const, coordinates: [41.64, 41.62] as [number, number] } } },
      { slug: 'listing-1', location: { geo: { type: 'Point' as const, coordinates: [41.65, 41.63] as [number, number] } } },
    ]

    const points = getMarketplaceMapPoints(items)

    expect(points.map((point) => point.item.slug)).toEqual(['dev-1', 'listing-1'])
    expect(points.map((point) => point.index)).toEqual([1, 2])
    expect(points[0]!.coordinates).toEqual([41.64, 41.62])
  })

  it('drops non-finite, NaN, and out-of-range coordinates before rendering markers', () => {
    const points = getMarketplaceMapPoints([
      { slug: 'nan', location: { geo: { type: 'Point' as const, coordinates: [Number.NaN, 41.62] as unknown as [number, number] } } },
      { slug: 'infinity', location: { geo: { type: 'Point' as const, coordinates: [Number.POSITIVE_INFINITY, 41.62] as unknown as [number, number] } } },
      { slug: 'lng-out-of-range', location: { geo: { type: 'Point' as const, coordinates: [181, 41.62] as [number, number] } } },
      { slug: 'lat-out-of-range', location: { geo: { type: 'Point' as const, coordinates: [41.64, -91] as [number, number] } } },
      { slug: 'wrong-length', location: { geo: { type: 'Point' as const, coordinates: [41.64] as unknown as [number, number] } } },
      { slug: 'string-coords', location: { geo: { type: 'Point' as const, coordinates: ['41.64', '41.62'] as unknown as [number, number] } } },
      { slug: 'valid', location: { geo: { type: 'Point' as const, coordinates: [41.64, 41.62] as [number, number] } } },
    ])

    expect(points.map((point) => point.item.slug)).toEqual(['valid'])
  })

  it('gracefully handles non-array or null input', () => {
    expect(getMarketplaceMapPoints(null as unknown as [])).toEqual([])
    expect(getMarketplaceMapPoints(undefined as unknown as [])).toEqual([])
  })
})

describe('map data formatting and helper functions', () => {
  const devItem = {
    slug: 'sea-towers',
    name: 'Sea Towers',
    classType: 'Премиум',
    completionDate: '2027-12-01',
    location: { city: 'Батуми', address: 'ул. Шерифа Химшиашвили, 15' },
  }

  const listingItem = {
    slug: 'apartment-sea-view',
    dealType: 'sale' as const,
    propertyType: 'apartment' as const,
    price: { amountMinorUnits: 12500000, currency: 'USD' },
    characteristics: { rooms: 2, area: 65, floor: 12, totalFloors: 24 },
    location: { city: 'Батуми', address: 'ул. Руставели, 8' },
    media: [{ role: 'cover' as const, url: 'https://cdn.example.com/cover.jpg', position: 0 }],
  }

  it('correctly identifies item types', () => {
    expect(isDevelopmentCard(devItem)).toBe(true)
    expect(isDevelopmentCard(listingItem)).toBe(false)
    expect(isListingCard(listingItem)).toBe(true)
    expect(isListingCard(devItem)).toBe(false)
  })

  it('formats titles, addresses, and price/date appropriately', () => {
    expect(getMapItemTitle(devItem)).toBe('Sea Towers')
    expect(getMapItemTitle(listingItem)).toBe('2-комн. квартира, 65 м²')

    expect(getMapItemAddress(devItem)).toBe('Батуми, ул. Шерифа Химшиашвили, 15')
    expect(getMapItemAddress(listingItem)).toBe('Батуми, ул. Руставели, 8')

    expect(getMapItemPriceOrDate(devItem)).toContain('Сдача')
    expect(getMapItemPriceOrDate(listingItem)).toMatch(/\$125[\s\u00A0]000/)

    expect(getMapItemBadge(devItem)).toBe('ЖК · Премиум')
    expect(getMapItemBadge(listingItem)).toBe('✦ Продажа')

    expect(getMapItemLink(devItem)).toBe('/developments/sea-towers')
    expect(getMapItemLink(listingItem)).toBe('/listings/apartment-sea-view')

    expect(getMapItemCoverUrl(listingItem)).toBe('https://cdn.example.com/cover.jpg')
    expect(getMapItemCoverUrl(devItem)).toBeUndefined()
  })

  it('produces descriptive aria labels for interactive map markers', () => {
    const devLabel = mapItemLabel(devItem, 0)
    expect(devLabel).toContain('Sea Towers')
    expect(devLabel).toContain('Батуми')

    const listingLabel = mapItemLabel(listingItem, 1)
    expect(listingLabel).toContain('2-комн. квартира')
    expect(listingLabel).toMatch(/\$125[\s\u00A0]000/)
  })
})

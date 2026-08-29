import { describe, expect, it } from 'vitest'
import { getMarketplaceMapPoints } from '../src/lib/map-data'

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

  it('drops non-finite and out-of-range coordinates before rendering markers', () => {
    const points = getMarketplaceMapPoints([
      { slug: 'nan', location: { geo: { type: 'Point' as const, coordinates: [Number.NaN, 41.62] as [number, number] } } },
      { slug: 'lng-out-of-range', location: { geo: { type: 'Point' as const, coordinates: [181, 41.62] as [number, number] } } },
      { slug: 'lat-out-of-range', location: { geo: { type: 'Point' as const, coordinates: [41.64, -91] as [number, number] } } },
      { slug: 'valid', location: { geo: { type: 'Point' as const, coordinates: [41.64, 41.62] as [number, number] } } },
    ])

    expect(points.map((point) => point.item.slug)).toEqual(['valid'])
  })
})

/** @vitest-environment jsdom */
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MarketplaceApiError, marketplaceApi } from '../src/api/marketplace-api'
import { useListingDetail } from '../src/hooks/useListingDetail'

describe('useListingDetail hook', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('loads single listing by slug and sets ready state', async () => {
    vi.spyOn(marketplaceApi, 'getListing').mockResolvedValue({
      slug: 'listing-123',
      dealType: 'sale',
      price: { amountMinorUnits: 9000000, currency: 'USD' },
      propertyType: 'apartment',
      location: { city: 'Batumi', address: 'Gorgiladze 12' },
      characteristics: { area: 70, rooms: 3, floor: 5, totalFloors: 10 },
      seo: { title: '3-комнатная квартира в Батуми', description: 'Отличный вид' },
    })

    const { result } = renderHook(() => useListingDetail('listing-123'))
    expect(result.current.status).toBe('loading')

    await waitFor(() => expect(result.current.status).toBe('ready'))
    const state = result.current
    if (state.status !== 'ready') throw new Error('expected ready')
    expect(state.item.slug).toBe('listing-123')
    expect(state.item.characteristics?.rooms).toBe(3)
  })

  it('sets not-found state when 404 is returned', async () => {
    vi.spyOn(marketplaceApi, 'getListing').mockRejectedValue(
      new MarketplaceApiError('Объект не найден или больше не опубликован.', 404),
    )

    const { result } = renderHook(() => useListingDetail('non-existent-slug'))
    await waitFor(() => expect(result.current.status).toBe('not-found'))
  })
})

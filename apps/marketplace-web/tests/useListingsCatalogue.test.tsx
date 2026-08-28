/** @vitest-environment jsdom */
import { cleanup, renderHook, waitFor, act } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { marketplaceApi } from '../src/api/marketplace-api'
import { useListingsCatalogue } from '../src/hooks/useListingsCatalogue'

describe('useListingsCatalogue hook', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('loads listings on initial mount and sets ready status', async () => {
    vi.spyOn(marketplaceApi, 'listListings').mockResolvedValue({
      items: [
        {
          slug: 'batumi-flat-1',
          dealType: 'sale',
          price: { amountMinorUnits: 8500000, currency: 'USD' },
          propertyType: 'apartment',
          location: { city: 'Batumi', address: 'Rustaveli 10' },
          characteristics: { area: 65, rooms: 2, floor: 7, totalFloors: 16 },
        },
      ],
      nextCursor: 'next-1',
    })

    const { result } = renderHook(() => useListingsCatalogue({ city: 'Batumi' }))

    expect(result.current.state.status).toBe('loading')
    await waitFor(() => expect(result.current.state.status).toBe('ready'))

    const state = result.current.state
    if (state.status !== 'ready') throw new Error('expected ready')
    expect(state.items).toHaveLength(1)
    expect(state.items[0].slug).toBe('batumi-flat-1')
    expect(state.nextCursor).toBe('next-1')
  })

  it('sets empty status when 0 items returned', async () => {
    vi.spyOn(marketplaceApi, 'listListings').mockResolvedValue({
      items: [],
      nextCursor: null,
    })

    const { result } = renderHook(() => useListingsCatalogue())
    await waitFor(() => expect(result.current.state.status).toBe('empty'))
  })

  it('handles loadMore pagination', async () => {
    vi.spyOn(marketplaceApi, 'listListings')
      .mockResolvedValueOnce({
        items: [{ slug: 'item-1' }],
        nextCursor: 'cursor-2',
      })
      .mockResolvedValueOnce({
        items: [{ slug: 'item-2' }],
        nextCursor: null,
      })

    const { result } = renderHook(() => useListingsCatalogue())
    await waitFor(() => expect(result.current.state.status).toBe('ready'))

    await act(async () => {
      result.current.loadMore()
    })

    await waitFor(() => {
      const state = result.current.state
      if (state.status !== 'ready') throw new Error('expected ready')
      expect(state.items).toHaveLength(2)
      expect(state.nextCursor).toBeNull()
    })
  })
})

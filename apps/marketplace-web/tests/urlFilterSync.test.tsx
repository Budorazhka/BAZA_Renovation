/** @vitest-environment jsdom */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../src/App'
import { marketplaceApi } from '../src/api/marketplace-api'

vi.mock('../src/api/marketplace-api', () => ({
  marketplaceApi: {
    listDevelopments: vi.fn(),
    listListings: vi.fn(),
    getDevelopment: vi.fn(),
    getListing: vi.fn(),
    revealDevelopmentContact: vi.fn(),
    revealListingContact: vi.fn(),
  },
  MarketplaceApiError: class extends Error {
    constructor(msg: string, readonly status: number) {
      super(msg)
      this.name = 'MarketplaceApiError'
    }
  },
}))

describe('URL Filter Synchronization & Navigation Acceptance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(marketplaceApi.listDevelopments as any).mockResolvedValue({
      items: [{ slug: 'dev-1', name: 'ЖК Батуми Сансет', completionDate: '2026-Q4' }],
      nextCursor: null,
    })
    ;(marketplaceApi.listListings as any).mockResolvedValue({
      items: [
        {
          id: 'listing-1',
          slug: 'listing-1',
          dealType: 'sale',
          propertyType: 'apartment',
          price: { amountMinorUnits: 7500000, currency: 'USD' },
          characteristics: { rooms: 2, area: 65, floor: 5, totalFloors: 12 },
          location: { city: 'Batumi', address: 'Rustaveli 10' },
        },
      ],
      nextCursor: null,
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('initializes tab and filters from URL search params', async () => {
    render(
      <MemoryRouter initialEntries={['/?tab=listings&city=Batumi&dealType=sale&propertyType=apartment']}>
        <App />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(marketplaceApi.listListings).toHaveBeenCalledWith(
        expect.objectContaining({
          city: 'Batumi',
          dealType: 'sale',
          propertyType: 'apartment',
        }),
        expect.any(Object),
      )
    })

    expect(screen.getByRole('tab', { name: 'Вторичка и аренда', selected: true })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Купить' }).className).toContain('is-active')
    expect(screen.getByRole('button', { name: 'Квартиры' }).className).toContain('is-active')
  })

  it('switching tabs updates active tab and re-queries catalog', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(marketplaceApi.listDevelopments).toHaveBeenCalled()
    })

    const listingsTab = screen.getByRole('tab', { name: 'Вторичка и аренда' })
    fireEvent.click(listingsTab)

    await waitFor(() => {
      expect(marketplaceApi.listListings).toHaveBeenCalled()
    })
  })

  it('selecting dealType and propertyType filter chips triggers query with updated filters', async () => {
    render(
      <MemoryRouter initialEntries={['/?tab=listings']}>
        <App />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(marketplaceApi.listListings).toHaveBeenCalled()
    })

    const rentLongChip = screen.getByRole('button', { name: 'Снять длительно' })
    fireEvent.click(rentLongChip)

    await waitFor(() => {
      expect(marketplaceApi.listListings).toHaveBeenCalledWith(
        expect.objectContaining({ dealType: 'rent_long' }),
        expect.any(Object),
      )
    })

    const houseChip = screen.getByRole('button', { name: 'Дома и виллы' })
    fireEvent.click(houseChip)

    await waitFor(() => {
      expect(marketplaceApi.listListings).toHaveBeenCalledWith(
        expect.objectContaining({ dealType: 'rent_long', propertyType: 'house' }),
        expect.any(Object),
      )
    })
  })

  it('submitting city search form updates filter and re-queries', async () => {
    render(
      <MemoryRouter initialEntries={['/?tab=listings']}>
        <App />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(marketplaceApi.listListings).toHaveBeenCalled()
    })

    const cityInput = screen.getByRole('searchbox', { name: /город/i })
    fireEvent.change(cityInput, { target: { value: 'Tbilisi' } })

    const findBtn = screen.getByRole('button', { name: /найти/i })
    fireEvent.click(findBtn)

    await waitFor(() => {
      expect(marketplaceApi.listListings).toHaveBeenCalledWith(
        expect.objectContaining({ city: 'Tbilisi' }),
        expect.any(Object),
      )
    })
  })

  it('clearing filters resets query params and reloads all listings', async () => {
    render(
      <MemoryRouter initialEntries={['/?tab=listings&city=Batumi&dealType=sale']}>
        <App />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(marketplaceApi.listListings).toHaveBeenCalledWith(
        expect.objectContaining({ city: 'Batumi', dealType: 'sale' }),
        expect.any(Object),
      )
    })

    const clearBtn = screen.getByRole('button', { name: /сбросить/i })
    fireEvent.click(clearBtn)

    await waitFor(() => {
      expect(marketplaceApi.listListings).toHaveBeenCalledWith(
        expect.objectContaining({ city: undefined, dealType: undefined }),
        expect.any(Object),
      )
    })
  })

  it('parses bbox parameter and passes it to API when view=map', async () => {
    render(
      <MemoryRouter initialEntries={['/?tab=listings&view=map&bbox=41.60000,41.60000,41.70000,41.70000']}>
        <App />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(marketplaceApi.listListings).toHaveBeenCalledWith(
        expect.objectContaining({
          bbox: { minLng: 41.6, minLat: 41.6, maxLng: 41.7, maxLat: 41.7 },
        }),
        expect.any(Object),
      )
    })
  })

  it('does not send bbox to API when view is list (default)', async () => {
    render(
      <MemoryRouter initialEntries={['/?tab=developments&bbox=41.60000,41.60000,41.70000,41.70000']}>
        <App />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(marketplaceApi.listDevelopments).toHaveBeenCalledWith(
        expect.objectContaining({
          bbox: undefined,
        }),
        expect.any(Object),
      )
    })
  })
})

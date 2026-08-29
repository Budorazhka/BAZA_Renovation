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

describe('Cursor Pagination & Deduplication Acceptance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('appends items on "Показать ещё" and deduplicates overlapping IDs', async () => {
    ;(marketplaceApi.listListings as any)
      .mockResolvedValueOnce({
        items: [
          { id: 'item-1', slug: 'item-1', dealType: 'sale', price: { amountMinorUnits: 10000000, currency: 'USD' }, location: { city: 'Batumi' } },
          { id: 'item-2', slug: 'item-2', dealType: 'sale', price: { amountMinorUnits: 12000000, currency: 'USD' }, location: { city: 'Batumi' } },
        ],
        nextCursor: 'cur-page-2',
      })
      .mockResolvedValueOnce({
        items: [
          { id: 'item-2', slug: 'item-2', dealType: 'sale', price: { amountMinorUnits: 12000000, currency: 'USD' }, location: { city: 'Batumi' } }, // duplicate
          { id: 'item-3', slug: 'item-3', dealType: 'sale', price: { amountMinorUnits: 15000000, currency: 'USD' }, location: { city: 'Batumi' } },
        ],
        nextCursor: null,
      })

    render(
      <MemoryRouter initialEntries={['/?tab=listings']}>
        <App />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Показано: 2')).toBeDefined()
    })

    const loadMoreBtn = screen.getByRole('button', { name: /показать ещё/i })
    fireEvent.click(loadMoreBtn)

    await waitFor(() => {
      // 2 initial + 1 new (deduplicated item-2) = 3 total
      expect(screen.getByText('Показано: 3')).toBeDefined()
    })

    // Next cursor is null, button disappears and end note is shown
    expect(screen.queryByRole('button', { name: /показать ещё/i })).toBeNull()
    expect(screen.getByText('Все доступные объекты показаны')).toBeDefined()
  })

  it('recovers from pagination error without wiping out existing items', async () => {
    ;(marketplaceApi.listListings as any)
      .mockResolvedValueOnce({
        items: [
          { id: 'item-1', slug: 'item-1', dealType: 'sale', price: { amountMinorUnits: 10000000, currency: 'USD' }, location: { city: 'Batumi' } },
        ],
        nextCursor: 'cur-page-2',
      })
      .mockRejectedValueOnce(new Error('Network connection timeout'))
      .mockResolvedValueOnce({
        items: [
          { id: 'item-2', slug: 'item-2', dealType: 'sale', price: { amountMinorUnits: 20000000, currency: 'USD' }, location: { city: 'Batumi' } },
        ],
        nextCursor: null,
      })

    render(
      <MemoryRouter initialEntries={['/?tab=listings']}>
        <App />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Показано: 1')).toBeDefined()
    })

    const loadMoreBtn = screen.getByRole('button', { name: /показать ещё/i })
    fireEvent.click(loadMoreBtn)

    // Error alert is shown, but initial item-1 is still visible!
    await waitFor(() => {
      expect(screen.getByText('Network connection timeout')).toBeDefined()
      expect(screen.getByText('Показано: 1')).toBeDefined()
    })

    const retryBtn = screen.getByRole('button', { name: /попробовать снова/i })
    fireEvent.click(retryBtn)

    await waitFor(() => {
      expect(screen.getByText('Показано: 2')).toBeDefined()
    })
  })
})

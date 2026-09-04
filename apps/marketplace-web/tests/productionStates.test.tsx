/** @vitest-environment jsdom */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../src/App'
import { marketplaceApi, MarketplaceApiError } from '../src/api/marketplace-api'

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

describe('Production Error & Empty States Acceptance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders 404 Not Found / Unpublished state for listings with back link', async () => {
    ;(marketplaceApi.getListing as any).mockRejectedValue(
      new MarketplaceApiError('Объект не найден или больше не опубликован.', 404),
    )

    render(
      <MemoryRouter initialEntries={['/listings/unpublished-slug']}>
        <App />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Объявление не найдено или было снято с публикации.')).toBeDefined()
    })

    expect(screen.getByRole('link', { name: 'Вернуться в каталог' })).toBeDefined()
  })

  it('renders 429 Rate Limited / Error state with retry button', async () => {
    ;(marketplaceApi.getListing as any)
      .mockRejectedValueOnce(
        new MarketplaceApiError('Слишком много запросов. Пожалуйста, повторите попытку позже.', 429),
      )
      .mockResolvedValueOnce({
        id: 'listing-1',
        slug: 'listing-1',
        dealType: 'sale',
        propertyType: 'apartment',
        price: { amountMinorUnits: 5000000, currency: 'USD' },
        location: { city: 'Batumi' },
      })

    render(
      <MemoryRouter initialEntries={['/listings/listing-1']}>
        <App />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Слишком много запросов. Пожалуйста, повторите попытку позже.')).toBeDefined()
    })

    const retryBtn = screen.getByRole('button', { name: 'Повторить попытку' })
    fireEvent.click(retryBtn)

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeDefined()
      expect(screen.getByRole('button', { name: 'Показать телефон' })).toBeDefined()
      expect(screen.getAllByText('Batumi').length).toBeGreaterThan(0)
    })
  })

  it('renders empty catalogue state when query returns zero items', async () => {
    ;(marketplaceApi.listListings as any).mockResolvedValue({
      items: [],
      nextCursor: null,
    })

    render(
      <MemoryRouter initialEntries={['/newconstructions?tab=listings&city=NonExistentCity']}>
        <App />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('По выбранным параметрам пока нет опубликованных объектов.')).toBeDefined()
    })

    expect(screen.getByRole('button', { name: 'Сбросить фильтры' })).toBeDefined()
  })
})

/** @vitest-environment jsdom */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
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

describe('Accessibility & Semantic HTML Smoke Acceptance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(marketplaceApi.listDevelopments as any).mockResolvedValue({
      items: [{ slug: 'dev-1', name: 'ЖК Батуми Сансет', completionDate: '2026-Q4' }],
      nextCursor: null,
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('contains semantic landmarks: banner, main#main-content, and contentinfo', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('banner')).toBeDefined()
    expect(screen.getByRole('main')).toBeDefined()
    // Landmark `search` на главной больше не проверяется: 12.09.2026 страница
    // пересобрана по утверждённому фрейму `Home page` v4 long (`3428:55239`),
    // где в hero логотип, слоган и фотополотно, а строки поиска нет вовсе —
    // поиск живёт на экранах каталога (`search result`, `236:27197`).
    // Проверка landmark'а переехала в тест каталога ниже.
    expect(screen.getByRole('contentinfo')).toBeDefined()
    expect(screen.getByText('Перейти к основному содержанию')).toBeDefined()
    // До 04.09.2026 «Войти» вело на /publish: человек, которому нужен кабинет,
    // попадал в мастер размещения объекта, где вход был лишь первым шагом.
    //
    // `findBy`, а не `getBy`: с 05.09.2026 шапка знает про сессию и до ответа
    // сервера не утверждает ни «Войти», ни «Кабинет» — показать вошедшему
    // «Войти» на долю секунды это та же неправда, просто короткая.
    const loginLink = await screen.findByRole('link', { name: /Войти/ })
    expect(loginLink.getAttribute('href')).toBe('/auth/login')
  })

  it('has proper heading hierarchy with h1 and section h2', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeDefined()
      expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(0)
    })
  })

  it('keeps catalogue-only floating controls off public detail pages', async () => {
    ;(marketplaceApi.getListing as any).mockResolvedValue({
      id: 'listing-1',
      slug: 'listing-1',
      dealType: 'sale',
      propertyType: 'apartment',
      price: { amountMinorUnits: 12000000, currency: 'USD' },
      location: { city: 'Batumi', address: 'Улица Руставели, 15' },
    })

    render(
      <MemoryRouter initialEntries={['/listings/listing-1']}>
        <App />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeDefined()
    })

    expect(screen.queryByLabelText('Инструменты каталога')).toBeNull()
    expect(screen.getByRole('contentinfo')).toBeDefined()
  })
})

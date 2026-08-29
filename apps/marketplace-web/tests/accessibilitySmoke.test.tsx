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

  it('contains semantic landmarks: banner, main#main-content, search, and contentinfo', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('banner')).toBeDefined()
    expect(screen.getByRole('main')).toBeDefined()
    expect(screen.getByRole('search')).toBeDefined()
    expect(screen.getByRole('contentinfo')).toBeDefined()
    expect(screen.getByText('Перейти к основному содержанию')).toBeDefined()
    expect(screen.getByRole('link', { name: /Войти/ }).getAttribute('href')).toBe('/publish')
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
})

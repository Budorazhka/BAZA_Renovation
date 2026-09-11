/** @vitest-environment jsdom */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
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

/**
 * MKT-SCR-027. До 04.09.2026 неизвестный адрес молча отдавал главную: битая
 * ссылка выглядела рабочей страницей. Тест закрывает именно это — что по чужому
 * адресу показывается «не найдено», а не витрина.
 */
describe('Неизвестный маршрут', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(marketplaceApi.listDevelopments as any).mockResolvedValue({ items: [], nextCursor: null, total: 0 })
    ;(marketplaceApi.listListings as any).mockResolvedValue({ items: [], nextCursor: null, total: 0 })
  })

  afterEach(() => {
    cleanup()
  })

  it('показывает страницу «не найдено», а не главную', async () => {
    render(
      <MemoryRouter initialEntries={['/такого-адреса-нет']}>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Такой страницы нет' })).toBeTruthy()
    // Заголовок главной на этом экране появляться не должен.
    expect(screen.queryByRole('heading', { name: /Лучший способ найти недвижимость/i })).toBeNull()
  })

  it('предлагает уйти в каталог и на главную', async () => {
    render(
      <MemoryRouter initialEntries={['/такого-адреса-нет']}>
        <App />
      </MemoryRouter>,
    )

    const toCatalogue = await screen.findByRole('link', { name: 'Смотреть новостройки' })
    expect(toCatalogue.getAttribute('href')).toBe('/newconstructions')
    expect(screen.getByRole('link', { name: 'На главную' }).getAttribute('href')).toBe('/')
  })

  it('главная по-прежнему открывается по своему адресу', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: /Лучший способ найти недвижимость/i })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Такой страницы нет' })).toBeNull()
  })
})

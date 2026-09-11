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

const PUBLISHER = { id: '68b0000000000000000000aa', name: 'АН Премиум', type: 'agency' }

/**
 * Клик по застройщику или агентству ведёт в отфильтрованный каталог, а не на
 * отдельную страницу компании (решение владельца от 04.09.2026, по образцу
 * действующего baza.sale). Тест закрывает обе половины: ссылка в карточке и
 * то, что фильтр действительно доезжает до API.
 */
describe('Фильтр каталога по застройщику и агентству', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(marketplaceApi.listDevelopments as any).mockResolvedValue({
      items: [
        { slug: 'dev-1', name: 'ЖК Батуми Сансет', completionDate: '2026-Q4', publisher: PUBLISHER },
      ],
      nextCursor: null,
      total: 1,
    })
    ;(marketplaceApi.listListings as any).mockResolvedValue({ items: [], nextCursor: null, total: 0 })
  })

  afterEach(() => {
    cleanup()
  })

  it('в карточке имя застройщика — ссылка на каталог с фильтром по его id', async () => {
    render(
      <MemoryRouter initialEntries={['/newconstructions']}>
        <App />
      </MemoryRouter>,
    )

    // {timeout: 5000}: дефолтный 1с у findBy* не всегда укладывается в
    // цепочку монтирования на CI-раннере (тот же класс флейка, что уже
    // ловили в authRoutes.test.tsx/tasksPageTaskActions.test.ts — 10.09.2026).
    const link = await screen.findByRole('link', { name: PUBLISHER.name }, { timeout: 5000 })
    expect(link.getAttribute('href')).toBe(`/newconstructions?publisher=${PUBLISHER.id}`)
  })

  it('publisher из адреса уходит в запрос каталога', async () => {
    render(
      <MemoryRouter initialEntries={[`/newconstructions?publisher=${PUBLISHER.id}`]}>
        <App />
      </MemoryRouter>,
    )

    await waitFor(() => expect(marketplaceApi.listDevelopments).toHaveBeenCalled())
    const [query] = (marketplaceApi.listDevelopments as any).mock.calls[0]
    expect(query.publisher).toBe(PUBLISHER.id)
  })

  it('при активном фильтре показывает имя компании и кнопку сброса', async () => {
    render(
      <MemoryRouter initialEntries={[`/newconstructions?publisher=${PUBLISHER.id}`]}>
        <App />
      </MemoryRouter>,
    )

    // Имя компании встречается дважды: в плашке фильтра и в ссылке карточки,
    // поэтому ищем именно внутри плашки, а не по всему документу.
    const banner = await screen.findByText(/Показаны объекты компании/, {}, { timeout: 5000 })
    expect(banner.textContent).toContain(PUBLISHER.name)
    expect(screen.getByRole('button', { name: 'Показать все компании' })).toBeTruthy()
  })

  it('без publisher в карточке ссылки на компанию нет', async () => {
    ;(marketplaceApi.listDevelopments as any).mockResolvedValue({
      // Объект частного собственника: организации-публикатора у него нет.
      items: [{ slug: 'dev-2', name: 'ЖК Без компании', completionDate: '2026-Q4' }],
      nextCursor: null,
      total: 1,
    })

    render(
      <MemoryRouter initialEntries={['/newconstructions']}>
        <App />
      </MemoryRouter>,
    )

    await screen.findByText('ЖК Без компании', {}, { timeout: 5000 })
    expect(screen.queryByText(/Показаны объекты компании/)).toBeNull()
    expect(screen.queryByRole('link', { name: PUBLISHER.name })).toBeNull()
  })
})
